# closure-file-write

## Trigger
- Controlled file write or upload-to-write primitive is confirmed.

## Why it looks promising
- File write often composes into include/render/static-serve/session/.user.ini/template/execution/readback chains.

## What usually goes wrong
- The solver keeps searching for new bugs instead of turning the existing write into a readable or executable closure path.

## Better question
- What is the cheapest adapter that converts this write into readback, include, render, execution, or privileged state?

## First corrective probe
- Record write path control, content control, fixed prefixes/suffixes, trigger surface, and serving/reload behavior before more discovery.

## Closure queue
1. direct static readback
2. include/render/template consumption
3. config or session-triggered execution/readback
4. wrapper/filter/content adapter
5. one canary write proving the chosen closure path

## Stop rule
- After a viable adapter exists, freeze unrelated discovery until the top two closure adapters fail.

## Reuse query terms
- file write upload readback include render filter adapter session user ini
