# Network Reference

Use this reference for PCAP / PCAPNG analysis after triage confirms a network capture.

## Trigger

- `.pcap`, `.pcapng`, or stream reconstruction clues

## Primary Route

1. Identify protocols and sessions.
2. Extract obvious files, credentials, and hosts.
3. Follow streams and inspect DNS / HTTP / TLS / custom protocols.
4. Reconstruct covert channels only after a clear protocol inventory.
5. Verify the recovered artifact or flag from the capture.

## Preferred Tools

- `tshark`
- `tcpdump`
- `Wireshark`
- `ngrep`

## Pivot Rules

- If the task is really a protocol client challenge with tiny state, pivot to misc.
- If the capture is just a delivery channel for an encoded secret, pivot to crypto or stego.
- If the capture has no substantive network content, stop and reclassify.
