# Python Jail

Use for Python sandbox/jail challenges with restricted builtins, blocked characters, filtered keywords, or limited eval/exec contexts.

## Triggers

- Python `eval`, `exec`, REPL, calculator, template-like expression, or restricted shell.
- Filters on `import`, `open`, `os`, underscores, quotes, brackets, dots, digits, or length.
- Error messages exposing Python exception names or object reprs.

## First Safe Checks

1. Identify execution mode: `eval`, `exec`, AST filter, blacklist, whitelist, bytecode, or custom parser.
2. Map allowed syntax and blocked tokens with harmless probes.
3. List available names/builtins if possible.
4. Determine output oracle: expression result, exception text, stdout, timing, file read, or side effect.
5. Choose one escape family based on constraints, not random payloads.

## Capability Table

| Capability | Evidence | Possible Route |
|---|---|---|
| attribute access | dot or `getattr` works | object graph traversal |
| string construction | quotes/chr/bytes/format works | build blocked names |
| call syntax | parentheses/callable works | invoke import/open/read |
| indexing | brackets/slice works | subclasses/list traversal |
| builtins access | `__builtins__` or globals | import/open/eval recovery |
| exception oracle | traceback leaks objects | side-channel discovery |

## Common Routes

- `__subclasses__()` traversal when object attributes are reachable.
- `globals()` / `locals()` / function `__globals__` to recover builtins.
- String construction via `chr`, bytes, formatting, concatenation, slicing, or docstrings.
- Import recovery via `__import__`, importlib, loader classes, or existing modules.
- File read via `open`, pathlib, file classes, or framework helpers.

## Stop Rules

- Do not try more than 3 same-family payload variants without a new syntax/object-graph differential.
- Do not assume CPython subclass indexes are stable across versions; discover indexes dynamically when possible.
- If no output oracle exists, first create or identify one before exploit payloads.

## Solver/Client

For interactive jails, write a small client that sends probes, records responses, and then sends the final payload. Keep final payload construction reproducible.
