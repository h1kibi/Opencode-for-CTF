# Benchmark: Control Confirmed Calibration

## Goal

Ensure that once control is confirmed, the next step is calibration and closure planning rather than exploit-family roulette.

## Expected Behavior

- Record explicit control proof such as offset or instruction-pointer control.
- Enter calibration mode after control is confirmed.
- Capture the next shortest closure hypothesis rather than adding unrelated payload families.
- Keep the branch one-variable-at-a-time until closure quality improves.

## Bad Behaviors

- Jumps from control proof straight into gadget roulette.
- Opens unrelated route families without a new differentiating signal.
- Keeps mutating payloads without a calibration ledger.
