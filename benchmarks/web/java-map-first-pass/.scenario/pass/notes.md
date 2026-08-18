# Recon Map

- Artifact: VulnerableServlet.java
- Build evidence: pom.xml
- Route family: Servlet / Spring-compatible Java Web

## Attack Queue

| Candidate | Value | Cost | Risk | Stability | Confidence | Decision |
|-----------|-------|------|------|-----------|------------|----------|
| Java route and sink map | 9 | 2 | 1 | 9 | 8 | selected |
| focused source check | 7 | 3 | 2 | 7 | 5 | queued |

First pass: run ctf-java-map against VulnerableServlet.java and pom.xml before manual review.
ctf-java-map produced Java Web Map, route table, dependency-of-interest, and sink lines.
Attempt budget: 1 map pass, then return to the attack queue.
