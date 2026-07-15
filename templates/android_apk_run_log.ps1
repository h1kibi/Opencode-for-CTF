param(
  [Parameter(Mandatory=$true)][string]$Apk,
  [Parameter(Mandatory=$true)][string]$Package,
  [string]$Activity = "",
  [string]$Serial = "",
  [string]$OutDir = "work/android-run",
  [switch]$ClearData,
  [switch]$UninstallFirst
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$adbArgs = @()
if ($Serial) { $adbArgs += @("-s", $Serial) }

function ADB([string[]]$Args) {
  & adb @adbArgs @Args
}

"# Android APK run/log helper" | Tee-Object -FilePath "$OutDir\run-summary.txt"
"apk=$Apk" | Tee-Object -Append -FilePath "$OutDir\run-summary.txt"
"package=$Package" | Tee-Object -Append -FilePath "$OutDir\run-summary.txt"
"activity=$Activity" | Tee-Object -Append -FilePath "$OutDir\run-summary.txt"

ADB @("devices") | Tee-Object -FilePath "$OutDir\adb-devices.txt"
if ($UninstallFirst) { ADB @("uninstall", $Package) | Tee-Object -FilePath "$OutDir\uninstall.txt" }
ADB @("install", "-r", $Apk) | Tee-Object -FilePath "$OutDir\install.txt"
if ($ClearData) { ADB @("shell", "pm", "clear", $Package) | Tee-Object -FilePath "$OutDir\pm-clear.txt" }
ADB @("logcat", "-c") | Out-Null

if ($Activity) {
  ADB @("shell", "am", "start", "-n", "$Package/$Activity") | Tee-Object -FilePath "$OutDir\start.txt"
} else {
  ADB @("shell", "monkey", "-p", $Package, "-c", "android.intent.category.LAUNCHER", "1") | Tee-Object -FilePath "$OutDir\start.txt"
}

Start-Sleep -Seconds 3
ADB @("logcat", "-d", "-v", "time") | Tee-Object -FilePath "$OutDir\logcat-full.txt" | Select-String -Pattern "SWDD|strange|shell|art|dex|classloader|DexClassLoader|JNI|libart|RuntimeException|UnsatisfiedLinkError|VerifyError|ClassNotFoundException|frida" -CaseSensitive:$false | Tee-Object -FilePath "$OutDir\logcat-highsignal.txt"
"artifacts: $OutDir\run-summary.txt, $OutDir\logcat-full.txt, $OutDir\logcat-highsignal.txt"
