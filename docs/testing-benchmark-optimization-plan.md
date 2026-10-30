# Testing and Benchmark Current State

This document records the current testing and benchmark contracts and the remaining quality work. It separates runtime behavior from registry/content checks and separates replay diagnostics from challenge-solving ability.

## 1. Current test signals

The repository has tests for pure state and policy logic, file locking and state persistence, installers, tool behavior, Team lifecycle and repair, and benchmark runners. The current CI workflow runs the quality matrix on Ubuntu and Windows with Node 22:

```text
npm ci
npm run lint
npm run check:content
npm run format:check
npm test
npm run benchmark:replay
npm run build:plugin
npm run release:check
```

A separate Ubuntu coverage job runs the test suite with coverage after the quality job. This is the current CI behavior shown by `.github/workflows/ci.yml`; it is not accurate to describe CI as Ubuntu-only or as omitting replay contracts.

Tests that only inspect source text, metadata, file presence, or wiring are contract/integrity checks. They can protect a registration or content invariant, but they do not establish that a tool executed correctly or that an agent solved a challenge. A test name and report must match that boundary.

## 2. Benchmark entrypoints

The package scripts define three distinct benchmark purposes:

| Entry point | Current role | Counts as solve rate? |
|---|---|---:|
| `benchmark:lint` | Run family benchmark rule checks and report static/process diagnostics | No |
| `benchmark:replay` | Run deterministic scenario contracts and replay checks | No; process diagnostics only |
| `benchmark:solve` | Run the NYU-style solver benchmark with isolated workspaces and independent challenge oracles | Yes, when the challenge oracle reports solved |

`benchmark:scenarios` remains an alias for `benchmark:replay`, and `benchmark:nyu` remains an alias for `benchmark:solve`. A replay scenario validates checker and trace behavior; it is not an end-to-end agent solve-rate measurement.

The independent oracle is authoritative for solving. Candidate flag formatting, worker prose, keyword matches, artifacts, or a successful checker process cannot by themselves establish `solved`. Replay status, evidence completeness, and contract status are useful diagnostic dimensions and must remain separately reported.

## 3. Current benchmark protections

The current benchmark infrastructure includes deterministic scenario manifests, pass/fail artifacts, ordered trace contracts where declared, family rule checks, and a NYU runner with isolated workspaces, private expected-flag hashes, sanitized challenge context, optional service lifecycle hooks, and replay support. The exact coverage of each family and each checker is a source-level fact and should be read from its manifest and runner rather than inferred from aggregate counts.

The important result dimensions are distinct:

- `solved`: independent oracle or challenge verifier accepted the result;
- `formatMatched`: candidate matched an expected format but is not proven correct;
- `replayPassed`: a permitted replay or trace contract passed;
- `contractPassed`: a wiring or schema contract passed;
- `unavailable`: a required platform or dependency was unavailable.

`unavailable` must not silently become pass or solved. A challenge with missing required observations should fail or report an explicit error according to the runner contract, not become a successful empty result.

## 4. Test design boundary

A useful behavior test starts the actual tool or runtime path and asserts an independent outcome, such as exit status, state transition, output contract, artifact, cleanup, or oracle result. A contract test may assert schema, manifest, registry, command routing, or cross-reference integrity, but it should be named and reported as a contract.

High-value areas currently include:

- independent flag/file/service oracle behavior;
- Team lifecycle, retry, cancellation, recovery, repair, and persistence;
- file-lock ownership and fencing;
- installer and package lifecycle behavior;
- real tool and CLI behavior on controlled fixtures;
- NYU runner isolation, timeout, cleanup, replay, and report redaction.

Source-text assertions and presence-only checks should remain limited to the contract or integrity layer. They should not be promoted into benchmark solve evidence.

## 5. CI and platform semantics

Pull-request CI currently includes deterministic replay contracts and runs on both Linux and Windows. The workflow also builds the plugin and verifies the release package. The normal package `check` script runs TypeScript checking, content checks, the full Vitest suite, and benchmark replay; it does not run the NYU solve benchmark.

The NYU solve benchmark is a separate command and requires a pinned dataset/workspace setup and the relevant external challenge environment. It is not part of the ordinary PR workflow shown in the current CI file.

Platform-specific unavailable conditions must be explicit. Windows and Linux have different shell, path, signal, Docker, and WSL capabilities; a specialist dependency being unavailable should be reported as unavailable or skipped with a reason, not counted as a successful solve.

## 6. Remaining quality work

The remaining work supported by the current repository is narrow:

1. Keep test names and benchmark reports aligned with what they actually execute and prove.
2. Add or improve real behavior fixtures only where a plausible consumer-visible regression is not covered by existing runtime tests.
3. Preserve negative paths for wrong flags, malformed packets, missing evidence, timeout, cleanup, and unavailable environments.
4. Keep replay and lint results out of solve-rate denominators.
5. Pin and document the dataset and environment used for any repeatable `benchmark:solve` report.
6. Consolidate duplicate contract/source-text checks only when the resulting canonical contract still identifies the affected input and invariant.

The repository has not established that every family has a complete independent solve fixture or that a nightly solve schedule is configured. Those remain source-dependent and should not be described as completed.

## 7. Review questions

For a new test or benchmark check, ask:

- Does it execute the behavior it claims to cover?
- Can a wrong flag or malformed result be rejected independently?
- Is there a failure, boundary, cleanup, or unavailable path?
- Is the assertion independent of the implementation text?
- Is the result a contract, replay diagnostic, or solve measurement?
- Can the scenario be isolated and reproduced with its environment and dataset recorded?

## 8. Source-dependent uncertainty

The workflow and package scripts establish the CI and entrypoint claims above. The completeness of individual family coverage, the precise benchmark dataset used in a particular run, and any scheduled nightly job are not established by those files alone. Treat those details as unknown until the corresponding runner, manifest, or workflow supplies evidence.
