import { describe, expect, it } from "vitest"
import { collectWorkerResult, parseProbeResult, type WorkerMessage } from "../src/team/team-worker-packet.ts"

function result(overrides: Record<string, unknown> = {}) {
  return {
    protocol: "ctf.team.probe.v1",
    type: "probe_result",
    status: "completed",
    summary: "confirmed the target behavior",
    observations: [
      {
        kind: "observation",
        statement: "The service accepts the documented request.",
        evidence: [{ type: "command", value: "./probe --check" }],
      },
    ],
    artifacts: ["work/probe.txt"],
    ...overrides,
  }
}

function fenced(value: unknown) {
  return `\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\`\n`
}

describe("team ProbeResult parser", () => {
  it("parses a valid probe_result with observations, evidence, and artifacts", () => {
    const parsed = parseProbeResult(
      `worker report${fenced(result({ status: "blocked", next: "compare the remote response" }))}`,
    )

    expect(parsed).toEqual(result({ status: "blocked", next: "compare the remote response" }))
  })

  it("rejects malformed JSON, unknown status, and unknown packet protocols", () => {
    const text = [
      "```json\n{ invalid json\n```",
      fenced(result({ status: "running" })),
      fenced(result({ protocol: "ctf.team.unknown.v1" })),
    ].join("\n")

    expect(() => parseProbeResult(text)).toThrow()
    expect(() => parseProbeResult("")).toThrow("Worker output is empty")
  })

  it("rejects missing or malformed evidence and oversized bounded fields", () => {
    const cases = [
      result({ observations: [{ kind: "observation", statement: "missing evidence" }] }),
      result({
        observations: [{ kind: "observation", statement: "bad evidence", evidence: [{ type: "command", value: "" }] }],
      }),
      result({
        observations: [
          { kind: "observation", statement: "unknown evidence", evidence: [{ type: "socket", value: "x" }] },
        ],
      }),
      result({ summary: "x".repeat(2_001) }),
      result({ observations: [{ kind: "observation", statement: "x".repeat(2_001), evidence: [] }] }),
      result({ artifacts: ["x".repeat(1_001)] }),
    ]

    for (const value of cases) expect(() => parseProbeResult(fenced(value))).toThrow()
  })

  it("rejects a later malformed result instead of hiding it", () => {
    const text = [
      fenced(result({ summary: "first" })),
      fenced(result({ summary: "newest valid", status: "failed" })),
      "```json\nnot valid\n```",
    ].join("\n")

    expect(() => parseProbeResult(text)).toThrow()
    expect(
      parseProbeResult([fenced(result({ summary: "first" })), fenced(result({ summary: "second" }))].join("\n"))
        ?.summary,
    ).toBe("second")
  })

  it("bounds trailing output while retaining a result at the end", () => {
    const parsed = parseProbeResult("x".repeat(12_001) + fenced(result({ summary: "tail result" })))

    expect(parsed?.summary).toBe("tail result")
  })

  it("collects only assistant messages after the persisted cursor", () => {
    const messages: WorkerMessage[] = [
      { info: { role: "assistant", id: "old" }, parts: [{ type: "text", text: fenced(result({ summary: "old" })) }] },
      { info: { role: "user", id: "prompt" }, parts: [{ type: "text", text: "ignore" }] },
      { info: { role: "assistant", id: "new" }, parts: [{ type: "text", text: fenced(result({ summary: "new" })) }] },
    ]
    expect(collectWorkerResult(messages, "old")).toMatchObject({ packet: { summary: "new" }, lastMessageID: "new" })
  })

  it("retains bounded raw output when collection packet parsing fails", () => {
    const collected = collectWorkerResult([
      { info: { role: "assistant", id: "bad" }, parts: [{ type: "text", text: "x".repeat(20_000) }] },
    ])
    expect(collected.serializationError).toBeDefined()
    expect(collected.result.length).toBe(6_000)
    expect(collected.lastMessageID).toBe("bad")
  })
})
