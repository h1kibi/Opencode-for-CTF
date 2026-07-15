# Java OOXML / Apache POI XXE

Use this reference when Java source or bytecode confirms Apache POI, XMLBeans, `WorkbookFactory.create(InputStream)`, `XSSFWorkbook`, `OPCPackage`, or an `excel-*.xlsx` style upload/parse gate.

## Core Rule

Treat this as an **OOXML parser family**, not a generic XML sink. Prefer standard OOXML entrypoint ordering before broad payload mutation.

OOXML part priority unless source disproves it:
1. `[Content_Types].xml`
2. `_rels/.rels`
3. `xl/workbook.xml`
4. `xl/worksheets/sheet*.xml`
5. `docProps/*.xml`

If two probes fail with parser-context errors tied to one part, switch to the next OOXML part instead of mutating entity syntax on the same part.

## Common Failure Signatures

These usually mean the **XML context/part is wrong**, not that XXE is impossible:

- `Parameter entities may not appear in the internal subset`
- `Referencing an external entity within an attribute value is illegal`
- XMLBeans / Piccolo / SAX malformed-content errors tied to one file
- `NullPointerException` in `XSSFWorkbook.onDocumentRead` after malformed workbook content

Interpretation:
- internal subset restrictions -> move parameter-entity logic to an external DTD
- attribute-value restriction -> stop trying to expand entities in attribute positions; switch part/context
- parser NPE after malformed workbook/sheet -> try a cleaner OOXML part or preserve a standard workbook structure

## OOB Infrastructure Gate

Distinguish two attacker capabilities:

1. **Receive-only OOB**
   - examples: Interactsh, webhook collectors, DNS loggers
   - can observe callbacks and sometimes direct exfil
   - cannot serve attacker-controlled `evil.dtd` body content

2. **Response-serving OOB**
   - example: attacker-controlled HTTP server/VPS
   - can return custom `evil.dtd`, staged XML, redirects, or other parser-fed content

Rule:
- External DTD XXE requires **response-serving OOB**.
- Do not treat Interactsh-only as sufficient when the target must fetch attacker-defined DTD content.
- If response-serving OOB is unavailable, either ask for VPS/HTTP hosting early or pivot to in-band/error/writeback options.

## Standard Closure Queue

When POI/OOXML reachability is confirmed and a local file-read path is blocked by filename/path filters:

1. Confirm parse entrypoint and file naming gate.
2. Run a harmless external-resource canary on the highest-priority OOXML part.
3. If using external DTD, verify attacker-controlled DTD hosting, not callback-only OOB.
4. Move file-read logic into external DTD.
5. Exfiltrate the target file through the cleanest available channel.

## Decision Rule Against Drift

If source proves `WorkbookFactory.create(InputStream)` and local file-read is blocked by a keyword filter such as `flag`, the POI/OOXML XXE closure path usually outranks:

- same-family path alias guessing
- repeated `/proc` or fd variants
- speculative upload-write/JSP write ideas
- continued workbook-only entity syntax mutation

Use those only if they clearly shorten the flag path or if the POI branch is explicitly falsified.
