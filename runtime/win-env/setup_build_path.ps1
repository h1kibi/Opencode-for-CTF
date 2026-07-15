$ErrorActionPreference = 'Stop'

$cmakeDir = 'C:\Program Files\JetBrains\CLion 2025.3.3\bin\cmake\win\x64\bin'
$ninjaDir = 'C:\Program Files\JetBrains\CLion 2025.3.3\bin\ninja\win\x64'
$rcMtDir = 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64'
$clDir = 'C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64'

$required = @($cmakeDir, $ninjaDir, $rcMtDir, $clDir)
$missing = $required | Where-Object { -not (Test-Path -LiteralPath $_) }
if ($missing) {
  throw "Missing required directories: $($missing -join ', ')"
}

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$userParts = @()
if ($userPath) {
  $userParts = $userPath.Split(';') | Where-Object { $_ -and $_.Trim() }
}

foreach ($dir in $required) {
  if ($userParts -notcontains $dir) {
    $userParts += $dir
  }
}

$newUserPath = ($userParts | Select-Object -Unique) -join ';'
[Environment]::SetEnvironmentVariable('Path', $newUserPath, 'User')

$env:Path = $newUserPath + ';' + [Environment]::GetEnvironmentVariable('Path', 'Machine')

Write-Output 'Updated user PATH with required build tool directories.'
Write-Output ''
Write-Output 'Verification:'
where.exe cmake
where.exe ninja
where.exe rc
where.exe mt
where.exe cl
