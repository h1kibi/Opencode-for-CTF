import { rmSync } from "node:fs"
import { afterAll, afterEach, describe, expect, it } from "vitest"
import { handleToolExecuteBefore } from "../src/hooks/tool-hooks.ts"
import { mergePluginConfig } from "../src/plugin-config.ts"
import { makeTestWorkspace } from "./support/test-workspace.ts"

// Default MCP activation writes under <worktree>/runtime/state. Point the hook
// at a throwaway worktree so unit runs never touch the repository's real
// runtime state.
const worktree = makeTestWorkspace("ctf-clean-room")

afterAll(() => {
  rmSync(worktree, { recursive: true, force: true })
})

function run(args: { toolName: string; agentName?: string; cleanRoom?: boolean }) {
  return handleToolExecuteBefore({
    meta: { agent: args.agentName ?? "ctf-fast", tool: args.toolName, sessionID: "s1" },
    output: { tool: args.toolName },
    pluginConfig: { disabled_hooks: [] },
    enabledPacks: ["core", "web", "pwn", "rev", "crypto", "forensics", "misc", "aisec"],
    input: { client: {}, worktree, directory: worktree },
    isHookEnabled: () => false,
    expertReadinessReport: () => ({ ready: true }),
    expertReadinessFailureText: () => "",
    cleanRoom: args.cleanRoom,
  })
}

describe("clean_room measurement arm", () => {
  afterEach(() => {
    delete process.env.OPENCODE_CTF_CLEAN_ROOM
  })

  it("blocks web retrieval tools for ctf agents when enabled", async () => {
    for (const tool of [
      "webfetch",
      "websearch",
      "brave_search",
      "tavily_search",
      "jina_reader",
      "firecrawl_scrape",
      "anysearch_query",
      "browser_navigate",
      "puppeteer_click",
      "chrome_devtools",
      "github_search_code",
      "gh_grep_search",
      "markitdown_convert",
      "context7_query",
    ]) {
      await expect(run({ toolName: tool, cleanRoom: true }), tool).rejects.toThrow(/CleanRoomGate/)
    }
  })

  it("keeps offline solving tools available in clean room", async () => {
    // The gate must not fire; deeper pipeline failures with a fake client are fine.
    const outcome = await run({ toolName: "ctf-file-triage", cleanRoom: true }).then(
      () => "ok",
      (err) => (err instanceof Error ? err.message : String(err)),
    )
    expect(outcome).not.toMatch(/CleanRoomGate/)
  })

  it("does not gate non-ctf agents", async () => {
    await expect(run({ toolName: "webfetch", agentName: "build", cleanRoom: true })).resolves.toBeUndefined()
  })

  it("leaves retrieval open when the arm is off", async () => {
    // webfetch may still be blocked by the fast surface for ctf-fast — the
    // contract here is only that the CleanRoomGate stays silent.
    const outcome = await run({ toolName: "webfetch", cleanRoom: false }).then(
      () => "ok",
      (err) => (err instanceof Error ? err.message : String(err)),
    )
    expect(outcome).not.toMatch(/CleanRoomGate/)
  })

  it("env OPENCODE_CTF_CLEAN_ROOM=1 forces the arm on", () => {
    process.env.OPENCODE_CTF_CLEAN_ROOM = "1"
    expect(mergePluginConfig({}).clean_room).toBe(true)
    expect(mergePluginConfig({ clean_room: false }).clean_room).toBe(true)
    delete process.env.OPENCODE_CTF_CLEAN_ROOM
    expect(mergePluginConfig({}).clean_room).toBe(false)
    expect(mergePluginConfig({ clean_room: true }).clean_room).toBe(true)
  })
})
