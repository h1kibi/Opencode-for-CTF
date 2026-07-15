# Endpoint calibration and Web constraint equation

Use this reference before spending more than two probes on the same endpoint parameter or payload family. This is mandatory for routes that are designer-linked, accept controlled input, return exceptions containing controlled input, or plausibly perform file/read/render/download/upload/auth/redirect/fetch/database behavior.

## Minimal calibration matrix

1. `GET` with query parameters.
2. `POST` with the same query parameters.
3. `POST` with `application/x-www-form-urlencoded` body parameters.
4. `POST` with `application/json` body when API/JSON behavior is plausible.
5. `OPTIONS` only to record `Allow`/header behavior.
6. Fresh session cookie versus no cookie if the app sets a session cookie.

A branch may not pivot away from a high-value endpoint while HTTP method and parameter location remain untested. Prefer `ctf-web-diff-probe` for these one-variable checks; use manual curl only for binary downloads, exact reproduction, or variants the dedicated tools cannot express.

## Same-family probe limit

A changed payload string is not a changed hypothesis. If two probes in the same endpoint, method, parameter location, content type, and session state produce no useful new differential, stop that payload family.

Before leaving the endpoint, test one orthogonal variable in this order:

1. HTTP method
2. parameter location
3. Content-Type
4. session/cookie state
5. route shape

## Exception oracle rule

An exception containing attacker-controlled input is positive evidence of source-to-sink reachability, not merely a failed payload. Identify the semantic consumer and use it to define the next one-variable probe.

Common semantic consumers:

- file open
- template render
- SQL query
- class load
- URL fetch
- XML parse
- deserialization
- command invocation
- redirect

Do not continue with many payload strings until endpoint calibration is complete.

## Designer-clue priority rule

Routes, parameters, files, forms, buttons, comments, JS literals, document links, visible application hints, and challenge-authored errors are designer-selected clues.

Complete endpoint calibration for designer-linked routes before testing generic framework tricks, CVE-shaped hypotheses, broad hidden-route enumeration, or version-specific bypasses.

## Working variant lock

When one endpoint variant produces a stronger oracle than baseline, lock it as the working variant:

- method
- parameter location
- content type
- session state
- route shape

Subsequent probes on that endpoint must use the working variant unless explicitly testing one different variable.

## Primitive lock eligibility

Do not lock onto a secondary error route or generic framework clue while a designer-linked source-to-sink endpoint has unresolved calibration items.

Prefer confirmed controlled-input sink routes over passive error pages unless the passive error directly yields a flag, source, config, or credential.

## Endpoint matrix ledger

| Path | Designer-linked? | Controlled Inputs | Observed Variant (method/location/content-type/session) | Status/Body/Type | Sink Oracle | Untested Required Variants | Working Variant | Next Orthogonal Probe |
|---|---|---|---|---|---|---|---|---|

## Web constraint equation

Before another same-family probe, build the Web Constraint Equation:

| Controlled Input | Precheck / Validator | Sink / Semantic Consumer | Filters / Transforms | Oracle | Desired Mismatch / Primitive |
|---|---|---|---|---|---|

## Source-guided backward slice

When source is available, prefer source-guided backward slicing over route-by-route guessing:

| Sink/Transition | Preconditions | Reachable Route | Controlled Fields | Transform/Filter Chain | Primitive | Proof Marker |
|---|---|---|---|---|---|---|

Start from dangerous sinks and privileged state transitions, then walk backward to attacker-controlled sources. Do not enter a long payload branch until proof-of-reachability is established.

## State diff ledger

For stateful challenges, maintain a State Diff Ledger:

| Action | Before | After | Persistent? | Controllable Fields | New Primitive | Oracle |
|---|---|---|---|---|---|---|

Track created files, database rows, sessions, cache keys, jobs, admin/bot effects, and workflow state. Prefer stable state transitions over blind one-shot payloads.
