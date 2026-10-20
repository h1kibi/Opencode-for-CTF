import { spawn, type ChildProcess } from "node:child_process"
import { existsSync, mkdtempSync } from "node:fs"
import { readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { resolveFileLockPaths, withFileLock } from "../src/file-lock.js"

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs")
const worker = path.join(projectRoot, "test", "fixtures", "file-lock-worker.mjs")

function runWorker(args: string[], options: { killOn?: string } = {}) {
  const child = spawn(process.execPath, [tsxCli, worker, ...args], {
    cwd: projectRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    // POSIX: own process group so a hard kill also reaps the tsx runner's
    // grandchild (the process that actually holds the lock).
    detached: process.platform !== "win32",
  })
  let output = ""
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString()
    if (options.killOn && output.includes(options.killOn)) child.emit("lock-ready")
  })
  child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()))
  const ready = options.killOn
    ? new Promise<void>((resolve, reject) => {
        child.once("lock-ready", () => resolve())
        child.once("error", reject)
      })
    : Promise.resolve()
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once("error", reject)
    child.once("close", (code, signal) => resolve({ code, signal }))
  })
  return { child, ready, closed, getOutput: () => output }
}

/**
 * Hard-kill the worker and every process it spawned. tsx runs the fixture in a
 * child process on POSIX, so killing only the direct child leaves the real
 * lock holder alive and the lease never goes stale.
 */
function killWorker(child: ChildProcess) {
  if (process.platform === "win32" || !child.pid) {
    child.kill("SIGKILL")
    return
  }
  try {
    process.kill(-child.pid, "SIGKILL")
  } catch {
    child.kill("SIGKILL")
  }
}

describe("withFileLock", () => {
  it("executes the function and returns its result", async () => {
    const result = await withFileLock("test-key", async () => "hello")
    expect(result).toBe("hello")
  })

  it("serializes concurrent access to the same key", async () => {
    // The lock guarantees mutual exclusion: critical sections for the same key
    // do not interleave. (Entry order into the lock function is not guaranteed.)
    const timeline: string[] = []

    const task1 = withFileLock("serial-key", async () => {
      timeline.push("1-start")
      await new Promise((r) => setTimeout(r, 50))
      timeline.push("1-end")
      return "a"
    })

    const task2 = withFileLock("serial-key", async () => {
      timeline.push("2-start")
      timeline.push("2-end")
      return "b"
    })

    const results = await Promise.all([task1, task2])
    expect(results).toEqual(["a", "b"])

    const i1e = timeline.indexOf("1-end")
    const i2s = timeline.indexOf("2-start")
    const i2e = timeline.indexOf("2-end")
    const i1s = timeline.indexOf("1-start")

    const oneThenTwo = i1e >= 0 && i2s >= 0 && i1e < i2s
    const twoThenOne = i2e >= 0 && i1s >= 0 && i2e < i1s
    expect(oneThenTwo || twoThenOne).toBe(true)
  })

  it("serializes more than two same-key waiters", async () => {
    let active = 0
    let maximum = 0
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        withFileLock("many-waiters", async () => {
          active++
          maximum = Math.max(maximum, active)
          await new Promise((resolve) => setTimeout(resolve, index % 2 ? 2 : 1))
          active--
        }),
      ),
    )
    expect(maximum).toBe(1)
  })

  it("allows independent keys to run in parallel", async () => {
    const order: number[] = []

    const task1 = withFileLock("key-a", async () => {
      order.push(1)
      await new Promise((r) => setTimeout(r, 30))
      order.push(2)
    })

    const task2 = withFileLock("key-b", async () => {
      order.push(3)
      await new Promise((r) => setTimeout(r, 10))
      order.push(4)
    })

    await Promise.all([task1, task2])
    expect(order).toContain(1)
    expect(order).toContain(3)
  })

  it("propagates errors and releases the lock", async () => {
    await expect(
      withFileLock("error-key", async () => {
        throw new Error("boom")
      }),
    ).rejects.toThrow("boom")

    const result = await withFileLock("error-key", async () => "ok")
    expect(result).toBe("ok")
  })

  it("keeps lock sentinel directories isolated per worktree", async () => {
    const first = mkdtempSync(path.join(os.tmpdir(), "ctf-lock-first-"))
    const second = mkdtempSync(path.join(os.tmpdir(), "ctf-lock-second-"))
    const firstKey = path.join(first, "state.json")
    const secondKey = path.join(second, "state.json")

    await withFileLock(firstKey, async () => undefined)
    await withFileLock(secondKey, async () => undefined)

    expect(resolveFileLockPaths(firstKey).directory).toBe(path.join(first, ".ctf-locks"))
    expect(resolveFileLockPaths(secondKey).directory).toBe(path.join(second, ".ctf-locks"))
    expect(existsSync(resolveFileLockPaths(firstKey).directory)).toBe(true)
    expect(existsSync(resolveFileLockPaths(secondKey).directory)).toBe(true)

    await rm(first, { recursive: true, force: true })
    await rm(second, { recursive: true, force: true })
  })

  it("normalizes relative and absolute aliases to one queue key", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "ctf-lock-alias-"))
    const file = path.join(directory, "state.json")
    const previous = process.cwd()
    process.chdir(directory)
    try {
      let active = 0
      let maximum = 0
      await Promise.all([
        withFileLock("state.json", async () => {
          active++
          maximum = Math.max(maximum, active)
          await new Promise((resolve) => setTimeout(resolve, 30))
          active--
        }),
        withFileLock(file, async () => {
          active++
          maximum = Math.max(maximum, active)
          active--
        }),
      ])
      expect(maximum).toBe(1)
    } finally {
      process.chdir(previous)
      await rm(directory, { recursive: true, force: true })
    }
  })
})

describe("withFileLock cross-process guarantees", () => {
  it("serializes independent Node processes around atomic JSON updates", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "ctf-lock-process-"))
    const file = path.join(directory, "state.json")
    await writeFile(file, JSON.stringify({ counter: 0 }), "utf8")

    const first = runWorker(["increment", file, "12", "3", "2000"])
    const second = runWorker(["increment", file, "12", "3", "2000"])
    const [firstExit, secondExit] = await Promise.all([first.closed, second.closed])

    expect(firstExit.code, `${first.getOutput()}\n${second.getOutput()}`).toBe(0)
    expect(secondExit.code, `${first.getOutput()}\n${second.getOutput()}`).toBe(0)
    const state = JSON.parse(await readFile(file, "utf8")) as { counter: number }
    expect(state.counter).toBe(24)

    await rm(directory, { recursive: true, force: true })
  }, 30_000)

  it("takes over a stale lease after the owning process is hard-killed", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "ctf-lock-stale-"))
    const file = path.join(directory, "state.json")
    await writeFile(file, JSON.stringify({ counter: 0 }), "utf8")

    const holder = runWorker(["hold", file, "1", "0", "2000"], { killOn: "LOCKED" })
    await holder.ready
    killWorker(holder.child)
    const holderExit = await holder.closed
    expect(holderExit.code).not.toBe(0)

    let ran = false
    await withFileLock(
      file,
      async () => {
        ran = true
        await writeFile(file, JSON.stringify({ counter: 1 }), "utf8")
      },
      {
        stale: 2000,
        retries: { retries: 80, factor: 1.15, minTimeout: 10, maxTimeout: 250 },
      },
    )
    expect(ran).toBe(true)
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ counter: 1 })

    await rm(directory, { recursive: true, force: true })
  }, 20_000)

  it("fences an old owner that resumes after stale takeover", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "ctf-lock-fence-"))
    const file = path.join(directory, "state.json")
    await writeFile(file, JSON.stringify({ counter: 0 }), "utf8")

    const oldOwner = runWorker(["stale-write", file, "1", "3500", "2000"], { killOn: "LOCKED" })
    await oldOwner.ready

    await withFileLock(
      file,
      async () => {
        await writeFile(file, JSON.stringify({ counter: 1 }), "utf8")
      },
      {
        stale: 2000,
        retries: { retries: 80, factor: 1.15, minTimeout: 10, maxTimeout: 250 },
      },
    )

    const oldOwnerExit = await oldOwner.closed
    expect(oldOwnerExit.code).toBe(0)
    expect(oldOwner.getOutput()).toContain("FENCED")
    expect(oldOwner.getOutput()).not.toContain("OLD-WROTE")
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ counter: 1 })

    await rm(directory, { recursive: true, force: true })
  }, 15_000)

  it("does not let a fenced owner release a replacement lease", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "ctf-lock-release-fence-"))
    const file = path.join(directory, "state.json")
    const signalFile = path.join(directory, "release.signal")
    await writeFile(file, JSON.stringify({ counter: 0 }), "utf8")

    const oldOwner = runWorker(["stale-release", file, "1", "3500", "2000", signalFile], { killOn: "LOCKED" })
    await oldOwner.ready

    await withFileLock(
      file,
      async (lease) => {
        await writeFile(signalFile, "release\n", "utf8")
        const oldOwnerExit = await oldOwner.closed
        expect(oldOwnerExit.code).toBe(0)
        await lease.assertOwned()
        await writeFile(file, JSON.stringify({ counter: 1 }), "utf8")
      },
      {
        stale: 2000,
        retries: { retries: 80, factor: 1.15, minTimeout: 10, maxTimeout: 250 },
      },
    )

    expect(oldOwner.getOutput()).toContain("FENCED")
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ counter: 1 })

    await rm(directory, { recursive: true, force: true })
  }, 15_000)

  it("fences atomic state writes from an old owner after stale takeover", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "ctf-lock-atomic-fence-"))
    const file = path.join(directory, "state.json")
    await writeFile(file, JSON.stringify({ counter: 0 }), "utf8")

    const oldOwner = runWorker(["stale-atomic", file, "1", "3500", "2000"], { killOn: "LOCKED" })
    await oldOwner.ready

    await withFileLock(
      file,
      async () => {
        await writeFile(file, JSON.stringify({ counter: 1 }), "utf8")
      },
      {
        stale: 2000,
        retries: { retries: 80, factor: 1.15, minTimeout: 10, maxTimeout: 250 },
      },
    )

    const oldOwnerExit = await oldOwner.closed
    expect(oldOwnerExit.code).toBe(0)
    expect(oldOwner.getOutput()).toContain("FENCED")
    expect(oldOwner.getOutput()).not.toContain("OLD-WROTE")
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ counter: 1 })

    await rm(directory, { recursive: true, force: true })
  }, 15_000)

  it("fails closed when acquisition is disabled and another process owns the lease", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "ctf-lock-busy-"))
    const file = path.join(directory, "state.json")
    await writeFile(file, JSON.stringify({ counter: 0 }), "utf8")

    const holder = runWorker(["hold", file, "1", "0", "15_000"], { killOn: "LOCKED" })
    await holder.ready
    let ran = false
    await expect(
      withFileLock(
        file,
        async () => {
          ran = true
        },
        { retries: 0, stale: 15_000 },
      ),
    ).rejects.toMatchObject({ code: "ELOCKED" })
    expect(ran).toBe(false)

    killWorker(holder.child)
    await holder.closed
    await rm(directory, { recursive: true, force: true })
  }, 10_000)
})
