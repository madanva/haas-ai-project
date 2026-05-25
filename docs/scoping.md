# Scoping Notes — PIT Class Explorer

> Jonathan You · 2026-05-23 · Living doc
> Companion to [`README.md`](../README.md) and [`data-source.md`](data-source.md).

This file captures *why* the current stack was chosen, what we learned investigating the alternatives, and a transient section of open questions and active work items. The §4 list shrinks over time as items migrate to GitHub Issues.

---

## 1. Data source: why ExploreCourses XML

We considered three sources for the Stanford catalog:

| Source | Verdict | Why |
|---|---|---|
| **[explorecourses.stanford.edu](https://explorecourses.stanford.edu/)** XML API | **Chosen** | Public, no auth, documented endpoint, stable since 2014. Operational details in [`data-source.md`](data-source.md). |
| **[navigator.stanford.edu/classes](https://navigator.stanford.edu/classes)** | Rejected | `robots.txt: Disallow: /`, new Stanford Navigator Terms of Use, and the data path requires reverse-engineering a short-lived Algolia secured key from `POST /api/generate-key`. Auth-gated UI on the roadmap per their own FAQ. |
| **[oncourse.college](https://oncourse.college/)** backend (`server-coyote.fly.dev`) | Architectural reference, not a source | Their frontend bundle reveals they hit their own backend at `server-coyote.fly.dev/search?q=`. The JSON it returns is a direct superset of ExploreCourses XML field names (`year`, `subject`, `code`, `title`, `description`, `grading`, `unitsMin/Max`, `gers`, `instructors`, `component`, `career`, `department`) — strong evidence they ingest the same XML server-side and persist it. Validates the model we're using. |

ExploreCourses self-flags as deprecated (`<deprecated>true</deprecated>`, points to `<latestVersion>20200810</latestVersion>`) but both `view=xml-20140630` (our current) and `view=xml-20200810` still serve data. Fallback path if both break is documented in [`data-source.md`](data-source.md).

> **Footnote on `robots.txt`.** An automated check during scoping returned `Disallow: /` for `explorecourses.stanford.edu` — but a raw `curl https://explorecourses.stanford.edu/robots.txt` confirms the file 404s and the host has no robot restrictions. The earlier `Disallow: /` reading was cache bleed from Navigator. Saves five minutes for the next person who checks.

---

## 2. Architecture: ingest → classify → static JSON

The repo follows a three-stage pipeline:

```
explorecourses XML  →  data/raw_classes.json  →  data/classified.json  →  web/public/classified.json
   (scraper)                                       (classifier)                (cp; static deploy)
```

Two architectural choices worth flagging:

**Backend ingester rather than live API.** The frontend never hits ExploreCourses directly. It fetches a pre-computed static JSON file from its own origin. This is the same model OnCourse uses (see §1), and avoids: per-request XML parsing, 300 MB catalog downloads, and tight coupling to ExploreCourses uptime. It also means classification cost is amortized once per refresh, not per pageview.

**Static deploy rather than a hosted backend.** `web/` builds to a static bundle. `classified.json` is replaceable in place without a JS rebuild. Hostable on Vercel, Netlify, GitHub Pages, S3+CloudFront, or any static host with no running server. Operational cost stays near zero — appropriate for a Haas-Center-backed discovery site that doesn't need real-time anything.

---

## 3. Classifier: Claude Haiku 4.5 on every refresh, no fine-tuned encoder

We considered two classification strategies:

| Strategy | Cost shape | Quality shape |
|---|---|---|
| **(a)** Claude-labels-once → fine-tune a small encoder (e.g. ModernBERT-base) → cheap local inference forever | Higher up-front (labeling + training), near-zero ongoing | Requires a held-out gold set to validate; encoder drifts from taxonomy revisions until retrained |
| **(b) [chosen]** Claude Haiku 4.5 on every refresh, disk-cached per `(prompt_version, course_id, title, description)` | ~$20–30 per full reclassify, near-zero on cache hits | Stays aligned with the prompt; taxonomy changes flow through immediately via `PROMPT_VERSION` bump |

At current scale (~12K courses, infrequent refresh) (b) wins on operational simplicity and total cost. (a) starts to win if any of:

- Call volume grows (e.g. real-time classification of newly added courses)
- The taxonomy stabilizes enough that retraining is annual not weekly
- Anthropic API spend becomes a sustainability concern

The two-pass setup in [`classifier/classify.py`](../classifier/classify.py) is a smart cost reducer: pass 1 is a 1-token title-only filter, pass 2 is the full classification on survivors. README claims ~50% pass-2 savings.

---

## 4. Open Questions & Active Work Items

> **This section is transient.** Items are expected to migrate to GitHub Issues as they're picked up. The list should shrink over time.
>
> **Snapshot pin: `ba40928`.** Observations below are verified against this commit. If you're reading this doc on a later commit, re-verify before acting — see [Audit history](#audit-history) at the bottom.

### 4.1 Scope: are fellowships and projects still in?

The Apr 27 kickoff framed the system as covering **classes + fellowships + research projects**. The repo today is classes only (`web/src/app/types.ts` only models `Course`; no `Fellowship` or `Project` types). Open question for the team: are fellowships and projects deferred to a later milestone, or has scope narrowed? Materially affects what work is on the table.

### 4.2 Two classifier prompts that disagree

- [`classifier/classify.py`](../classifier/classify.py) defines a 4-category PIT verdict (`pit_specific`, `tech_applied_to_impact_area`, `ethics_policy_of_tech`, `pit_knowledge_pillar`) with structured `impact_areas` from the 19-area taxonomy.
- [`VS/pit_classifier_prompt.xml`](../VS/pit_classifier_prompt.xml) defines a binary `PIT_RELATED` / `NOT_PIT_RELATED` verdict with a flat `pit_impact_areas` list.

Output schemas, rule numberings, and few-shot examples all differ. Looks like two parallel versions. Question for the team: is `VS/` a sandbox, an experimental rewrite, or canonical? Needs reconciliation before either drifts further.

### 4.3 No validation gold set

There's no labeled ground-truth dataset and no F1 / precision / recall measurement. The current quality signal is `confidence` self-reported by the same model doing the labeling — circular. A hand-labeled holdout of ~100 examples would let us measure pass-2 precision and detect drift across Haiku revisions.

### 4.4 Cost optimization untapped

`classifier/classify.py` uses synchronous `client.messages.create` across a thread pool. Neither **prompt caching** nor the **Batch API** is enabled. The system prompt is large (full taxonomy + 6 few-shot examples) and identical across every call, so prompt caching alone would cut pass-2 cost by an estimated 70%; Batch API would halve it again. Concretely: ~$20–30 → ~$3–5 per full reclassify. ~50 lines of change.

### 4.5 Taxonomy duplication has grown asymmetric

[`classifier/taxonomy.py`](../classifier/taxonomy.py) is the Python source of truth: 19 impact areas + 4 PIT categories + knowledge pillars + exclusion patterns. [`web/src/app/taxonomy.ts`](../web/src/app/taxonomy.ts) mirrors the 19-area list and 4 PIT categories — but **as of the `19 → 7 themes` UI restructure, it has also grown TS-only structure that has no Python equivalent**:

- `ImpactTheme` type with 7 themes (`justice`, `health`, `environment`, `civic`, `ethics`, `education`, `government`)
- `IMPACT_AREA_THEME: Record<string, ImpactTheme>` mapping each of the 19 areas to one of the 7 themes
- `THEME_STYLES` with Tailwind classes per theme
- Helper functions (`impactAreaTheme`, `areaChipClass`, `primaryTheme`)

README still instructs contributors to "keep these in sync" but the 7-theme grouping isn't synced from anywhere — it lives only in TS. If the classifier ever needs to know about themes (for instance, to use the 7 themes as classification categories instead of the 19 areas), it would have to either reach into TS code or duplicate the mapping. Codegen from a single JSON source consumed by both runtimes is the natural fix; this is more important now than it was before the restructure.

### 4.6 Documentation drift after the 19 → 7 themes restructure

The UI changes that landed in `b9651a0` / `9305623` (themes as filter, 19-area chips for display only) are correct, but the surrounding docs haven't been updated to match:

- **README.md** still describes the 19 PIT impact areas as the primary classification *and filter* mechanism. The reality is now: 19 areas remain the classification schema; 7 themes are the filter UI. Worth a short paragraph clarifying the two levels.
- **`docs/data-source.md`** lists "What we pull per course" but omits the new `offered_terms` (`list[str]`) and `is_offered_this_year` (`bool`) fields the scraper now emits. Filterable signal in the UI; should be in the doc.

Either fixable in a quick PR; flagging here in case anyone wants to grab them before they grow.

---

## 5. Possible Contributions

> **Pending role confirmation.** Listed in rough priority order; happy to take none, one, or several depending on what fits.

a. **Validation harness** — held-out gold set + per-category F1 measurement. Biggest quality win; doesn't step on anyone else's work.

b. **Prompt caching + Batch API for `classify.py`** — well-scoped, ~50 lines, biggest cost win.

c. **Reconcile `classifier/classify.py` and `VS/pit_classifier_prompt.xml`** — coordination work, requires team decision on which is canonical.

d. **Codegen taxonomy across Python and TS** — small, defensive, removes a bug class. *More important after the 19 → 7 themes restructure* (see §4.5) since the asymmetry can't be hand-synced.

---

## Appendix: Investigation log

The full scoping investigation (Navigator probes, OnCourse bundle analysis, ExploreCourses XML verification) is recorded in a private Obsidian vault. Reproducible commands are inlined above wherever the resulting claim is verifiable — `curl https://explorecourses.stanford.edu/robots.txt` for the cache-bleed footnote, the OnCourse bundle introspection for the architectural reference. Happy to share the raw notes if useful.

---

## Audit history

Each entry pins the §4/§5 observations to a specific commit so future readers can see when content was last verified against the code.

- **2026-05-23 (`ed21c25`)** — Initial draft of this doc. Audit content verified against commit `ed21c25` (HEAD at the time the PR opened). Landed on main as `ba40928` via [PR #1](https://github.com/madanva/haas-ai-project/pull/1).
- **2026-05-24 (`ba40928`)** — Re-audit after the `19 → 7 themes` UI restructure (`9305623`, `b9651a0`) and related work landed on main during PR #1's review window. §4.5 expanded (taxonomy asymmetry grew); §4.6 added (documentation drift). §§4.1–4.4 unchanged.
