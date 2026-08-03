# Browser, Session, and Identity Artifacts

Use for browser databases, cookies, history, cached tokens, saved form data, or identity clues in a preserved challenge artifact.

## Safe sequence

1. Work on a copy and hash the source.
2. Identify browser/profile/version and database schema.
3. Extract URLs, timestamps, downloads, local storage, cookies, and history with provenance.
4. Separate metadata from secret material; redact secrets unless the challenge explicitly requires recovery.
5. Correlate browser evidence with DNS, logs, files, or challenge timestamps.

Do not use recovered real-world credentials or tokens outside the authorized challenge. A cookie record proves storage, not validity; validate only against the in-scope challenge oracle.

