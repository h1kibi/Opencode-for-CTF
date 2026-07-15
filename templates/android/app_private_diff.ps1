param(
  [Parameter(Mandatory=$true)][string]$Package,
  [string]$Serial = "",
  [string]$Before = ".\work\android-runtime\before.txt",
  [string]$After = ".\work\android-runtime\after.txt",
  [string]$BaseDir = "/data/user/0"
)

$ErrorActionPreference = 'Stop'
$adb = @('adb')
if ($Serial) { $adb += @('-s', $Serial) }

function Dump-Listing([string]$OutPath) {
  $cmd = "run-as $Package sh -c 'cd $BaseDir/$Package 2>/dev/null && find . -maxdepth 5 -type f | sort'"
  & $adb shell $cmd | Set-Content -Path $OutPath
}

Dump-Listing -OutPath $Before
Start-Sleep -Seconds 2
Dump-Listing -OutPath $After

$beforeSet = @{}
Get-Content -LiteralPath $Before -ErrorAction SilentlyContinue | ForEach-Object { $beforeSet[$_] = $true }

"# Newly observed files" | Set-Content -Path (Join-Path (Split-Path $After -Parent) 'private-diff.txt')
Get-Content -LiteralPath $After -ErrorAction SilentlyContinue | ForEach-Object {
  if (-not $beforeSet.ContainsKey($_)) { Add-Content -Path (Join-Path (Split-Path $After -Parent) 'private-diff.txt') -Value $_ }
}

"done: wrote $Before, $After, private-diff.txt"
