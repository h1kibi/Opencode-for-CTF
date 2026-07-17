# Update local ljagiello/ctf-skills mirror and rebuild pattern card indexes.
$ErrorActionPreference = "Stop"
$repo = "{env:OPENCODE_CONFIG_DIR}\knowledge\ljagiello-ctf-skills"
$cards = "{env:OPENCODE_CONFIG_DIR}\knowledge\pattern-cards"
if (-not (Test-Path -LiteralPath $repo)) { throw "repo not found: $repo" }
$env:HTTP_PROXY = "http://127.0.0.1:7897"
$env:HTTPS_PROXY = "http://127.0.0.1:7897"
git -C $repo pull --ff-only
node (Join-Path $cards "build-ljagiello-cards.cjs")
node (Join-Path $cards "build-ljagiello-cards-v2.cjs")
node (Join-Path $cards "build-ljagiello-cards-v3.cjs")
node (Join-Path $cards "build-ljagiello-cards-v4.cjs")
node (Join-Path $cards "build-ljagiello-cards-v5.cjs")
node (Join-Path $cards "build-ljagiello-cards-v6.cjs")
node (Join-Path $cards "build-ljagiello-cards-v7.cjs")
node (Join-Path $cards "build-ljagiello-cards-v8.cjs")
node (Join-Path $cards "build-ljagiello-cards-v9.cjs")
node (Join-Path $cards "smoke-pattern-search.cjs")
node (Join-Path $cards "smoke-pattern-search-v5.cjs")
node (Join-Path $cards "smoke-pattern-search-v6.cjs")
node (Join-Path $cards "smoke-pattern-search-v7.cjs")
node (Join-Path $cards "smoke-pattern-search-v8.cjs")
node (Join-Path $cards "smoke-pattern-search-v9.cjs")
"updated and rebuilt pattern card indexes"
