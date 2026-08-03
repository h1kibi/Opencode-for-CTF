#!/usr/bin/env pwsh
# ============================================================
# update-external-skills.ps1
#
# Update the local SecKnowledge reference skill in
# skills-external/secknowledge-skill/ (Windows version).
#
# Usage:
#   ./scripts/update-external-skills.ps1
#   ./scripts/update-external-skills.ps1 -DryRun
# ============================================================
param([switch]$DryRun)

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$SkillsRepo = Join-Path $ProjectRoot "skills-external" "secknowledge-skill"
$RemoteUrl = "https://github.com/Pa55w0rd/secknowledge-skill.git"

if (-not (Test-Path (Join-Path $SkillsRepo ".git"))) {
  Write-Warning "skills-external/secknowledge-skill is not a git repository."
  Write-Host "    Expected at: $SkillsRepo"
  Write-Host "    Run: git clone $RemoteUrl `"$SkillsRepo`""
  exit 1
}

Write-Host "[*] Updating SecKnowledge external skill..." -ForegroundColor Green
Write-Host "    Repo: $SkillsRepo"
Write-Host "    Remote: $RemoteUrl"

Push-Location $SkillsRepo
try {
  $currentRemote = git remote get-url origin
  if ($currentRemote -ne $RemoteUrl) { throw "Remote mismatch: expected $RemoteUrl, got $currentRemote" }
  if ((git status --porcelain)) { throw "Refusing to overwrite a dirty external checkout." }
  $oldHash = git rev-parse HEAD
  git fetch --depth=1 origin main 2>&1 | Out-Host
  $newHash = git rev-parse origin/main
  Write-Host "    Current: $oldHash"
  Write-Host "    Latest:  $newHash"
  if ($oldHash -eq $newHash) {
    Write-Host "[OK] Already up to date." -ForegroundColor Green
    exit 0
  }
  git log --oneline "$oldHash..origin/main" --no-decorate 2>$null
  if ($DryRun) {
    Write-Host "[!] Dry-run - not applying changes." -ForegroundColor Yellow
    exit 0
  }
  git checkout --detach origin/main 2>&1 | Out-Host
  Write-Host "[OK] SecKnowledge external skill updated. Pin the resulting commit in scripts/fetch-skills.mjs." -ForegroundColor Green
} finally {
  Pop-Location
}
