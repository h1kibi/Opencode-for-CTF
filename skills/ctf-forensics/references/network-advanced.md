# Advanced Network Reconstruction

## Triggers

Load for PCAP/PCAPNG or captured traffic where the answer may be reconstructed across packets, flows, transactions, timing, or multiple protocols rather than read from one payload. Typical clues include DNS/ICMP tunneling, fragmented HTTP data, TLS/QUIC metadata, unusual timing, retransmissions, or multiple hosts carrying complementary pieces.

## Preservation and Scope

Hash the original capture, work on a copy, and record capture time range, snaplen, link type, timezone assumptions, filters, and tool versions. Keep packet numbers and stream/flow identifiers for every derived artifact. A string found by `strings` is only a lead; it is not a reconstructed secret or flag.

## Layered Workflow

1. **Inventory:** identify interfaces, endpoints, protocols, incomplete captures, truncation, retransmissions, and time gaps.
2. **Flow:** group by 5-tuple and direction; record first/last packet, byte counts, and TCP sequence gaps.
3. **Stream:** reassemble TCP/UDP/ICMP/DNS data with direction and ordering preserved; retain raw packet references.
4. **Transaction:** parse DNS queries/answers, HTTP requests/responses, TLS handshakes, QUIC metadata, and application framing.
5. **Channel hypothesis:** test encoding, chunk numbering, length fields, timing, or cross-host ordering against controls and null traffic.
6. **Reconstruct:** produce a deterministic artifact with packet/stream provenance and a reversible decoder.
7. **Verify:** replay the reconstructed input into the challenge parser/oracle when available, or confirm all framing/checksum/length constraints independently.

## Covert-Channel Discriminators

- **DNS:** distinguish normal resolver traffic from labels with stable chunk IDs, high entropy, unusual lengths, or encoded payloads; inspect query/response pairing and NXDOMAIN behavior.
- **ICMP:** separate echo identifiers/sequence numbers from payload; check direction, padding, and missing chunks.
- **HTTP:** follow redirects and content encoding; reassemble chunked/compressed bodies before searching; do not mix unrelated hosts or sessions.
- **Timing:** establish a baseline from control flows, account for retransmits and capture jitter, and require a repeatable threshold rather than one gap.
- **TLS/QUIC:** use SNI/ALPN/certificate/packet-size/timing metadata only as routing evidence unless keys or an authorized decryption path are present.

## Evidence Ledger

For each decoded piece record: packet numbers, stream/flow ID, direction, timestamp policy, transform, chunk order, missing-data status, and output hash. Keep raw and normalized forms side by side. If a reconstruction requires guessing a missing chunk or ordering, mark it incomplete and do not promote it to a flag candidate.

## Handoff and Flag Boundary

Hand off to `ctf-crypto` when the decisive step is cryptanalysis, to `ctf-web`/`ctf-misc` when the traffic reveals a live protocol, and to `ctf-rev` when a binary parser/checker is the bottleneck. Apply `ctf-common/references/flag-identification-rules.md`: one payload, one packet, or one readable string remains `untrusted_hint`/`flag_candidate` until an independent oracle verifies it. Never write `agent_flag.txt` from a packet search alone.

## Stop Rules

Stop when the capture is truncated, the alleged channel is not reproducible, timestamps cannot support the claim, or the only evidence is a format-looking string without reconstruction and verification provenance.
