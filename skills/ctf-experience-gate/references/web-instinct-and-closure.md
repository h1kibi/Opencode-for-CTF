# Web Instinct and Closure Gates

Use when Web evidence exists and the solver is choosing between source acquisition, medium-value phenomena, clue-driven probes, and primitive-to-chain closure.

## CTF Web Instinct Layered Decision Gate

CTF Web solving should prioritize likely challenge-intended, low-cost, high-yield paths over realistic-but-long exploit chains. Do not let confirmed but low-yield phenomena dominate the main line.

Layered priority order:

1. Challenge clues: credentials, page hints, unusual names, comments, masks, filenames, challenge text.
2. Low-cost high-yield source/data surfaces: `.git/HEAD`, `.git/index`, `.phps`, `~`, `.bak`, `.swp`, `.zip`, backup archives, debug/source/history leaks.
3. Source-guided sink audit: SQL sinks, file read/write sinks, include/require, unserialize, eval/template/code execution, config/secret reads.
4. Classic teaching-vulnerability mapping from code structure and dangerous functions.
5. Phenomenon-only Web bugs such as XSS, CRLF, open redirect, reflection, or weak parser differential only if they are close to flag/source/database or unlock a stronger primitive.

## Source Availability Priority Gate

- If the target looks like an old PHP site, BUU/NSS/common training platform, simple page with many interaction points, traditional directory/static resource layout, acquired login state, or artificial CTF app rather than real business, put source acquisition in the top two hypotheses.
- If source acquisition cost is lower than continuing black-box chain building, check source surfaces before deep exploit chaining: `.git/HEAD`, `.git/index`, `.phps`, `~`, `.bak`, `.swp`, `.zip`, backup/source archives, and recoverable git history.
- Do not spend a long branch on CRLF/XSS/parser phenomena while a cheap source-leak check remains untested.

## Primitive Value Gate

- High-value primitives: arbitrary file read, source leak, SQLi with data read, deserialization/POP, file write, SSRF to internal/source, command/code execution, config/secret read.
- Medium-value primitives: stored XSS, CRLF, open redirect, reflection, weak parser differential, header injection, UI-only state difference.
- A medium-value primitive must show a two-step route to flag/source/database/privileged state before it becomes the main line. Otherwise downgrade it after at most two no-progress probes.

## Classic Function Mapping

- `addslashes` / legacy mysql escaping -> wide-byte SQL injection or encoding/collation bypass.
- `include`, `require`, `readfile`, `file_get_contents` -> LFI, wrappers, path normalization, precheck/sink consumer mismatch.
- `file_put_contents` / upload move -> file-write chain, wrapper/filter adapter, include/webroot/session/.user.ini trigger.
- `unserialize` -> POP chain and magic-method sink mapping.
- `preg_replace /e`, `eval`, `assert`, template render with user input -> code execution/template injection.
- `header("Location: ...$input")` -> CRLF/open redirect, but keep below source/SQL/file-chain unless it reaches flag path quickly.
- Raw HTML output -> XSS/reflection, but require a clear admin-bot/secret/flag route before main-line commitment.

## Black-Box Difference Correction

Before promoting a response/page difference to the main line, answer:

1. Is it execution evidence or only reflected/data-display evidence?
2. Is it on a read path or write path?
3. Can it directly yield data echo, state change, permission change, file/source/database read, or stronger primitive?

Only-reflection evidence must not occupy the main line for long. If two same-family probes do not move closer to source/database/file/flag, downgrade and pivot.

## Budget Stop-Loss

- Two same-family probes without a new differential -> downgrade that branch.
- If 10-15 minutes or one focused mini-loop does not move closer to source/database/file/flag, force pivot.
- If an untested cheap high-yield branch exists, do not continue deepening a complex medium-value chain.

## Challenge Clue Priority Gate

Do not let generic black-box methodology override strong challenge-provided clues. If the page, title, source comment, robots, error text, placeholder, sample credential, visible username/password shape, masked string, unusual filename, parameter name, or challenge description gives a distinctive clue, treat it as a high-priority primitive candidate.

Hard rules:

- Before broad mechanism hunting, write a Clue Ledger: exact clue string, where it appears, possible role, implied structure, controlled inputs it relates to, and cheapest confirmation oracle.
- Exhaust a small, bounded clue-first budget before generic branches: usually 3-6 targeted variants, or 1-2 `ctf_rag`-backed hypothesis conversions if the clue maps to a known family.
- For credential-shaped clues, do not stop after the literal value fails. Interpret masks and repetition as structure hints: prefix/suffix, fixed padding, username-derived password, leetspeak/date/common suffix, hidden length, wildcard/star placeholders, or normalization/case hints.
- A strong visible clue outranks generic black-box differentials unless clue-first probes are falsified or the clue is confirmed decoy/noise.
- After clue-first budget fails, explicitly record why the clue is exhausted before moving to login differential, source extension probing, content-type confusion, or unrelated route discovery.

## Primitive Composition Gate

When source, SSRF, LFI, debug leak, decompile output, or route tracing reveals a concrete primitive or sink, stop broad recon and try to close the exploit chain from existing pieces first.

Hard rules:

- Sink-first closure: once a sink/gadget is known, write a Primitive Ledger before looking for new routes/parameters: controlled data, controlled path/name, transform/prefix/suffix, trigger, execution context, oracle, and blockers.
- Composition before discovery: do not search for hidden routes, extra parameters, more protocols, or internal enumeration until the top two chain-closure probes for the existing primitive have failed or been falsified.
- Pattern recall by sink: immediately query `ctf_rag` using the concrete sink/function/class/protocol names, not only the broad bug family. Examples: `file_put_contents php filter write base64 prefix`, `file_get_contents include data scheme parser mismatch`, `__toString hasaki file_put_contents php unserialize`.
- Chain shape thinking: convert primitive -> required capability -> adapter pattern. Examples: file write -> executable write via wrapper/filter; precheck read + include sink -> parser differential; SSRF source read -> source-guided gadget closure; upload write -> include/render/static serve; deserialization gadget -> sink adapter.
- New-surface budget: after a strong primitive is found, at most one cheap new-surface check is allowed before chain closure. More discovery requires evidence that the primitive is unreachable, untriggerable, or non-composable.
- If a known sink maps to a retrieved technique note, the next step must be a one-variable probe derived from it.

## PHP Chain-Closure Patterns

High-value PHP patterns to recall before more recon:

- `file_put_contents` with controlled path/content: prioritize write adapters such as `php://filter/write=convert.base64-decode/resource=...`, path-to-webroot/include target, `.user.ini`/auto_prepend when applicable, phar/session/upload pivots when reachable. If a fixed PHP prefix/suffix pollutes content, test base64 decoder tolerance or alignment padding before abandoning the write sink.
- PHP unserialize gadget ending in file write: `__toString`, destructor, magic method, or method-call gadget plus `file_put_contents` should be modeled as controlled write first, then transformed into execution/read primitive using wrappers or reachable include/static path.
- `file_get_contents($x)` precheck followed by `include($x)` sink: prioritize protocol/parser semantic mismatch. Do not treat one `data://` failure as falsifying all `data:` behavior. Test exact scheme syntax differences such as `data:,harmless/path` versus `data://...`, wrapper normalization, and whether the precheck and include consume different resources.
- If SSRF already gave source or local-only PHP files, consider SSRF solved as a source acquisition/access primitive. Do not keep enumerating SSRF protocols unless source-guided chain closure fails.
