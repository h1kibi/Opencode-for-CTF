# PWN Competition Readiness Checklist

Use this checklist after prompt/template updates and before live CTF use. It focuses on the division of labor:

- `ctf-pwn-fast`: solve simple/template PWN quickly; solve many medium tasks; escalate cleanly when complexity dominates.
- `ctf-rigorous`: consume fast handoff, reduce hard primitives, build shortest closure, and handle remote drift without roulette.

## 1. Fast-lane solve expectations

`ctf-pwn-fast` should pass these before live use:

| Case family | Expected outcome |
|---|---|
| ret2win / no-canary BOF | solved with route-specific `exploit.py` |
| simple ret2libc | leak-to-base chain or near-closure exploit |
| fmt leak starter | leak map first, no premature `%n` roulette |
| fmt write template | `%n` only after offset/writability proof |
| NX-off / shellcode | shellcode or ORW shellcode chosen quickly |
| seccomp/static | ORW/syscall route before shell aesthetics |
| simple UAF/DF | fast template only after stale/refill primitive is proven |
| bundled libc / ld present | runtime doctor forces the correct base before heap or overlap validation |
| exact-length menu read | helper contract is locked before repeated send/sendline retries |
| obvious hard heap/C++/FSOP | early clean handoff, not fake fast-mode solving |

## 2. Fast-lane handoff quality gate

An unsolved fast run is acceptable only if the handoff includes:

- binary/libc/ld/Docker/run-script/remote inventory;
- runtime-doctor or equivalent substrate-gate output when bundled libc/ld exists;
- mitigation summary;
- protocol/input model;
- selected fast route and why;
- attempted payloads with same-family count;
- strongest primitive or signal;
- stable leaks and forbidden unknown-class leaks;
- exploit file path and last-known-good command;
- local/remote output summaries when tried;
- active substrate and unlock condition;
- one best next rigorous probe with oracle, confirm, and falsify condition.

If any of these are missing, `ctf-rigorous` may waste time repeating triage.

## 3. Rigorous hard-PWN expectations

`ctf-rigorous` should demonstrate these behaviors on medium/hard replays:

| Phase | Expected behavior |
|---|---|
| `PWN_HARD_INTAKE` | consume `pwn_fast_handoff.md` or compact state before broad triage |
| `PWN_PRIMITIVE_REDUCTION` | prove control/leak/AAR/AAW/overlap/syscall surface before naming technique |
| `PWN_CLOSURE_BUILD` | direct flag/data-only/output hijack/ORW before heavy shell aesthetics |
| `PWN_REMOTE_ADAPT` | transcript/IO/libc/stack-alignment checks before gadget mutation |

## 4. Regression command

Run one case at a time while developing rules:

```powershell
node scripts/check-pwn-benchmarks.ts benchmarks/pwn/<case>
```

Recommended first smoke set:

```text
benchmarks/pwn/ret2win-basic
benchmarks/pwn/fmtstr-leak-write
benchmarks/pwn/seccomp-orw
benchmarks/pwn/heap-uaf-reduction
benchmarks/pwn/remote-drift
benchmarks/pwn/cxx-inventory-uaf
benchmarks/pwn/safe-linking-leak-classification
```

## 5. Live CTF go/no-go criteria

Go to live CTF testing when:

- CTF agents have no fixed `model` field and follow the session model;
- `ctf-pwn-fast` creates or updates `exploit.py` early on template cases;
- bundled `libc.so.6` / `ld` forces `ctf-pwn-libc-runtime-doctor` or an equivalent hard gate before heap/overlap validation continues;
- exact-length menu/raw contracts trigger helper locking instead of repeated send/sendline drift;
- hard triggers produce `pwn_fast_handoff.md` instead of long prose;
- `ctf-rigorous` resumes from handoff without broad repeated triage;
- local-success/remote-fail branches use remote drift tools before gadget roulette;
- failure cases produce `templates/pwn_failure_signature.md` data for patching.

## 6. After-action feedback loop

After each live or benchmark failure:

1. Fill `templates/pwn_failure_signature.md`.
2. Patch exactly one of: agent rule, exploit template, benchmark expected behavior, or pattern card.
3. Re-run the closest benchmark case.
4. Promote the lesson only if it is reusable beyond the specific challenge.
