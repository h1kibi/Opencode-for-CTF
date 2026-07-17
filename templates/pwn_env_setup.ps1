param(
  [string]$TargetDir = ".",
  [string]$TemplateDir = "{env:OPENCODE_CONFIG_DIR}\templates",
  [ValidateSet("18","20","22","24","i386","general","heavy","general18","general20","general24","heavy24","debian11","debian12","alpine","aarch64","arm64","mipsel","all")]
  [string]$Profile = "general",
  [switch]$Overwrite,
  [switch]$Build,
  [switch]$PrintOnly
)

$ErrorActionPreference = "Stop"

function Resolve-FullPath([string]$Path) {
  if ([System.IO.Path]::IsPathRooted($Path)) {
    return [System.IO.Path]::GetFullPath($Path)
  }
  return [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $Path))
}

$target = Resolve-FullPath $TargetDir
if (-not (Test-Path -LiteralPath $target)) {
  throw "TargetDir does not exist: $target"
}
if (-not (Test-Path -LiteralPath $TemplateDir)) {
  throw "TemplateDir does not exist: $TemplateDir"
}

$files = @(
  "docker/docker/docker-compose.revlab.yml",
  "docker/Dockerfile.pwnlab.ubuntu18.04",
  "docker/Dockerfile.pwnlab.ubuntu20.04",
  "docker/Dockerfile.pwnlab.ubuntu22.04",
  "docker/Dockerfile.pwnlab.ubuntu24.04",
  "docker/Dockerfile.pwnlab.i386-ubuntu20.04",
  "docker/Dockerfile.pwnlab.general-ubuntu22.04",
  "docker/Dockerfile.pwnlab.heavy-ubuntu22.04",
  "docker/Dockerfile.pwnlab.general-ubuntu24.04",
  "docker/Dockerfile.pwnlab.heavy-ubuntu24.04",
  "docker/Dockerfile.pwnlab.general-ubuntu18.04",
  "docker/Dockerfile.pwnlab.general-ubuntu20.04",
  "docker/Dockerfile.pwnlab.general-debian11",
  "docker/Dockerfile.pwnlab.general-debian12",
  "docker/Dockerfile.pwnlab.general-alpine",
  "docker/Dockerfile.pwnlab.aarch64",
  "docker/Dockerfile.pwnlab.mipsel",
  "solve_pwn.py",
  "pwn_notes.md",
  "pwn_state_compact.md",
  "pwn_retro.md"
)

Write-Host "PWN env setup target: $target"
Write-Host "Template source: $TemplateDir"

foreach ($file in $files) {
  $src = Join-Path $TemplateDir $file
  $dst = Join-Path $target $file
  if (-not (Test-Path -LiteralPath $src)) {
    Write-Warning "Missing template: $src"
    continue
  }
  if ((Test-Path -LiteralPath $dst) -and -not $Overwrite) {
    $srcHash = (Get-FileHash -LiteralPath $src -Algorithm SHA256).Hash
    $dstHash = (Get-FileHash -LiteralPath $dst -Algorithm SHA256).Hash
    if ($srcHash -ne $dstHash) {
      Write-Warning "skip existing but differs from template: $file (rerun with -Overwrite to refresh)"
    } else {
      Write-Host "skip existing: $file"
    }
    continue
  }
  if ($PrintOnly) {
    Write-Host "would copy: $file"
  } else {
    Copy-Item -LiteralPath $src -Destination $dst -Force:$Overwrite
    Write-Host "copied: $file"
  }
}

$profileMap = @{
  "18" = "ubuntu18"
  "20" = "ubuntu20"
  "22" = "ubuntu22"
  "24" = "ubuntu24"
  "i386" = "i386"
  "general" = "general"
  "heavy" = "heavy"
  "general18" = "general18"
  "general20" = "general20"
  "general24" = "general24"
  "heavy24" = "heavy24"
  "debian11" = "debian11"
  "debian12" = "debian12"
  "alpine" = "alpine"
  "aarch64" = "aarch64"
  "arm64" = "aarch64"
  "mipsel" = "mipsel"
  "all" = "general"
}
$composeProfile = $profileMap[$Profile]

Write-Host ""
Write-Host "Suggested commands:"
if ($composeProfile -eq "heavy") {
  Write-Host "  docker compose -f docker/docker-compose.revlab.yml --profile general build pwn-general"
  Write-Host "  docker compose -f docker/docker-compose.revlab.yml --profile heavy build pwn-heavy"
} elseif ($composeProfile -eq "heavy24") {
  Write-Host "  docker compose -f docker/docker-compose.revlab.yml --profile general24 build pwn-general24"
  Write-Host "  docker compose -f docker/docker-compose.revlab.yml --profile heavy24 build pwn-heavy24"
} else {
  Write-Host "  docker compose -f docker/docker-compose.revlab.yml --profile $composeProfile build"
}
if ($composeProfile -eq "i386") {
  Write-Host "  docker compose -f docker/docker-compose.revlab.yml --profile $composeProfile up -d pwn-i386"
  Write-Host "  docker compose -f docker/docker-compose.revlab.yml --profile $composeProfile exec pwn-i386 bash"
} elseif ($composeProfile -eq "general") {
  Write-Host "  docker compose -f docker/docker-compose.revlab.yml --profile $composeProfile up -d pwn-general"
  Write-Host "  docker compose -f docker/docker-compose.revlab.yml --profile $composeProfile exec pwn-general bash"
} elseif ($composeProfile -eq "heavy") {
  Write-Host "  docker compose -f docker/docker-compose.revlab.yml --profile $composeProfile up -d pwn-heavy"
  Write-Host "  docker compose -f docker/docker-compose.revlab.yml --profile $composeProfile exec pwn-heavy bash"
} elseif ($composeProfile -eq "general24") {
  Write-Host "  docker compose -f docker/docker-compose.revlab.yml --profile $composeProfile up -d pwn-general24"
  Write-Host "  docker compose -f docker/docker-compose.revlab.yml --profile $composeProfile exec pwn-general24 bash"
} elseif ($composeProfile -eq "heavy24") {
  Write-Host "  docker compose -f docker/docker-compose.revlab.yml --profile $composeProfile up -d pwn-heavy24"
  Write-Host "  docker compose -f docker/docker-compose.revlab.yml --profile $composeProfile exec pwn-heavy24 bash"
} else {
  Write-Host "  docker compose -f docker/docker-compose.revlab.yml --profile $composeProfile up -d pwn-$composeProfile"
  Write-Host "  docker compose -f docker/docker-compose.revlab.yml --profile $composeProfile exec pwn-$composeProfile bash"
}
Write-Host "  docker compose -f docker/docker-compose.revlab.yml ps"
Write-Host ""
Write-Host "Inside container quick checks:"
Write-Host "  file ./chall && readelf -h ./chall && objdump -f ./chall && nm -an ./chall | head"
Write-Host "  strings -a ./chall | head && checksec --file=./chall"
Write-Host '  python3 -c "from pwn import *; print(''pwntools ok'')"'
Write-Host "  pwnlab-check || true"
Write-Host "  gdb -q ./chall"
Write-Host "  ROPgadget --binary ./chall --only 'pop|ret' | head"

if ($Build) {
  if ($PrintOnly) {
    Write-Host "would build profile: $composeProfile"
  } else {
    Push-Location $target
    try {
      if ($composeProfile -eq "heavy") {
        docker compose -f docker/docker-compose.revlab.yml --profile general build pwn-general
        docker compose -f docker/docker-compose.revlab.yml --profile heavy build pwn-heavy
      } elseif ($composeProfile -eq "heavy24") {
        docker compose -f docker/docker-compose.revlab.yml --profile general24 build pwn-general24
        docker compose -f docker/docker-compose.revlab.yml --profile heavy24 build pwn-heavy24
      } else {
        docker compose -f docker/docker-compose.revlab.yml --profile $composeProfile build
      }
    } finally {
      Pop-Location
    }
  }
}
