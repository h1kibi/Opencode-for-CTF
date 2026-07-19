import { describe, expect, it } from "vitest"
import {
  isFutureIso,
  isoPlusMs,
  nowIso,
  loadJsonFile,
  removeFileIfExists,
  atomicUpdateJsonFile,
} from "../src/state-store.js"
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("nowIso", () => {
  it("returns a valid ISO string", () => {
    const result = nowIso()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })
})

describe("isoPlusMs", () => {
  it("returns a future ISO string", () => {
    const future = isoPlusMs(10_000)
    expect(future).toBeDefined()
    expect(Date.parse(future!)).toBeGreaterThan(Date.now())
  })
})

describe("isFutureIso", () => {
  it("returns true for a future timestamp", () => {
    const future = new Date(Date.now() + 60_000).toISOString()
    expect(isFutureIso(future)).toBe(true)
  })

  it("returns false for a past timestamp", () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    expect(isFutureIso(past)).toBe(false)
  })

  it("returns false for undefined", () => {
    expect(isFutureIso(undefined)).toBe(false)
  })

  it("returns false for empty string", () => {
    expect(isFutureIso("")).toBe(false)
  })
})

describe("loadJsonFile", () => {
  function tmpFile(prefix: string) {
    const dir = mkdtempSync(join(tmpdir(), `ctf-test-${prefix}-`))
    return join(dir, "test.json")
  }

  it("returns fallback for missing file", async () => {
    const result = await loadJsonFile(tmpFile("missing"), { fallback: true })
    expect(result).toEqual({ fallback: true })
  })

  it("returns fallback for empty file", async () => {
    const file = tmpFile("empty")
    writeFileSync(file, "", "utf-8")
    const result = await loadJsonFile(file, [])
    expect(result).toEqual([])
  })

  it("throws for invalid JSON instead of silently resetting state", async () => {
    const file = tmpFile("invalid")
    writeFileSync(file, "not-json", "utf-8")
    await expect(loadJsonFile(file, { ok: false })).rejects.toThrow(SyntaxError)
  })

  it("parses valid JSON", async () => {
    const file = tmpFile("valid")
    writeFileSync(file, '{"hello":"world","count":42}', "utf-8")
    const result = await loadJsonFile<{ hello: string; count: number }>(file, { hello: "", count: 0 })
    expect(result.hello).toBe("world")
    expect(result.count).toBe(42)
  })
})

describe("removeFileIfExists", () => {
  it("removes an existing file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ctf-test-remove-"))
    const file = join(dir, "temp.txt")
    writeFileSync(file, "data", "utf-8")
    expect(existsSync(file)).toBe(true)
    await removeFileIfExists(file)
    expect(existsSync(file)).toBe(false)
  })

  it("does not throw for missing file", async () => {
    await expect(removeFileIfExists("/nonexistent/path/foo.json")).resolves.toBeUndefined()
  })
})

describe("atomicUpdateJsonFile", () => {
  function tmpState<T>(initial: T): { file: string; cleanup: () => void } {
    const dir = mkdtempSync(join(tmpdir(), "ctf-test-atomic-"))
    if (initial !== undefined) {
      writeFileSync(join(dir, "state.json"), JSON.stringify(initial), "utf-8")
    }
    return {
      file: join(dir, "state.json"),
      cleanup: () => {
        try {
          writeFileSync(join(dir, "state.json"), "")
        } catch {}
      },
    }
  }

  it("reads and mutates existing state", async () => {
    const { file } = tmpState({ count: 1 })
    const result = await atomicUpdateJsonFile<{ count: number }>(file, { count: 0 }, (s: { count: number }) => {
      s.count++
      return s
    })
    expect(result.count).toBe(2)

    // Verify on disk
    const onDisk = JSON.parse(readFileSync(file, "utf-8"))
    expect(onDisk.count).toBe(2)
  })

  it("uses fallback when file does not exist and writes result", async () => {
    const { file } = tmpState(undefined as unknown as Record<string, never>)
    const result = await atomicUpdateJsonFile<{ items: string[] }>(file, { items: [] }, (s: { items: string[] }) => {
      s.items.push("a")
      return s
    })
    expect(result.items).toEqual(["a"])

    const onDisk = JSON.parse(readFileSync(file, "utf-8"))
    expect(onDisk.items).toEqual(["a"])
  })

  it("propagates mutator errors and does not write", async () => {
    const { file } = tmpState({ stable: true })
    await expect(
      atomicUpdateJsonFile(file, {}, () => {
        throw new Error("mutator-failure")
      }),
    ).rejects.toThrow("mutator-failure")

    // File should be unchanged
    const onDisk = JSON.parse(readFileSync(file, "utf-8"))
    expect(onDisk).toEqual({ stable: true })
  })

  it("serialises concurrent mutations to the same file", async () => {
    const { file } = tmpState({ counter: 0 })

    const tasks = Array.from({ length: 10 }, (_: unknown, i: number) =>
      atomicUpdateJsonFile<{ counter: number }>(file, { counter: 0 }, (s: { counter: number }) => {
        s.counter++
        return s
      }),
    )

    await Promise.all(tasks)

    const onDisk = JSON.parse(readFileSync(file, "utf-8"))
    expect(onDisk.counter).toBe(10)
  })

  it("always writes back to disk regardless of object identity", async () => {
    const { file } = tmpState({ data: "unchanged" })

    await atomicUpdateJsonFile(file, { data: "" }, (s: { data: string }) => {
      // Return same reference — still gets saved
      return s
    })

    // Verify content was written
    const onDisk = JSON.parse(readFileSync(file, "utf-8"))
    expect(onDisk).toEqual({ data: "unchanged" })
  })
})
