import { tool } from "@opencode-ai/plugin"
import { execFile as execFileCb } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { promisify } from "node:util"
import path from "node:path"

const execFile = promisify(execFileCb)

function extractJsonBlock(text: string) {
  const firstArray = text.indexOf("[")
  const firstObject = text.indexOf("{")
  const startCandidates = [firstArray, firstObject].filter((x) => x >= 0).sort((a, b) => a - b)
  const start = startCandidates.length ? startCandidates[0] : -1
  if (start < 0) return text.trim()

  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === "{" || ch === "[") depth++
    if (ch === "}" || ch === "]") {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return text.slice(start).trim()
}

function psScript() {
  return String.raw`
param([string]$ProcessName,[string]$WindowTitle,[int]$MaxChildren=40)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName System.Windows.Forms

$all = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 }
if ($ProcessName) {
  $all = $all | Where-Object { $_.ProcessName -match $ProcessName }
}
if ($WindowTitle) {
  $all = $all | Where-Object { $_.MainWindowTitle -match $WindowTitle }
}

$out = @()
foreach ($p in $all | Select-Object -First 10) {
  try {
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
    if (-not $root) { continue }
    $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
    $child = $walker.GetFirstChild($root)
    $children = @()
    $count = 0
    while ($child -and $count -lt $MaxChildren) {
      $children += [pscustomobject]@{
        Name = $child.Current.Name
        ControlType = $child.Current.ControlType.ProgrammaticName
        AutomationId = $child.Current.AutomationId
        ClassName = $child.Current.ClassName
        IsEnabled = $child.Current.IsEnabled
        BoundingRectangle = [string]$child.Current.BoundingRectangle
      }
      $child = $walker.GetNextSibling($child)
      $count++
    }
    $out += [pscustomobject]@{
      ProcessName = $p.ProcessName
      Id = $p.Id
      MainWindowTitle = $p.MainWindowTitle
      MainWindowHandle = ('0x{0:X}' -f [int64]$p.MainWindowHandle)
      ChildPreview = $children
    }
  } catch {}
}

$out | ConvertTo-Json -Depth 6
`
}

export default tool({
  description: "CTF Windows GUI inspect: enumerate visible top-level windows for a process/title and preview child UIAutomation controls for low-risk GUI reversing.",
  args: {
    processName: tool.schema.string().optional().describe("Regex-like process name filter, e.g. BabyGame or notepad."),
    windowTitle: tool.schema.string().optional().describe("Regex-like window title filter."),
    maxChildren: tool.schema.number().optional().describe("Maximum child controls to preview per window. Default 40."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args) {
    const command = psScript()
    const maxChildren = Math.max(10, Math.min(args.maxChildren ?? 40, 200))
    try {
      const tmpDir = path.join(process.cwd(), "work", "windows-gui-inspect")
      await mkdir(tmpDir, { recursive: true })
      const scriptPath = path.join(tmpDir, "uia_inspect.ps1")
      await writeFile(scriptPath, command, "utf8")
      const { stdout, stderr } = await execFile("powershell", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-ProcessName",
        args.processName || "",
        "-WindowTitle",
        args.windowTitle || "",
        "-MaxChildren",
        String(maxChildren),
      ], {
        timeout: 30000,
        maxBuffer: 4 * 1024 * 1024,
        shell: false,
      })
      const text = `${stdout}${stderr ? `\n${stderr}` : ""}`.trim()
      const jsonText = extractJsonBlock(text)
      const payload = jsonText ? JSON.parse(jsonText) : []
      if (args.jsonOnly) return JSON.stringify(payload, null, 2)
      const rows = Array.isArray(payload) ? payload : [payload]
      if (!rows.length) {
        return [
          "CTF_WINDOWS_GUI_INSPECT:",
          "- windows: 0",
          `- hint: no visible window matched the current filter${args.processName ? ` (processName=${args.processName})` : ""}${args.windowTitle ? ` (windowTitle=${args.windowTitle})` : ""}`,
          "- next: confirm the program is running and has created a visible top-level window, then retry with processName or windowTitle.",
          "- launch_template: Start-Process -FilePath '<path-to-app.exe>'",
        ].join("\n")
      }
      return [
        "CTF_WINDOWS_GUI_INSPECT:",
        `- windows: ${rows.length}`,
        ...rows.flatMap((row: any) => [
          `- process: ${row.ProcessName} pid=${row.Id} title=${row.MainWindowTitle} hwnd=${row.MainWindowHandle}`,
          ...(Array.isArray(row.ChildPreview) ? row.ChildPreview.slice(0, maxChildren).map((child: any) => `  - ${child.ControlType} name=${child.Name || ""} automationId=${child.AutomationId || ""} class=${child.ClassName || ""} enabled=${child.IsEnabled}`) : []),
        ]),
      ].join("\n")
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message?: string }
      const detail = `${e.stdout ?? ""}${e.stderr ? `\n${e.stderr}` : ""}${e.message ? `\n${e.message}` : ""}`.trim()
      if (args.jsonOnly) return JSON.stringify({ ok: false, error: detail }, null, 2)
      return `CTF_WINDOWS_GUI_INSPECT:\n- error: ${detail}`
    }
  },
})
