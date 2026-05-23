"""
Stanford explorecourses scraper.

Pulls every active course in the current academic year from
https://explorecourses.stanford.edu, dedups cross-listings, and writes a
normalized JSON list to data/raw_classes.json.

The endpoint is officially deprecated (their XML response declares
<deprecated>true</deprecated> and points to <latestVersion>20200810</latestVersion>),
but still serves data as of mid-2026. If view=xml-20140630 ever stops working,
try view=xml-20200810. If both die, switch to navigator.stanford.edu (see
docs/data-source.md for the alternative path).
"""

from __future__ import annotations

import json
import re
import sys
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable
from urllib.parse import urlencode

import requests
from lxml import etree
from tqdm import tqdm


BASE = "https://explorecourses.stanford.edu"
HOMEPAGE_URL = f"{BASE}/"
SEARCH_URL = f"{BASE}/search"
USER_AGENT = "pit-classifier/0.1 (Stanford PIT discovery; contact varun@composite.com)"
VIEW = "xml-20140630"

OUTPUT = Path(__file__).resolve().parent.parent / "data" / "raw_classes.json"


@dataclass
class Course:
    course_id: str
    subject: str
    code: str
    full_code: str  # e.g. "PHIL 1"
    title: str
    description: str
    year: str  # academic year, e.g. "2025-2026"
    units_min: int | None
    units_max: int | None
    gers: list[str]
    grading: str
    learning_objectives: list[str]
    academic_org: str
    academic_org_descr: str
    academic_career: str
    cross_listed_codes: list[str]  # extracted from title, e.g. "CS 181"


_session = requests.Session()
_session.headers.update({
    "User-Agent": USER_AGENT,
    "Accept-Encoding": "gzip, deflate",
})


def _get(url: str, *, retries: int = 3, backoff: float = 2.0) -> str:
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            r = _session.get(url, timeout=60)
            r.raise_for_status()
            return r.text
        except requests.RequestException as e:
            last_err = e
            time.sleep(backoff ** attempt)
    raise RuntimeError(f"GET failed after {retries} retries: {url}") from last_err


def discover_department_codes() -> list[str]:
    """Scrape the homepage for all filter-departmentcode-XXX values."""
    html = _get(HOMEPAGE_URL)
    codes = sorted(set(re.findall(r"filter-departmentcode-([A-Z0-9]+)", html)))
    if not codes:
        raise RuntimeError("Failed to discover any department codes from homepage")
    return codes


def fetch_department_xml(dept_code: str) -> bytes:
    """Fetch the XML response for all active courses in a department."""
    params = {
        "q": "a",  # broad token; combined with department filter this returns all active courses
        "view": VIEW,
        "filter-coursestatus-Active": "on",
        f"filter-departmentcode-{dept_code}": "on",
    }
    url = f"{SEARCH_URL}?{urlencode(params)}"
    text = _get(url)
    return text.encode("utf-8")


def _text(el: etree._Element | None, default: str = "") -> str:
    return (el.text or "").strip() if el is not None else default


def _int(el: etree._Element | None) -> int | None:
    if el is None or el.text is None:
        return None
    try:
        return int(el.text.strip())
    except ValueError:
        return None


def _extract_cross_listings(title: str) -> tuple[str, list[str]]:
    """Stanford titles like 'The Black Fantastic (ENGLISH 146D, FILMEDIA 146)' encode
    cross-listings in trailing parens. Strip them out, return clean title + list."""
    m = re.search(r"\s*\(([^)]+)\)\s*$", title)
    if not m:
        return title.strip(), []
    inside = m.group(1)
    # Cross-listings look like 'SUBJ 123' or 'SUBJ 123A'; reject parens that are clearly other content
    listings = re.findall(r"\b([A-Z][A-Z&]+\s+\d+[A-Z0-9]*)", inside)
    if not listings:
        return title.strip(), []
    clean = title[: m.start()].strip()
    return clean, listings


def parse_courses(xml_bytes: bytes) -> list[Course]:
    """Parse explorecourses XML response into Course records."""
    # explorecourses returns courses wrapped in <xml><courses><course>... — but
    # description text contains entities like &quot; that aren't auto-resolved.
    # lxml handles standard entities fine; the XML is well-formed.
    root = etree.fromstring(xml_bytes)
    out: list[Course] = []
    for c in root.iter("course"):
        title_raw = _text(c.find("title"))
        title, cross_listed = _extract_cross_listings(title_raw)

        admin = c.find("administrativeInformation")
        course_id = _text(admin.find("courseId")) if admin is not None else ""
        academic_org = _text(admin.find("academicOrganization")) if admin is not None else ""
        academic_career = _text(admin.find("academicCareer")) if admin is not None else ""

        gers_raw = _text(c.find("gers"))
        gers = [g.strip() for g in re.split(r"[,;]", gers_raw) if g.strip()]

        objectives = []
        for lo in c.iter("learningObjective"):
            d = _text(lo.find("description"))
            if d:
                objectives.append(d)

        subject = _text(c.find("subject"))
        code = _text(c.find("code"))

        out.append(Course(
            course_id=course_id,
            subject=subject,
            code=code,
            full_code=f"{subject} {code}".strip(),
            title=title,
            description=_text(c.find("description")),
            year=_text(c.find("year")),
            units_min=_int(c.find("unitsMin")),
            units_max=_int(c.find("unitsMax")),
            gers=gers,
            grading=_text(c.find("grading")),
            learning_objectives=objectives,
            academic_org=academic_org,
            academic_org_descr="",  # not in XML; will be backfilled if needed
            academic_career=academic_career,
            cross_listed_codes=cross_listed,
        ))
    return out


def scrape_all(*, departments: Iterable[str] | None = None, sleep: float = 0.3) -> list[Course]:
    """Iterate departments, dedup by course_id, return all courses."""
    if departments is None:
        departments = discover_department_codes()
    departments = list(departments)
    print(f"Discovered {len(departments)} departments. Fetching...", file=sys.stderr)

    seen: dict[str, Course] = {}
    failed: list[tuple[str, str]] = []
    for dept in tqdm(departments, desc="departments"):
        try:
            xml = fetch_department_xml(dept)
            courses = parse_courses(xml)
            for c in courses:
                # Dedup on courseId. Cross-listings produce identical records
                # under different department filters.
                if c.course_id and c.course_id not in seen:
                    seen[c.course_id] = c
            time.sleep(sleep)  # polite delay
        except Exception as e:
            failed.append((dept, str(e)))
            tqdm.write(f"  ! {dept}: {e}")

    print(f"\nCollected {len(seen)} unique courses across {len(departments)} departments.", file=sys.stderr)
    if failed:
        print(f"Failed departments ({len(failed)}):", file=sys.stderr)
        for d, e in failed:
            print(f"  {d}: {e}", file=sys.stderr)
    return list(seen.values())


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    courses = scrape_all()
    payload = {
        "source": "explorecourses.stanford.edu",
        "view": VIEW,
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "count": len(courses),
        "courses": [asdict(c) for c in courses],
    }
    with OUTPUT.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"Wrote {len(courses)} courses to {OUTPUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
