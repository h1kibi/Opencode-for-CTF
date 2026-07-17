# Contributing to Opencode-for-CTF

Thanks for your interest in contributing! This is a CTF agent plugin for [OpenCode](https://opencode.ai). We welcome contributions of all forms — bug reports, feature additions, new tools, skill improvements, and documentation.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Contributing Guidelines](#contributing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Adding a New Tool](#adding-a-new-tool)
- [Adding a New Skill](#adding-a-new-skill)
- [Adding a New Agent](#adding-a-new-agent)
- [Testing](#testing)

## Code of Conduct

This project follows a standard Code of Conduct. Be respectful, constructive, and inclusive. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for details.

## Getting Started

1. Fork the repository.
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/Opencode-for-CTF.git
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Read [INSTALL.md](INSTALL.md) for end-user install semantics (profiles, manifest, status).
5. Install into an isolated OpenCode config when testing installer changes:
   ```bash
   OPENCODE_CONFIG_DIR=.local/opencode npm run ctf:install
   npm run ctf:status -- --strict
   ```

## Development Setup

- Node.js **>= 22.20.0** required (`package.json` engines)
- TypeScript (type-check with `npx tsc --noEmit`)
- Tests use Vitest (`npx vitest run`)
- Coverage: `npx vitest run --coverage`
- Run checks: `npm run check` (tsc + content validate + tests)
- Build plugin: `npm run build:plugin`
- Release shape: `npm run release:check` or `npm run pack:check`
- Managed installation doctor: `npm run doctor`
- Tooling doctor: `npm run doctor:tooling`

## Project Structure

See [README.md](README.md#仓库结构) for the full structure. Key directories:

| Directory   | Purpose                                                       |
| ----------- | ------------------------------------------------------------- |
| `src/`      | Plugin runtime (event hooks, state management, MCP lifecycle) |
| `tools/`    | Tool definitions (148+, `@opencode-ai/plugin tool()`)         |
| `agents/`   | Agent definitions (YAML frontmatter + markdown)               |
| `commands/` | Slash commands (129+, markdown)                               |
| `skills/`   | CTF skills (61+, markdown)                                    |
| `packages/` | Shared workspace packages                                     |
| `test/`     | Unit tests (Vitest)                                           |
| `scripts/`  | Setup and diagnostic scripts                                  |

## Contributing Guidelines

### Code Style

- 2-space indentation
- ESM imports with explicit file extensions
- TypeScript strict mode
- Use `propString()` from `src/plugin.ts` for safe event-property access
- State mutations through `atomicUpdateJsonFile()` for cross-process safety
- Path validation via `resolveInsideWorkspace()` pattern

### Commit Messages

- Use English, concise
- Prefix with category: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`
- Example: `feat: add ctf-web-ssti skill with reference docs`

### Naming Conventions

- Files: `kebab-case.ts` or `kebab-case.md`
- Agent names: `ctf-{category}`
- Skill names: `ctf-{category}-{subtopic}`
- Tool names: `ctf-{category}-{purpose}.ts`
- Command names: `ctf-{action}.md`

## Pull Request Process

1. Create a feature branch from `main`.
2. Make your changes.
3. Ensure type checking passes: `npx tsc --noEmit`
4. Ensure tests pass: `npx vitest run`
5. Update or add tests for your changes.
6. Update `CHANGELOG.md` if adding a notable feature.
7. Submit a pull request with a clear description.

### PR Title Format

```
<type>: <brief description>
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`

### PR Checklist

- [ ] Type check passes
- [ ] Tests pass (new tests added for new functionality)
- [ ] Documentation updated (README, CLAUDE.md, or inline docs)
- [ ] CHANGELOG.md updated
- [ ] No hardcoded absolute paths
- [ ] Tools validate workspace path boundaries

## Adding a New Tool

See `tools/` for examples. Each tool:

1. Uses `import { tool } from "@opencode-ai/plugin"`
2. Exports `default tool({ description, args, execute })`
3. Uses `tool.schema.string()` / `.number()` for args
4. Imports shared utilities from `./lib/` with `.ts` extension
5. Validates paths stay inside workspace
6. Returns a plain string

## Adding a New Skill

1. Create `skills/<category>/SKILL.md`
2. Include YAML frontmatter: `name`, `description`, `compatibility`
3. Define the solve state machine (phases, transitions, stop conditions)
4. Reference specialized sub-skills
5. Include evidence requirements and output contract

## Adding a New Agent

1. Create `agents/ctf-{name}.md`
2. YAML frontmatter: `description`, `mode`, `temperature`, `steps`, `permission`
3. Granular permissions: allow common ops, ask for destructive/privileged ops
4. Reference relevant skills, commands, and tools

## Testing

- All tests in `test/` directory
- File naming: `*.test.ts`
- Use temporary directories for filesystem-dependent tests
- Mock OpenCode client for integration-like tests
- Run with: `npx vitest run`
- Watch mode: `npx vitest`
