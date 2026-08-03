# closure-db-read

## Trigger
- SQL/NoSQL/database read or authenticated DB-backed object access is confirmed.

## Why it looks promising
- Many hard CTFs hide the flag in a row, config table, note, token, secret, admin object, or migration artifact.

## What usually goes wrong
- The solver dumps too much schema/data instead of ranking likely flag-bearing structures.

## Better question
- Which tables, collections, fields, or object types are most likely to contain the flag, secret, admin token, or route clue?

## First corrective probe
- Enumerate schema minimally and rank names like `flag`, `secret`, `token`, `key`, `admin`, `config`, `note`, `post`, `message`, `draft`, `setting` before broad dumping.

## Closure queue
1. obvious flag/secret/config rows
2. admin/user/session/token rows
3. content tables with hidden/private objects
4. migration/metadata/config tables
5. one precise query to confirm the top candidate

## Stop rule
- Do not keep full-database exploration once a likely flag-bearing structure exists.

## Reuse query terms
- db read schema rank flag secret token admin config hidden object
