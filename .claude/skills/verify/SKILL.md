---
name: verify-public-install
description: End-to-end verification of the managed OpenCode installation without touching the user's real configuration.
---

# Verify Public Install

Use an isolated config tree rooted inside the repository:

```powershell
$env:XDG_CONFIG_HOME="$PWD\.verify-xdg"
$env:OPENCODE_CONFIG_DIR="$env:XDG_CONFIG_HOME\opencode"
npm run build:plugin
npm run ctf:install -- --profile safe
npm run ctf:status -- --strict
npm run doctor -- --strict
opencode debug config
opencode agent list
```

Expected observations:

- install reports the `safe` profile and no MCP is enabled
- strict status shows zero missing/modified managed files
- doctor reports installation/config/plugin bundle ready; optional tool gaps are informational
- `opencode debug config` parses successfully and lists the isolated plugin bundle
- `opencode agent list` contains `ctf-fast`, `ctf-expert`, and category agents

Adjacent probes:

- a second `ctf:install` must stop with a clear “already installed; run upgrade or uninstall” error
- `ctf:upgrade` on the same version must preserve the installation and strict status

Remove `.verify-xdg/` after verification; it is ignored by git via `.tmp-*` only if renamed, so do not commit it.
