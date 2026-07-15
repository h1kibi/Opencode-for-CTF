# Failure: patching before stable observation point

- family: failure
- category: rev
- trigger: anti-debug, packing, or self-modifying behavior exists, but the barrier location and post-barrier semantics are still unclear
- misleading signal: patching looks faster than analysis once runtime behavior becomes annoying
- wrong behavior: patches broad checks or control flow before recovering one stable post-barrier observation point
- damage: destroys the original semantics needed for checker recovery and makes later reasoning less trustworthy
- correction rule: localize the barrier first and capture one stable memory/code view after it before any broad patching
- better next probe: identify the first divergence under tracing and dump or observe the smallest stable post-barrier region
