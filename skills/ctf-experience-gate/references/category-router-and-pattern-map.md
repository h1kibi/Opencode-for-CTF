# Category Router and Pattern Map

Use before spawning subagents or when a branch is drifting across Web, pwn, reverse, crypto, forensics, and misc evidence.

## Cross-Category Evidence Router

| Evidence | Prefer | First primitive to prove | Pivot if |
|---|---|---|---|
| HTTP routes, JS, cookies, templates, APIs, browser bot | Web | read/bypass/forge/render/execute one controlled effect | source shows crypto/math/binary/forensics as real blocker |
| Native binary, crash, checksec, libc, heap, ROP, kernel | Pwn | leak, write, control RIP/function pointer, syscall, win path | behavior not understood -> reverse first |
| Obfuscated binary, APK, WASM, bytecode, VM, anti-debug | Reverse | recover validation logic, constants, state machine, transform | bug understood and exploit remains -> pwn; algorithm is crypto -> crypto |
| RSA/AES/ECC/lattice/PRNG/hash/signature/math oracle | Crypto | recover key/plaintext/nonce/seed or forge one token | artifact extraction or implementation reversing is blocker |
| PCAP, disk image, memory dump, image/audio/PDF/archive/stego | Forensics | extract artifact, stream, hidden layer, credential, or flag fragment | recovered app/binary/crypto becomes blocker |
| Jail, encoding stack, esolang, game, VM puzzle, DNS/RF oddity | Misc | escape, decode layer, solve constraints, recover protocol state | becomes web/pwn/rev/crypto/forensics dominated |

## Category First Questions

### Web

- Where is the flag likely to be: browser, API, file, DB, internal service, admin state?
- What boundary is trusted: header, cookie, route, object ID, parser, template, file path, upload metadata, callback URL?
- Are multiple parsers disagreeing: proxy/app, URL/fetcher, sanitizer/browser, checker/sink, content-type/body parser?
- What is the smallest primitive: read one file, forge one token, call one endpoint, trigger one bot visit?

### Pwn

- Do we understand the binary behavior, or should reverse run first?
- What protections matter: PIE, NX, RELRO, canary, seccomp, ASLR, libc version?
- What primitive exists: leak, overflow, format string, UAF, OOB, arbitrary read/write, syscall, win function?
- What is the shortest stable chain: ret2win, ret2libc, ROP/SROP, heap poisoning, FSOP, kernel privesc?

### Reverse

- What is the validation target: flag string, license, protocol, VM bytecode, game state, cryptographic transform?
- Is static analysis enough, or is a runtime oracle faster?
- Are there anti-analysis mechanisms: packing, ptrace, timing, signals, self-modifying code, VMProtect/Themida-like behavior?
- Can constants/transforms be extracted into a solver instead of fully decompiling everything?

### Crypto

- What are the public parameters, oracle access, and flag encoding?
- Is this textbook misuse, weak parameters, nonce/seed reuse, padding/oracle, lattice/Coppersmith, or custom algebra?
- Can known prefix/format reduce the problem?
- Is the fastest path direct math, Sage/Python modeling, z3/LLL, or protocol interaction?

### Forensics

- What artifact type is real: archive, disk, memory, pcap, image, audio, PDF, logs, registry, Docker layer?
- Is the flag direct, fragmented, encoded, hidden in metadata, carved, or recovered via timeline?
- What layer should be peeled first, and what evidence proves progress?
- If a recovered artifact is another challenge type, pivot quickly.

### Misc

- Is it encoding, jail, constraint puzzle, protocol oddity, game/VM, DNS/RF, or platform navigation?
- What is the oracle: length, comparison, timeout, error, score, server state, decoded layer?
- Can the task be modeled with z3, dynamic programming, graph search, symbolic execution, or automated interaction?
- Stop manual guessing when a solver/oracle model exists.

## Fast Pattern Map

Use this as a local pattern recall layer before external search.

### Web patterns

- Parser mismatch, template/file read, SSRF, command execution, XML/XXE, upload/write, deserialization -> server-side pattern family.
- XSS, CSP, admin bot, DOM, postMessage, browser normalization, cache poisoning -> client-side pattern family.
- JWT, cookie signing, OAuth/OIDC, SAML, IDOR, hidden admin, role/tenant confusion -> auth/access pattern family.
- Source/config leak -> secret recovery -> token/session forgery is often faster than payload brute force.

### Pwn patterns

- Crash with easy control -> ret2win/ret2libc before exotic ROP.
- Format string -> leak first, then write primitive; avoid blind overwrite before offset/oracle.
- Heap/UAF/OOB -> identify allocator/libc/tcache/fastbin/unsorted primitive before one_gadget hunting.
- Seccomp/kernel/sandbox -> enumerate allowed syscalls/objects before generic shellcode.

### Reverse patterns

- Strings/constants/imports first; then validation slice; then dynamic oracle if static is noisy.
- Custom VM -> identify instruction format, dispatch loop, state registers, and trace one sample.
- Anti-debug/packing -> bypass/dump/trace minimal region, not full unpack unless needed.
- Transform validation -> lift to Python/z3; do not decompile unrelated UI/framework code.

### Crypto patterns

- RSA -> check small factors, shared primes, small e, common modulus, close primes, leaked dp/dq/phi, broadcast, Coppersmith.
- Symmetric -> mode misuse, IV/nonce reuse, padding oracle, ECB/cut-paste, CBC bitflip, GCM nonce reuse.
- PRNG -> seed/time, LCG/MT/LFSR state recovery, partial outputs, known plaintext.
- Lattice/ECC/ZKP -> identify dimension, leakage type, subgroup/order, reused nonce, invalid curve, setup trust.

### Forensics patterns

- File/archive -> magic bytes, embedded files, trailing data, safe extraction, flag grep.
- PCAP -> HTTP/DNS/TCP streams, credentials, uploaded/downloaded files, timing/covert channels.
- Disk/memory -> process list, filescan, registry/logs, deleted files, browser artifacts, Docker layers.
- Media/stego -> metadata, bitplanes, palettes, frames, audio spectrogram, QR/barcode, overlay/trailing data.

### Misc patterns

- Encoding stack -> identify charset/alphabet/entropy/magic bytes; automate layered decode.
- Pyjail/bashjail -> enumerate allowed syntax/builtins, oracle, object graph, environment, no-call/no-quote bypass families.
- Game/VM/constraint -> model state transitions; use z3/DP/search rather than manual play.
- CTF platform/navigation -> use API/state carefully; separate platform hints from challenge artifacts.
