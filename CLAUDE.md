# Opencode-for-CTF — CLAUDE.md

This is a CTF agent plugin for OpenCode. Follow these conventions when working here.

## Project Structure

```
src/           — Plugin runtime (TypeScript, ESM)
agents/        — Agent definitions (YAML frontmatter + markdown)
commands/      — Slash commands (markdown); L0 surface is /ctf + /ctf-help + a few overrides
skills/        — CTF skills (markdown + references/)
tools/         — Tool definitions (TypeScript, @opencode-ai/plugin tool())
packages/      — Shared workspace packages (ctf-core router, adapter surface, …)
scripts/       — Diagnostic and setup scripts
test/          — Vitest unit tests
knowledge/     — Knowledge base (lessons, pattern-cards, pwn, rev)
rules/         — Safety and CTF solving rules
templates/     — Solve/exploit templates
docker/        — PWN/REV multi-arch Dockerfiles
mcp-servers/   — Custom MCP server implementations
runtime/       — Runtime environment helpers
```

## Product surface

- Default user entry: `/ctf` (auto-route via tool `ctf-route-plan` / `packages/ctf-core/src/router.ts`)
- Primary agents only: `ctf-fast`, `ctf-expert` (plus support primary `researcher` for KB maintenance; no ctf-master/daily)
- Optional user config: `opencode-for-ctf.jsonc` (see `opencode-for-ctf.example.jsonc`, loader in `src/plugin-config.ts`)
- Tool packs: `src/tool-packs.ts` + `loadCtfTools({ packs })`; defaults skip android/godot; env `OPENCODE_CTF_TOOL_PACKS`
- OpenCode product constants: `packages/ctf-adapter-opencode`
- CLI: `node scripts/cli.mjs <install|upgrade|status|uninstall|doctor|help>`

## TypeScript Conventions

- ESM only: use `import`/`export`, NOT `require`
- All relative imports need explicit file extensions: `"./foo.js"` (typecheck will enforce this)
- Exception: `.ts` extension in imports is OK with `allowImportingTsExtensions: true` + `noEmit`
- Use typed `tool({...})` from `@opencode-ai/plugin` in tools/
- `src/` uses `.ts` extension in internal imports (allowed by tsconfig)

## Code Style

- 2-space indentation
- Prefer explicit `undefined` checks over `||` for optional values
- Use `propString()` / `propStringNullable()` from `src/plugin.ts` for safe event-property access
- State files are JSON, read/written atomically via `state-store.ts`
- Cross-process synchronization via `file-lock.ts` (proper-lockfile)

## Testing

- Vitest, in `test/` directory
- File name: `*.test.ts`
- Use temporary directories for filesystem tests (`mkdtempSync`)
- Run: `npm test` (or `npx vitest run`)
- Coverage: `npm run test:coverage`

## Adding a New Tool

1. Create `.ts` file in `tools/` with `export default tool({...})`
2. Use `tool.schema.string()` / `.number()` for argument definitions
3. Import shared utilities from `./lib/` with `.ts` extension
4. Write path resolution with `resolveInsideWorkspace()` pattern (prevents path traversal)
5. Return a plain string from `execute()`

## Adding a New Command

1. Create markdown file in `commands/` with YAML frontmatter
2. Frontmatter: `description`, `agent`, `subtask: false`
3. Use `$ARGUMENTS` placeholder for user input
4. Format: `---` frontmatter, then command instructions

## Adding a New Agent

1. Create markdown file in `agents/`
2. YAML frontmatter: `description`, `mode` (primary/subagent), `temperature`, `steps`, `permission`
3. Granular permission rules: allow safe ops, ask for destructive/network/install
4. Reference the relevant skills and commands

## Adding a New Skill

1. Create `SKILL.md` in `skills/<category>/`
2. Define solve state machine phases
3. Reference specialized sub-skills and `references/*.md`
4. Include stop conditions and evidence requirements

## Common Pitfalls

- Don't hardcode absolute paths — use `.env` + `setup.mjs`
- Don't commit `opencode.json` — it's a generated file with local paths
- State files in `runtime/state/` are ephemeral — add to `.gitignore`
- Tools must validate paths stay inside workspace (use `resolveInsideWorkspace`)
- MCP servers need entries in THREE places: registry, agent profile, and optionally opencode.jsonc
