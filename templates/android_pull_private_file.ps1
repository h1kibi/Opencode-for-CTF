param(
  [Parameter(Mandatory=$true)][string]$Package,
  [Parameter(Mandatory=$true)][string]$RemotePath,
  [Parameter(Mandatory=$true)][string]$OutFile,
  [string]$Serial = ""
)

$ErrorActionPreference = "Stop"
$adbArgs = @()
if ($Serial) { $adbArgs += @("-s", $Serial) }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutFile) | Out-Null
& adb @adbArgs exec-out run-as $Package cat $RemotePath > $OutFile
Get-Item -LiteralPath $OutFile | Format-List FullName,Length,LastWriteTime
