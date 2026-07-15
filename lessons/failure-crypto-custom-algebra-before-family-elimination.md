# Failure: custom algebra before family elimination

- family: failure
- category: crypto
- trigger: RSA/protocol challenge has recognizable parameters or oracle behavior, but the exact family and preconditions are still unproven
- misleading signal: an advanced attack name seems plausible from parameter shape alone
- wrong behavior: starts custom Sage/algebra/brute-force work before classifying the family and proving prerequisites
- damage: burns time on mathematically valid but strategically irrelevant branches
- correction rule: normalize parameters, formalize the oracle, and eliminate simpler families before advanced algebra
- better next probe: write a one-page family/precondition matrix and run the cheapest discriminating test first
