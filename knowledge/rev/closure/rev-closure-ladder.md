# REV Closure Ladder

The shortest path from "I understand the binary" to "agent_flag.txt written".

This is the REV-equivalent of `ctf-pwn-closure-router`: rank closure paths in priority order; do not promote a more expensive route until the cheaper one is concretely falsified.

## Ladder (priority order)

| Rank | Closure | Trigger Condition | Cost | Tool |
|---:|---|---|---:|---|
| **1** | **Direct flag / plaintext recovery** | Flag-shaped string visible in `strings`, `.rodata`, `.rsrc`, dump | low | `strings`, `ctf-flag-grep` |
| **2** | **Direct checker extraction** | Constants/transform recovered; static algorithm | low | `solve.py` (revlab container) |
| **3** | **Runtime dump** | Self-decrypting / packed / lazy-loaded code | low-medium | `ctf-rev-live-memory-dump` |
| **4** | **Unicorn/Qiling replay** | Checker function isolated; foreign arch / anti-debug | medium | `ctf-rev-unicorn-helper` + `ctf-rev-unicorn-replay-builder` |
| **5** | **Simple transform inversion** | XOR/add/rol/sub/permute confirmed forward | low | `solve.py` |
| **6** | **Z3 / SMT** | Branch-heavy, bounded input, arithmetic constraints | medium | python3 + z3-solver |
| **7** | **angr symbolic execution** | Clear find/avoid addresses; bounded path | medium-high | python3 + angr |
| **8** | **VM lifter / full emulator** | Custom VM with stable opcode set | high | python3 |
| **9** | **Patch-based bypass** | Verification-only goal | medium | `pwntools` `elf.asm(...)` |

## Promotion Rules

A more expensive route may be promoted **only if**:

1. The shorter route was **falsified** (reproduced 2 failed attempts with concrete oracle), OR
2. The harder route is **provably shorter** under current evidence (e.g., 50-byte z3 vs 500-line manual invert), OR
3. The target **naturally requires** that family (e.g., binary IS a Unicorn replay → Unicorn closure inevitable)

## Closure Ledger

Maintain `work/ctf-evidence/<slug>/rev-closure-ledger.md`:

```markdown
| # | Family | Status | Evidence | Falsifier | Time spent |
|---|---|---|---|---|---|
| 1 | direct_flag | falsified | strings shows decoy flag only | grep -i flag returns 1 result, fake | 2m |
| 2 | checker_extract | active | sub_401234 has loop, table @0x405000 | — | 15m |
| 3 | runtime_dump | candidate | UPX detected, but try checker first | — | — |
```

## Stop Rules

- Once **rank 1** confirms (real flag found): write `agent_flag.txt`, stop.
- Once **rank 2-9** produces a working solver: verify with binary, stop.
- After 30 min on rank 5+ with no progress: pivot to next rank or hand off to `ctf-rigorous`.
- After 2 falsified ranks: re-derive the closure family from `ctf-rev-closure-ladder` tool.

## Tool Integration

```text
ctf-rev-closure-ladder evidence="<binary triage + identified primitives>"
# returns:
# - top-3 ranked closure candidates with confirm/falsify oracles
# - one selected next probe
# - stop rule for current rank
```

## Mixed-Surface Closure Owners

When REV is part of a mixed-surface challenge (REV + crypto, REV + web, REV + forensics):

| Mixed | REV's Role | Owner Hand-off Trigger |
|---|---|---|
| REV + crypto | Recover algorithm + key/seed | After algorithm extracted, `ctf-crypto` owns oracle attack |
| REV + web | Recover client-side validation | After bypass found, `ctf-web` owns server-side exploit |
| REV + forensics | Recover protocol parser | After magic/length confirmed, `ctf-forensics` carves & decrypts |
| REV + pwn | Recover binary semantics | After exploit primitive identified, `ctf-pwn` owns close |

Use `ctf-decision-state add_observation owner=rev returnTrigger="..." closureOwner=..." `.

## Anti-Drift

| Anti-pattern | Symptom | Correction |
|---|---|---|
| Reading too much code | 4+ rounds of decompiler exploration without closure plan | Force rank-1 check via `strings`/`grep`, then rank-2 |
| Patching before observation | Modify binary before knowing what semantic to bypass | `failure-rev-patching-before-stable-observation-point` lesson |
| Symbolic before state extraction | Dump constants → angr without understanding control flow | Run `ctf-rev-closure-ladder` to reset rank |
| Decompiler over-trust | Believe `(int)x` semantics without checking assembly width | Verify with `objdump -d` on critical operations |

## Hand-off

If REV closure stalls > 30 min:
1. Fill `notes.md` with: target, identified primitive, falsified routes, current rank, blocker
2. Hand off to `ctf-rigorous` with `templates/ctf_handoff.md`
3. Include `work/ctf-evidence/<slug>/rev-closure-ledger.md` for context

## References

- `skills/ctf-rev-team/SKILL.md` — Rev Closure Priority Ladder section
- `tools/ctf-rev-closure-ladder.ts` — generator/router tool
- `lessons/closure-rev-checker-recovery.md`
- `lessons/failure-rev-patching-before-stable-observation-point.md`
- `lessons/failure-rev-table-constants-read-without-forward-model.md`
- `lessons/failure-rev-symbolic-before-state-extraction.md`
