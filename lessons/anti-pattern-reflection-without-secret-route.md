# anti-pattern-reflection-without-secret-route

## Trigger
- Reflection or display changes exist, but no bot, secret-bearing browser state, privileged reader, or exfil route is visible.

## Why it looks promising
- Reflection is concrete and easy to manipulate.

## Why it is strategically weak now
- Reflection alone is not a flag path. Without a secret route, it is usually medium-value at best.

## Better closure family
- source/data leak, authz/state, file read, config/secret path, or a real bot/runtime model.

## Revisit trigger
- Evidence of bot/report/admin visit, same-origin secret endpoint, storage/cookie path, or DOM-held secret appears.
