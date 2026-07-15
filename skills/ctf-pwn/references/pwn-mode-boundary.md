# PWN Mode Boundary

Use this reference when deciding whether a branch should stay in `ctf-pwn-fast`, escalate to `ctf-rigorous`, or be executed by `ctf-pwn` under a rigorous controller.

## Role Split

- `ctf-pwn-fast`: fast primary opener for simple or medium native PWN with one short closure path.
- `ctf-rigorous`: primary controller for complex, branchy, source-rich, unstable, or multi-family CTF branches.
- `ctf-pwn`: PWN execution specialist. Under rigorous mode it owns exploit doctrine, runtime calibration, leak reduction, heap reduction, and closure experiments, but it does not take over controller duties.

## Keep the Branch in `ctf-pwn-fast` When

- one classic route is already obvious: `ret2win`, `ret2libc`, `fmt`, `shellcode`, `orw`, `stack-pivot`, `ret2csu`, or one simple heap primitive;
- the next best action is creating or editing `exploit.py` rather than building a larger queue;
- the runtime is understandable after one substrate decision;
- the leak class is stable enough for one closure family;
- the branch does not need repeated gdb, allocator theory, or competing top routes.

## Escalate to `ctf-rigorous` When

- allocator or glibc versioning determines whether the branch is real;
- leak class or base math is unstable, contested, or unknown;
- parser side effects, helper drift, or mixed menu/raw phases dominate;
- local proof exists but remote materially diverges;
- seccomp/static closure requires non-trivial syscall or ORW modeling;
- more than one serious exploit family is still alive;
- repeated debugger, replay, or state checkpoints are now cheaper than another fast attempt.

## `ctf-rigorous` Controller Rules for PWN Branches

- keep at most top-3 live hypotheses;
- keep one active execution substrate per branch;
- after a confirmed primitive, promote closure over new family exploration;
- delegate PWN execution to `ctf-pwn` early once the branch is clearly PWN-owned and no longer fast-lane simple;
- use checkpoints and compact ledgers instead of re-running broad triage.

## `ctf-pwn` Specialist Return Contract

When `ctf-pwn` returns control to a rigorous branch, it should return only:

- strongest runtime or source-backed evidence;
- current PWN route owner and route-lock status;
- confirmed primitive or strongest non-proof signal;
- substrate confidence;
- stable versus unstable leaks or calibration blockers;
- one best next PWN-specific probe with oracle and falsify condition.

## Fast-to-Rigorous Handoff Minimum

- exploit artifact path;
- binary/libc/ld/runtime summary;
- mitigation summary;
- input model or prompt contract;
- selected route and same-family attempts already spent;
- exact blocker;
- stable leaks and unknown assumptions clearly marked;
- best next rigorous one-variable probe.
