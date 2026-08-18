# Pwn Triage

ctf-binary-probe identified an amd64 non-PIE binary and a repeatable crash. ctf-fast keeps this direct ret2win candidate in the fast lane.

CONTROL_CONFIRMED: instruction-pointer control at offset 72.
Enter CALIBRATION mode after control confirmation.
Calibration Ledger: change one variable at a time; record offset, alignment, return target, and observed result.
Next shortest closure hypothesis: direct win-function return with minimum local closure proof.
Avoid unrelated gadget roulette until the closure hypothesis is falsified.
