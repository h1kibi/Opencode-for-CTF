import { existsSync } from "node:fs"
import { getIdaMcpInstancesDir, inspectIdaMcpInstances } from "./lib/ida-mcp-discovery.ts"
import { runToolChecksDetailed, TOOL_CHECKS } from "./lib/tool-checks.mjs"

/**
 * REV toolchain doctor.
 * Check data lives in scripts/lib/tool-checks.mjs (rev/android groups); this
 * wrapper selects the REV-relevant subset and applies the IDA env used by the
 * IDA-based MCP backends. Run with: npm run doctor:rev
 */

const REV_TOOL_NAMES = [
  "python",
  "file",
  "strings",
  "objdump",
  "readelf",
  "nm",
  "gdb",
  "apktool",
  "adb",
  "jadx",
  "aapt",
  "aapt2",
  "apkanalyzer",
  "baksmali",
  "apkid",
  "frida",
  "frida-ps",
  "java",
  "javap",
  "rizin",
  "rz-bin",
  "ghidraRun",
  "analyzeHeadless",
  "mcp-reva",
  "ida-pro-mcp",
  "idalib-mcp",
]

const IDA_DIR_CANDIDATES = [process.env.IDADIR, "C:\\Tools\\IDA Professional 9.2", "C:\\Tools\\ida92\\portable"].filter(
  (dir): dir is string => Boolean(dir),
)
const IDA_DIR = IDA_DIR_CANDIDATES.find((dir) => existsSync(`${dir}\\ida.exe`))
const IDA_ENV: Record<string, string> = IDA_DIR ? { IDADIR: IDA_DIR, IDA_PATH: IDA_DIR } : {}

async function main() {
  const results = runToolChecksDetailed(
    TOOL_CHECKS.filter((check) => REV_TOOL_NAMES.includes(check.name)),
    {
      env: IDA_ENV,
    },
  )
  const found = results.filter((r) => r.ok).map((r) => r.name)
  const missing = results.filter((r) => !r.ok).map((r) => r.name)
  const discoveryDir = getIdaMcpInstancesDir()
  const instances = await inspectIdaMcpInstances({ directory: discoveryDir })
  const liveInstances = instances.filter((instance) => instance.live)

  console.log("# REV Doctor")
  console.log(`found: ${found.length ? found.join(", ") : "none"}`)
  console.log(`missing: ${missing.length ? missing.join(", ") : "none"}`)
  console.log(`ida_dir: ${IDA_DIR ?? "not found"}`)
  console.log(`ida_mcp_discovery: ${discoveryDir}`)
  console.log(`ida_mcp_registered: ${instances.length}`)
  console.log(`ida_mcp_live: ${liveInstances.length}`)
  for (const instance of instances) {
    const label = instance.backend ?? "unknown"
    const endpoint = instance.host && instance.port ? `${instance.host}:${instance.port}` : "invalid endpoint"
    const target = instance.binary ? ` binary=${instance.binary}` : ""
    const status = instance.live ? "live" : `stale/unreachable (${instance.reason ?? "unknown"})`
    console.log(`  - ${status}: ${label} pid=${instance.pid} ${endpoint}${target}`)
  }

  if (missing.length === 0 && liveInstances.length > 0) {
    console.log("runtime: ready (toolchain installed and at least one live IDA MCP instance detected)")
  } else if (missing.length === 0) {
    console.log("runtime: installed (no live IDA MCP instance; start IDA, open a sample, then Edit -> Plugins -> MCP)")
  } else {
    console.log("runtime: incomplete (install/fix missing tools before relying on the full REV lane)")
  }
}

await main()
