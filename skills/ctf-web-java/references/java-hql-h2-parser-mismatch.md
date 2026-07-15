# Java HQL / H2 Parser Mismatch

Derived from ljagiello/ctf-skills `ctf-web/server-side-advanced-2.md` HQL non-breaking space note.

Use when Java Hibernate/JPA/HQL validation blocks SQL syntax but backend DB parsing differs, especially H2.

## Trigger Signals

- Hibernate, JPA, HQL, `createQuery`, `EntityManager`, or Spring Data query source.
- H2 database in config/dependencies.
- Filter blocks spaces, subqueries, or SQL keywords at HQL/application layer.
- Error-based DB oracle exists.

## Key Insight

Parser mismatch can occur when the HQL/application validator treats a character as part of a token, but the underlying DB treats it as whitespace or syntax.

The ljagiello note highlights U+00A0 non-breaking space:

- HQL parser treats U+00A0 as a regular character.
- H2 treats U+00A0 as whitespace.

## First Safe Checks

1. Confirm DB type from config/errors; prioritize this for H2.
2. Confirm query path is HQL/JPA and reaches DB.
3. Use one harmless non-breaking-space differential in a non-destructive expression.
4. If error-based oracle exists, test controlled cast/error with benign marker before flag extraction.

## Constraint Table

| Layer | Parser | Input Transform | Whitespace / Encoding Behavior | Oracle |
|---|---|---|---|---|

## Stop Rules

- Do not apply H2-specific U+00A0 bypass to unknown databases without evidence.
- Do not brute SQL payload variants before confirming HQL/application parser vs DB mismatch.
- After two no-diff encoding probes, pivot to source/query extraction.
