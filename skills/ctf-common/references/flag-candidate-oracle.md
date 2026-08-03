# Flag Candidate -> Oracle Closure

Use this as the shared closure contract for every category. It is deliberately shorter than a payload playbook.

## State machine

```text
untrusted_hint -> flag_candidate -> oracle_verified -> closed
```

A string becomes `flag_candidate` only after the strict default rules classify it and the solver records:

```yaml
value: <exact string>
source: <file/HTTP/terminal/tool>
origin: <where it came from>
context: <nearby command, path, response, or artifact fact>
classification: high | medium
candidate_status: pending_oracle
```

## Default classification

- Accept a braced `prefix{payload}` only when the prefix is 3-10 alphanumeric characters and the payload is 10-60 characters from the approved safe set.
- Accept the UUID variant directly when it is an explicit `flag{...}` or `ctf{...}` value.
- Reject bare MD5/SHA-256 unless the source/context explicitly names `flag.txt`, `.flag`, `/flag`, `readflag`, or `getflag`.
- Treat decoded text, a regex hit, HTTP 200, a successful command, a shell, a crash, a worker claim, or a file named `flag` as evidence only.

## Oracle sequence

1. Extract and preserve all candidate metadata; never overwrite a candidate with a normalized value.
2. Call `ctf-flag-verify` with the candidate(s) and the strongest independent oracle available:
   - exact expected value;
   - workspace-scoped flag file read independently from the candidate path;
   - expected SHA-256;
   - challenge service/platform checker.
3. A custom `flagPattern` can reduce false positives but can never produce `oracle_verified: true`.
4. If the result is `candidate`, keep `candidate_status: pending_oracle` and continue the smallest closure check.
5. If the result is `rejected` or `unverified`, record the reason and do not retry the same candidate without new evidence.
6. Only after `oracle_verified: true`, record the exact value with `ctf-evidence-board command=flag-verify`, then stop and write `agent_flag.txt` if the caller owns that final-output step.

## Stop / pivot rules

- Stop immediately after an exact oracle match; do not keep exploiting or collect unrelated secrets.
- Pivot when the candidate is only format-valid but the current primitive cannot reach an independent oracle.
- Mark the branch dead when the exact oracle rejects all candidates and no new source/context was discovered.
- Keep `oracle_verified: false` in every intermediate report.

## Anti-confusion examples

| Observation | State | Reason |
|---|---|---|
| `flag{...}` in HTML comment | `flag_candidate` | shape is strong, source is not proof |
| 32-hex value in a random config | `untrusted_hint` | no flag context |
| 32-hex value from `cat /flag` | `flag_candidate` | context permits hash classification, still needs oracle |
| exact value matched against independent `flag.txt` | `oracle_verified` | independent file oracle passed |
| `flagPattern` matched a string | `flag_candidate` | a pattern is not a proof oracle |
