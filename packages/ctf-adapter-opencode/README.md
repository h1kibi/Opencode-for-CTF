# ctf-adapter-opencode

Thin OpenCode-facing surface for **opencode-for-ctf**.

## Responsibilities

- Re-export the shared category router from `ctf-core`
- Document OpenCode product constants: default entry `/ctf`, primary agents, config basenames
- Keep harness-specific naming separate from pure scoring logic

## Non-goals

- Plugin hooks and installers stay in repo-root `src/` and `scripts/`
- Agent markdown and slash commands stay in `agents/` and `commands/`

## Usage

```ts
import {
  decideRoute,
  DEFAULT_ENTRY_COMMAND,
  PRIMARY_AGENTS,
} from "../../packages/ctf-adapter-opencode/src/index.ts"

const plan = decideRoute({ text: "http://127.0.0.1:8000 flask" })
```
