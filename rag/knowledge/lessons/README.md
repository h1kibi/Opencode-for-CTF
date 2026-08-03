# Structured Lessons Index

This directory stores structured lesson metadata for `ctf-lesson-search` and future decision-layer retrieval.

Current file:

- `lessons.index.json` — structured lesson index

Recommended maintenance flow:

1. Add or edit a lesson in `..\..\lessons\`
2. Run or inspect `ctf-lesson-index-audit`
3. Add missing lesson metadata to `lessons.index.json`
4. Prefer indexing lessons that affect:
   - closure order
   - owner handoff
   - branch penalty
   - anti-pattern demotion

Minimum metadata per lesson:

- `id`
- `file`
- `family`
- `title`
- `triggers`
- `signals`
- `better_question`
- `stop_rule`
- `query_terms`
