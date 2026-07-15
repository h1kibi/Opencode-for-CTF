# Java XXE / SSRF

Use for XML parsers, URL fetchers, HTTP clients, image/document converters, webhook/import/proxy endpoints, or protocol handler abuse.

## Triggers

- XML parser classes: `DocumentBuilderFactory`, `SAXParserFactory`, `XMLInputFactory`, `SAXReader`, `TransformerFactory`.
- URL fetch classes: `URL`, `URI`, `openConnection`, `RestTemplate`, `HttpClient`, `OkHttpClient`, `WebClient`.
- Features that import URL/XML/SVG/Office files, fetch avatars, webhooks, or proxy resources.
- Java stack traces mentioning parser/fetch exceptions.

## First Safe Checks

1. Identify parser/fetcher and controlled field.
2. Check validator/allowlist, scheme restrictions, DNS/IP filters, redirects, and timeout behavior.
3. Use harmless external/same-origin/canary URL only when callbacks are in scope; otherwise use local observable routes/errors.
4. For XXE, verify parser features and entity behavior with benign entity/error probes before file reads.
5. For SSRF, test one differential: scheme, host normalization, redirect, DNS, IPv6/IPv4, or path-based oracle.

## Sink Table

| Route | Parser / Fetcher | Controlled URL/XML | Validator | Allowed Schemes | Oracle | Primitive |
|---|---|---|---|---|---|---|

## Java-Specific Notes

- `DocumentBuilderFactory` must disable DOCTYPE and external entities to be safe.
- `TransformerFactory`/XSLT can introduce separate file/network behavior.
- `URL.openConnection` follows Java URL parsing quirks; `URI` vs `URL` validation mismatches matter.
- SSRF may target actuator, metadata, internal admin, file/protocol handlers, or local services only if in challenge scope.

## Stop Rules

- Do not spray URL parser bypasses before identifying validator/fetcher.
- Do not attempt out-of-scope internal networks.
- After two SSRF/XXE probes without callback/error/oracle, pivot to source-guided parser/fetch chain mapping.
