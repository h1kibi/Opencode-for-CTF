import { tool } from "@opencode-ai/plugin"
import { safeExec } from "./lib/exec-utils.ts"

type Check = {
  name: string
  command: string
  args: string[]
  required: boolean
  category: string
  hint: string
}

function firstLine(s: string) {
  return (s.split(/\r?\n/).find(Boolean) || "<no output>").slice(0, 220)
}

export default tool({
  description:
    "CTF pwn environment check: verify pwntools, gdb, checksec, ROPgadget, one_gadget, seccomp-tools, patchelf, pwninit, qemu and common ELF tooling.",
  args: {
    profile: tool.schema
      .string()
      .optional()
      .describe("basic | full. basic checks core tools, full checks optional advanced tools. Default basic."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args) {
    const profile = (args.profile || "basic").toLowerCase() === "full" ? "full" : "basic"
    const checks: Check[] = [
      {
        name: "python",
        command: "python",
        args: ["--version"],
        required: true,
        category: "runtime",
        hint: "Install Python 3 and ensure python is on PATH.",
      },
      {
        name: "pwntools",
        command: "python",
        args: ["-c", "import pwn; print(pwn.__version__)"],
        required: true,
        category: "python",
        hint: "python -m pip install pwntools",
      },
      {
        name: "file",
        command: "file",
        args: ["--version"],
        required: true,
        category: "elf",
        hint: "Install file utility; on Windows prefer WSL2/MSYS2.",
      },
      {
        name: "readelf",
        command: "readelf",
        args: ["--version"],
        required: true,
        category: "elf",
        hint: "Install binutils.",
      },
      {
        name: "objdump",
        command: "objdump",
        args: ["--version"],
        required: true,
        category: "elf",
        hint: "Install binutils.",
      },
      { name: "nm", command: "nm", args: ["--version"], required: true, category: "elf", hint: "Install binutils." },
      {
        name: "gdb",
        command: "gdb",
        args: ["--version"],
        required: true,
        category: "debug",
        hint: "Install gdb; for pwn prefer WSL2/Linux.",
      },
      {
        name: "checksec",
        command: "checksec",
        args: ["--version"],
        required: true,
        category: "triage",
        hint: "Install pwntools/checksec or checksec package.",
      },
      {
        name: "ROPgadget",
        command: "ROPgadget",
        args: ["--version"],
        required: true,
        category: "rop",
        hint: "python -m pip install ROPGadget",
      },
    ]
    const optional: Check[] = [
      {
        name: "angr",
        command: "python",
        args: ["-c", "import angr; print(angr.__version__)"],
        required: false,
        category: "symbolic",
        hint: "python -m pip install angr claripy z3-solver",
      },
      {
        name: "claripy",
        command: "python",
        args: ["-c", "import claripy; print(getattr(claripy, '__version__', 'present'))"],
        required: false,
        category: "symbolic",
        hint: "python -m pip install claripy z3-solver",
      },
      {
        name: "z3-solver",
        command: "python",
        args: ["-c", "import z3; print(z3.get_version_string())"],
        required: false,
        category: "symbolic",
        hint: "python -m pip install z3-solver",
      },
      {
        name: "one_gadget",
        command: "one_gadget",
        args: ["--version"],
        required: false,
        category: "rop",
        hint: "gem install one_gadget",
      },
      {
        name: "seccomp-tools",
        command: "seccomp-tools",
        args: ["--version"],
        required: false,
        category: "sandbox",
        hint: "gem install seccomp-tools",
      },
      {
        name: "patchelf",
        command: "patchelf",
        args: ["--version"],
        required: false,
        category: "libc",
        hint: "Install patchelf.",
      },
      {
        name: "pwninit",
        command: "pwninit",
        args: ["--version"],
        required: false,
        category: "libc",
        hint: "Install pwninit for libc/ld patching.",
      },
      {
        name: "qemu-x86_64",
        command: "qemu-x86_64",
        args: ["--version"],
        required: false,
        category: "emulation",
        hint: "Install qemu-user for cross-arch pwn.",
      },
      {
        name: "strace",
        command: "strace",
        args: ["--version"],
        required: false,
        category: "trace",
        hint: "Install strace.",
      },
      {
        name: "ltrace",
        command: "ltrace",
        args: ["--version"],
        required: false,
        category: "trace",
        hint: "Install ltrace.",
      },
    ]
    const selected = profile === "full" ? [...checks, ...optional] : checks
    const results = []
    for (const c of selected) {
      const r = await safeExec(c.command, c.args, undefined, 5000)
      results.push({ ...c, ok: r.ok, version: firstLine(r.output) })
    }
    const missingRequired = results.filter((x) => x.required && !x.ok)
    const missingOptional = results.filter((x) => !x.required && !x.ok)
    const summary = {
      profile,
      ready: missingRequired.length === 0,
      required_ok: results.filter((x) => x.required && x.ok).length,
      required_total: results.filter((x) => x.required).length,
      optional_missing: missingOptional.map((x) => x.name),
      required_missing: missingRequired.map((x) => x.name),
      results,
    }
    if (args.jsonOnly) return JSON.stringify(summary, null, 2)
    return [
      "pwn_env_check:",
      `profile: ${profile}`,
      `ready: ${summary.ready}`,
      `required_ok: ${summary.required_ok}/${summary.required_total}`,
      `required_missing: ${summary.required_missing.length ? summary.required_missing.join(" | ") : "none"}`,
      `optional_missing: ${summary.optional_missing.length ? summary.optional_missing.join(" | ") : "none"}`,
      "checks:",
      ...results.map(
        (r) =>
          `- ${r.ok ? "OK" : r.required ? "MISSING_REQUIRED" : "missing_optional"} ${r.name} [${r.category}]: ${r.version}${r.ok ? "" : ` | hint: ${r.hint}`}`,
      ),
      "recommendation:",
      summary.ready
        ? "- Core pwn environment is ready. Use profile=full to check optional advanced tooling."
        : "- Install missing required tools before contest pwn automation; WSL2/Linux is strongly preferred for ELF pwn.",
    ].join("\n")
  },
})
