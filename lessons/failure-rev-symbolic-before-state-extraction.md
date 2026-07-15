# Failure: symbolic escalation before state-machine extraction

- family: failure
- category: rev
- trigger: large pseudocode or VM-looking control flow appears before the true checker or state variables are isolated
- misleading signal: symbolic tools seem powerful enough to skip path reduction
- wrong behavior: jumps into Z3 or brute symbolic modeling before extracting the smallest real checker/state machine
- damage: bloats the constraint space and hides the actual comparison boundary
- correction rule: isolate the input boundary, real checker, and minimal state model before symbolic escalation
- better next probe: trace one controlled input to the first real compare/acceptance branch and reduce the state variables it touches
