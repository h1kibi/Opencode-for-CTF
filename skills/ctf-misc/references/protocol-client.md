# Protocol / PPC Client

Use for misc services that ask repeated questions, implement custom protocols, or require fast deterministic interaction.

## Triggers

- Remote/local service with prompts and answer rounds.
- Netcat-style programming challenge.
- Custom text/binary protocol, captcha-like math, game turns, or proof-of-work.
- Manual interaction repeats or timing matters.

## First Safe Checks

1. Capture one normal transcript.
2. Identify prompt boundaries, input terminators, encoding, and timeout.
3. Build a grammar/state table.
4. Implement minimal client with pwntools/socket/requests as appropriate.
5. Solve one round locally/in script, then loop only after parsing is stable.

## Protocol State Table

| State | Prompt / Bytes | Expected Input | Parser | Transition | Oracle |
|---|---|---|---|---|---|

## Client Rules

- Use deterministic receive helpers: `recvuntil`, regex, length-prefix parsing, or byte framing.
- Log unexpected prompts and abort rather than sending guessed answers.
- Separate parser, solver, and transport code.
- Keep retry count low unless failures are clearly network instability.
- Prefer local service/Docker reproduction before remote loops.

## Common Solvers

- Arithmetic/expression parser.
- Base/encoding converter.
- Hash/proof-of-work brute force with bounded search.
- Maze/game state search.
- Compression/serialization decoder.
- Binary frame parser with struct unpacking.

## Stop Rules

- Do not continue manual netcat after the grammar is stable enough for a client.
- Do not run high-volume loops before validating one full round.
- After two parser desyncs, record raw bytes and fix framing before more answers.

## Output Contract

Produce `solve.py` or `solve.js` with target host/port variables, local/remote mode if useful, and final flag extraction.
