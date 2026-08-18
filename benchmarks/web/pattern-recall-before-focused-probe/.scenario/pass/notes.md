# Recon Map

- Route: POST /filter
- Input: query
- Candidate signal: reflected error text contains a database grammar fragment

## Attack Queue

| Candidate             | Value | Cost | Risk | Stability | Confidence | Decision |
| --------------------- | ----- | ---- | ---- | --------- | ---------- | -------- |
| focused grammar check | 8     | 2    | 2    | 8         | 7          | selected |
| broad payload search  | 3     | 8    | 7    | 3         | 2          | rejected |

Candidate signal is concrete: the response contains a database grammar fragment.
After recon and queue ranking, use ctf-web-pattern-search for one pattern recall pass.
Pattern recall: likely boolean-filter family.
First Safe Check: one inert syntax variant against the reflected parameter.
No broad mutation; stop after the first stable response and rerank.
