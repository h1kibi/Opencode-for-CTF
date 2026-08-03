# Architecture Notes

This file is a short orientation map for maintainers after the runtime refactor wave.

## Canonical subsystems

### Runtime assembly

- `src/plugin.ts`
- `src/hooks/`

`plugin.ts` should stay thin. Hook-specific behavior belongs in hook handler modules.

### Team Mode

- Canonical implementation: `src/team/`
- Compatibility façade: `src/team-runtime.ts`
- Legacy compatibility layer: `src/team-manager.ts`

New Team Mode logic should target the run/job model in `src/team/`.

### MCP lifecycle

- Canonical implementation: `src/mcp/mcp-runtime-adapter.ts`
- Compatibility façade: `src/dynamic-mcp-manager.ts`

New MCP policy/activation work should go to `src/mcp/`, not back into the façade.

### Capability summaries

- `src/capabilities/tool-visibility.ts`
- `src/capabilities/family-capability-view.ts`
- `src/capabilities/runtime-capability-summary.ts`

Diagnostics and self-tests should prefer these APIs over re-implementing visibility or readiness logic.

### Installer defaults

- Canonical defaults: `scripts/lib/install-defaults.mjs`
- Installer implementation: `scripts/lib/opencode-ctf-install.mjs`

Keep installation-time defaults separate from runtime behavior.

## Transitional exports

The following files intentionally preserve transitional exports for compatibility:

- `src/plugin.ts`
- `src/team-runtime.ts`
- `src/dynamic-mcp-manager.ts`

Do not grow these compatibility exports unless there is a strong migration reason.
When internal callers are updated, prefer direct imports from the canonical subsystem modules.

## Maintenance rule

Before adding a new helper, ask which layer owns it:

- assembly/hook glue
- canonical subsystem logic
- compatibility façade
- installer defaults
- diagnostics/capability summary

Put the helper in the owning layer, not the nearest convenient file.
