---
description: CTF REV network-replay + pcap-carve + key-search one-shot workflow
agent: ctf-rev
subtask: false
---

Run a CTF REV challenge that combines **network session replay + packet capture analysis + key search + batch decryption** in one shot, leaning on the preinstalled `revlab:ubuntu22.04` image so tool assembly is not the bottleneck.

Challenge/target:
$ARGUMENTS

Use skills: `ctf-common`, `ctf-terminal`, `ctf-rev`.

## Pre-flight

1. Confirm revlab image is built. If not, ask the user before building (the build is a long network operation):
   ```powershell
   .\scripts\build-revlab.ps1 -RunCheck
   ```
2. If the user says skip-build, fall back to host tooling where possible; record `image_missing` in `notes.md`.

## Workflow

Follow `templates/rev-network-replay.md` exactly. Condensed:

1. **Inventory**: `ctf-one-shot-triage` / `ctf-file-triage`; record binary arch/runtime + pcap link-type + protocol hints.
2. **Reproduce session (optional)**: lock substrate with `ctf-pwn-runtime-lock`; run binary in `revlab:ubuntu22.04` via `ctf-pwn-docker-runner`; capture `replay.pcap` with `tcpdump -i lo`.
3. **Packet probe**: `ctf-pcap-probe target=<capture.pcap>`; auto-uses revlab docker when host tshark/capinfos/file missing.
4. **Packet carve**: `ctf-pcap-carve target=<capture.pcap> magic=<MAGIC> lengthSize=<N> cipher=none`. If magic unknown, sweep `{0,1,2,4} × {big,little}` and `autoTryXorBytes=true`.
5. **Key search**: `ctf-binary-probe` + `ctf-elf-slice` / `ctf-rev-pe-slice` for key candidates (16/24/32 byte arrays). For Go binaries, `ctf-go-pclntool` to recover `main.encode/main.handshake/main.sessionKey`, then ReVa decompile.
6. **Batch decrypt**: `ctf-pcap-carve target=<capture.pcap> magic=<MAGIC> lengthSize=<N> cipher=rc4|xor_key|xor_byte|aes_ecb key=<hex_or_ascii>`. For AES/ChaCha, run python3 pycryptodome inside the container.
7. **Flag verification**: `ctf-flag-grep work/`; compare reproduced pcap decrypted frames vs provided pcap decrypted frames for byte equality; write `agent_flag.txt` only after verification.

## Backend selection

- `ctf-pcap-probe`: backend=auto (host first; docker fallback).
- `ctf-go-pclntool`: backend=auto (host go first; revlab docker fallback).
- `ctf-pcap-carve`: pure TS, no external deps; runs on host always.
- `ctf-pwn-docker-runner`: explicit image required; pass `image=revlab:ubuntu22.04`.

## Stop rules

- `ctf-pcap-probe verdict=direct_flag` → verify and stop.
- 2 failed magic guesses → switch to full `ctf-rev` binary reversing.
- 3 failed cipher/key combos → re-derive magic/length from binary reversing.
- 30 min without closure → hand off to `ctf-master` with `inventory.md` + `replay.pcap` + top-3 hypotheses.

## Required artifacts at handoff

- `work/ctf-evidence/<slug>/inventory.md`
- `work/rev-network-replay/replay.pcap` (if reproduced)
- `work/rev-go-pclntool/rename_ida.py` (if Go binary)
- `notes.md` with backend_used, missing tools, blocker reason
