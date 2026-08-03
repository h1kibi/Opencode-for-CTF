# Failure: pwn control confirmed but exploit not calibrated

- signal:
  - RIP/EIP or equivalent control was strongly indicated
  - the exploit route was probably already correct
  - the agent continued route expansion, gadget wandering, or side probing instead of exploit calibration

- damage:
  - wasted budget after route lock
  - offset/preserve/pacing details remained unconfirmed
  - near-success states were misclassified as failure
  - parser-side effects or delimiter rules stayed implicit

- correction rule:
  - once control is confirmed, stop horizontal exploration
  - create or update a calibration ledger
  - change one variable at a time
  - prove a minimal local closure before full chain construction
  - treat shell-like output changes as post-exploit diagnostics first

- trigger phrases:
  - "route seems right but exploit still flaky"
  - "crash/control is there but final chain won't land"
  - "remote output changed after payload"
  - "partial control maybe enough"

- ranking effect:
  - penalize new bug-family exploration after control is confirmed
  - increase priority of calibration, preserve-region, badchar, and pacing probes
