"""
Two-pass PIT classifier using Claude Haiku 4.5.

Pass 1: title + department only. Cheap broad filter; keeps anything plausibly PIT.
Pass 2: full description + taxonomy. Returns structured JSON verdict on survivors.

Results are cached on disk keyed by course content hash so reruns are essentially
free for unchanged courses. Tune CONCURRENCY for throughput; Anthropic rate
limits are the practical ceiling.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from anthropic import Anthropic, APIError
from dotenv import load_dotenv
from tqdm import tqdm

from classifier.taxonomy import (
    IMPACT_AREA_NAMES,
    PIT_CATEGORIES,
    render_taxonomy_for_prompt,
)


MODEL = "claude-haiku-4-5-20251001"
CONCURRENCY = 8  # parallel API calls
MAX_RETRIES = 3
# Bump this any time the prompt changes — included in cache key so old verdicts
# from prior prompt versions are not reused.
PROMPT_VERSION = "v3"

ROOT = Path(__file__).resolve().parent.parent
RAW_PATH = ROOT / "data" / "raw_classes.json"
OUT_PATH = ROOT / "data" / "classified.json"
CACHE_DIR = ROOT / "data" / "cache"


# ---------------------------------------------------------------------------
# Pass 1: title-only cheap filter
# ---------------------------------------------------------------------------

PASS1_SYSTEM = """You are filtering Stanford courses for a Public Interest Technology (PIT) discovery site.

PIT requires BOTH (a) substantive technology content AND (b) a public-interest framing. A course that is only about civic engagement WITHOUT technology is not PIT, and a course that is only about technical skills WITHOUT a public-interest framing is not PIT.

You see only the title and department. Decide whether this course COULD plausibly be PIT — i.e. whether it warrants closer inspection. Be permissive: false positives cost a few cents in pass 2; false negatives mean a real PIT class is never surfaced.

Say "yes" if the title hints at ANY of:
- Technology applied to social / public / community / equity / sustainability / health / justice / democracy / education / privacy / accessibility issues
- Ethics, policy, law, or governance of technology
- Human-centered design, civic tech, data for social good, public-interest computing
- Computer science / AI / data science courses with public-good framing
- Policy, urban planning, environmental, healthcare, education, or justice courses that may involve technology

Say "no" if the title is CLEARLY:
- Pure technical skills with no public-interest framing (e.g. "Linear Algebra", "Organic Chemistry", "Compilers", "Molecular Imaging Physics")
- Pure non-technical humanities with no tech connection (e.g. "Latin Poetry", "Renaissance Art History", "Tennis")
- Civic engagement / community service / volunteering courses with no technology component (e.g. "Local Government in Action", "Community Service")
- Physical education, language instruction, music lessons, lab techniques

Respond with ONLY a single token: "yes" or "no". No explanation."""


def pass1_prompt(course: dict) -> str:
    return f"Department: {course['academic_org'] or course['subject']}\nTitle: {course['title']}"


def pass1_should_keep(client: Anthropic, course: dict) -> bool:
    resp = _call_anthropic(
        client,
        system=PASS1_SYSTEM,
        user=pass1_prompt(course),
        max_tokens=4,
    )
    text = resp.strip().lower()
    # Be lenient — anything starting with 'y' keeps the course alive
    return text.startswith("y")


# ---------------------------------------------------------------------------
# Pass 2: full classification with structured output
# ---------------------------------------------------------------------------

# Few-shot examples covering: (a) clear PIT, (b) ambivalent tech that the report
# explicitly flags as NOT PIT on its own, (c) policy/ethics that IS PIT without
# coding, (d) pure non-tech.
FEW_SHOT_EXAMPLES = [
    {
        "title": "Computers, Ethics, and Public Policy",
        "department": "Computer Science",
        "description": "Students design, evaluate, and recommend public policy positions on cutting-edge ethical issues raised by computer technology. Topics include privacy, autonomous systems, algorithmic fairness, social media regulation, and AI governance. Students work in teams to research a contemporary issue and produce a policy paper.",
        "verdict": {
            "is_pit": True,
            "confidence": 0.98,
            "pit_category": "ethics_policy_of_tech",
            "impact_areas": ["Ethics", "Government and Government Technology", "Privacy"],
            "reasoning": "Centers on tech ethics and policy — algorithmic fairness, AI governance, privacy. Maps directly to PIT §3.2.9 Ethics and §3.2.11 GovTech.",
        },
    },
    {
        "title": "Introduction to Algorithms",
        "department": "Computer Science",
        "description": "Asymptotic analysis, divide-and-conquer, dynamic programming, greedy algorithms, graph algorithms, NP-completeness. Problem sets in Python.",
        "verdict": {
            "is_pit": False,
            "confidence": 0.95,
            "pit_category": None,
            "impact_areas": [],
            "reasoning": "Pure technical skills course. The report (p.13) explicitly calls these 'ambivalent terms' — the same Python/algorithms skills apply to PIT or non-PIT work, so the course itself is not PIT.",
        },
    },
    {
        "title": "Data Science for Social Impact",
        "department": "Statistics",
        "description": "Project-based course pairing students with nonprofits and civic organizations to apply data science methods (regression, classification, causal inference, visualization) to social-impact problems: housing affordability, criminal justice disparities, education equity, public health.",
        "verdict": {
            "is_pit": True,
            "confidence": 0.97,
            "pit_category": "tech_applied_to_impact_area",
            "impact_areas": ["Cities/Urban Issues", "Law/Legal Services", "Education", "Healthcare", "Ethics"],
            "reasoning": "Technical (data science) explicitly applied to multiple PIT impact areas — housing, criminal justice, education equity, public health. Textbook 'tech applied to impact area' case.",
        },
    },
    {
        "title": "Privacy Law and Policy",
        "department": "Law",
        "description": "Survey of US and international privacy law: GDPR, CCPA, HIPAA, FERPA. Constitutional foundations, sectoral statutes, enforcement, emerging issues in surveillance, biometrics, and AI-driven decisionmaking.",
        "verdict": {
            "is_pit": True,
            "confidence": 0.96,
            "pit_category": "ethics_policy_of_tech",
            "impact_areas": ["Privacy", "Law/Legal Services", "Ethics"],
            "reasoning": "Policy/law course centered on technology's societal role — privacy, surveillance, AI decisionmaking. PIT even without hands-on coding.",
        },
    },
    {
        "title": "Renaissance Italian Poetry",
        "department": "Italian",
        "description": "Close reading of Petrarch, Ariosto, and Tasso. Conducted in Italian. Weekly papers and class discussion.",
        "verdict": {
            "is_pit": False,
            "confidence": 0.99,
            "pit_category": None,
            "impact_areas": [],
            "reasoning": "Pure humanities course with no technology content or public-interest-tech framing.",
        },
    },
    {
        "title": "Designing AI for Healthcare",
        "department": "Bioengineering",
        "description": "Hands-on course on building machine learning systems for clinical use: medical imaging, EHR mining, clinical decision support. Emphasis on fairness across demographic groups, regulatory pathways, and deployment in resource-constrained settings.",
        "verdict": {
            "is_pit": True,
            "confidence": 0.96,
            "pit_category": "tech_applied_to_impact_area",
            "impact_areas": ["Healthcare", "Ethics", "Identity"],
            "reasoning": "Technical ML course explicitly applied to a PIT impact area (healthcare) with fairness/equity framing. Hits §3.2.12 Healthcare and §3.2.9 Ethics.",
        },
    },
]


PASS2_SYSTEM = f"""You classify Stanford courses for a Public Interest Technology (PIT) discovery site.

{render_taxonomy_for_prompt()}

## Your task

Decide whether the given course qualifies as PIT. If yes, identify the pit_category and impact areas.

Use INCLUSIVE judgment — surface tech-applied-to-impact-area courses, ethics/policy/law of technology courses, and PIT-specific academic courses, not just narrow "CS for social good" classes.

## Three hard rules — apply these before anything else

1. **Technology component is REQUIRED.** PIT is "Public Interest TECHNOLOGY". A course must substantively engage with TECHNOLOGY in at least one of these ways:
   - Teach how to design, build, or apply a technology (software, data systems, AI, hardware, digital platforms, technical infrastructure)
   - Substantively EXAMINE, CRITIQUE, or CONTEXTUALIZE technology's role in society — even if the course methodology is humanities/social-science. Examples: an STS gateway course on "ethics of science, technology, and medicine"; a course on the history of media technology and democracy; a bioethics course on brain-computer interfaces and adaptive technologies. These ARE PIT.
   - Teach policy, law, ethics, or governance OF technology (privacy law, AI governance, platform regulation).

   A course that is purely about civic engagement, community service, public policy in the abstract, social organizing, urban planning, or humanities content WITHOUT technology as a subject — even tangentially — is NOT PIT. Examples that are NOT PIT: "Local Government in Action" (civic engagement, no tech subject); "Comparative Housing Policy" (housing policy without tech); "Greek Metaethics" (philosophy without tech).

2. **Ambivalent-tech exclusion.** Per the report (p.13): technical skills alone are "ambivalent" — they apply to PIT or non-PIT work equally. A technical course that does NOT substantively frame itself around social impact, equity, public access, ethics, governance, or one of the 19 impact areas is NOT PIT, even if the underlying tech *could* be applied to public-interest problems. Example: a deep technical course on imaging modality physics (PET/SPECT/MRI) is NOT PIT even though imaging is used in healthcare; the course must explicitly frame itself around health equity, public-health outcomes, ethics, or access for it to qualify.

3. **Impact-area precision.** Only tag an impact_area if the description SUBSTANTIVELY covers content in that area — not if it merely mentions the area as one of many illustrative example application domains. Example: a general AI-ethics course that says "AI can help with food production, healthcare, storms, pandemics" mentions four areas, but if the course content is about AI ethics in general, tag only Ethics — not Food and Agriculture, Healthcare, etc.

## Few-shot examples

""" + "\n\n".join(
    f"### Example\nTitle: {ex['title']}\nDepartment: {ex['department']}\nDescription: {ex['description']}\n\nVerdict: {json.dumps(ex['verdict'])}"
    for ex in FEW_SHOT_EXAMPLES
) + """

## Output format

Return ONLY a single JSON object, no prose before or after. Schema:
{
  "is_pit": boolean,
  "confidence": number between 0 and 1,
  "pit_category": one of ["pit_specific", "tech_applied_to_impact_area", "ethics_policy_of_tech", "pit_knowledge_pillar"] or null if is_pit is false,
  "impact_areas": array of strings, each from the 19 impact area names listed above; [] if is_pit is false,
  "reasoning": one or two sentences citing specific elements of the description
}"""


def pass2_prompt(course: dict) -> str:
    return (
        f"Title: {course['title']}\n"
        f"Department: {course['academic_org'] or course['subject']}\n"
        f"Code: {course['full_code']}\n"
        f"Units: {course['units_min']}-{course['units_max']}\n"
        f"Cross-listed as: {', '.join(course['cross_listed_codes']) or 'n/a'}\n"
        f"Description: {course['description']}"
    )


def pass2_classify(client: Anthropic, course: dict) -> dict:
    raw = _call_anthropic(
        client,
        system=PASS2_SYSTEM,
        user=pass2_prompt(course),
        max_tokens=400,
    )
    return _parse_verdict(raw)


def _parse_verdict(raw: str) -> dict:
    # The model is instructed to return only JSON, but be defensive.
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.rsplit("```", 1)[0]
    try:
        obj = json.loads(text.strip())
    except json.JSONDecodeError as e:
        raise ValueError(f"verdict parse failed: {e!r}\nraw: {raw!r}")

    # Normalize and validate
    obj["is_pit"] = bool(obj.get("is_pit", False))
    obj["confidence"] = float(obj.get("confidence", 0.0))
    cat = obj.get("pit_category")
    if cat is not None and cat not in PIT_CATEGORIES:
        obj["pit_category"] = None
    obj["impact_areas"] = [a for a in (obj.get("impact_areas") or []) if a in IMPACT_AREA_NAMES]
    obj["reasoning"] = str(obj.get("reasoning", ""))[:1000]
    if not obj["is_pit"]:
        obj["pit_category"] = None
        obj["impact_areas"] = []
    return obj


# ---------------------------------------------------------------------------
# Anthropic call helper with retries
# ---------------------------------------------------------------------------

def _call_anthropic(client: Anthropic, *, system: str, user: str, max_tokens: int) -> str:
    last_err: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            resp = client.messages.create(
                model=MODEL,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            parts = [b.text for b in resp.content if getattr(b, "type", None) == "text"]
            return "".join(parts)
        except APIError as e:
            last_err = e
            # Exponential backoff for 429/5xx
            time.sleep(2 ** attempt)
    raise RuntimeError(f"Anthropic call failed after {MAX_RETRIES} attempts") from last_err


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

def _cache_key(course: dict) -> str:
    payload = f"{PROMPT_VERSION}|{course['course_id']}|{course['title']}|{course['description']}"
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


def _cache_path(key: str) -> Path:
    return CACHE_DIR / f"{key}.json"


def _cache_get(course: dict) -> dict | None:
    p = _cache_path(_cache_key(course))
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except Exception:
        return None


def _cache_put(course: dict, verdict: dict) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    _cache_path(_cache_key(course)).write_text(json.dumps(verdict))


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

def classify_course(client: Anthropic, course: dict) -> dict:
    """Classify one course, going through both passes with caching."""
    cached = _cache_get(course)
    if cached is not None:
        cached["_cached"] = True
        return cached

    # Pass 1
    keep = pass1_should_keep(client, course)
    if not keep:
        verdict = {
            "is_pit": False,
            "confidence": 0.95,
            "pit_category": None,
            "impact_areas": [],
            "reasoning": "Filtered out at pass 1 (title-only): no plausible PIT signal.",
            "_pass": 1,
        }
    else:
        verdict = pass2_classify(client, course)
        verdict["_pass"] = 2

    _cache_put(course, verdict)
    return verdict


def classify_all(courses: list[dict], *, limit: int | None = None, concurrency: int = CONCURRENCY) -> list[dict]:
    if limit is not None:
        courses = courses[:limit]

    # override=True because shells launched from some IDEs (incl. Claude
    # Desktop) pre-export ANTHROPIC_API_KEY="" — without override, the empty
    # value would win over the .env value.
    load_dotenv(ROOT / ".env", override=True)
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY not set. Edit pit-classifier/.env and paste your key after the = sign."
        )

    client = Anthropic(api_key=api_key)
    out: list[dict] = [None] * len(courses)  # type: ignore[list-item]
    pass1_kept = 0
    pass2_pit = 0
    cache_hits = 0

    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = {pool.submit(classify_course, client, c): i for i, c in enumerate(courses)}
        for fut in tqdm(as_completed(futures), total=len(futures), desc="classify"):
            i = futures[fut]
            try:
                verdict = fut.result()
            except Exception as e:
                tqdm.write(f"  ! course #{i} ({courses[i].get('full_code')}): {e}")
                verdict = {
                    "is_pit": False,
                    "confidence": 0.0,
                    "pit_category": None,
                    "impact_areas": [],
                    "reasoning": f"classifier error: {e}",
                    "_pass": 0,
                }
            if verdict.get("_cached"):
                cache_hits += 1
            elif verdict.get("_pass") == 1:
                pass1_kept += 0  # was filtered
            elif verdict.get("_pass") == 2:
                pass1_kept += 1
                if verdict["is_pit"]:
                    pass2_pit += 1
            out[i] = {**courses[i], "verdict": verdict}

    print(
        f"\nDone. cache_hits={cache_hits}  pass1_survivors={pass1_kept}  "
        f"final_pit={sum(1 for r in out if r['verdict']['is_pit'])}",
        file=sys.stderr,
    )
    return out


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None, help="classify only the first N courses (for sampling)")
    ap.add_argument("--input", default=str(RAW_PATH))
    ap.add_argument("--output", default=str(OUT_PATH))
    ap.add_argument("--sample", action="store_true", help="write a sample-only file alongside output")
    args = ap.parse_args()

    with open(args.input) as f:
        raw = json.load(f)
    courses = raw["courses"]
    print(f"Loaded {len(courses)} courses from {args.input}", file=sys.stderr)

    results = classify_all(courses, limit=args.limit)

    payload = {
        "model": MODEL,
        "classified_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source_year": raw.get("courses", [{}])[0].get("year") if raw.get("courses") else "",
        "count": len(results),
        "pit_count": sum(1 for r in results if r["verdict"]["is_pit"]),
        "results": results,
    }
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"Wrote {len(results)} classified records to {args.output}", file=sys.stderr)


if __name__ == "__main__":
    main()
