# Java SQL / MyBatis

Use for MyBatis, JDBC, JPA/native query, JdbcTemplate, or string-built SQL candidates.

## Triggers

- MyBatis XML/annotations using `${...}`.
- `Statement`, string concatenation around SQL, `createNativeQuery`, `JdbcTemplate` with concatenated SQL.
- Search/order/sort/table/column parameters.
- SQL errors from Java stack traces.

## First Safe Checks

1. Identify data access layer and exact query construction.
2. Distinguish safe parameter binding `#{...}` / `?` from string substitution `${...}` / concatenation.
3. Confirm controlled field reaches SQL with one harmless differential: quote, sort toggle, boolean, numeric boundary, or syntax-neutral marker.
4. Identify DB type from config/errors/dependencies.
5. Prefer extracting final SQL from source/logs/errors before payload variants.

## SQL Sink Table

| Mapper / DAO | Query | Controlled Field | Binding Type | DB | Oracle | Candidate Primitive |
|---|---|---|---|---|---|---|

## MyBatis Notes

- `#{param}` is prepared binding; `${param}` is raw text substitution.
- `ORDER BY ${sort}` and table/column names are common intended sinks.
- Dynamic SQL tags can make reachability conditional.
- XML mapper namespace/method must match service/controller call chain.

## Stop Rules

- Do not assume SQLi from MyBatis alone; require `${}` or string construction plus reachability.
- After two payloads without SQL/error/differential, pivot to mapper/source reachability.
- Avoid broad dump automation before proving flag table/path and query primitive.

## HQL / JPA / H2 Specialization

When Hibernate/JPA/HQL and H2 or parser mismatch evidence appears, load `java-hql-h2-parser-mismatch.md` before SQL payload variation.
