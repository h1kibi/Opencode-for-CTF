---
description: CTF control: OMO-style CTF OOB discipline gate; enforce stable DNS/HTTP callback evidence rules for blind bugs
agent: ctf-expert
subtask: false
---

Validate OOB discipline for blind CTF probes.

OOB context:
$ARGUMENTS

Rules:
- Use one stable OOB session/domain per challenge branch. Do not restart callback clients unless necessary.
- Record probe label, payload location, timestamp, expected callback shape, and poll result.
- DNS callback confirms lookup only; HTTP callback confirms fetch; neither alone proves full RCE or file read.
- Timeout/502/slow response is BLOCKED unless paired with a callback or clear differential.
- For Java/Log4j/JNDI-style probes, first confirm DNS, then version/env leak if appropriate, then choose payload path based on JDK/security gate.
- For SSRF/webhook/importer probes, distinguish redirect fetch, DNS resolution, internal HTTP fetch, and response exfiltration.
- Stop after two OOB probes with no callback and no new differential; pivot oracle or family.

Return compactly:
1. OOB session identifier/domain status.
2. Probe ledger entry.
3. Evidence level: DNS_ONLY / HTTP_FETCH / RESPONSE_EXFIL / NO_CALLBACK / BLOCKED.
4. What is confirmed and what is not confirmed.
5. Next safe OOB action or PIVOT.
