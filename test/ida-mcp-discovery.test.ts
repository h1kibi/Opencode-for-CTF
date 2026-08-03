import { createServer } from "node:net"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { getIdaMcpInstancesDir, inspectIdaMcpInstances } from "../scripts/lib/ida-mcp-discovery.ts"

const servers: ReturnType<typeof createServer>[] = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          if (!server.listening) {
            resolve()
            return
          }
          server.close(() => resolve())
        }),
    ),
  )
})

async function listenServer() {
  const server = createServer()
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("test server did not expose a TCP address")
  return { server, port: address.port }
}

describe("IDA MCP discovery doctor", () => {
  it("uses the Windows APPDATA layout and supports an explicit test override", () => {
    expect(getIdaMcpInstancesDir({ APPDATA: "C:/Users/test/AppData/Roaming" })).toMatch(/[\\/]Users[\\/]test[\\/]AppData[\\/]Roaming/)
    expect(getIdaMcpInstancesDir({ IDA_MCP_INSTANCES_DIR: "C:/tmp/ida-instances" })).toBe("C:/tmp/ida-instances")
  })

  it("classifies live, stale, and malformed registrations without deleting them", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-ida-discovery-"))
    const { port } = await listenServer()
    await writeFile(
      path.join(root, `instance_${port}.json`),
      JSON.stringify({ host: "127.0.0.1", port, pid: 1234, binary: "sample.exe", backend: "gui" }),
    )
    await writeFile(
      path.join(root, "instance_1.json"),
      JSON.stringify({ host: "127.0.0.1", port: 1, pid: 1234, backend: "gui" }),
    )
    await writeFile(path.join(root, "instance_2.json"), "not-json")
    await mkdir(path.join(root, "ignored"))

    const instances = await inspectIdaMcpInstances({ directory: root, timeoutMs: 100 })
    expect(instances).toHaveLength(3)
    expect(instances.find((instance) => instance.port === port)).toMatchObject({
      live: true,
      backend: "gui",
      binary: "sample.exe",
    })
    expect(instances.find((instance) => instance.port === 1)).toMatchObject({
      live: false,
      reason: "TCP endpoint unavailable (possibly stale registration)",
    })
    expect(instances.find((instance) => instance.file.endsWith("instance_2.json"))).toMatchObject({
      live: false,
      reason: "invalid discovery JSON",
    })
  })
})

