# Misc Fallback Matrix

Use this when a misc branch stalls. Misc is a router first; stay only when mixed scripting is still the shortest path.

| Failed Stage | Symptom | Fallback | Stop / Pivot Rule |
|---|---|---|---|
| Classification | Triage is ambiguous | Build the Misc Constraint Equation and run one orthogonal probe: archive/media/protocol/source/binary/crypto | After two generic triage passes, force route decision or ask for challenge details |
| Direct Flag | Grep/strings finds nothing | Check archive members, metadata, embedded signatures, common encodings, and extracted directories | If artifact type is clear, route to specialized category |
| Archive/Container | Extraction unclear or nested | Use safe listing/extraction, inspect magic bytes and member names, rerun triage on extracted output | Stop recursive extraction when no new file type/flag signal appears |
| Media/Document | Stego guesswork begins | Use metadata, trailing data, embedded archive, strings, QR/barcode/spectrogram only when format signal exists | Do not run random stego tools without evidence |
| Encoding Puzzle | Decode chain stalls | Record reversible transform chain, charset, byte order, padding, known plaintext, and oracle | After 3 same-family decodes, try orthogonal representation or ask for clue |
| Jail/Sandbox | Payloads blocked | Map blocked chars/keywords, available builtins/imports, object graph, eval mode, and side channels | After 3 same-family bypasses without differential, change escape family |
| Protocol/PPC | Manual interaction repeats | Capture grammar, state transitions, timeout, answer format; build minimal client | Do not continue manual netcat after grammar is stable |
| Game/Simulation | Search space unclear | Model state, transitions, scoring, target condition; choose BFS/DP/A*/SMT/random only with reason | If no oracle/goal exists, ask for rules or inspect source |
| Blockchain/ML | Domain-specific setup unclear | Identify local vs remote chain/model, contract/source/notebook, inputs, scoring and allowed actions | Avoid third-party accounts or out-of-scope services |
| Cross-category | Hidden web/pwn/rev/crypto/forensics evidence appears | Route to specialized skill and carry over evidence summary | Do not stay in misc after route confidence is high |
| Final Verification | Candidate output uncertain | Run exact checker/client/extraction path; flag grep final work dirs | Do not guess flags; write only verified `agent_flag.txt` |

High-information fallbacks:

- Route decision beats tool spraying.
- Minimal client beats manual protocol loops.
- Jail constraint map beats payload mutation.
- Reversible transform ledger beats ad-hoc decoding.
- Specialized category handoff beats misc overreach.
