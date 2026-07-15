---
description: (opencode - Skill) Use when a confirmed primitive is BLOCKED by a WAF, filter, or constraints. Generates a strict, prioritized matrix of bypass techniques instead of random fuzzing.
scope: opencode
compatibility: opencode
---

# WAF Bypass Planner (ctf-waf-bypass-plan)

**TRIGGER:** A chain/segment is in `BLOCKED` state due to a specific filter/WAF.

Prefer the structured tool `ctf-waf-bypass-plan` when available. This command is the fallback SOP if the tool is unavailable.

## Instructions

1. **Identify the Blocker**: You MUST extract exactly what is being blocked (e.g., "script tags", "spaces in SQL", "file protocol", "comma").
2. **Consult SecKB**: Use `seckb_seckb_gap_search_plan` to search the local knowledge base for bypasses specific to this blocker and the target framework.
3. **Use structured planner**: If available, call `ctf-waf-bypass-plan` with `blocker`, `stack`, `sink`, and compact evidence. Treat the returned matrix as the ordered attempt list.
4. **Generate Matrix**: Do NOT start sending payloads immediately. Output a STRICT, numbered Markdown table/list (the "Bypass Matrix"):
   - `Order`
   - `Technique Family` (e.g., URL Encoding, Parser Differential, Alternative Character)
   - `Payload Template`
   - `Expected Oracle` (How will we know it bypassed?)
5. **Execution Protocol**:
   - Execute the matrix strictly from 1 to N.
   - Run ONE family at a time.
   - After each attempt, use `observe` to update the decision state.
   - If 3 families fail, STOP. Mark the branch `BLOCKED` and backtrack to the nearest confirmed shared segment. Mark `DEAD` only when the sink/parser family itself is falsified.