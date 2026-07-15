# Scoreboard speed lane

Use Scoreboard Speed Lane for online scoring, easy/medium-looking targets, or the first 8-12 minutes of a fresh Web challenge. It is intentionally less ceremonial than the full workflow.

## Priority order

1. Challenge/page clues: credentials, masks, versions, filenames, roles, odd strings, flag format hints.
2. Low-cost source/data leaks: `robots.txt`, `sitemap.xml`, `/.well-known/`, `.git/HEAD`, `.git/index`, `.phps`, `~`, `.bak`, `.swp`, `.zip`, source maps, backup archives, debug/config routes.
3. Static/frontend leaks: JS bundle endpoints, source maps, env/config literals, GraphQL operations, admin path literals, feature flags.
4. Default/weak auth: default creds, clue-derived credential variants, public admin-login cookie seeding, weak signed cookie/JWT shape.
5. Direct primitives: obvious file read/source leak/debug console/SQL error/auth bypass/LFI wrapper/upload served path/exposed secret/admin token.
6. Attachment/direct flag checks when files exist: triage, extract, strings, flag grep, source grep.

## Return early rule

Return early if a direct flag/source/secret/admin-token path appears. Use only 1-2 low-cost checks per speed-lane family.

If no direct path appears after the time box, or the target is clearly multi-stage/stateful, switch to full decision-state workflow.

## Do not do in fast lane

- wordlist fuzzing
- sqlmap
- brute force
- high-concurrency checks
- repeated uploads
- repeated bot triggers
- payload storms
