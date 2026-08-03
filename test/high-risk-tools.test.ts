import { deflateRawSync } from "node:zlib"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import backgroundJob from "../tools/core/ctf-background-job.js"
import safeExtract from "../tools/core/ctf-safe-extract.js"
import pcapCarve from "../tools/forensics/ctf-pcap-carve.js"

type Context = { directory: string }
type ToolResult = string | { output?: string }

function outputOf(result: ToolResult): string {
  return typeof result === "string" ? result : result.output || ""
}

async function waitForOutput(fn: () => Promise<string>, pattern: string, attempts = 15): Promise<string> {
  let last = ""
  for (let i = 0; i < attempts; i++) {
    last = await fn()
    if (last.includes(pattern)) return last
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return last
}

function makeClassicPcap(appPayload: Buffer): Buffer {
  const eth = Buffer.alloc(14)
  eth.writeUInt16BE(0x0800, 12)
  const ip = Buffer.alloc(20)
  ip[0] = 0x45
  ip[9] = 6
  const tcp = Buffer.alloc(20)
  tcp[12] = 0x50
  const payload = Buffer.concat([eth, ip, tcp, appPayload])
  const global = Buffer.alloc(24)
  global.writeUInt32LE(0xa1b2c3d4, 0)
  global.writeUInt16LE(2, 4)
  global.writeUInt16LE(4, 6)
  global.writeUInt32LE(65535, 16)
  global.writeUInt32LE(1, 20)
  const pkt = Buffer.alloc(16)
  pkt.writeUInt32LE(1, 0)
  pkt.writeUInt32LE(0, 4)
  pkt.writeUInt32LE(payload.length, 8)
  pkt.writeUInt32LE(payload.length, 12)
  return Buffer.concat([global, pkt, payload])
}

function makeLocalHeaderOnlyZip(name: string, data: Buffer): Buffer {
  const fileName = Buffer.from(name)
  const compressed = deflateRawSync(data)
  const header = Buffer.alloc(30)
  header.writeUInt32LE(0x04034b50, 0)
  header.writeUInt16LE(20, 4)
  header.writeUInt16LE(0, 6)
  header.writeUInt16LE(8, 8)
  header.writeUInt32LE(0, 10)
  header.writeUInt32LE(0, 14)
  header.writeUInt32LE(compressed.length, 18)
  header.writeUInt32LE(data.length, 22)
  header.writeUInt16LE(fileName.length, 26)
  header.writeUInt16LE(0, 28)
  return Buffer.concat([header, fileName, compressed])
}

describe("high-risk tool contracts", () => {
  it("ctf-safe-extract falls back when the PowerShell zip backend cannot extract", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ctf-safe-extract-local-header-"))
    await writeFile(
      path.join(dir, "local-only.zip"),
      makeLocalHeaderOnlyZip("flag.txt", Buffer.from("flag{zip_local_only}")),
    )

    const text = outputOf(
      await safeExtract.execute({ target: "local-only.zip", out: "out", overwrite: true }, { directory: dir } as never),
    )

    expect(text).toContain("backend: zip-local-header-recovery")
    expect(text).toContain("files_inspected: 1")
    await expect(readFile(path.join(dir, "out", "local-only", "flag.txt"), "utf8")).resolves.toBe(
      "flag{zip_local_only}",
    )
  }, 15000)

  it("ctf-pcap-carve keeps whole-file fallback while scanning pcap app-layer payloads", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ctf-pcap-carve-"))
    const target = path.join(dir, "sample.pcap")
    await writeFile(target, makeClassicPcap(Buffer.from("NOISE")), "binary")
    await writeFile(target, Buffer.concat([await readFile(target), Buffer.from("MAGICflag{whole_file_fallback}")]))

    const text = outputOf(
      await pcapCarve.execute({ target: "sample.pcap", magic: "MAGIC", scanAppLayerOnly: true, jsonOnly: true }, {
        directory: dir,
      } as never),
    )
    const parsed = JSON.parse(text)

    expect(parsed.is_pcap).toBe(true)
    expect(parsed.candidates_scanned).toBeGreaterThanOrEqual(2)
    expect(parsed.frames_carved).toBeGreaterThanOrEqual(1)
    expect(JSON.stringify(parsed.flag_candidates)).toContain("flag")
  })

  it("ctf-background-job starts, reports, reads, and stops a workspace-local node job", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ctf-background-job-"))
    const context = { directory: dir } as Context
    let started: Record<string, unknown> | null = null

    try {
      const parsedStart = JSON.parse(
        outputOf(
          await backgroundJob.execute(
            {
              operation: "start",
              id: "contract",
              lang: "node",
              code: "console.log('BG_CONTRACT_OK'); setTimeout(() => {}, 10000)",
              jsonOnly: true,
            },
            context as never,
          ),
        ),
      )
      started = parsedStart

      expect(parsedStart.ok).toBe(true)
      expect(parsedStart.pid).toBeGreaterThan(0)

      const status = JSON.parse(
        outputOf(
          await backgroundJob.execute({ operation: "status", id: "contract", jsonOnly: true }, context as never),
        ),
      )
      expect(status.ok).toBe(true)
      expect(status.running).toBe(true)

      const jobOutput = await waitForOutput(async () => {
        const read = JSON.parse(
          outputOf(
            await backgroundJob.execute({ operation: "read", id: "contract", jsonOnly: true }, context as never),
          ),
        )
        return `${read.stdout}\n${read.stderr}`
      }, "BG_CONTRACT_OK")
      expect(jobOutput).toContain("BG_CONTRACT_OK")

      const stopped = JSON.parse(
        outputOf(await backgroundJob.execute({ operation: "stop", id: "contract", jsonOnly: true }, context as never)),
      )
      expect(stopped.stopped).toBe(true)
    } finally {
      if (started) {
        await backgroundJob
          .execute({ operation: "stop", id: "contract", jsonOnly: true }, context as never)
          .catch(() => undefined)
      }
    }
  }, 60000)
})
