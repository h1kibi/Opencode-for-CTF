# CTF Operating Rules

This configuration is for authorized CTF, lab, benchmark, and local challenge solving only.

## Global Solve Loop

1. Identify scope, target, files, service, and flag format.
2. Run low-cost triage before deep exploitation.
3. Build a hypothesis table with evidence, confidence, cost, and next action.
4. Test one hypothesis at a time.
5. Record command purpose, command, key output, interpretation, and fallback in `notes.md`.
6. Prefer local reproduction before remote exploitation.
7. Produce `solve.py`, `solve.js`, `solve.sage`, or `exploit.py` when practical.
8. Write `agent_flag.txt` only after verified challenge behavior or justified extraction.

## Never

- Do not attack unrelated third-party systems.
- Do not guess flags.
- Do not use hidden benchmark metadata as the solution.
- Do not repeat failed payload families without a changed hypothesis.
- Do not run destructive commands against original artifacts.

## Default Output Files

- `notes.md`: triage, observations, hypotheses, commands, failed paths, exploit path.
- `solve.py` / `solve.js` / `solve.sage` / `exploit.py`: reproducible final method.
- `agent_flag.txt`: exact verified flag only.

## Use Tools First

- For unknown files, prefer `ctf-file-triage` before manual guessing.
- For RSA-like challenges, prefer `ctf-rsa-probe` before writing attacks.
- For Web URLs, prefer `ctf-web-probe` only on authorized or local challenge URLs.
- For possible flags, use `ctf-flag-grep` before claiming unsolved.
