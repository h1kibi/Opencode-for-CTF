# PWN Anti-Patterns

Use this file as a stop-rule catalog. Each anti-pattern should kill drift early and replace it with one next action.

## 1. Wrong libc / wrong base validation
- **Signal**: bundled `libc.so.6` exists but validation started on generic pwnlab or host base
- **Damage**: heap, overlap, tcache, FILE, and seccomp conclusions become polluted
- **Correct action**: run `ctf-pwn-libc-runtime-doctor`, relock substrate, then repeat only the minimum validation
- **Stop rule**: no more heap mutation until runtime lock is explicit

## 2. Menu helper drift
- **Signal**: repeated `sendlineafter` / `sendafter` toggling, exact-length reads like `read(size+1)`, unexplained leftover prompt bytes
- **Damage**: later probes fail for protocol reasons and get misclassified as exploit failure
- **Correct action**: run `ctf-pwn-menu-contract-probe`, define one helper per menu phase
- **Stop rule**: no more gadget or heap mutation until helper contract is fixed

## 3. Primitive already exists but branch stays broad
- **Signal**: stable leak, write primitive, or direct ORW is already available, but branch keeps reopening alternate families
- **Damage**: contest time burns on unnecessary route churn
- **Correct action**: write a closure card and force shortest-closure probes only
- **Stop rule**: do not open a new family without a falsifier for the current primitive

## 4. `.bss` arbitrary write treated as mandatory closure owner
- **Signal**: `.bss` or global write exists and the branch assumes it must become the final path
- **Damage**: misses shorter output-hijack, path overwrite, FILE, or ORW routes
- **Correct action**: run adjacency / output-hijack closure checks before heavier shell/ROP work
- **Stop rule**: if no shorter consumer exists after focused checks, only then continue heavier closure work

## 5. Long reference replaces next probe
- **Signal**: branch cites a large writeup or reference chapter instead of extracting one experiment
- **Damage**: knowledge does not become action
- **Correct action**: translate the doc into one trigger, one first safe check, one next probe
- **Stop rule**: if the reference cannot yield a next probe in under 30 seconds, demote it
