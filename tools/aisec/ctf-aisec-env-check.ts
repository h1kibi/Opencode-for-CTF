import { tool } from "@opencode-ai/plugin"
import { safeExec } from "../lib/exec-utils.ts"

type Probe = {
  name: string
  kind: "command" | "python-package" | "runtime"
  ok: boolean
  required: boolean
  version?: string
  detail: string
  hint?: string
}

type PythonLauncher = { command: string; prefix: string[]; version: string }

const DEFAULT_PACKAGES = [
  "torch",
  "transformers",
  "numpy",
  "scipy",
  "Pillow",
  "safetensors",
  "scikit-learn",
  "onnx",
  "onnxruntime",
  "tensorflow",
  "tokenizers",
] as const

const IMPORT_NAMES: Record<string, string> = {
  torch: "torch",
  transformers: "transformers",
  numpy: "numpy",
  scipy: "scipy",
  Pillow: "PIL",
  safetensors: "safetensors",
  "scikit-learn": "sklearn",
  onnx: "onnx",
  onnxruntime: "onnxruntime",
  tensorflow: "tensorflow",
  tokenizers: "tokenizers",
}

const PACKAGE_HINTS: Record<string, string> = {
  torch: "Use a CPU-compatible PyTorch build unless the challenge explicitly needs GPU.",
  transformers: "Install only after approval; a local wrapper may work with its bundled tokenizer/model code.",
  numpy: "Use the selected Python launcher consistently for all probes.",
  scipy: "A NumPy-only fallback is sufficient for many lightweight probes.",
  Pillow: "Use image header inspection or a Pillow-free parser as a fallback.",
  safetensors: "Do not replace this with pickle loading; inspect the header first.",
  "scikit-learn": "A small NumPy/Python baseline can replace sklearn for simple metrics.",
  onnx: "The ONNX file can still be fingerprinted without importing onnx.",
  onnxruntime: "Use static ONNX inspection or a challenge-provided wrapper if unavailable.",
  tensorflow: "Prefer a project-provided venv; do not install a second framework blindly.",
  tokenizers: "Tokenizer JSON/config inspection remains available without the Rust package.",
}

async function run(command: string, args: string[], timeoutMs = 4000) {
  return safeExec(command, args, {
    timeoutMs,
    maxBuffer: 128 * 1024,
    shell: process.platform === "win32",
  })
}

async function choosePython(): Promise<PythonLauncher | null> {
  const candidates: Array<[string, string[]]> =
    process.platform === "win32"
      ? [
          ["python", []],
          ["py", ["-3"]],
          ["python3", []],
        ]
      : [
          ["python3", []],
          ["python", []],
        ]
  for (const [command, prefix] of candidates) {
    const result = await run(command, [...prefix, "--version"])
    if (result.ok) return { command, prefix, version: result.output.trim() }
  }
  return null
}

function packageProbeCode(packages: string[]) {
  return [
    "import importlib, importlib.metadata, json",
    `packages = ${JSON.stringify(packages)}`,
    `imports = ${JSON.stringify(Object.fromEntries(packages.map((name) => [name, IMPORT_NAMES[name] ?? name])))}`,
    "out = {}",
    "for name in packages:",
    "    module = imports[name]",
    "    try:",
    "        importlib.import_module(module)",
    "        try: version = importlib.metadata.version(name)",
    "        except Exception: version = 'present'",
    "        out[name] = {'ok': True, 'version': version}",
    "    except Exception as exc:",
    "        out[name] = {'ok': False, 'version': None, 'detail': type(exc).__name__ + ': ' + str(exc)[:180]}",
    "print(json.dumps(out, sort_keys=True))",
  ].join("\n")
}

export default tool({
  description:
    "Read-only AI-security environment matrix: checks Python/runtime commands and optional ML packages without installing or loading model artifacts.",
  args: {
    packages: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Optional package subset from the known AI/ML package list."),
    jsonOnly: tool.schema.boolean().optional().describe("Return machine-readable JSON only."),
  },
  async execute(args) {
    const requested = args.packages?.length ? args.packages : [...DEFAULT_PACKAGES]
    const packages = [...new Set(requested)].filter((name) => name in IMPORT_NAMES)
    const rejected = [...new Set(requested)].filter((name) => !(name in IMPORT_NAMES))
    const results: Probe[] = []

    const node = await run("node", ["--version"])
    results.push({
      name: "node",
      kind: "runtime",
      ok: node.ok,
      required: true,
      version: node.ok ? node.output.trim() : undefined,
      detail: node.ok ? node.output.trim() : "Node.js launcher unavailable",
      hint: node.ok ? undefined : "Install Node.js or use the OpenCode-provided runtime.",
    })

    const docker = await run("docker", ["--version"])
    results.push({
      name: "docker",
      kind: "command",
      ok: docker.ok,
      required: false,
      version: docker.ok ? docker.output.trim() : undefined,
      detail: docker.ok ? docker.output.trim() : "Docker unavailable (optional; needed only for isolated runtimes).",
      hint: docker.ok ? undefined : "Request Docker/heavy runtime only when the challenge requires it.",
    })

    const python = await choosePython()
    results.push({
      name: "python",
      kind: "runtime",
      ok: Boolean(python),
      required: true,
      version: python?.version,
      detail: python ? `${python.command} ${python.version}` : "No working Python launcher (python, py -3, python3).",
      hint: python ? undefined : "Create/activate the challenge venv or ask the controller to fix the Python runtime.",
    })

    const packageResults: Record<string, { ok: boolean; version: string | null; detail?: string }> = {}
    if (python && packages.length) {
      const checked = await run(python.command, [...python.prefix, "-c", packageProbeCode(packages)], 10000)
      if (checked.ok) {
        try {
          Object.assign(packageResults, JSON.parse(checked.output.trim()))
        } catch {
          for (const name of packages) packageResults[name] = { ok: false, version: null, detail: "invalid probe output" }
        }
      } else {
        for (const name of packages) packageResults[name] = { ok: false, version: null, detail: checked.output.trim().slice(0, 180) }
      }
    }

    for (const name of packages) {
      const result = packageResults[name] ?? { ok: false, version: null, detail: "not probed" }
      results.push({
        name,
        kind: "python-package",
        ok: result.ok,
        required: false,
        version: result.version ?? undefined,
        detail: result.ok ? `import ${IMPORT_NAMES[name]} available (${result.version ?? "present"})` : result.detail ?? "package unavailable",
        hint: result.ok ? undefined : PACKAGE_HINTS[name],
      })
    }

    const missingOptional = results.filter((result) => !result.ok && !result.required).map((result) => result.name)
    const output = {
      schema_version: 1,
      category: "aisec",
      platform: process.platform,
      arch: process.arch,
      ready: results.filter((result) => result.required).every((result) => result.ok),
      python: python ? { command: python.command, prefix: python.prefix, version: python.version } : null,
      requested_packages: packages,
      rejected_packages: rejected,
      missing_optional: missingOptional,
      results,
      safety: {
        read_only: true,
        model_deserialization: "not performed",
        installs_performed: false,
      },
    }

    if (args.jsonOnly) return JSON.stringify(output, null, 2)
    const lines = [
      "=== AI Security Environment Check ===",
      `ready: ${output.ready ? "YES" : "NO"}`,
      `platform: ${process.platform}/${process.arch}`,
      "",
      ...results.map((result) => `  ${result.ok ? "OK" : result.required ? "MISS" : "WARN"} [${result.kind}] ${result.name}: ${result.detail}`),
      "",
      "Safety: read-only; no installs and no model deserialization.",
    ]
    if (rejected.length) lines.splice(4, 0, `Ignored unknown packages: ${rejected.join(", ")}`)
    return lines.join("\n")
  },
})
