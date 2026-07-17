import { existsSync } from "fs"
import { spawnSync } from "child_process"
import path from "path"

const home = process.env.USERPROFILE || process.env.HOME || ""
const candidates = [
  process.env.GDRE_TOOLS_PATH,
  path.join(home, "tools", "godot", "gdsdecomp", "v2.5.0", "gdre_tools.exe"),
  path.join(home, "tools", "godot", "gdsdecomp", "gdre_tools.exe"),
  "C:\\Tools\\godot\\gdsdecomp\\gdre_tools.exe",
].filter((value): value is string => Boolean(value))

const gdre = candidates.find((p) => existsSync(p)) || ""

function run(args: string[]) {
  if (!gdre) return { ok: false, output: "gdre_tools.exe not found" }
  const res = spawnSync(gdre, args, {
    shell: process.platform === "win32",
    encoding: "utf8",
    timeout: 15000,
    maxBuffer: 1024 * 1024,
  })
  return {
    ok: res.status === 0,
    output: `${res.stdout || ""}${res.stderr || ""}`.trim(),
  }
}

const version = run(["--headless", "--version"])
const help = run(["--headless", "--help"])
const bytecode = run(["--headless", "--list-bytecode-versions"])

console.log("# Godot REV Doctor")
console.log(`gdre_tools_path: ${gdre || "missing"}`)
console.log(`version_ok: ${version.ok}`)
console.log(`help_ok: ${help.ok}`)
console.log(`bytecode_versions_ok: ${bytecode.ok}`)
console.log("\n## details")
console.log(`- version: ${version.output.split(/\r?\n/)[0] || "none"}`)
console.log(`- help_first_line: ${help.output.split(/\r?\n/)[0] || "none"}`)
console.log(`- bytecode_first_lines: ${bytecode.output.split(/\r?\n/).slice(0, 8).join(" | ") || "none"}`)
console.log("\n## recommended_path")
if (!gdre) {
  console.log("Install or unpack gdsdecomp (GDRE Tools) before expecting fast Godot .gdc/.pck recovery.")
} else if (!version.ok || !help.ok) {
  console.log(
    "GDRE exists but is not healthy enough for wrapper use; inspect the local release directory and executable dependencies.",
  )
} else {
  console.log(
    "Godot RE fast-path is available. Use ctf-godot-decompile for extract/recover/decompile wrappers and ctf-godot-pack-inspect to shrink scope first.",
  )
}
