# Stanford PIT Class Explorer

Browse Stanford courses related to **Public Interest Technology** (PIT) — tech for the public good, ethics of technology, civic tech, and more. Built on the [Haas Center for Public Service PIT taxonomy](https://haas.stanford.edu).

The pipeline scrapes every active course in the current academic year from `explorecourses.stanford.edu`, classifies each one with Claude Haiku 4.5 against the 19 PIT impact areas from the taxonomy report, and surfaces the results in a searchable static site.

## Repo layout

```
pit-classifier/
├── scraper/         # explorecourses XML scraper
├── classifier/      # Haiku-4.5 two-pass classifier + PIT taxonomy
├── data/            # raw + classified JSON, classifier cache (gitignored)
├── web/             # Next.js static site
├── scripts/
│   └── refresh.sh   # one-command end-to-end refresh
├── docs/            # data-source notes
├── .env             # ANTHROPIC_API_KEY (gitignored)
└── requirements.txt
```

## Quick start

```bash
# 1. Python deps
pip install -r requirements.txt

# 2. Set your Anthropic API key — get one at console.anthropic.com/settings/keys
cp .env.example .env
$EDITOR .env            # paste sk-ant-api03-... after the = sign

# 3. End-to-end: scrape, classify, publish
./scripts/refresh.sh

# 4. View the site
cd web
npm install
npm run dev             # http://localhost:3000
```

## What the classifier does

For every course, the classifier returns:

```json
{
  "is_pit": true,
  "confidence": 0.92,
  "pit_category": "tech_applied_to_impact_area",
  "impact_areas": ["Healthcare", "Ethics"],
  "reasoning": "Course explicitly teaches ML methods applied to clinical care with fairness framing..."
}
```

It uses a **two-pass strategy**:

1. **Pass 1 — cheap title filter.** A 1-token classification on title alone drops obvious non-PIT courses (organic chem, Latin poetry) and saves ~50% of the pass-2 API spend.
2. **Pass 2 — full classification.** For pass-1 survivors, the model sees the full description plus the 19 impact areas and applies three hard rules from the [June 2023 Stanford PIT taxonomy report](https://haas.stanford.edu):
   - **Technology is required.** PIT means *Public Interest **Technology***. A pure civic-engagement or pure-humanities course without tech as a subject is NOT PIT.
   - **Ambivalent tech is excluded.** Per the report, technical skills alone are "ambivalent" — a Python or imaging-physics course is not PIT unless it explicitly frames itself around social impact, equity, ethics, or governance.
   - **Impact-area precision.** Only tag impact areas that are substantively covered, not merely mentioned as illustrative examples.

PIT verdicts fall into one of four categories:
- `pit_specific` — directly teaches PIT content (e.g. "CS for Social Good")
- `tech_applied_to_impact_area` — technical course applied to a PIT impact area (e.g. "ML for Healthcare")
- `ethics_policy_of_tech` — policy/law/ethics of tech (e.g. "Privacy Law", "AI Governance")
- `pit_knowledge_pillar` — teaches motivations, assessment, user engagement, or responsible deployment of PIT

## Cost & runtime

- **Scrape:** ~2 minutes, free (public XML API)
- **Classify full catalog (~12K courses):** ~15–25 minutes, **~$20–30** in Anthropic API spend
- **Re-classify after a refresh:** mostly free — descriptions that are unchanged hit the on-disk cache

## Data source

The pipeline reads from `explorecourses.stanford.edu` (Stanford's official course catalog) via its public XML API. The endpoint is marked deprecated by Stanford — see [docs/data-source.md](docs/data-source.md) for the fallback plan if it stops working.

**We deliberately do not scrape `navigator.stanford.edu`** even though it serves the same data behind a friendlier UI: its `robots.txt` is `Disallow: /` and its API requires reverse-engineering a short-lived Algolia secured key. ExploreCourses is the supported public path.

## Updating the taxonomy

The 19 PIT impact areas and the inclusion/exclusion rules live in:
- `classifier/taxonomy.py` — Python source of truth (used by classifier prompt)
- `web/src/app/taxonomy.ts` — TypeScript mirror (used by UI filters)

Keep these in sync. After editing, bump `PROMPT_VERSION` in `classifier/classify.py` to invalidate the cache and re-run `./scripts/refresh.sh`.

## Deploying

The site is static. After `cd web && npm run build` you get `web/out/` — drop that on Vercel, Netlify, GitHub Pages, S3+CloudFront, or any static host.

The `classified.json` is fetched at runtime from `/classified.json` on the deployed origin. To refresh the data without rebuilding the JS bundle, just replace that file.

## Acknowledgments

PIT taxonomy from: Cohen, Chua, Garvin, Yoon, Zhou. *A Public Interest Technology Job Skills Taxonomy to Match Job Seekers with Hiring Organizations* (Stanford Haas Center for Public Service, June 2023). Funded by New America / PIT-UN.
