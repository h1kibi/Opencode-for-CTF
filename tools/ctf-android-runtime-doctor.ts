import { tool } from "@opencode-ai/plugin"
import { execFile as execFileCb } from "node:child_process"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"

const execFile = promisify(execFileCb)

type ExecResult = { ok: boolean; output: string }

async function tryExec(cmd: string, args: string[], timeout = 6000): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFile(cmd, args, { timeout, maxBuffer: 1024 * 1024, shell: process.platform === "win32" })
    return { ok: true, output: `${stdout}${stderr ? `\n${stderr}` : ""}`.trim() }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    return { ok: false, output: `${e.stdout ?? ""}${e.stderr ? `\n${e.stderr}` : ""}${e.message ? `\n${e.message}` : ""}`.trim() }
  }
}

function firstDevice(adbDevices: string) {
  return adbDevices.split(/\r?\n/).map((line) => line.trim()).find((line) => /\bdevice$/.test(line) && !/^List of devices/i.test(line))?.split(/\s+/)[0] || ""
}

function clean(value: ExecResult) {
  return value.output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] || ""
}

function parseAbiList(value: string) {
  return value.split(",").map((abi) => abi.trim()).filter(Boolean)
}

function profileDrift(targetAndroid: string, model: string, manufacturer: string) {
  const targetLooksPixel = /pixel/i.test(targetAndroid)
  const deviceLooksPixel = /pixel/i.test(`${model} ${manufacturer}`)
  return targetLooksPixel && !deviceLooksPixel
}

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`path must stay inside current workspace: ${input}`)
  return target
}

function u16(buf: Buffer, off: number) { return off + 2 <= buf.length ? buf.readUInt16LE(off) : 0 }
function u32(buf: Buffer, off: number) { return off + 4 <= buf.length ? buf.readUInt32LE(off) : 0 }

type ZipEntry = { name: string; method: number; compressedSize: number; uncompressedSize: number; localHeaderOffset: number }

function listZip(buf: Buffer): ZipEntry[] {
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 0x10000 - 22); i--) {
    if (u32(buf, i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error("invalid zip/apk: EOCD not found")
  const total = u16(buf, eocd + 10)
  const cdOffset = u32(buf, eocd + 16)
  const entries: ZipEntry[] = []
  let off = cdOffset
  for (let i = 0; i < total && off + 46 <= buf.length; i++) {
    if (u32(buf, off) !== 0x02014b50) break
    const method = u16(buf, off + 10)
    const compressedSize = u32(buf, off + 20)
    const uncompressedSize = u32(buf, off + 24)
    const nameLen = u16(buf, off + 28)
    const extraLen = u16(buf, off + 30)
    const commentLen = u16(buf, off + 32)
    const localHeaderOffset = u32(buf, off + 42)
    const name = buf.subarray(off + 46, off + 46 + nameLen).toString("utf8")
    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset })
    off += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

function apkLibAbis(buf: Buffer) {
  return [...new Set(listZip(buf).filter((entry) => /^lib\/[^/]+\/[^/]+\.so$/i.test(entry.name)).map((entry) => entry.name.split("/")[1]).filter(Boolean))]
}

function hasArm64(abis: string[]) {
  return abis.some((abi) => abi === "arm64-v8a" || abi === "arm64")
}

function hasX8664(abis: string[]) {
  return abis.some((abi) => abi === "x86_64")
}

function compareTarget(androidVersion: string, abis: string[], targetAndroid: string, targetAbi: string) {
  const targetNeedsArm64 = /arm64|arm64-v8a/i.test(targetAbi)
  const targetAndroidMajor = targetAndroid.match(/\d+/)?.[0] || ""
  const deviceAndroidMajor = androidVersion.match(/\d+/)?.[0] || ""
  const abiEquivalent = !targetNeedsArm64 || hasArm64(abis)
  const androidEquivalent = !targetAndroidMajor || !deviceAndroidMajor || targetAndroidMajor === deviceAndroidMajor
  return { abiEquivalent, androidEquivalent }
}

export default tool({
  description: "CTF Android runtime equivalence doctor: classify adb device ABI/API equivalence, arm64-only APK risk, libndk_translation risk, and recommended runtime path.",
  args: {
    apk: tool.schema.string().optional().describe("Optional workspace-relative APK path. Infer ABI expectations from lib/<abi>/*.so when present."),
    serial: tool.schema.string().optional().describe("Optional adb device serial"),
    targetAndroid: tool.schema.string().optional().describe("Expected target Android release/API, e.g. Android 11 or 30. Default Android 11."),
    targetAbi: tool.schema.string().optional().describe("Expected target ABI, e.g. arm64-v8a. Default arm64-v8a."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args) {
    const targetAndroid = args.targetAndroid || "Android 11"
    let inferredApkAbis: string[] = []
    if (args.apk) {
      try {
        const apkPath = resolveInsideWorkspace(process.cwd(), args.apk)
        inferredApkAbis = apkLibAbis(await readFile(apkPath))
      } catch {
        inferredApkAbis = []
      }
    }
    const targetAbi = args.targetAbi || inferredApkAbis[0] || "arm64-v8a"
    const adb = await tryExec("adb", ["devices"], 6000)
    const serial = args.serial || firstDevice(adb.output)
    const adbArgs = serial ? ["-s", serial] : []

    const props = serial ? await Promise.all([
      tryExec("adb", [...adbArgs, "shell", "getprop", "ro.build.version.release"], 5000),
      tryExec("adb", [...adbArgs, "shell", "getprop", "ro.build.version.sdk"], 5000),
      tryExec("adb", [...adbArgs, "shell", "getprop", "ro.product.cpu.abi"], 5000),
      tryExec("adb", [...adbArgs, "shell", "getprop", "ro.product.cpu.abilist"], 5000),
      tryExec("adb", [...adbArgs, "shell", "getprop", "ro.system.product.cpu.abilist"], 5000),
      tryExec("adb", [...adbArgs, "shell", "getprop", "ro.hardware"], 5000),
      tryExec("adb", [...adbArgs, "shell", "getprop", "ro.kernel.qemu"], 5000),
      tryExec("adb", [...adbArgs, "shell", "getprop", "ro.dalvik.vm.native.bridge"], 5000),
      tryExec("adb", [...adbArgs, "shell", "getprop", "ro.product.board"], 5000),
      tryExec("adb", [...adbArgs, "shell", "getprop", "ro.board.platform"], 5000),
      tryExec("adb", [...adbArgs, "shell", "getprop", "ro.product.model"], 5000),
      tryExec("adb", [...adbArgs, "shell", "getprop", "ro.product.manufacturer"], 5000),
      tryExec("adb", [...adbArgs, "shell", "uname", "-m"], 5000),
    ]) : []

    const [release, sdk, abi, abilist, systemAbiList, hardware, qemu, nativeBridge, board, platform, model, manufacturer, unameMachine] = props
    const abiList = parseAbiList(clean(abilist) || clean(systemAbiList) || clean(abi))
    const equivalence = serial ? compareTarget(clean(release), abiList, targetAndroid, targetAbi) : { abiEquivalent: false, androidEquivalent: false }
    const apkArm64Only = inferredApkAbis.length > 0 && inferredApkAbis.every((abi) => /arm64/i.test(abi))
    const nativeBridgeValue = clean(nativeBridge)
    const nativeBridgeEnabled = Boolean(nativeBridgeValue && !/^0|none$/i.test(nativeBridgeValue))
    const ndkTranslationRisk = Boolean(serial) && (((/arm64/i.test(targetAbi) || apkArm64Only) && hasX8664(abiList) && !hasArm64(abiList)) || nativeBridgeEnabled)
    const isEmulator = /1/.test(clean(qemu)) || /ranchu|goldfish|qemu/i.test(clean(hardware)) || /sdk|emulator/i.test(`${clean(model)} ${clean(manufacturer)}`)
    const deviceProfileDrift = profileDrift(targetAndroid, clean(model), clean(manufacturer))

    const verdict = !serial ? "NO_DEVICE"
      : ndkTranslationRisk ? "NOT_EQUIVALENT_X86_TRANSLATION_RISK"
      : equivalence.abiEquivalent && equivalence.androidEquivalent && !deviceProfileDrift ? "EQUIVALENT_ENOUGH"
      : equivalence.abiEquivalent && equivalence.androidEquivalent && deviceProfileDrift ? "ANDROID_MAJOR_OK_BUT_DEVICE_PROFILE_DRIFT"
      : !equivalence.abiEquivalent ? "NOT_EQUIVALENT_ABI"
      : "PARTIAL_ANDROID_VERSION_MISMATCH"

    const recommendedPath = !serial ? "Connect an Android device/emulator and rerun."
      : ndkTranslationRisk ? "Do not rely on this x86_64 emulator for arm64-only native APKs; use physical arm64 Android 11, cloud arm64 device, ARM host emulator, or static/JNI patch extraction."
      : !equivalence.abiEquivalent ? "Use an arm64-v8a capable target before dynamic native closure."
      : deviceProfileDrift ? "ABI/API look acceptable for first probes, but record device-profile drift and avoid over-trusting runtime-specific native behavior."
      : !equivalence.androidEquivalent ? "Dynamic checks may work, but record Android version mismatch before trusting runtime-only behavior."
      : "Runtime is suitable for first dynamic probes."

    const payload = {
      verdict,
      selectedSerial: serial || "none",
      target: { android: targetAndroid, abi: targetAbi, apkAbis: inferredApkAbis },
      device: serial ? {
        release: clean(release),
        sdk: clean(sdk),
        abi: clean(abi),
        abilist: abiList,
        systemAbilist: parseAbiList(clean(systemAbiList)),
        hardware: clean(hardware),
        emulator: isEmulator,
        nativeBridge: nativeBridgeValue || "none",
        nativeBridgeEnabled,
        board: clean(board),
        platform: clean(platform),
        model: clean(model),
        manufacturer: clean(manufacturer),
        unameMachine: clean(unameMachine),
      } : null,
      equivalence: {
        abiEquivalent: equivalence.abiEquivalent,
        androidEquivalent: equivalence.androidEquivalent,
        ndkTranslationRisk: Boolean(ndkTranslationRisk),
        deviceProfileDrift,
      },
      recommendedPath,
      arm64WindowsNote: "On x86_64 Windows hosts, Android Studio emulator generally cannot directly boot arm64-v8a system images; arm64-only native APK closure needs a real arm64 device, ARM host, or remote arm64 runtime.",
    }

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "ANDROID_RUNTIME_DOCTOR:",
      `- verdict: ${payload.verdict}`,
      `- selected_serial: ${payload.selectedSerial}`,
      `- target: ${payload.target.android} / ${payload.target.abi}`,
      `- apk_abis: ${payload.target.apkAbis.join(",") || "unknown_or_not_supplied"}`,
      `- device_android: ${payload.device?.release || "unknown"} sdk=${payload.device?.sdk || "unknown"}`,
      `- device_abi: ${payload.device?.abi || "unknown"}`,
      `- device_abilist: ${payload.device?.abilist.join(",") || "unknown"}`,
      `- system_abilist: ${payload.device?.systemAbilist.join(",") || "unknown"}`,
      `- emulator: ${payload.device?.emulator ?? "unknown"}`,
      `- native_bridge: ${payload.device?.nativeBridge || "unknown"}`,
      `- uname_machine: ${payload.device?.unameMachine || "unknown"}`,
      `- abi_equivalent: ${payload.equivalence.abiEquivalent}`,
      `- android_equivalent: ${payload.equivalence.androidEquivalent}`,
      `- device_profile_drift: ${payload.equivalence.deviceProfileDrift}`,
      `- libndk_translation_risk: ${payload.equivalence.ndkTranslationRisk}`,
      `- recommendation: ${payload.recommendedPath}`,
      `- windows_arm64_note: ${payload.arm64WindowsNote}`,
    ].join("\n")
  },
})
