# Failure: packet reading before stream ranking

- family: failure
- category: forensics
- trigger: PCAP contains many packets or protocols, but no stream ranking by bytes, protocol, or auth-bearing content has been done
- misleading signal: individual packets look interesting enough to inspect sequentially
- wrong behavior: reads packets one by one before reconstructing and ranking the smallest decisive stream set
- damage: loses the closure object in protocol noise and slows object or credential extraction
- correction rule: rank streams first, reconstruct second, then decode only the smallest stream set that can yield the credential/session/secret object
- better next probe: summarize top conversations by protocol and byte volume, then pick the first auth-bearing or object-bearing stream for full reconstruction
