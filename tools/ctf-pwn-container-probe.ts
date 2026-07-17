import { tool } from "@opencode-ai/plugin"
import path from "node:path"
import { safeExecWithStreams } from "./lib/exec-utils.ts"

function splitArgs(value: string | undefined) {
  return (value || "").split(/\s+/).filter(Boolean).slice(0, 40)
}

function compact(s: string, max = 12000) {
  const clean = s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
  if (clean.length <= max) return clean
  return `${clean.slice(0, Math.floor(max * 0.6))}\n...[truncated ${clean.length - max} chars]...\n${clean.slice(clean.length - Math.floor(max * 0.4))}`
}

function parseProbe(output: string) {
  const lines = output.split(/\r?\n/)
  const map = new Map<string, string>()
  for (const line of lines) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) map.set(m[1], m[2])
  }
  return map
}

function isComposeMissing(output: string) {
  return /no configuration file provided|cannot find a suitable configuration file|compose\.ya?ml.*not found/i.test(
    output,
  )
}

export default tool({
  description:
    "CTF PWN container probe: verify a chosen Docker/container substrate has pwntools, gdb, ELF tooling, and optional binary triage before the solve starts.",
  args: {
    composeService: tool.schema.string().optional().describe("docker compose service name for exec mode."),
    containerName: tool.schema.string().optional().describe("Explicit container name for docker exec mode."),
    image: tool.schema.string().optional().describe("Docker image for temporary docker run mode."),
    useComposeRun: tool.schema.boolean().optional().describe("Use compose run --rm instead of exec. Default false."),
    profile: tool.schema.string().optional().describe("Optional profile hint for reporting."),
    binary: tool.schema.string().optional().describe("Workspace-relative binary to inspect inside the container."),
    libc: tool.schema.string().optional().describe("Workspace-relative libc to inspect inside the container."),
    timeoutMs: tool.schema.number().optional().describe("Execution timeout in milliseconds. Default 20000."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const timeoutMs = Math.max(1000, Math.min(args.timeoutMs ?? 20000, 120000))
    const containerWorkdir = "/work"
    const binary = args.binary ? args.binary.replace(/\\/g, "/") : ""
    const libc = args.libc ? args.libc.replace(/\\/g, "/") : ""

    const probeScript = [
      "set +e",
      "echo PYTHON3=$(command -v python3 >/dev/null 2>&1 && echo ok || echo missing)",
      "echo PWNTOOLS=$(python3 - <<'PY'\ntry:\n import pwn\n print('ok')\nexcept Exception:\n print('missing')\nPY\n)",
      "echo GDB=$(command -v gdb >/dev/null 2>&1 && echo ok || echo missing)",
      "echo ANGR=$(python3 - <<'PY'\ntry:\n import angr\n print('ok')\nexcept Exception:\n print('missing')\nPY\n)",
      "echo CLARIPY=$(python3 - <<'PY'\ntry:\n import claripy\n print('ok')\nexcept Exception:\n print('missing')\nPY\n)",
      "echo Z3_SOLVER=$(python3 - <<'PY'\ntry:\n import z3\n print('ok')\nexcept Exception:\n print('missing')\nPY\n)",
      "echo FILE=$(command -v file >/dev/null 2>&1 && echo ok || echo missing)",
      "echo CHECKSEC=$(command -v checksec >/dev/null 2>&1 && echo ok || echo missing)",
      "echo OBJDUMP=$(command -v objdump >/dev/null 2>&1 && echo ok || echo missing)",
      "echo READELF=$(command -v readelf >/dev/null 2>&1 && echo ok || echo missing)",
      "echo NM=$(command -v nm >/dev/null 2>&1 && echo ok || echo missing)",
      "echo STRINGS=$(command -v strings >/dev/null 2>&1 && echo ok || echo missing)",
      "echo PATCHELF=$(command -v patchelf >/dev/null 2>&1 && echo ok || echo missing)",
      "echo ROPGADGET=$(command -v ROPgadget >/dev/null 2>&1 && echo ok || echo missing)",
      "echo ONE_GADGET=$(command -v one_gadget >/dev/null 2>&1 && echo ok || echo missing)",
      "echo SECCOMP_TOOLS=$(command -v seccomp-tools >/dev/null 2>&1 && echo ok || echo missing)",
      "echo LTRACE=$(command -v ltrace >/dev/null 2>&1 && echo ok || echo missing)",
      "echo STRACE=$(command -v strace >/dev/null 2>&1 && echo ok || echo missing)",
      binary
        ? `if [ -f ${JSON.stringify(path.posix.join(containerWorkdir, binary))} ]; then file ${JSON.stringify(path.posix.join(containerWorkdir, binary))}; fi`
        : "",
      binary
        ? `if command -v checksec >/dev/null 2>&1 && [ -f ${JSON.stringify(path.posix.join(containerWorkdir, binary))} ]; then checksec --file=${JSON.stringify(path.posix.join(containerWorkdir, binary))}; fi`
        : "",
      binary
        ? `if [ -f ${JSON.stringify(path.posix.join(containerWorkdir, binary))} ]; then python3 - <<'PY'
from pathlib import Path
import struct
p = Path(${JSON.stringify(path.posix.join(containerWorkdir, binary))})
b = p.read_bytes()[:64]
ok = len(b) >= 20 and b[:4] == b'\x7fELF'
machine = struct.unpack_from('<H', b, 18)[0] if ok else 0
print('I386_RUNTIME=' + ('ok' if machine == 3 else 'n/a'))
print('ELF_INTERPRETER_EXPECTED=' + ('/lib/ld-linux.so.2' if machine == 3 else 'n/a'))
PY`
        : "",
      binary
        ? `if [ -e /lib/ld-linux.so.2 ]; then echo I386_INTERPRETER=ok; else echo I386_INTERPRETER=missing; fi`
        : "",
      binary
        ? `if [ -e /lib32/libc.so.6 ] || [ -e /usr/lib32/libc.so.6 ] || [ -e /lib/i386-linux-gnu/libc.so.6 ] || [ -e /usr/lib/i386-linux-gnu/libc.so.6 ]; then echo I386_LIBC=ok; else echo I386_LIBC=missing; fi`
        : "",
      libc
        ? `if [ -f ${JSON.stringify(path.posix.join(containerWorkdir, libc))} ]; then strings -a ${JSON.stringify(path.posix.join(containerWorkdir, libc))} | grep -m 3 -E 'GNU C Library|glibc|GLIBC_' || true; fi`
        : "",
    ]
      .filter(Boolean)
      .join("; ")

    const common = ["-w", containerWorkdir]
    let argv: string[] = []
    let mode = ""
    if (args.containerName) {
      mode = "docker_exec"
      argv = ["exec", args.containerName, "bash", "-lc", probeScript]
    } else if (args.composeService && !args.useComposeRun) {
      mode = "compose_exec"
      argv = ["compose", "exec", "-T", args.composeService, "bash", "-lc", probeScript]
    } else if (args.composeService && args.useComposeRun) {
      mode = "compose_run"
      argv = [
        "compose",
        "run",
        "--rm",
        "-T",
        ...splitArgs(args.profile ? `--profile ${args.profile}` : ""),
        args.composeService,
        "bash",
        "-lc",
        probeScript,
      ]
    } else if (args.image) {
      mode = "docker_run"
      argv = [
        "run",
        "--rm",
        "-v",
        `${context.directory.replace(/\\/g, "/")}:${containerWorkdir}`,
        ...common,
        args.image,
        "bash",
        "-lc",
        probeScript,
      ]
    } else {
      throw new Error("one of containerName, composeService, or image is required")
    }

    let output = ""
    let exitCode: number | string = 0
    const r = await safeExecWithStreams("docker", argv, {
      cwd: context.directory,
      timeoutMs,
      maxBuffer: 3 * 1024 * 1024,
    })
    output = `${r.stdout}${r.stderr ? `\n${r.stderr}` : ""}`
    if (!r.ok) {
      exitCode = r.exitCode ?? "error"
    }

    if (isComposeMissing(output) && args.image && (mode === "compose_exec" || mode === "compose_run")) {
      mode = "docker_run_fallback"
      argv = [
        "run",
        "--rm",
        "-v",
        `${context.directory.replace(/\\/g, "/")}:${containerWorkdir}`,
        ...common,
        args.image,
        "bash",
        "-lc",
        probeScript,
      ]
      const r2 = await safeExecWithStreams("docker", argv, {
        cwd: context.directory,
        timeoutMs,
        maxBuffer: 3 * 1024 * 1024,
      })
      output = `${r2.stdout}${r2.stderr ? `\n${r2.stderr}` : ""}`
      exitCode = r2.ok ? 0 : (r2.exitCode ?? "error")
    }

    const parsed = parseProbe(output)
    const payload = {
      mode,
      profile: args.profile || "",
      image: args.image || "",
      compose_service: args.composeService || "",
      container_name: args.containerName || "",
      exit_code: exitCode,
      capability: {
        python3: parsed.get("PYTHON3") || "unknown",
        pwntools: parsed.get("PWNTOOLS") || "unknown",
        gdb: parsed.get("GDB") || "unknown",
        angr: parsed.get("ANGR") || "unknown",
        claripy: parsed.get("CLARIPY") || "unknown",
        z3_solver: parsed.get("Z3_SOLVER") || "unknown",
        file: parsed.get("FILE") || "unknown",
        checksec: parsed.get("CHECKSEC") || "unknown",
        objdump: parsed.get("OBJDUMP") || "unknown",
        readelf: parsed.get("READELF") || "unknown",
        nm: parsed.get("NM") || "unknown",
        strings: parsed.get("STRINGS") || "unknown",
        patchelf: parsed.get("PATCHELF") || "unknown",
        ropgadget: parsed.get("ROPGADGET") || "unknown",
        one_gadget: parsed.get("ONE_GADGET") || "unknown",
        seccomp_tools: parsed.get("SECCOMP_TOOLS") || "unknown",
        ltrace: parsed.get("LTRACE") || "unknown",
        strace: parsed.get("STRACE") || "unknown",
        i386_runtime: parsed.get("I386_RUNTIME") || "unknown",
        i386_interpreter: parsed.get("I386_INTERPRETER") || "unknown",
        i386_libc: parsed.get("I386_LIBC") || "unknown",
      },
      recommended_action:
        parsed.get("PYTHON3") !== "ok" || parsed.get("PWNTOOLS") !== "ok"
          ? "switch image or install dependencies before starting the solve"
          : parsed.get("ANGR") !== "ok" || parsed.get("CLARIPY") !== "ok" || parsed.get("Z3_SOLVER") !== "ok"
            ? "core pwn toolchain is ready, but symbolic-execution fallback is missing; prefer a fuller pwnlab image before heavy checker/constraint branches"
            : "lock this container as the active substrate and keep exploit.py/runners inside it",
      output: compact(output),
    }

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "PWN_CONTAINER_PROBE",
      `mode: ${payload.mode}`,
      `profile: ${payload.profile}`,
      `image: ${payload.image}`,
      `compose_service: ${payload.compose_service}`,
      `container_name: ${payload.container_name}`,
      `exit_code: ${payload.exit_code}`,
      `python3: ${payload.capability.python3}`,
      `pwntools: ${payload.capability.pwntools}`,
      `gdb: ${payload.capability.gdb}`,
      `angr: ${payload.capability.angr}`,
      `claripy: ${payload.capability.claripy}`,
      `z3_solver: ${payload.capability.z3_solver}`,
      `file: ${payload.capability.file}`,
      `checksec: ${payload.capability.checksec}`,
      `objdump: ${payload.capability.objdump}`,
      `readelf: ${payload.capability.readelf}`,
      `nm: ${payload.capability.nm}`,
      `strings: ${payload.capability.strings}`,
      `patchelf: ${payload.capability.patchelf}`,
      `ropgadget: ${payload.capability.ropgadget}`,
      `one_gadget: ${payload.capability.one_gadget}`,
      `seccomp_tools: ${payload.capability.seccomp_tools}`,
      `i386_runtime: ${payload.capability.i386_runtime}`,
      `i386_interpreter: ${payload.capability.i386_interpreter}`,
      `i386_libc: ${payload.capability.i386_libc}`,
      `recommended_action: ${payload.recommended_action}`,
      "output_compact:",
      payload.output,
    ].join("\n")
  },
})
