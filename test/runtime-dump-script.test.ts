import { describe, expect, it } from "vitest"
import { psRuntimeDumpScript } from "../tools/rev/ctf-runtime-dump.ts"

describe("ctf-runtime-dump PowerShell script", () => {
  it("does not use the read-only PowerShell automatic variable Pid", () => {
    const script = psRuntimeDumpScript()
    expect(script).not.toContain("[string]$Pid =")
    expect(script).not.toContain("$Pid -match")
    expect(script).toContain("[string]$TargetPid =")
    expect(script).toContain("$TargetPid -match")
  })
})
