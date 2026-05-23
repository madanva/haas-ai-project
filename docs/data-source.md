# Data source

Source: `https://explorecourses.stanford.edu/search?q=a&view=xml-20140630&filter-coursestatus-Active=on&filter-departmentcode-{DEPT}=on`

Stanford's official catalog API. We iterate every department code on the explorecourses homepage and dedup courses by their `<courseId>` (cross-listings show up under multiple subjects but share an ID).

## What we pull per course

- Department + course code (e.g. `CS 181`)
- Title
- Full description
- Academic year (we filter to current — currently 2025–2026)
- Units (min/max)
- GERs / Ways
- Cross-listed codes (parsed out of the title)
- Learning objectives
- Grading basis
- Academic organization

## Deprecation status

ExploreCourses returns `<deprecated>true</deprecated>` and points to `<latestVersion>20200810</latestVersion>`. As of the last run, both `view=xml-20140630` (our current) and `view=xml-20200810` still return data. If `20140630` breaks, switch the `VIEW` constant in `scraper/fetch_classes.py` to `xml-20200810`.

If both views eventually go dark, the next best path is **navigator.stanford.edu**. Notes for whoever has to do that:

- Same-origin API: `GET https://navigator.stanford.edu/api/classes/{strm}/{classNbr}` returns rich JSON per course (full description, instructor, units, term).
- There is **no public list endpoint**. The discovery UI talks to **Algolia** directly. The frontend gets a short-lived secured API key from `POST https://navigator.stanford.edu/api/generate-key`. The Algolia app ID is injected at build via `NEXT_PUBLIC_ALGOLIA_APP_ID` and is not in the public JS — you need a one-shot headless browser to sniff it from a live network request.
- **`robots.txt` is `Disallow: /`.** Scraping is officially against site policy. If we ever have to go this route, ask the Haas Center (PIT report authors) for an official data partnership or registrar contact first.

## Filtering decisions

- **Year**: only the current academic year (`filter-coursestatus-Active=on` returns just this).
- **Offered vs in-catalog**: we keep all active catalog courses regardless of whether sections are scheduled this year. The catalog includes courses on hiatus / offered next year — surfaced in the same list. (Could add an "offered this year" toggle later if useful — see `scraper/fetch_classes.py` parse loop.)
- **Departments**: all ~250 department codes from the explorecourses homepage. Many language and study-abroad codes have zero active courses and silently drop out.
- **Dedup**: by `<courseId>`. Cross-listings (e.g. `CS 181 / PHIL 207`) are kept once with both codes recorded in `cross_listed_codes`.
