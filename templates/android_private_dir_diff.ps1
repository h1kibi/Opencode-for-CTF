param(
  [Parameter(Mandatory=$true)][string]$Package,
  [string]$Serial = "",
  [string]$OutDir = "work/android-private-diff",
  [string]$Phase = "snapshot"
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$adbArgs = @()
if ($Serial) { $adbArgs += @("-s", $Serial) }
function ADB([string[]]$Args) { & adb @adbArgs @Args }

$base = "/data/user/0/$Package"
$out = "$OutDir\$Phase-private-tree.txt"
ADB @("shell", "run-as", $Package, "sh", "-c", "pwd; ls -la; find $base -maxdepth 4 -type f -o -type d 2>/dev/null") | Tee-Object -FilePath $out
"snapshot=$out"
"If run-as fails, app is not debuggable or device policy blocks private dir access. Use Frida/file-write hooks or a rooted/test build fallback."
