#!/usr/bin/env pwsh
# ============================================================
# update-external-skills.ps1
#
# Update the local mirror of ljagiello/ctf-skills in
# skills-external/ctf-skills/ (Windows version).
#
# Usage:
#   ./scripts/update-external-skills.ps1
#   ./scripts/update-external-skills.ps1 -DryRun
# ============================================================
param([switch]$DryRun)

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$SkillsRepo = Join-Path $ProjectRoot "skills-external" "ctf-skills"
$RemoteUrl = "https://github.com/ljagiello/ctf-skills.git"

if (-not (Test-Path (Join-Path $SkillsRepo ".git"))) {
  Write-Warning "skills-external/ctf-skills is not a git repository."
  Write-Host "    Expected at: $SkillsRepo"
  Write-Host "    Run: git clone $RemoteUrl `"$SkillsRepo`""
  exit 1
}

Write-Host "[*] Updating CTF skills mirror..." -ForegroundColor Green
Write-Host "    Repo: $SkillsRepo"

Push-Location $SkillsRepo
try {
  $oldHash = git rev-parse HEAD
  git fetch origin main 2>&1 | Out-Host
  $newHash = git rev-parse origin/main 2>$null

  if ($oldHash -eq $newHash) {
    Write-Host "[✓] Already up to date." -ForegroundColor Green
    exit 0
  }

  Write-Host "[!] Updates available:" -ForegroundColor Yellow
  Write-Host "    Old: $oldHash"
  Write-Host "    New: $newHash"
  Write-Host "`n[*] Changes:" -ForegroundColor Green
  git log --oneline "$oldHash..origin/main" --no-decorate 2>$null

  if ($DryRun) {
    Write-Host "`n[!] Dry-run — not applying changes." -ForegroundColor Yellow
    exit 0
  }

  git merge origin/main --ff-only 2>&1 | Out-Host
  Write-Host "[✓] CTF skills mirror updated." -ForegroundColor Green
} finally {
  Pop-Location
}
