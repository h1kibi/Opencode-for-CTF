# Anti-pattern: JWT decode without trust boundary

- family: anti-pattern
- category: web
- trigger: token decodes cleanly, but no evidence yet shows that claims, alg, kid, or jku influence server-side authorization
- misleading signal: visible JWT fields create false confidence that a forge path exists
- wrong behavior: spends probe budget on JWT mutation families before classifying token type and trust boundary
- damage: suppresses stronger source/session/authz branches and inflates low-closure auth curiosity
- correction rule: first classify token type, validation library, and whether the server trusts client-controlled claims or key-location fields
- better next probe: run a harmless claim/header significance test or framework/token-class identification step
