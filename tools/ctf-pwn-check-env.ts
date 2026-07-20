import { tool } from "@opencode-ai/plugin"
import { runEnvChecks, summarizeEnvChecks, type EnvCheckItem } from "./lib/env-check-core.ts"

type Check = EnvCheckItem

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
        name: "glibc-ldd",
        command: "ldd",
        args: ["--version"],
        required: false,
        category: "libc",
        hint: "Install glibc runtime tools; on Windows prefer WSL2/Linux for ELF pwn.",
      },
      {
        name: "assembler",
        command: "as",
        args: ["--version"],
        required: false,
        category: "asm",
        hint: "Install binutils assembler for shellcode/ROP helper workflows.",
      },
      {
        name: "socat",
        command: "socat",
        args: ["-V"],
        required: false,
        category: "remote",
        hint: "Install socat for local socket harnesses and service mirroring.",
      },
      {
        name: "nc",
        command: "nc",
        args: ["-h"],
        required: false,
        category: "remote",
        hint: "Install netcat/ncat for manual remote connectivity checks.",
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
    const results = await runEnvChecks(selected, 5000)
    const baseSummary = summarizeEnvChecks(results)
    const summary = {
      profile,
      ready: baseSummary.ready,
      required_ok: baseSummary.required_ok,
      required_total: baseSummary.required_total,
      optional_missing: baseSummary.optional_missing,
      required_missing: baseSummary.required_missing,
      results,
      assembler_available: results.find((x) => x.name === "assembler")?.ok ?? false,
      glibc_version: results.find((x) => x.name === "glibc-ldd")?.version ?? "unchecked",
      qemu_user_available: results.some((x) => x.name.startsWith("qemu-") && x.ok),
      remote_connectivity_helpers: {
        socat: results.find((x) => x.name === "socat")?.ok ?? false,
        nc: results.find((x) => x.name === "nc")?.ok ?? false,
      },
      recommended_next_action: baseSummary.required_missing.length === 0
        ? "core pwn environment is ready; run ctf-pwn-probe or ctf-binary-probe on the challenge"
        : "install missing required tools or switch to a prepared Linux/pwnlab substrate before exploit automation",
      fallback_action: "if host setup is incomplete, use ctf-pwn-runbox / Docker / WSL and keep runner/gdb steps on that substrate",
      stop_if: "required ELF tooling or pwntools remains unavailable after substrate selection",
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
      `recommended_next_action: ${summary.recommended_next_action}`,
      `fallback_action: ${summary.fallback_action}`,
      `stop_if: ${summary.stop_if}`,
    ].join("\n")
  },
})
