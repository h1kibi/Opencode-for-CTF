# closure-admin-session

## Trigger
- Admin session, privileged cookie/token, or role-equivalent state is confirmed.

## Why it looks promising
- Admin or equivalent privileged state often exposes debug, export, user management, logs, hidden objects, or direct flag-bearing pages.

## What usually goes wrong
- The solver celebrates admin access but keeps probing unrelated bug families instead of enumerating privileged assets.

## Better question
- Which admin-only path, object, API, or export surface is most likely to reveal the flag or its storage location immediately?

## First corrective probe
- Build a tiny privileged surface queue: dashboard, settings, export, logs, hidden APIs, privileged object IDs, admin-only notes/files.

## Closure queue
1. admin-only page or object likely to show the flag
2. admin-only source/config/export/log path
3. role-based API with object ID access
4. internal or debug path visible only after admin
5. one clean-state re-login confirmation if needed

## Stop rule
- Do not drop back into generic exploitation until the top privileged data surfaces are tested.

## Reuse query terms
- admin session privileged route export debug logs object id hidden api
