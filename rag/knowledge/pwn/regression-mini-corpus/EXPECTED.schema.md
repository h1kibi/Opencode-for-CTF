# Regression EXPECTED.json Schema

Each regression case may include a machine-readable `EXPECTED.json` alongside human `EXPECTED.md`.

```json
{
  "schema_version": "pwn_regression_expected.v1",
  "name": "case-name",
  "sample_type": "c-source | metadata-only",
  "expected_primitive": "FRAME_INDEXED_CALLSITE_LEAK or pwn.card.id",
  "expected_tags": {
    "control": [],
    "leak": [],
    "callsite": [],
    "mitigation": [],
    "runtime": [],
    "closure": [],
    "anti_pattern": []
  },
  "minimal_probe_shape": "one-line probe summary",
  "confirm_oracle": "what confirms the primitive",
  "falsify_oracle": "what falsifies the primitive",
  "anti_pattern_to_avoid": ["..."]
}
```

These files are for future regression scoring. Markdown remains the readable source; JSON enables automation.
