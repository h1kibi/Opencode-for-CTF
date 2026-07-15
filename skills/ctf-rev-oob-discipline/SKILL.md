---
name: ctf-rev-oob-discipline
description: Use for REV challenges where the binary or runtime exhibits out-of-band behavior — self-decryption, asset download, callback to attacker server, license server check, network-fetched bytecode, runtime patch download, or telemetry beaconing. Provides receive-only vs response-serving infrastructure distinction, capability gating, and stop rules specific to reverse engineering contexts.
compatibility: opencode
---

# CTF REV OOB Discipline

Use this skill when a REV challenge involves any of the following, even before exploitation:

- Binary self-decrypts code at runtime
- Binary fetches assets / bytecode / keys / patches from network
- Binary uses license server / authentication endpoint
- Binary calls back to attacker-controlled server (C2-like behavior in CTF)
- Binary downloads its real payload from a remote URL
- Mobile app fetches DEX/JNI/asset from CDN
- Binary uses DNS-based C2 / TXT-record-based key delivery
- Binary expects to receive bytes via UDP/TCP/HTTP for decryption oracle
- Frida/instrumentation needs to observe network traffic to reverse the protocol

`ctf-oob-discipline` (the original) is **web/crypto focused**: receive-only OOB (Interactsh) vs response-serving OOB (controllable HTTP server). REV has different OOB semantics that this skill captures.

## REV-Specific OOB Capability Matrix

| OOB Capability | What it provides | What REV uses it for |
|---|---|---|
| **observation-only** | Capture outbound traffic to know what binary requests | Identify protocol, key endpoints, payload format |
| **response-serving** | Reply with attacker-controlled bytes | Inject custom payload to control execution flow |
| **MITM-capable** | Intercept and modify in-flight bytes | Modify bytecode/key responses to bypass checker |
| **DNS-controlled** | Reply to DNS queries with crafted A/TXT records | Inject keys/bytecode via DNS exfil channels |
| **offline-replay** | Replay captured pcap as fake remote | Reproduce remote session locally for repeated reversing |

## Capability Gating

Before committing to a route that depends on OOB:

| Route | Required Capability | If Missing |
|---|---|---|
| Static reverse with pcap only | observation-only | OK |
| Reproduce remote session locally | offline-replay (pcap) + binary | OK if pcap is complete |
| Inject custom bytecode/payload | response-serving HTTP | Ask user for VPS/listener; do not fake locally without user approval |
| Modify bytecode response in-flight | MITM-capable (host loopback OK) | Use revlab container's `tcpdump`/`tshark` + `socat` to MITM |
| DNS-based C2 reverse | DNS-controlled | Ask user for OOB DNS or use `dnschef` locally |
| License server bypass | response-serving HTTP/TLS + cert | Ask user; or use static patch instead (rank 9 in closure ladder) |

## Triage Decision Tree

```text
Does the binary make ANY network call?
├── No → standard REV (no OOB needed)
└── Yes
    ├── Is the call essential for the validation path?
    │   ├── No → patch/stub the call (rank 9: patch_bypass)
    │   └── Yes
    │       ├── Is the response deterministic (key/bytecode)?
    │       │   ├── Yes → capture once via pcap, then offline-replay
    │       │   └── No (depends on input) → need response-serving OOB
    │       │       ├── User has VPS? → use user's VPS
    │       │       └── No VPS → ask for VPS, OR pivot to static patch
    └── Does the binary fetch its REAL payload from network?
        ├── Yes → pcap-based extraction:
        │   1. Run binary in revlab container with `tcpdump`
        │   2. Capture full pcap including TLS keys (SSLKEYLOGFILE)
        │   3. Decrypt with `tshark -o tls.keylog_file:...`
        │   4. Carve payload with `ctf-pcap-carve`
        │   5. Continue REV on extracted payload
        └── No → standard local REV
```

## Self-Decrypting Binary (No Network)

If the binary self-decrypts in-process (no network), this is **not** OOB but **runtime dump**:

- Use `ctf-rev-live-memory-dump` instead
- Marker = stable stdout line that appears AFTER decryption
- Capture `/proc/<pid>/mem` at marker time
- See `knowledge/rev/packed/packed-unpack-workflow.md`

## Asset/CDN Download (HTTP/HTTPS)

If the binary downloads assets from a CDN:

```text
1. Run binary in revlab container with strace -f -e network ./binary
2. Identify URLs from connect() / openat() calls
3. curl the URLs and save responses
4. If TLS: use --insecure or capture with mitmproxy + custom CA
5. Once payload captured, carve with ctf-pcap-carve or analyze directly
6. Replay with local server (python3 -m http.server) if binary needs to re-fetch
```

## License Server Check

If the binary checks a license/auth server:

| Strategy | When to Use |
|---|---|
| **Patch the check** (rank 9) | Check returns boolean; flag is local | 
| **Replay captured response** | Check is read-only; response is deterministic |
| **Spoof response** | Check returns key/data needed for flag computation |
| **Bypass with hosts file** | Server hostname known; redirect to localhost |
| **MITM with mitmproxy** | TLS-based; need to inject custom cert |

For CTF contexts, **patch first** — license servers are usually not part of the intended challenge.

## Mobile (APK) OOB

APK fetches DEX/JNI/asset from network:

```text
1. ctf-apk-triage to find network endpoints in manifest/strings
2. ctf-android-runtime-doctor to confirm runtime equivalence
3. Run app in container/emulator with proxy (mitmproxy on :8080)
4. Capture downloaded payload
5. Decompile with ctf-jadx-targeted-slice on captured payload
6. If JNI library is downloaded: ctf-android-native-triage on .so
```

## DNS-Based C2 (Rare in REV)

If binary uses DNS for key/payload delivery:

```text
1. tcpdump UDP port 53 in revlab container
2. Identify DNS queries (A/TXT records to attacker domain)
3. If attacker domain is dead: replay TXT records via dnschef
4. If attacker domain is live (OOB-controlled): respond with crafted bytes
```

## Stop Rules

- **Do not pivot to OOB before confirming network is on the validation path**. Many CTF binaries have decoy network calls for telemetry that don't affect flag.
- **Patch before MITM**. If the check is binary (success/fail), pwntools patch is faster than building a fake server.
- **Capture pcap once, replay forever**. If response is deterministic, save the pcap and replay locally to avoid repeated network setup.
- **Do not run unknown binaries on host**. Always use revlab container with `--cap-add=NET_RAW` (already in compose service).
- **Ask user before using their VPS for response-serving OOB**. This is a real-world constraint, not just a CTF rule.

## Closure Path

Once OOB capability is established and payload is captured:

1. Save captured payload to `work/<slug>/captured-payload.bin`
2. Continue REV on captured payload (often this becomes a normal binary/blob)
3. Switch to `ctf-rev-closure-ladder` for closure routing
4. Reproducible solver: include capture file in `solve.py` for offline verification

## Receive-Only vs Response-Serving (REV Context)

| Need | Receive-Only Sufficient? | Response-Serving Required? |
|---|---|---|
| Identify protocol from binary | ✅ | ❌ |
| Extract embedded payload from pcap | ✅ | ❌ |
| Replay captured session locally | ✅ | ❌ |
| Inject custom bytecode | ❌ | ✅ |
| Bypass license server with crafted response | ❌ | ✅ |
| MITM TLS with custom cert | ❌ | ✅ |
| Decrypt streaming protocol that depends on input | ❌ | ✅ |

## Companion Tools

- `ctf-pcap-probe` — capture overview (HTTP/DNS/TCP streams)
- `ctf-pcap-carve` — extract custom-protocol frames from pcap
- `ctf-rev-live-memory-dump` — for in-process self-decrypt (not network)
- `ctf-rev-closure-ladder` — closure routing
- `ctf-pwn-docker-runner image=revlab:ubuntu22.04 ...` — controlled execution

## References

- `skills/ctf-oob-discipline` (original web/crypto OOB)
- `knowledge/rev/closure/rev-closure-ladder.md`
- `commands/ctf-rev-network.md` (one-shot workflow)
