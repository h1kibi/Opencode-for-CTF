---
name: ctf-forensics-network
description: Use for PCAP / PCAPNG / network capture forensics — protocol analysis, file extraction, covert channels, and traffic reconstruction.
---

# CTF Forensics — Network Analysis

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
