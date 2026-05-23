#!/usr/bin/env bash
# Refresh the PIT class dataset end-to-end.
#
# 1. Scrape every active Stanford course (current academic year) from
#    explorecourses.stanford.edu.
# 2. Classify each course with Claude Haiku 4.5 (cached on disk — unchanged
#    courses from prior runs are not re-classified).
# 3. Copy the classified output into web/public/ so the static site picks it up.
#
# Required: ANTHROPIC_API_KEY in pit-classifier/.env (see .env.example).
# After this finishes, redeploy the web/ build (or just refresh localhost:3000
# in dev — the JSON is fetched at runtime).

set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> [1/3] Scraping explorecourses.stanford.edu..."
python3 -m scraper.fetch_classes

echo
echo "==> [2/3] Classifying courses with Claude Haiku 4.5..."
python3 -m classifier.classify

echo
echo "==> [3/3] Publishing to web/public/classified.json..."
cp data/classified.json web/public/classified.json
echo "    $(ls -lh web/public/classified.json | awk '{print $5}')"

echo
echo "Done. Re-build the site:   cd web && npm run build"
echo "Or just refresh the dev server if it's running."
