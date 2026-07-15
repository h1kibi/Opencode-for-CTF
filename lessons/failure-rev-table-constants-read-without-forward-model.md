# Failure: table constants read without forward model

- family: failure
- category: rev
- trigger: challenge exposes many byte tables, lookup arrays, or constants, but no verified forward transform step exists yet
- misleading signal: extracted arrays make it feel like inversion can start immediately
- wrong behavior: attempts inverse logic or solver construction before proving one forward step on controlled input
- damage: produces elegant but semantically detached models
- correction rule: verify that the table is on the real checker path and that one forward step predicts an actual comparison or state change
- better next probe: extract one candidate table and validate one forward transform round against a controlled input trace
