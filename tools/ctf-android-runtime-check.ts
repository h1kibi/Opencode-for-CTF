import { tool } from "@opencode-ai/plugin"
import { safeExec } from "./lib/exec-utils.ts"

function firstDevice(adbDevices: string) {
  return (
    adbDevices
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => /\bdevice$/.test(l) && !/^List of devices/i.test(l))
      ?.split(/\s+/)[0] || ""
  )
}

export default tool({
  description:
    "CTF Android runtime check: safe adb/frida environment probe for Android REV dynamic analysis readiness.",
  args: {
    serial: tool.schema.string().optional().describe("Optional adb device serial"),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args) {
    const adb = await safeExec("adb", ["devices"], undefined, 6000)
    const serial = args.serial || firstDevice(adb.output)
    const adbArgs = serial ? ["-s", serial] : []
    const androidVersion = serial
      ? await safeExec("adb", [...adbArgs, "shell", "getprop", "ro.build.version.release"], undefined, 5000)
      : { ok: false, output: "no adb device" }
    const abi = serial
      ? await safeExec("adb", [...adbArgs, "shell", "getprop", "ro.product.cpu.abi"], undefined, 5000)
      : { ok: false, output: "no adb device" }
    const id = serial
      ? await safeExec("adb", [...adbArgs, "shell", "id"], undefined, 5000)
      : { ok: false, output: "no adb device" }
    const tmp = serial
      ? await safeExec("adb", [...adbArgs, "shell", "ls", "-ld", "/data/local/tmp"], undefined, 5000)
      : { ok: false, output: "no adb device" }
    const fridaPs = await safeExec("frida-ps", ["-U"], undefined, 8000)
    const psFrida = serial
      ? await safeExec("adb", [...adbArgs, "shell", "ps", "-A"], undefined, 7000)
      : { ok: false, output: "no adb device" }
    const fridaServer = /frida/i.test(`${fridaPs.output}\n${psFrida.output}`)
    const payload = {
      adb_available: adb.ok,
      devices_output: adb.output,
      selected_serial: serial || "none",
      device: {
        androidVersion: androidVersion.output.trim(),
        abi: abi.output.trim(),
        id: id.output.trim(),
        writableTmpHint: tmp.output.trim(),
      },
      frida: {
        fridaPsOk: fridaPs.ok,
        fridaServerLikelyRunning: fridaServer,
        fridaPsPreview: fridaPs.output.split(/\r?\n/).slice(0, 15),
      },
      recommendation: serial
        ? {
            canInstall: "ask-gated: use adb install only with user approval",
            canHook: fridaServer ? "likely yes" : "unknown/no frida-server visible",
            firstDynamicProbe:
              "install/run app, capture focused logcat, then hook checker/native boundary if static triage points there",
          }
        : {
            canInstall: "no device",
            canHook: "no device",
            firstDynamicProbe: "connect Android 11 test device/emulator and rerun",
          },
    }
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "verdict: android_runtime_check",
      `adb_available: ${adb.ok}`,
      `selected_serial: ${payload.selected_serial}`,
      `androidVersion: ${payload.device.androidVersion || "unknown"}`,
      `abi: ${payload.device.abi || "unknown"}`,
      `id: ${payload.device.id || "unknown"}`,
      `frida_ps_ok: ${payload.frida.fridaPsOk}`,
      `frida_server_likely_running: ${payload.frida.fridaServerLikelyRunning}`,
      "adb_devices:",
      ...adb.output
        .split(/\r?\n/)
        .slice(0, 20)
        .map((l) => `- ${l}`),
      "recommendation:",
      `- canInstall: ${payload.recommendation.canInstall}`,
      `- canHook: ${payload.recommendation.canHook}`,
      `- firstDynamicProbe: ${payload.recommendation.firstDynamicProbe}`,
    ].join("\n")
  },
})
