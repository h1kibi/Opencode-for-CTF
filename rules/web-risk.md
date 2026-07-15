# Web Risk Rules

Use these rules for Web challenge state changes:

- default concurrency is 1
- default initial request budget is 20
- maximum initial upload or overwrite canaries is 2
- maximum initial bot-triggering payloads is 2
- do not use wordlist fuzzing as the first focused probe
- prefer challenge-local control planes over blind callbacks
