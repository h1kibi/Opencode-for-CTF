# REV Network Replay Template

One-shot workflow for CTF challenges that combine **network session replay + packet capture analysis + key search + batch decryption**. Designed to minimize environment assembly time by leaning on the `revlab:ubuntu22.04` image (preinstalled: tshark/capinfos/file/strings/binwalk/upx/binutils/readelf/objdump/nm + python3 + pycryptodome + scapy + pwntools + capstone + unicorn + z3 + angr + go toolchain).

## When to Use

- Challenge ships a binary **plus** a pcap, a `remote.endpoint`, a sample traffic log, or a "decode the captured protocol" hint.
- Protocol is custom (non-HTTP/non-DNS) with a recognizable magic (e.g. `ET3RNUMX`) or length-prefix framing.
- The binary itself is the server/client and you want to **reproduce** the captured session rather than blindly reversing the protocol.

## Prerequisites

1. Build the revlab image once:
   ```powershell
   .\scripts\build-revlab.ps1 -RunCheck
   ```
2. Workspace has either:
   - a single binary + a pcap, or
   - a binary + `host:port` to spawn and capture from.

## Workflow (5 phases)

### Phase 1 — Inventory

- `ctf-one-shot-triage .` or `ctf-file-triage <artifact>`.
- Identify: binary arch/runtime (Go? Rust? C++? packed?), pcap link-type, observed protocol hints (magic, length, plain text).
- Record findings in `work/ctf-evidence/<slug>/inventory.md`.

### Phase 2 — Reproduce session (optional)

If the binary is a server/client you can run:

1. Lock runtime substrate via `ctf-pwn-runtime-lock` (binary + revlab image).
2. Start the binary inside the container:
   ```text
   ctf-pwn-docker-runner image=revlab:ubuntu22.04 script="cd /work && ./server 2>&1 | tee /work/work/server.log"
   ```
3. In another container/terminal, replay the captured client side (or `scapy` replay script). Capture with `tcpdump -i lo -w replay.pcap`.
4. Compare `replay.pcap` against the provided pcap with `ctf-pcap-probe` + `ctf-pcap-carve`.

If reproduction is not needed, skip to Phase 3.

### Phase 3 — Packet carve

```text
ctf-pcap-probe target=<capture.pcap>
# identify protocol magic + length framing
ctf-pcap-carve target=<capture.pcap> magic=ET3RNUMX lengthSize=2 lengthEndian=big cipher=none
```

If magic/length unknown:
- Inspect protocol_hierarchy output and pick the suspicious non-HTTP/DNS layer.
- Run `ctf-pcap-carve autoTryXorBytes=true` to brute single-byte XOR.
- For length-prefix variants, sweep `lengthSize` over {0,1,2,4} and `lengthEndian` {big,little}.

### Phase 4 — Key search

Search the binary and assets for likely keys:

- `ctf-binary-probe` and grep `interesting_strings` for hex/base64/ascii candidates.
- `ctf-elf-slice` (ELF) / `ctf-rev-pe-slice` (PE) with keyword `key|seed|nonce|iv|salt|0x[0-9a-f]{8,}`.
- For Go binaries, `ctf-go-pclntool` to recover `main.*` function names; then `ReVa_get-decompilation` on `main.encode` / `main.handshake` / `main.sessionKey`.
- Search `assets/` (APK) / `.rodata` (ELF) / `.rdata` (PE) with `ctf-artifact-page` for byte arrays of length 16/24/32 (likely AES/ChaCha keys) or 256 (likely S-box).

### Phase 5 — Batch decrypt + verify

```text
ctf-pcap-carve target=<capture.pcap> magic=ET3RNUMX lengthSize=2 cipher=rc4 key=<hex_or_ascii>
# or
ctf-pcap-carve target=<capture.pcap> magic=ET3RNUMX lengthSize=2 cipher=xor_key key=0xDEADBEEF
```

For AES/ChaCha (TS unsupported):
1. Run inside the revlab container:
   ```python
   from Crypto.Cipher import AES, ChaCha20
   key = bytes.fromhex("...")
   for frame in frames:
       cipher = AES.new(key, AES.MODE_ECB)
       print(cipher.decrypt(frame))
   ```
2. Compare against expected success/failure oracle from the binary.

For 1-byte XOR with auto-discovery:
```text
ctf-pcap-carve target=<capture.pcap> magic=ET3RNUMX autoTryXorBytes=true
```

### Phase 6 — Flag verification

- `ctf-flag-grep work/` over carved outputs.
- If the protocol produces flag-shaped plaintext in any frame, write `agent_flag.txt`.
- If reproduction was used, compare `replay.pcap` decrypted frames against provided pcap decrypted frames for byte equality.

## Stop rules

- If `ctf-pcap-probe` reports `verdict=direct_flag`, stop and verify.
- If 2 different magic guesses both produce no parseable frames, switch to **full binary reversing** (`ctf-rev` skill) instead of more carving sweeps.
- If 3 cipher/key combinations all yield non-printable output, treat the magic/length assumption as wrong and re-derive from binary reversing.

## Handoff

When this template does not close in ~30 min, hand off to `ctf-rigorous` with:

- `work/ctf-evidence/<slug>/inventory.md` (target + observed protocol hints)
- `work/rev-network-replay/replay.pcap` (if reproduced)
- `work/rev-go-pclntool/` outputs (if Go binary)
- top-3 hypotheses: (a) wrong magic/length, (b) wrong cipher family, (c) wrong key source
- best next probe with oracle + falsify
