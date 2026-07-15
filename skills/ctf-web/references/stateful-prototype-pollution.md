# Stateful storage, merge, and prototype-pollution gate

Use this reference for CRUD, note, store, template-builder, profile, page-builder, cache, cart, or workflow endpoints. Do not stop at single-record behavior; build a minimal state machine before generic payload variants.

## State model

| Object | Action | State Variable | Threshold / Trigger | Transform | Consumer | Oracle |
|---|---|---|---|---|---|---|

## Mandatory low-noise checks

1. Compare empty, one-record, several-record, and threshold-crossing states (`0`, `1`, `2..N`, `>N`) when the app stores user-controlled objects.
2. If multiple rows/items collapse into one response, field sets merge, duplicate keys coalesce, a cache refresh occurs, or output changes from array-of-objects to one object, immediately test server-side merge/compaction semantics.
3. For JavaScript/Node/Express apps, any stored JSON/object merge or dependency signal (`lodash`, `merge`, `extend`, `defaultsDeep`, `$.extend(true)`, `qs`, `bodyParser.urlencoded({extended:true})`) triggers the pollution probe set below before SQLi/XSS/bot expansion.
4. Treat `{}` responses from `__proto__` probes as ambiguous, not negative. Serialization can hide prototype effects; the real oracle is the later transform/consumer.

## Standard JS object-pollution probe set

- JSON body: `{"__proto__":{"polluted":"pp"}}`
- JSON body: `{"constructor":{"prototype":{"polluted":"pp"}}}`
- Form body: `__proto__[polluted]=pp`
- Form body: `constructor[prototype][polluted]=pp`

## Auth/session gadget probes

Use when sessions or roles exist:

- `constructor[prototype][login]=true`
- `constructor[prototype][userid]=1`
- `constructor[prototype][isAdmin]=true`
- `constructor[prototype][role]=admin`

## Template gadget probes

Use when EJS/Pug/Handlebars/template render is present:

- EJS `outputFunctionName`
- EJS `client=true` + `escapeFunction`
- debug/compile flags only after a harmless marker proves pollution reaches template options

## Promotion rules

Confirmed or strongly suspected server-side object merge + auth/session consumer outranks front-end XSS/admin-bot speculation. Enter closure through current-identity or admin-identity data read before looking for `/report`/bot routes.

If registration says `admin` duplicate but login fails, immediately map identity consumers (`userid`, `uid`, owner id, role`) and test IDOR/session pollution/mass assignment/reset semantics. Limit clue-derived password guessing to a tiny bounded set.

## Prototype pollution / DOM gadget brake

If a prototype-pollution or DOM-gadget probe has strong code signals but no effect, do not mark it dead until overwrite/reset and guard layers are checked.

Strong code signals include:

- `__proto__`
- `constructor.prototype`
- `Object.entries`
- deep merge/set
- `createElement`
- template options
- `setAttribute`
- dangerous sink

Record whether the polluted object was later replaced by an own-property object or default assignment. If so, the branch is `blocked by overwrite`, and any later HTML/CSP/parser/source primitive must trigger a revisit.

For Node/server-side merge, a flat or hidden `__proto__` result does not falsify pollution until `constructor.prototype` has been tested at the actual transform/consumer stage, not merely at the storage echo.

## Client-side script execution ledger

For pages with multiple inline scripts, especially with nonce/hash CSP, `TODO remove this script`, default assignments, reset/overwrite logic, or suspicious source/sink split, build a desired execution bitmap before abandoning a client-side chain.

| Script | Role | Attacker benefit | Blocker risk | Desired execution |
|---|---|---|---|---|

If a source script is wanted, a reset/default script is unwanted, and a sink/render script is wanted, try script-control mechanisms before pivoting:

- injected `meta http-equiv="Content-Security-Policy"`
- hash-selective `script-src`
- parser-state swallowing
- deliberate syntax/runtime error in the blocker
- resource blocking
- DOM clobbering of dependencies
- script ordering changes

Treat CSP as a control plane, not only a defense.
