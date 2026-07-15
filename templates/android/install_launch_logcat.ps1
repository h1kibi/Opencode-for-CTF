param(
  [Parameter(Mandatory=$true)][string]$Apk,
  [Parameter(Mandatory=$true)][string]$Package,
  [string]$Activity = "",
  [string]$Serial = "",
  [string]$OutDir = ".\work\android-runtime",
  [string]$Filter = "swdd strange shell art dex classloader RuntimeException UnsatisfiedLinkError VerifyError ClassNotFoundException JNI",
  [switch]$NoUninstall,
  [switch]$NoClear
)

$ErrorActionPreference = 'Stop'
if (!(Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }
$adb = @('adb')
if ($Serial) { $adb += @('-s', $Serial) }

& $adb shell getprop ro.build.version.release | Out-File -FilePath (Join-Path $OutDir 'device-info.txt') -Encoding utf8
& $adb shell getprop ro.product.model | Add-Content -Path (Join-Path $OutDir 'device-info.txt')

if (!$NoUninstall) {
  try { & $adb uninstall $Package | Tee-Object -FilePath (Join-Path $OutDir 'uninstall.txt') } catch {}
}

& $adb install $Apk | Tee-Object -FilePath (Join-Path $OutDir 'install.txt')

if (!$NoClear) {
  try { & $adb shell pm clear $Package | Tee-Object -FilePath (Join-Path $OutDir 'pm-clear.txt') } catch {}
}

& $adb logcat -c | Out-Null

if ($Activity) {
  & $adb shell am start -n "$Package/$Activity" | Tee-Object -FilePath (Join-Path $OutDir 'launch.txt')
} else {
  & $adb shell monkey -p $Package -c android.intent.category.LAUNCHER 1 | Tee-Object -FilePath (Join-Path $OutDir 'launch.txt')
}

$pattern = ($Filter -split '\s+' | Where-Object { $_ }) -join '|'
& $adb logcat -d | Select-String -Pattern $pattern -SimpleMatch:$false | ForEach-Object { $_.Line } | Set-Content -Path (Join-Path $OutDir 'logcat-filtered.txt')
& $adb logcat -d | Set-Content -Path (Join-Path $OutDir 'logcat-full.txt')

"done: outputs under $OutDir"
