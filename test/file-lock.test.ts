import { describe, expect, it } from "vitest"
import { withFileLock } from "../src/file-lock.js"

describe("withFileLock", () => {
  it("executes the function and returns its result", async () => {
    const result = await withFileLock("test-key", async () => "hello")
    expect(result).toBe("hello")
  })

  it("serializes concurrent access to the same key", async () => {
    // The lock guarantees mutual exclusion: critical sections for the same key
    // do not interleave.  (Entry order into the lock function is not guaranteed.)
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

    // Both tasks' critical sections must not overlap: "1-end" before "2-start"
    // OR "2-end" before "1-start".
    const i1e = timeline.indexOf("1-end")
    const i2s = timeline.indexOf("2-start")
    const i2e = timeline.indexOf("2-end")
    const i1s = timeline.indexOf("1-start")

    const oneThenTwo = i1e >= 0 && i2s >= 0 && i1e < i2s
    const twoThenOne = i2e >= 0 && i1s >= 0 && i2e < i1s
    expect(oneThenTwo || twoThenOne).toBe(true)
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
    // task2 can start before task1 is done because keys differ
  })

  it("propagates errors and releases the lock", async () => {
    await expect(
      withFileLock("error-key", async () => {
        throw new Error("boom")
      }),
    ).rejects.toThrow("boom")

    // Subsequent call should work (lock was released)
    const result = await withFileLock("error-key", async () => "ok")
    expect(result).toBe("ok")
  })
})
