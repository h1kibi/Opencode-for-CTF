# Tool Layer: Current State and Remaining Work

This document describes the current tool surface and the small set of remaining tool-layer concerns. It is not a plan for changing Team Mode; Team lifecycle tools are runtime tools and are described as such in the architecture documents.

## 1. Current registration path

The registry walks the `tools/` tree, skips `tools/lib` helpers, rejects duplicate basenames, and applies enabled-pack filtering. When `ctf-agent.manifest.json` is available for the active product root, its `registered_tools` list is the explicit product whitelist:

The registration pipeline is: discover files under `tools/`, identify unique basenames, apply the `registered_tools` whitelist, apply the enabled-pack filter, dynamically import and validate exports, then produce the registry and structured load report.

A file outside `registered_tools` is reported as `undeclared` and is not registered. A tool excluded by the selected pack is `deferred`. Import and export failures are retained in the load report with criticality and, where known, a fallback. The manifest separately lists runtime Team tools, which are created by the plugin rather than loaded from a disk tool file.

This is a current explicit product boundary: adding a source file does not by itself add an agent-visible registry entry when the manifest is enforced. The source still contains directory discovery because discovery supplies diagnostics and the candidate set; it is no longer the product decision by itself.

## 2. Current tool categories

The current metadata and pack layer distinguish:

- core and light tools used by common routing, triage, evidence, and verification paths;
- family and specialist tools for Web, Pwn, Rev, Crypto, Forensics, Misc, and AI-security work;
- maintenance and diagnostic tools;
- runtime-created tools, including Team lifecycle controls.

Packs control the visible/loading surface. Tool metadata also records environment requirements and tier information. Heavy or unavailable dependencies are reported rather than silently treated as available.

The explicit manifest is broad and contains both common and specialist entries. The repository has not completed a universal five-pack replacement, so the current family pack IDs remain the operative configuration. A tool's capability or environment requirement is not the same thing as a pack ID.

## 3. Canonical entries

Each tool has one canonical name and one implementation file. `ctf-safe-extract` is the archive implementation. The former compatibility names `archive-safe-extract`, `ctf-java-analyze-pack`, `ctf-pwn-remote-check`, and `ctf-web-recon-pack` were removed together with their manifest entries, pack classifications, allowlist entries, tests, and documentation references. `java-heavy` is no longer accepted as a pack alias for `java`.

The removed names are not retained as aliases: callers use the canonical tool directly, and an old name fails registry resolution instead of loading a second facade.

## 4. Current quality boundaries

The tool layer already enforces several boundaries:

- duplicate tool basenames fail discovery rather than selecting an arbitrary file;
- files not declared by the manifest are not registered;
- `tools/lib` modules are helpers, not agent tools;
- dynamic import and default-export contract failures are reported;
- pack filtering can defer specialist tools without deleting their implementations;
- runtime Team tools are kept separate from disk-backed manifest entries;
- tool requirements and known fallbacks are included in diagnostics;
- each registered tool maps to exactly one implementation file.

These boundaries reduce accidental public-surface growth without requiring all implementation files to be moved into new directories.

## 5. Remaining work

Only the following work is supported by current source evidence:

1. Keep the manifest, disk inventory, and registry report synchronized as tools are added or removed.
2. Complete a repository-wide reference audit before deleting specialist entries that appear unused in agent and skill text.
3. Continue extracting genuinely shared low-level primitives only when their input limits, offsets, error behavior, and output schemas are demonstrably identical.
4. Keep large public tools as stable orchestration surfaces while moving internal implementation only when the move does not add registry entries.
5. Reconcile historical tool-count and pack-count prose wherever it is still presented as an authoritative current number; the manifest and registry report are the sources of truth.

No claim is made here that the five-pack redesign, all duplicate-helper consolidation, or deletion of every unused specialist has been completed. Those are not current-state facts.

## 6. Verification boundary

Tool-layer verification should use behavior and registry contracts:

- manifest-declared tools load or produce a visible failure report;
- undeclared files remain outside the registry;
- pack filtering defers tools outside the selected surface;
- canonical archive calls retain their documented behavior;
- runtime Team tools remain available through the runtime registration path;
- unavailable specialist dependencies affect the specialist path without silently changing the core registry.

The repository's existing tests and release checks cover portions of these boundaries. This document does not infer complete coverage from the presence of a manifest or a source-level metadata entry.

## 7. Source-dependent uncertainty

The manifest includes a large specialist surface, while some older planning prose described a smaller target surface. It is therefore uncertain whether a specific specialist is intentionally public or merely retained without a product requirement. Treat the manifest plus actual call-site audit as authoritative for any deletion decision.
