import { describe, expect, it, vi } from "vitest"

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")
  return {
    ...actual,
    readFile: vi.fn().mockResolvedValue(Buffer.from("GNU C Library stable release version 2.31\0/bin/sh\0", "latin1")),
  }
})

const MOD_PATH = "../tools/ctf-pwn-libc-hint.ts"

describe("ctf-pwn-libc-hint tool", () => {
  it("computes libc base and derived addresses from a leaked symbol", async () => {
    const mod = await import(MOD_PATH)
    const execUtils = await import("../tools/lib/exec-utils.ts")

    const execSpy = vi.spyOn(execUtils, "safeExec").mockImplementation(async (command: string) => {
      if (command === "readelf") {
        return {
          ok: true,
          output: [
            "   123: 00000000000809c0    64 FUNC    GLOBAL DEFAULT   13 puts@@GLIBC_2.2.5",
            "   124: 000000000004f550    45 FUNC    GLOBAL DEFAULT   13 system@@GLIBC_2.2.5",
            "   125: 0000000000023e50    32 FUNC    GLOBAL DEFAULT   13 __libc_start_main@@GLIBC_2.34",
            "   126: 0000000000150000    32 FUNC    GLOBAL DEFAULT   13 setcontext@@GLIBC_2.2.5",
            "   127: 0000000000111000    32 FUNC    GLOBAL DEFAULT   13 mprotect@@GLIBC_2.2.5",
            "   128: 00000000000e4e30    32 FUNC    GLOBAL DEFAULT   13 execve@@GLIBC_2.2.5",
          ].join("\n"),
        } as never
      }
      if (command === "nm") {
        return { ok: true, output: "", exitCode: 0 } as never
      }
      if (command === "one_gadget") {
        return { ok: true, output: "0xe6c81\n0xe6c84", exitCode: 0 } as never
      }
      return { ok: true, output: "", exitCode: 0 } as never
    })

    try {
      const execute = mod.default.execute as (args: Record<string, unknown>, context: { directory: string }) => Promise<string>
      const text = await execute(
        {
          libc: "tools/ctf-pwn-offset.ts",
          leakSymbol: "puts",
          leakAddress: "0x7ffff7a809c0",
          jsonOnly: true,
        },
        { directory: "C:/Projects/Agent-projects/Opencode-for-CTF" },
      )
      const parsed = JSON.parse(text)
      expect(parsed.schema_version).toBe("pwn_libc_hint.v1")
      expect(parsed.libc_base).toBe("0x7ffff7a00000")
      expect(parsed.symbol_addresses.system).toBe("0x7ffff7a4f550")
      expect(parsed.best_fast_path).toBeTruthy()
      expect(parsed.one_variable_probe).toBeTruthy()
      expect(parsed.recommended_next_action).toBeTruthy()
    } finally {
      execSpy.mockRestore()
    }
  })
})
