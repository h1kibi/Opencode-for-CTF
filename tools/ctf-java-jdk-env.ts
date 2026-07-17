import { tool } from "@opencode-ai/plugin"
import path from "node:path"
import { safeExec } from "./lib/exec-utils.ts"

// JDK root is configurable via CTF_JDK_ROOT so the tool is not tied to any
// specific machine. Falls back to a conventional Windows location.
const root =
  process.env.CTF_JDK_ROOT ||
  (process.platform === "win32" ? "C:\\jdkenv" : path.join(process.env.HOME || "", "jdkenv"))

const jdks: Record<string, string> = {
  "7": path.join(root, "jdk-7u21"),
  "7u21": path.join(root, "jdk-7u21"),
  "8": path.join(root, "jdk-8u121"),
  "8u121": path.join(root, "jdk-8u121"),
  "8u65": path.join(root, "jdk-8u65"),
  "11": path.join(root, "jdk-11"),
  "17": path.join(root, "jdk-17"),
  "24": path.join(root, "jdk-24"),
}

function jdkPath(version?: string) {
  const key = (version || "8").toLowerCase().replace(/^jdk-?/, "")
  const p = jdks[key]
  if (!p) throw new Error(`unknown JDK version '${version}'. Known: ${Object.keys(jdks).join(", ")}`)
  return p
}

function exe(jdk: string, name: string) {
  return path.join(jdk, "bin", `${name}.exe`)
}

async function runInJdk(cmd: string, args: string[], cwd: string, envJdk: string, timeoutMs = 20000) {
  const env = { ...process.env, JAVA_HOME: envJdk, Path: `${path.join(envJdk, "bin")};${process.env.Path ?? ""}` }
  return (await safeExec(cmd, args, { cwd, timeoutMs, env })).output
}

function resolveWorkspace(contextDir: string, input?: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input || ".")
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`path must stay inside workspace: ${input}`)
  return target
}

export default tool({
  description:
    "CTF Java JDK environment: list configured JDKs (root configurable via CTF_JDK_ROOT), run selected java/javac/jar/javap with JAVA_HOME/PATH set, and emit PowerShell env snippets for agents.",
  args: {
    action: tool.schema.string().describe("list | version | javap | jar-list | run-jar | compile | snippet"),
    version: tool.schema
      .string()
      .optional()
      .describe("JDK version alias: 7u21, 8u65, 8u121, 8, 11, 17, 24. Default 8."),
    target: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative jar/class/java file or directory depending on action."),
    args: tool.schema
      .string()
      .optional()
      .describe("Extra command arguments as a single string. Keep simple; split on spaces."),
  },
  async execute(args, context) {
    const fs = await import("fs/promises")
    const action = args.action.toLowerCase()
    const version = args.version || "8"
    const jdk = jdkPath(version)
    const cwd = resolveWorkspace(context.directory, ".")
    const extra = args.args?.split(/\s+/).filter(Boolean) ?? []

    if (action === "list") {
      const rows: string[] = []
      for (const [alias, p] of Object.entries(jdks)) {
        try {
          await fs.access(exe(p, "java"))
          const out = await runInJdk(exe(p, "java"), ["-version"], cwd, p, 6000)
          rows.push(
            `[${alias}] ${p}\n${out
              .split(/\r?\n/)
              .map((x) => `  ${x}`)
              .join("\n")}`,
          )
        } catch {
          rows.push(`[${alias}] ${p}\n  missing java.exe`)
        }
      }
      return ["# JDK Environments", `root: ${root}`, ...rows].join("\n\n")
    }

    if (action === "snippet") {
      return [
        `# PowerShell snippet for JDK ${version}`,
        `$env:JAVA_HOME = "${jdk}"`,
        `$env:Path = "$env:JAVA_HOME\\bin;$env:Path"`,
        `& "$env:JAVA_HOME\\bin\\java.exe" -version`,
      ].join("\n")
    }

    if (action === "version") return runInJdk(exe(jdk, "java"), ["-version"], cwd, jdk, 6000)

    if (action === "javap") {
      const target = resolveWorkspace(context.directory, args.target)
      return runInJdk(exe(jdk, "javap"), ["-c", "-p", "-v", target, ...extra], path.dirname(target), jdk)
    }

    if (action === "jar-list") {
      const target = resolveWorkspace(context.directory, args.target)
      return runInJdk(exe(jdk, "jar"), ["tf", target], path.dirname(target), jdk)
    }

    if (action === "run-jar") {
      const target = resolveWorkspace(context.directory, args.target)
      return runInJdk(exe(jdk, "java"), ["-jar", target, ...extra], path.dirname(target), jdk, 30000)
    }

    if (action === "compile") {
      const target = resolveWorkspace(context.directory, args.target)
      return runInJdk(exe(jdk, "javac"), [target, ...extra], path.dirname(target), jdk, 30000)
    }

    throw new Error(`unknown action '${args.action}'`)
  },
})
