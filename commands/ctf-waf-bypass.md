---
description: Query WAF bypass database for a blocked chain/segment. Data-driven replacement for ctf-waf-bypass-plan.
---

Run the WAF bypass lookup tool to generate an ordered bypass matrix from the structured database:

```bash
python {env:SECKB_ROOT}/scripts/waf_bypass_lookup.py query \
  --blocker "$ARGUMENTS" \
  --max-families 6
```

If stack and sink are known, append them:
```bash
python {env:SECKB_ROOT}/scripts/waf_bypass_lookup.py query \
  --blocker "BLOCKER_DESCRIPTION" \
  --stack "STACK" \
  --sink "SINK" \
  --max-families 6
```

## Rules

1. Execute one family at a time. Do NOT combine bypasses until a differential is observed.
2. Every attempt must have a one-variable oracle and must be recorded via `chain-state observe`.
3. After 3 failed families with no new differential → mark the branch BLOCKED or backtrack to nearest confirmed shared segment.
4. Mark DEAD only when the sink/parser family itself is falsified.
5. If a bypass works → mark the segment BYPASSED, rerank chains, continue.

## Database Info

To list all categories:
```bash
python {env:SECKB_ROOT}/scripts/waf_bypass_lookup.py list-categories
```

To show all techniques in a category:
```bash
python {env:SECKB_ROOT}/scripts/waf_bypass_lookup.py show --category CATEGORY_NAME
```
