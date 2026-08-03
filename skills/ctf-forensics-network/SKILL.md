---
name: ctf-forensics-network
description: Use for PCAP / PCAPNG / network capture forensics — protocol analysis, file extraction, covert channels, and traffic reconstruction.
compatibility: opencode
---

# CTF Forensics — Network Analysis

## Stop Conditions

Stop before destructive extraction, when provenance would be lost, when the required tool/fallback is unavailable, or when the artifact class is falsified. Do not repeat equivalent extraction attempts without a new discriminator.

## Output Contract

Return confirmed evidence, uncertainty, source artifact/offset, command or tool used, status (`continue`, `pivot`, `blocked`, `dead`, or `close`), and exactly one next action.

## Dispatch / Handoff

Return artifact paths, hashes, offsets/streams, tool output, interpretation, and one next action to `ctf-forensics`; preserve provenance across any child artifact.

## First Safe Action

Hash and preserve the capture, identify interfaces/time range/protocols, then run a bounded protocol inventory.

## Required Inputs

Require the original artifact, hash/provenance, acquisition constraints, current forensics phase, and the exact extraction question.

## Do Not Load When

Do not load without the matching artifact class, and do not use this focused skill to replace `ctf-forensics` preservation, provenance, or phase ownership.

## Load When

Load when the artifact is PCAP/PCAPNG or a captured network stream requiring protocol, file, or covert-channel reconstruction.

## Trigger

Load when triage identifies: `.pcap`, `.pcapng`, or network stream captures.

## Primary Tools

- `tshark` — CLI packet analyzer
- `tcpdump` — packet capture and filtering
- `Wireshark` — GUI analysis (use for complex cases)
- `ngrep` — pattern matching on network layer

## Key tshark Commands

```bash
# Protocol hierarchy
tshark -r capture.pcap -z io,phs

# HTTP requests
tshark -r capture.pcap -Y http.request -T fields -e http.host -e http.request.uri

# DNS queries
tshark -r capture.pcap -Y dns -T fields -e dns.qry.name

# TCP conversations
tshark -r capture.pcap -z conv,tcp

# Export HTTP objects
tshark -r capture.pcap --export-objects http,./extracted

# Follow TCP stream
tshark -r capture.pcap -z follow,tcp,ascii,0

# TLS details (requires keylog)
tshark -r capture.pcap -o tls.keylog_file:keys.log -Y tls
```

## Detection Patterns

- DNS tunneling: high volume of unique subdomains, long TXT queries
- Covert channels: unusual protocols on standard ports, timing analysis
- Data exfiltration: large HTTP POSTs, DNS TXT with encoded payloads
- Beaconing: regular intervals of small packets to same IP
