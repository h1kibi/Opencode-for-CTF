# Install Windows REV tools using winget + manual fallback for non-winget tools.
#
# Usage:
#   .\install-windows-rev-tools.ps1                    # Tier 1 (essentials)
#   .\install-windows-rev-tools.ps1 -Tier 2            # Tier 1 + 2 (recommended)
#   .\install-windows-rev-tools.ps1 -Tier 3            # Tier 1 + 2 + 3 (full)
#   .\install-windows-rev-tools.ps1 -Tier 1 -DryRun    # show plan without installing
#   .\install-windows-rev-tools.ps1 -ManualOnly        # only fetch manual-install (PE-bear/CFF/dex2jar)
#
# Tier 1 (essentials, ~12 minutes total install):
#   x64dbg              Windows PE dynamic debugger (most-used)
#   Detect It Easy      Packer/compiler/anti-debug identifier
#   dnSpyEx             .NET decompiler + debugger (Unity IL2CPP)
#   HxD                 Hex editor with structure viewer
#   UPX                 Pack/unpack tool
#   ProcessMonitor      Sysinternals: file/registry/thread events
#   ProcessExplorer     Sysinternals: process tree + handles
#   SystemInformer      Process Hacker 2 successor
#   Wireshark           Network capture GUI (complement to tshark in container)
#
# Tier 2 (recommended for advanced REV):
#   ILSpy               Alternative .NET decompiler
#   010Editor           Hex editor with binary templates (trial)
#   IDA-Free            (NOTE: skip, user already has IDA Pro 9.2)
#   PE-bear             (manual, GitHub release)
#   d2j-dex2jar         (manual, dex->jar for APK reading)
#
# Tier 3 (optional / specialized):
#   APIMonitor          Win32 API call tracing (manual, rohitab.com)
#   CFFExplorer         PE editor (manual, ntcore.com)
#   FiddlerClassic      HTTP debug proxy (manual, Telerik)
#   Resource Hacker     Edit PE resources (manual)

[CmdletBinding()]
param(
    [ValidateRange(1, 3)]
    [int]$Tier = 1,
    [switch]$DryRun,
    [switch]$ManualOnly,
    [string]$ManualDir = "$env:USERPROFILE\Tools\rev-windows"
)

$ErrorActionPreference = "Continue"

# ===== Tool catalog =====

$wingetTools = @(
    # Tier 1 — essentials
    @{ Tier=1; Id='x64dbg.x64dbg';                          Name='x64dbg';                Note='Most-used Windows PE dynamic debugger' }
    @{ Tier=1; Id='horsicq.DetectItEasy';                   Name='Detect It Easy';        Note='Packer/compiler/protector identifier' }
    @{ Tier=1; Id='dnSpyEx.dnSpy';                          Name='dnSpyEx';               Note='.NET decompiler + debugger (active fork)' }
    @{ Tier=1; Id='MaelHorz.HxD';                           Name='HxD Hex Editor';        Note='Free hex editor with structure viewer' }
    @{ Tier=1; Id='upx.upx';                                Name='UPX';                   Note='Pack/unpack tool (matches container)' }
    @{ Tier=1; Id='Microsoft.Sysinternals.ProcessMonitor';  Name='Process Monitor';       Note='File/registry/thread event tracing' }
    @{ Tier=1; Id='Microsoft.Sysinternals.ProcessExplorer'; Name='Process Explorer';      Note='Process tree + handles + DLLs' }
    @{ Tier=1; Id='Winsider.SystemInformer';                Name='System Informer';       Note='Process Hacker 2 successor' }
    @{ Tier=1; Id='WiresharkFoundation.Wireshark';          Name='Wireshark';             Note='Network capture GUI' }

    # Tier 2 — recommended
    @{ Tier=2; Id='icsharpcode.ILSpy';                      Name='ILSpy';                 Note='Alternative .NET decompiler (open source)' }
    @{ Tier=2; Id='SweetScape.010Editor';                   Name='010 Editor';            Note='Hex editor with binary templates (trial)' }
    @{ Tier=2; Id='Microsoft.Sysinternals.ProcessHacker';   Name='Process Hacker (legacy)'; Note='Original Process Hacker' }
    @{ Tier=2; Id='Microsoft.Sysinternals.Suite';           Name='Sysinternals Suite';    Note='Full Sysinternals toolset (procmon/handle/strings/etc)' }

    # Tier 3 — optional
    @{ Tier=3; Id='WinMerge.WinMerge';                      Name='WinMerge';              Note='File diff (binary diff support)' }
    @{ Tier=3; Id='Notepad++.Notepad++';                    Name='Notepad++';             Note='Text editor with hex plugin' }
    @{ Tier=3; Id='Cppcheck.Cppcheck';                      Name='Cppcheck';              Note='Static analysis (when source available)' }
    @{ Tier=3; Id='Telerik.FiddlerEverywhere';              Name='Fiddler Everywhere';    Note='HTTP debug proxy (requires login)' }
)

# Manual-install tools (no winget package, must download from official source)
$manualTools = @(
    @{ Tier=1; Name='PE-bear';
       Url='https://github.com/hasherezade/pe-bear/releases/latest';
       Path='PE-bear';
       Note='hasherezade PE inspector (download zip, extract to ManualDir)' }
    @{ Tier=1; Name='dex2jar';
       Url='https://github.com/pxb1988/dex2jar/releases/latest';
       Path='dex2jar';
       Note='dex->jar conversion (use with jadx)' }
    @{ Tier=2; Name='CFF Explorer';
       Url='https://www.ntcore.com/?page_id=388';
       Path='CFF-Explorer';
       Note='ntcore CFF Explorer (PE editor)' }
    @{ Tier=2; Name='Resource Hacker';
       Url='http://www.angusj.com/resourcehacker/';
       Path='ResourceHacker';
       Note='Edit PE resources (icons/dialogs/strings)' }
    @{ Tier=3; Name='API Monitor';
       Url='http://www.rohitab.com/apimonitor';
       Path='APIMonitor';
       Note='rohitab.com API Monitor (Win32 API tracing)' }
    @{ Tier=3; Name='PEiD';
       Url='https://github.com/wolfram77web/app-peid/releases/latest';
       Path='PEiD';
       Note='Classic packer detector' }
    @{ Tier=3; Name='PEview';
       Url='https://wjradburn.com/software/';
       Path='PEview';
       Note='Simple PE viewer' }
)

# ===== Pre-flight =====

function Test-WingetAvailable {
    $w = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $w) {
        Write-Error "winget not found. Install App Installer from Microsoft Store first."
        return $false
    }
    return $true
}

function Test-Admin {
    $current = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($current)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# ===== Filter by Tier =====

$selectedWinget = $wingetTools | Where-Object { $_.Tier -le $Tier }
$selectedManual = $manualTools | Where-Object { $_.Tier -le $Tier }

# ===== Plan output =====

Write-Host ""
Write-Host "==== Windows REV Tools Install Plan (Tier $Tier) ===="
Write-Host ""
Write-Host "winget packages ($($selectedWinget.Count)):"
$selectedWinget | ForEach-Object { Write-Host ("  [T{0}] {1,-30} {2}" -f $_.Tier, $_.Name, $_.Note) }
Write-Host ""
Write-Host "manual downloads ($($selectedManual.Count)):"
$selectedManual | ForEach-Object { Write-Host ("  [T{0}] {1,-30} {2}" -f $_.Tier, $_.Name, $_.Note) }
Write-Host ""
Write-Host "manual download dir: $ManualDir"
Write-Host ""

if ($DryRun) {
    Write-Host "DRY RUN: no install actions performed."
    return
}

if ($ManualOnly) {
    Write-Host "==== Manual download-info only mode ===="
    $manualSummaryPath = Join-Path $ManualDir "manual-install-checklist.md"
    New-Item -ItemType Directory -Path $ManualDir -Force | Out-Null
    $md = @("# Manual Windows REV Tool Install Checklist","")
    foreach ($t in $selectedManual) {
        $md += "## $($t.Name)"
        $md += "- URL: $($t.Url)"
        $md += "- Suggested path: $ManualDir\$($t.Path)"
        $md += "- Note: $($t.Note)"
        $md += ""
    }
    $md -join "`r`n" | Out-File -FilePath $manualSummaryPath -Encoding UTF8
    Write-Host "checklist written to: $manualSummaryPath"
    Write-Host "Open each URL, download, extract to: $ManualDir\<Path>"
    return
}

# ===== Run install =====

if (-not (Test-WingetAvailable)) { exit 1 }

if (-not (Test-Admin)) {
    Write-Warning "Not running as Administrator. Some installers may fail or require UAC prompts."
}

$results = @()

foreach ($t in $selectedWinget) {
    Write-Host ""
    Write-Host "==> [T$($t.Tier)] $($t.Name)  ($($t.Id))"
    & winget install --id $t.Id --silent --accept-package-agreements --accept-source-agreements --disable-interactivity 2>&1 | Out-String -Stream | Select-Object -Last 5
    $rc = $LASTEXITCODE
    $status = switch ($rc) {
        0 { 'OK' }
        -1978335189 { 'ALREADY_INSTALLED' }   # APPINSTALLER_CLI_ERROR_PACKAGE_ALREADY_INSTALLED
        -1978335212 { 'NOT_FOUND' }           # APPINSTALLER_CLI_ERROR_NO_APPLICATIONS_FOUND
        default { "FAILED($rc)" }
    }
    $results += [PSCustomObject]@{ Tier=$t.Tier; Name=$t.Name; Id=$t.Id; Status=$status }
    Write-Host "    -> $status"
}

# ===== Manual fetch summary =====

New-Item -ItemType Directory -Path $ManualDir -Force | Out-Null
$manualSummaryPath = Join-Path $ManualDir "manual-install-checklist.md"
$md = @("# Manual Windows REV Tool Install Checklist","",
        "Following tools have no winget package; download manually.","")
foreach ($t in $selectedManual) {
    $tgt = Join-Path $ManualDir $t.Path
    $md += "## $($t.Name)"
    $md += "- URL: $($t.Url)"
    $md += "- Suggested path: $tgt"
    $md += "- Note: $($t.Note)"
    $md += ""
}
$md -join "`r`n" | Out-File -FilePath $manualSummaryPath -Encoding UTF8

# ===== Summary =====

Write-Host ""
Write-Host "==== Summary ===="
$results | Format-Table -AutoSize
Write-Host ""
Write-Host "Manual install checklist: $manualSummaryPath"
Write-Host ""
Write-Host "Recommended next steps:"
Write-Host "  1. Restart shell to refresh PATH (winget installs may not be in PATH yet)"
Write-Host "  2. Open the manual checklist and download Tier $Tier manual tools"
Write-Host "  3. Validate: x64dbg --version; dnSpy.exe; HxD.exe (no console output)"
