import { readFile, readdir } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { createConnection } from "node:net"

export interface IdaMcpInstance {
  file: string
  host: string
  port: number
  pid: number
  binary?: string
  idb_path?: string
  started_at?: string
  backend?: string
  live: boolean
  reason?: string
}

export interface IdaMcpDiscoveryOptions {
  directory?: string
  timeoutMs?: number
}

export function getIdaMcpInstancesDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.IDA_MCP_INSTANCES_DIR) return env.IDA_MCP_INSTANCES_DIR
  const appData = env.APPDATA ?? join(homedir(), "AppData", "Roaming")
  return join(appData, "Hex-Rays", "IDA Pro", "mcp", "instances")
}

function validPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 65535
}

function validPid(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
}

function probeTcp(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: boolean) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const socket = createConnection({ host, port })
    const timer = setTimeout(() => {
      socket.destroy()
      finish(false)
    }, timeoutMs)
    socket.once("connect", () => {
      clearTimeout(timer)
      socket.end()
      finish(true)
    })
    socket.once("error", () => {
      clearTimeout(timer)
      socket.destroy()
      finish(false)
    })
  })
}

/**
 * Read IDA Pro MCP registrations without deleting stale files.
 * The official MCP discovery helper performs the same TCP liveness check;
 * keeping this read-only makes the doctor safe to run while IDA is closing.
 */
export async function inspectIdaMcpInstances(options: IdaMcpDiscoveryOptions = {}): Promise<IdaMcpInstance[]> {
  const directory = options.directory ?? getIdaMcpInstancesDir()
  const timeoutMs = options.timeoutMs ?? 700
  let names: string[]
  try {
    names = await readdir(directory)
  } catch {
    return []
  }

  const files = names.filter((name) => /^instance_\d+\.json$/i.test(name)).sort()
  const instances: IdaMcpInstance[] = []
  for (const name of files) {
    const file = join(directory, name)
    let data: Record<string, unknown>
    try {
      data = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>
    } catch {
      instances.push({ file, host: "", port: 0, pid: 0, live: false, reason: "invalid discovery JSON" })
      continue
    }
    const host = typeof data.host === "string" && data.host ? data.host : ""
    const port = data.port
    const pid = data.pid
    if (!host || !validPort(port) || !validPid(pid)) {
      instances.push({ file, host, port: validPort(port) ? port : 0, pid: validPid(pid) ? pid : 0, live: false, reason: "missing host/port/pid" })
      continue
    }
    const live = await probeTcp(host, port, timeoutMs)
    instances.push({
      file,
      host,
      port,
      pid,
      binary: typeof data.binary === "string" ? data.binary : undefined,
      idb_path: typeof data.idb_path === "string" ? data.idb_path : undefined,
      started_at: typeof data.started_at === "string" ? data.started_at : undefined,
      backend: typeof data.backend === "string" ? data.backend : undefined,
      live,
      reason: live ? undefined : "TCP endpoint unavailable (possibly stale registration)",
    })
  }
  return instances
}
