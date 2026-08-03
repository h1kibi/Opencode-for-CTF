import { tool } from "@opencode-ai/plugin"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { safeExecWithStreams } from "../lib/exec-utils.ts"
import { rebuildPeFromMemory, parsePe } from "../lib/pe-utils.ts"
import {
  directoryFromContext,
  resolveFromDirectoryInsideWorkspace,
  resolveInsideWorkspace,
  workspaceRootFromContext,
} from "../lib/workspace-path.ts"

function normalizeRel(input: string) {
  return input.replace(/\\/g, "/")
}

function compact(text: string, max = 12000) {
  if (text.length <= max) return text
  const head = text.slice(0, Math.floor(max * 0.6))
  const tail = text.slice(text.length - Math.floor(max * 0.4))
  return `${head}\n...[truncated ${text.length - max} chars]...\n${tail}`
}

function extractJsonBlock(text: string) {
  const first = text.indexOf("{")
  if (first < 0) return ""
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = first; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === "{") depth++
    if (ch === "}") {
      depth--
      if (depth === 0) return text.slice(first, i + 1)
    }
  }
  return ""
}

export function psRuntimeDumpScript() {
  return String.raw`
param(
  [string]$TargetPid = "",
  [string]$ProcessName = "",
  [string]$LaunchTarget = "",
  [string]$LaunchArgs = "",
  [string]$OutDir = "",
  [string]$Mode = "pe",
  [string]$StartAddress = "",
  [string]$Size = "",
  [int]$MaxRegionBytes = 268435456,
  [long]$MaxTotalBytes = 1073741824,
  [bool]$MainOnly = $true
)
$ErrorActionPreference = "Stop"
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class CtfMem {
  [StructLayout(LayoutKind.Sequential)]
  public struct MEMORY_BASIC_INFORMATION {
    public IntPtr BaseAddress;
    public IntPtr AllocationBase;
    public uint AllocationProtect;
    public IntPtr RegionSize;
    public uint State;
    public uint Protect;
    public uint Type;
  }
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, int dwProcessId);
  [DllImport("kernel32.dll")]
  public static extern bool VirtualQueryEx(IntPtr hProcess, IntPtr lpAddress, out MEMORY_BASIC_INFORMATION lpBuffer, int dwLength);
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool ReadProcessMemory(IntPtr hProcess, IntPtr lpBaseAddress, byte[] lpBuffer, int dwSize, out int lpNumberOfBytesRead);
  [DllImport("kernel32.dll")]
  public static extern bool CloseHandle(IntPtr hObject);
}
"@

function Read-Memory([IntPtr]$hProcess, [Int64]$address, [int]$size) {
  $buf = New-Object byte[] $size
  $read = 0
  $ok = [CtfMem]::ReadProcessMemory($hProcess, [IntPtr]$address, $buf, $size, [ref]$read)
  if (-not $ok) { return $null }
  if ($read -lt $size) { [Array]::Resize([ref]$buf, $read) }
  return ,$buf
}

function Test-Pe([IntPtr]$hProcess, [Int64]$baseAddress) {
  $head = Read-Memory $hProcess $baseAddress 4096
  if ($null -eq $head -or $head.Length -lt 64) { return $null }
  if ($head[0] -ne 0x4D -or $head[1] -ne 0x5A) { return $null }
  $lfanew = [BitConverter]::ToInt32($head, 0x3C)
  if ($lfanew -lt 0 -or $lfanew + 24 -gt $head.Length) { return $null }
  if ($head[$lfanew] -ne 0x50 -or $head[$lfanew + 1] -ne 0x45 -or $head[$lfanew + 2] -ne 0 -or $head[$lfanew + 3] -ne 0) { return $null }
  $opt = $lfanew + 24
  $magic = [BitConverter]::ToUInt16($head, $opt)
  $sizeOfImage = [BitConverter]::ToInt32($head, $opt + 56)
  return @{
    BaseAddress = $baseAddress
    Lfanew = $lfanew
    Magic = $magic
    SizeOfImage = $sizeOfImage
  }
}

if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }

$proc = $null
if ($TargetPid -match '^\d+$') {
  $proc = Get-Process -Id ([int]$TargetPid) -ErrorAction Stop
} elseif ($LaunchTarget -and (Test-Path -LiteralPath $LaunchTarget)) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $LaunchTarget
  $psi.Arguments = $LaunchArgs
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $launched = [System.Diagnostics.Process]::Start($psi)
  Start-Sleep -Milliseconds 1500
  $proc = $launched
} elseif ($ProcessName) {
  $proc = Get-Process -Name $ProcessName -ErrorAction Stop | Select-Object -First 1
}
if ($null -eq $proc) { throw "target process not found (pid/processName/launchTarget)" }

$hProcess = [CtfMem]::OpenProcess(0x0410, $false, $proc.Id)
if ($hProcess -eq [IntPtr]::Zero) {
  $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  throw "OpenProcess failed (error=$err); the target may need elevated rights"
}

try {
  $mode = $Mode.ToLowerInvariant()
  $files = New-Object System.Collections.ArrayList
  $modules = New-Object System.Collections.ArrayList
  $errors = New-Object System.Collections.ArrayList
  $regionCount = 0
  $totalBytes = [Int64]0
  $moduleIndex = 0
  $mainBase = [Int64]0
  try {
    if ($null -ne $proc.MainModule) { $mainBase = $proc.MainModule.BaseAddress.ToInt64() }
  } catch {}

  if ($mode -eq "range") {
    $address = [Convert]::ToInt64($StartAddress, 16)
    $sizeBytes = [Math]::Min([Convert]::ToInt64($Size, 16), [Int64]$MaxRegionBytes)
    if ($sizeBytes -gt 0) {
      $chunkSize = [Math]::Min([int]1048576, [int]$sizeBytes)
      $file = Join-Path $OutDir "range_$('{0:x}' -f $address).bin"
      $fs = [System.IO.File]::Open($file, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
      try {
        $remaining = $sizeBytes
        $offset = $address
        while ($remaining -gt 0) {
          $take = [int][Math]::Min($remaining, $chunkSize)
          $buf = Read-Memory $hProcess $offset $take
          if ($null -eq $buf -or $buf.Length -eq 0) { break }
          $fs.Write($buf, 0, $buf.Length)
          $offset += $buf.Length
          $remaining -= $buf.Length
        }
      } finally {
        $fs.Dispose()
      }
      [void]$files.Add(@{ file = [System.IO.Path]::GetFileName($file); kind = "range"; base = $address; size = $sizeBytes })
    }
  } else {
    $cursor = [Int64]0
    while ($cursor -lt [Int64]::MaxValue -and $totalBytes -lt $MaxTotalBytes) {
      $mbi = New-Object CtfMem+MEMORY_BASIC_INFORMATION
      $returned = [CtfMem]::VirtualQueryEx($hProcess, [IntPtr]$cursor, [ref]$mbi, [Runtime.InteropServices.Marshal]::SizeOf([type][CtfMem+MEMORY_BASIC_INFORMATION]))
      if ($returned -eq 0) { break }
      $regionSize = [Int64]$mbi.RegionSize
      if ($regionSize -le 0) { break }
      $isCommit = (($mbi.State -band 0x1000) -ne 0)
      $isReadable = ($mbi.Protect -ne 0 -and ($mbi.Protect -band 0x100) -eq 0)
      $regionCount++
      if ($isCommit -and $isReadable) {
        if ($mode -eq "pe") {
          $mod = Test-Pe $hProcess $mbi.BaseAddress.ToInt64()
          if ($null -ne $mod -and (-not $MainOnly -or $mainBase -eq 0 -or $mod.BaseAddress -eq $mainBase)) {
            $imageSize = [Math]::Min([Math]::Max($mod.SizeOfImage, 0), [Int64]$MaxRegionBytes)
            $imageSize = [Math]::Min($imageSize, $regionSize)
            $buf = Read-Memory $hProcess $mbi.BaseAddress.ToInt64() ([int]$imageSize)
            if ($null -ne $buf -and $buf.Length -gt 0) {
              $name = "module_$($moduleIndex)_$('{0:x}' -f $mbi.BaseAddress.ToInt64())"
              $file = Join-Path $OutDir "$name.bin"
              [System.IO.File]::WriteAllBytes($file, $buf)
              [void]$files.Add(@{ file = [System.IO.Path]::GetFileName($file); kind = "module"; base = $mbi.BaseAddress.ToInt64(); size = $buf.Length; name = $name })
              [void]$modules.Add(@{ name = $name; base = $mbi.BaseAddress.ToInt64(); size = $buf.Length; magic = $mod.Magic; size_of_image = $mod.SizeOfImage })
              $moduleIndex++
              $totalBytes += $buf.Length
            }
          }
        } elseif ($mode -eq "all") {
          $take = [int][Math]::Min($regionSize, [Int64]$MaxRegionBytes)
          $buf = Read-Memory $hProcess $mbi.BaseAddress.ToInt64() $take
          if ($null -ne $buf -and $buf.Length -gt 0) {
            $file = Join-Path $OutDir "region_$($regionCount)_$('{0:x}' -f $mbi.BaseAddress.ToInt64()).bin"
            [System.IO.File]::WriteAllBytes($file, $buf)
            [void]$files.Add(@{ file = [System.IO.Path]::GetFileName($file); kind = "region"; base = $mbi.BaseAddress.ToInt64(); size = $buf.Length })
            $totalBytes += $buf.Length
          }
        }
      }
      $next = $mbi.BaseAddress.ToInt64() + $regionSize
      if ($next -le $cursor) { break }
      $cursor = $next
    }
  }

  $payload = [pscustomobject]@{
    ok = $true
    pid = $proc.Id
    process_name = $proc.ProcessName
    mode = $mode
    regions = $regionCount
    total_bytes = $totalBytes
    files = @($files)
    modules = @($modules)
    errors = @($errors)
  }
  $payload | ConvertTo-Json -Depth 6
} finally {
  [void][CtfMem]::CloseHandle($hProcess)
}
`
}

export default tool({
  description:
    "CTF Windows runtime dump + PE rebuild: locate a running or freshly launched process, enumerate committed memory, dump PE image regions, and reconstruct analyzable PE files from memory (shell detection / memory-dump / rebuild in one step).",
  args: {
    processName: tool.schema
      .string()
      .optional()
      .describe(
        "Process name filter, e.g. challenge or challenge.exe. Exactly one of pid/processName/launchTarget is required.",
      ),
    pid: tool.schema.number().optional().describe("Target process id."),
    launchTarget: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative or absolute PE path to launch and dump."),
    launchArgs: tool.schema.string().optional().describe("Arguments passed to launchTarget."),
    mode: tool.schema
      .string()
      .optional()
      .describe("pe | all | range. Default pe: find MZ/PE modules and dump only those image regions."),
    startAddress: tool.schema.string().optional().describe("Hex virtual address for range mode, e.g. 0x140000000."),
    size: tool.schema.string().optional().describe("Hex byte size for range mode, e.g. 0x400000."),
    outDir: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative output directory. Default work/rev-runtime-dump."),
    maxRegionBytes: tool.schema
      .number()
      .optional()
      .describe("Maximum bytes read for one module/region. Default 268435456."),
    maxTotalBytes: tool.schema.number().optional().describe("Maximum total dump bytes. Default 1073741824."),
    mainOnly: tool.schema
      .boolean()
      .optional()
      .describe("Dump only the main executable module in pe mode. Default true; set false to include all PE modules."),
    timeoutMs: tool.schema.number().optional().describe("PowerShell dump timeout. Default 60000, hard cap 600000."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    if (process.platform !== "win32") {
      throw new Error(
        "ctf-runtime-dump is Windows-only; on Linux/WSL use ctf-rev-live-memory-dump to generate a /proc/<pid>/mem helper",
      )
    }

    const workspace = workspaceRootFromContext(context)
    const directory = directoryFromContext(context)
    const outDir = resolveInsideWorkspace(workspace, args.outDir || "work/rev-runtime-dump")
    await mkdir(outDir, { recursive: true })
    const timeoutMs = Math.max(5000, Math.min(args.timeoutMs ?? 60000, 600000))
    const mode = (args.mode || "pe").toLowerCase()
    if (!["pe", "all", "range"].includes(mode)) throw new Error(`unsupported mode: ${args.mode}`)

    let launchTarget = ""
    if (args.launchTarget) {
      launchTarget = resolveFromDirectoryInsideWorkspace(directory, workspace, args.launchTarget)
    }

    const scriptPath = path.join(outDir, "runtime_dump.ps1")
    await writeFile(scriptPath, psRuntimeDumpScript(), "utf8")
    const { stdout, stderr, ok } = await safeExecWithStreams(
      "powershell",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-TargetPid",
        String(args.pid ?? ""),
        "-ProcessName",
        args.processName || "",
        "-LaunchTarget",
        launchTarget,
        "-LaunchArgs",
        args.launchArgs || "",
        "-OutDir",
        outDir,
        "-Mode",
        mode,
        "-StartAddress",
        args.startAddress || "0",
        "-Size",
        args.size || "0",
        "-MaxRegionBytes",
        String(Math.max(1048576, Math.min(args.maxRegionBytes ?? 268435456, 1073741824))),
        "-MaxTotalBytes",
        String(Math.max(1048576, Math.min(args.maxTotalBytes ?? 1073741824, 2147483648))),
        "-MainOnly",
        args.mainOnly === false ? "$false" : "$true",
      ],
      {
        cwd: outDir,
        timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
      },
    )

    const raw = `${stdout}${stderr ? `\n[stderr]\n${stderr}` : ""}`.trim()
    const jsonText = extractJsonBlock(raw)
    if (!jsonText) {
      const detail = compact(raw, 6000)
      if (args.jsonOnly) return JSON.stringify({ ok: false, error: detail }, null, 2)
      return `CTF_RUNTIME_DUMP:\n- error: ${detail}`
    }
    const summary = JSON.parse(jsonText) as {
      ok?: boolean
      pid?: number
      process_name?: string
      mode?: string
      regions?: number
      total_bytes?: number
      modules?: Array<{ name: string; base: number; size: number; magic: number; size_of_image: number }>
      files?: Array<{ file: string; kind: string; base: number; size: number }>
      errors?: string[]
    }
    if (!ok || summary.ok === false) {
      const detail = compact(raw, 6000)
      if (args.jsonOnly) return JSON.stringify({ ok: false, error: detail, summary }, null, 2)
      return `CTF_RUNTIME_DUMP:\n- error: ${detail}`
    }

    const rebuilt: Array<{
      source: string
      output: string
      base: string
      machine: number
      pe32_plus: boolean
      sections: number
      error?: string
    }> = []
    const failures: string[] = []
    for (const module of summary.modules ?? []) {
      const sourceFile = path.join(outDir, `${module.name}.bin`)
      const sourceRel = normalizeRel(path.relative(directory, sourceFile))
      try {
        const image = await readFile(sourceFile)
        const pe = parsePe(image)
        if (!pe) throw new Error("memory image did not contain a valid PE header at region base")
        const rebuiltBuffer = rebuildPeFromMemory(image)
        const outputName = `rebuild_${module.name}.exe`
        const outputFile = path.join(outDir, outputName)
        await writeFile(outputFile, rebuiltBuffer)
        rebuilt.push({
          source: sourceRel,
          output: normalizeRel(path.relative(directory, outputFile)),
          base: `0x${module.base.toString(16)}`,
          machine: pe.machine,
          pe32_plus: pe.pe32Plus,
          sections: pe.numberOfSections,
        })
      } catch (err) {
        failures.push(`${module.name}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    const manifest = {
      schema_version: "ctf_runtime_dump.v1",
      pid: summary.pid,
      process_name: summary.process_name,
      mode: summary.mode ?? mode,
      regions: summary.regions,
      total_bytes: summary.total_bytes,
      modules: summary.modules ?? [],
      rebuilt,
      rebuild_failures: failures,
      script: normalizeRel(path.relative(directory, scriptPath)),
      next_actions: [
        "Run ctf-rev-pe-recovery on the rebuilt PE to seed functions from .pdata and batch linear disassembly.",
        "Run ctf-memstr on dumped module .bin files to find ASCII/UTF-16 checker strings before decompilation.",
        "If IDA is licensed, open the rebuilt PE; otherwise use objdump/Ghidra/ReVa on the rebuilt file.",
      ],
    }
    await writeFile(path.join(outDir, "runtime-dump.json"), JSON.stringify(manifest, null, 2), "utf8")

    if (args.jsonOnly) return JSON.stringify(manifest, null, 2)
    return compact(
      [
        "CTF_RUNTIME_DUMP:",
        `- pid: ${summary.pid ?? "unknown"}`,
        `- process_name: ${summary.process_name ?? "unknown"}`,
        `- mode: ${summary.mode ?? mode}`,
        `- regions: ${summary.regions ?? 0}`,
        `- total_bytes: ${summary.total_bytes ?? 0}`,
        `- modules: ${(summary.modules ?? []).length}`,
        `- rebuilt: ${rebuilt.length}`,
        `- rebuild_failures: ${failures.length}`,
        "modules:",
        ...(summary.modules ?? []).map(
          (m) =>
            `- ${m.name} base=0x${m.base.toString(16)} size=${m.size} size_of_image=0x${m.size_of_image.toString(16)}`,
        ),
        "rebuilt:",
        ...(rebuilt.length
          ? rebuilt.map((r) => `- ${r.output} <- ${r.source} machine=0x${r.machine.toString(16)}`)
          : ["- none"]),
        "rebuild_failures:",
        ...(failures.length ? failures.map((f) => `- ${f}`) : ["- none"]),
        "next_actions:",
        ...manifest.next_actions.map((a) => `- ${a}`),
        "stderr:",
        compact(stderr, 2000) || "none",
      ].join("\n"),
    )
  },
})
