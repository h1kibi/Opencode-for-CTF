# Build/Refresh the CTF revlab image and verify it.
# Usage:
#   .\build-revlab.ps1                          # build only (no mirror)
#   .\build-revlab.ps1 -UseCNMirror             # use Tsinghua/PyPI/Goproxy CN mirrors
#   .\build-revlab.ps1 -RunCheck                # build + run revlab-check inside container
#   .\build-revlab.ps1 -SkipBuild               # only run check (assumes image already built)
#   .\build-revlab.ps1 -AptMirror http://... -PipIndexUrl https://... -GoProxy https://...

[CmdletBinding()]
param(
    [switch]$RunCheck,
    [switch]$SkipBuild,
    [switch]$UseCNMirror,
    [string]$ImageName = "revlab:ubuntu22.04",
    [string]$Dockerfile = "Dockerfile.revlab-ubuntu22.04",
    [string]$TemplatesDir = "",
    [string]$TagV2 = $false,
    [string]$AptMirror = "",
    [string]$AptSecurity = "",
    [string]$PipIndexUrl = "",
    [string]$PipTrustedHost = "",
    [string]$GoProxy = ""
)

$ErrorActionPreference = "Stop"

if (-not $TemplatesDir) {
    $TemplatesDir = (Resolve-Path (Join-Path (Join-Path $PSScriptRoot "..") "templates")).Path
} else {
    $TemplatesDir = (Resolve-Path $TemplatesDir).Path
}

$composeFile = Join-Path $TemplatesDir "docker-compose.revlab.yml"
$dockerfilePath = Join-Path $TemplatesDir $Dockerfile

if (-not (Test-Path -LiteralPath $dockerfilePath)) {
    Write-Error "Dockerfile not found: $dockerfilePath"
    exit 1
}

# 默认中国镜像预设
if ($UseCNMirror) {
    if (-not $AptMirror)    { $AptMirror    = "http://mirrors.tuna.tsinghua.edu.cn/ubuntu/" }
    if (-not $AptSecurity)  { $AptSecurity  = "http://mirrors.tuna.tsinghua.edu.cn/ubuntu/" }
    if (-not $PipIndexUrl)  { $PipIndexUrl  = "https://pypi.tuna.tsinghua.edu.cn/simple" }
    if (-not $PipTrustedHost) { $PipTrustedHost = "pypi.tuna.tsinghua.edu.cn" }
    if (-not $GoProxy)      { $GoProxy      = "https://goproxy.cn,direct" }
}

Write-Host "==> revlab image: $ImageName"
Write-Host "==> Dockerfile:          $dockerfilePath"
if ($AptMirror)    { Write-Host "==> APT_MIRROR:    $AptMirror" }
if ($PipIndexUrl)  { Write-Host "==> PIP_INDEX_URL: $PipIndexUrl" }
if ($GoProxy)      { Write-Host "==> GOPROXY:       $GoProxy" }

# 0) docker daemon check
$dockerOk = $true
try {
    $null = & docker version --format '{{.Server.Version}}' 2>$null
    if ($LASTEXITCODE -ne 0) { $dockerOk = $false }
} catch {
    $dockerOk = $false
}
if (-not $dockerOk) {
    Write-Error "docker daemon not available. Start Docker Desktop or check PATH."
    exit 1
}

# 1) skip or build
if ($SkipBuild) {
    Write-Host "==> SkipBuild set; checking existing image"
    $existingId = & docker image inspect $ImageName --format '{{.Id}}' 2>$null
    if (-not $existingId) {
        Write-Error "image $ImageName not present; rerun without -SkipBuild"
        exit 1
    }
    Write-Host "==> image present: $existingId"
} else {
    # 优先用 docker build --build-arg 透传 mirror
    $buildArgs = @("--build-arg", "APT_MIRROR=$AptMirror",
                   "--build-arg", "APT_SECURITY=$AptSecurity",
                   "--build-arg", "PIP_INDEX_URL=$PipIndexUrl",
                   "--build-arg", "PIP_TRUSTED_HOST=$PipTrustedHost",
                   "--build-arg", "GOPROXY=$GoProxy")
    # 过滤空值 (build-arg 传空字符串等价于不传)
    $filteredArgs = @()
    for ($i = 0; $i -lt $buildArgs.Count; $i += 2) {
        $val = $buildArgs[$i + 1]
        $name = $buildArgs[$i].Replace("--build-arg ", "")
        if ($val -and $val -ne "") {
            $filteredArgs += "--build-arg", "$name=$val"
        }
    }

    Write-Host "==> building via direct docker build (supports build-args)"
    & docker build -t $ImageName -f $dockerfilePath $TemplatesDir @filteredArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Host "==> direct docker build failed; falling back to compose --profile revlab build"
        & docker compose -f $composeFile --profile revlab build revlab
        if ($LASTEXITCODE -ne 0) {
            Write-Error "both docker build and compose build failed; inspect output above"
            exit 1
        }
    }
    Write-Host "==> build OK"
}

# 2) optional check
if ($RunCheck) {
    Write-Host "==> running revlab-check inside container"
    & docker run --rm $ImageName revlab-check
    if ($LASTEXITCODE -ne 0) {
        Write-Error "revlab-check failed"
        exit 1
    }
}

# 3) summary
Write-Host ""
Write-Host "revlab image ready: $ImageName"
Write-Host "next: ctf-pcap-probe / ctf-go-pclntool will auto-use it when host tools are missing."
Write-Host "to rebuild later:          .\build-revlab.ps1 -RunCheck"
Write-Host "with CN mirror:             .\build-revlab.ps1 -UseCNMirror -RunCheck"
