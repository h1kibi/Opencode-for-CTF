# PWN Fast Autonomy

Use this reference when `ctf-pwn-fast` should prefer model intuition and exploit throughput over human-authored micro-workflows.

## Core Rule

- Prefer the shortest evidence-backed closure path that can be turned into `exploit.py` with a clear oracle.
- Do not open helper tools just because they exist; open them when they remove a concrete uncertainty that blocks the next exploit iteration.
- If one short probe can materially reduce route uncertainty, run it. Otherwise write or edit the exploit.

## Model-First Promotion Conditions

Bias toward direct exploit iteration when all of these are true:

- one route family already looks plausible;
- the next payload change can be stated in one sentence;
- the success or failure oracle is clear;
- there is no strong signal of runtime mismatch, remote drift, helper-contract ambiguity, or primitive misclassification.

## Helper Demotion Rules

Treat these as conditional triggers, not opening rituals:

- `ctf-pwn-menu-contract-probe`
- `ctf-pwn-redflag-panel`
- `ctf-pwn-remote-drift-check`
- `ctf-pwn-libc-runtime-doctor`
- `ctf-pwn-container-probe`

Open them when the current blocker is specifically input contract, checker-style bug shape, local/remote divergence, wrong-runtime suspicion, or missing container capability.

## Soft Budget Interpretation

- The 15-minute budget is a strategy horizon, not a fixed screenplay.
- If closure distance is shrinking and the current family still has a clean oracle, continue.
- If the branch starts needing top-3 queue management, allocator theory, repeated runtime repair, or broad route re-ranking, stop pretending it is fast and hand off.

## Hard Guardrails That Still Stay

- Keep one serious exploit family active at a time.
- Stop after two same-family probes with no new oracle, then take exactly one orthogonal discriminator or hand off.
- Keep runtime-sensitive work on the locked substrate.
- A handoff without `exploit.py` or a next one-variable probe is incomplete unless no route was ever reached.
