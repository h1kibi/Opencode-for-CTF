# Pre-publish checklist

Use this before the first public GitHub push of **opencode-for-ctf** `0.1.1`.

## Must pass locally

```bash
node -v   # expect >= 22.20.0
npm install
npm run check
npm run build:plugin
npm run release:check
# optional fuller smoke
npm run pack:check
```

`npm run release:check` now runs an `npm pack --dry-run --json --ignore-scripts` probe and:

- **fails** if intermediate pattern cards (`cards.json` / `v2`–`v8`) or `skills-external/` appear
- **fails** if required runtime paths (v9 index, plugin bundle, agents) are missing
- **warns** if compressed/unpacked size exceeds soft thresholds (see `scripts/lib/publish-assets.mjs`)

Expected after Phase A slim pack: compressed roughly **~3–6 MB**, unpacked roughly **~25–40 MB**
(v9 alone is ~27 MB uncompressed). Historical card dumps stay in git for rebuilds only.

Note: a transitive dependency (`ini@7`) may still print `EBADENGINE` on some Node 22.20.x
installs. That warning is from the dependency's own engines field, not this package's
`engines` field. Runtime checks above remain the source of truth.

Isolated install smoke:

```bash
# Bash
export XDG_CONFIG_HOME="$PWD/.tmp-xdg"
export OPENCODE_CONFIG_DIR="$XDG_CONFIG_HOME/opencode"
npm run ctf:install
npm run ctf:status -- --strict
```

```powershell
$env:XDG_CONFIG_HOME="$PWD\.tmp-xdg"
$env:OPENCODE_CONFIG_DIR="$env:XDG_CONFIG_HOME\opencode"
npm run ctf:install
npm run ctf:status -- --strict
```

## Content hygiene

- [ ] No `.env` / real API keys / PATs in the tree
- [ ] No machine-specific absolute paths (`C:\Users\...`, personal usernames)
- [ ] `skills-external/` remains gitignored unless you intentionally vendor a snapshot
- [ ] `mcp-servers/*/node_modules/` not tracked
- [ ] `dist/` not committed (built in CI / install)
- [ ] README / INSTALL / SECURITY / LICENSE present and linked

## GitHub repo settings (after first push)

- [ ] Description + topics: `opencode`, `ctf`, `security`, `plugin`, `capture-the-flag`
- [ ] Enable Security Advisories
- [ ] Default branch protection optional for solo maintainers
- [ ] Create release tag `v0.1.1` when ready (docs already describe source install)

## Do not confuse with npm publish

GitHub source install is the current primary path:

```bash
npm run ctf:install
```

npm (`npx opencode-for-ctf install`) is prepared via `prepack` / CLI but should wait until `pack:check` and a real install-from-tarball are green.
