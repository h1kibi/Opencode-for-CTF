import path from "node:path"
import { describe, expect, it } from "vitest"
import { resolveCommand } from "../tools/lib/env-check-core.ts"

describe("env-check-core command resolution", () => {
  it("finds an interpreter that is guaranteed to exist on PATH", async () => {
    // `node` is the test runner itself, so it is on PATH on every supported
    // platform. This guards the POSIX branch of whereAll(): when it used
    // where.exe unconditionally, resolveCommand returned {} on Linux/WSL and
    // every env-check reported installed tools as missing.
    const binary = process.platform === "win32" ? path.basename(process.execPath) : "node"
    const locator = process.platform === "win32" ? "where.exe" : "which"
    const located = await resolveCommand(binary)
    expect(located.resolved, `${binary} must resolve via ${locator}`).toBeTruthy()
  }, 15_000)
})
