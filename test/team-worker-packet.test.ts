import { describe, expect, it } from "vitest"
import { parseWorkerPackets } from "../src/team/team-worker-packet.ts"

describe("team worker packet parser", () => {
  it("extracts a valid structured fact packet from worker markdown", () => {
    const markdown = [
      "Here is the local assessment of the target.",
      "```json",
      JSON.stringify({
        protocol: "ctf.team.worker.v1",
        type: "fact",
        intentId: "intent-1",
        routeId: "R1",
        statement: "Binary is 64-bit ELF with NX and no canary.",
        kind: "observation",
        confidence: "observed",
        evidence: [
          { type: "command", value: "checksec --file=chall" },
          { type: "response", value: "NX enabled, No canary found" },
        ],
      }),
      "```",
      "Next, proceeding with stack pivot verification.",
    ].join("\n")

    const packets = parseWorkerPackets(markdown)
    expect(packets).toHaveLength(1)
    expect(packets[0]).toMatchObject({
      protocol: "ctf.team.worker.v1",
      type: "fact",
      intentId: "intent-1",
      routeId: "R1",
      statement: "Binary is 64-bit ELF with NX and no canary.",
      kind: "observation",
      confidence: "observed",
    })
    expect(packets[0].evidence).toHaveLength(2)
  })

  it("extracts intent result packet", () => {
    const markdown = [
      "Completed assigned analysis.",
      "```json",
      JSON.stringify({
        protocol: "ctf.team.worker.v1",
        type: "intent_result",
        intentId: "intent-2",
        routeId: "R2",
        status: "completed",
        summary: "Verified vulnerability: format string leak reachable via /profile.",
        factIds: ["fact-10", "fact-11"],
        artifacts: ["work/poc.py"],
      }),
      "```",
    ].join("\n")

    const packets = parseWorkerPackets(markdown)
    expect(packets).toHaveLength(1)
    expect(packets[0]).toMatchObject({
      protocol: "ctf.team.worker.v1",
      type: "intent_result",
      intentId: "intent-2",
      routeId: "R2",
      status: "completed",
      artifacts: ["work/poc.py"],
    })
  })

  it("safely ignores malformed or invalid packets without throwing", () => {
    const invalidMarkdown = [
      "```json",
      "{ invalid json",
      "```",
      "```json",
      JSON.stringify({
        protocol: "wrong.protocol",
        type: "fact",
      }),
      "```",
      "```json",
      JSON.stringify({
        protocol: "ctf.team.worker.v1",
        type: "fact",
        statement: "",
        evidence: [],
      }),
      "```",
    ].join("\n")

    expect(parseWorkerPackets(invalidMarkdown)).toEqual([])
    expect(parseWorkerPackets("")).toEqual([])
  })

  it("coerces a worker-declared confirmed fact instead of discarding it", () => {
    // Only the Expert may produce `confirmed`; dropping the packet lost the
    // observation and its evidence entirely.
    const markdown = [
      "```json",
      JSON.stringify({
        protocol: "ctf.team.worker.v1",
        type: "fact",
        statement: "The admin cookie is forgeable.",
        kind: "candidate",
        confidence: "confirmed",
        evidence: [{ type: "response", value: "Set-Cookie: admin=1" }],
      }),
      "```",
    ].join("\n")

    const packets = parseWorkerPackets(markdown)
    expect(packets).toHaveLength(1)
    expect(packets[0].confidence).toBe("observed")
  })

  it("accepts an error fact without evidence but still requires it for observations", () => {
    const errorFact = [
      "```json",
      JSON.stringify({
        protocol: "ctf.team.worker.v1",
        type: "fact",
        statement: "pwntools import failed with ModuleNotFoundError",
        kind: "error",
        confidence: "observed",
        evidence: [],
      }),
      "```",
    ].join("\n")
    expect(parseWorkerPackets(errorFact)).toHaveLength(1)

    const observation = errorFact.replace('"error"', '"observation"')
    expect(parseWorkerPackets(observation)).toHaveLength(0)
  })

  it("finds packets emitted before a long trailing report", () => {
    // Regression: parsing only the tail of the message silently dropped every
    // packet emitted earlier in a verbose report.
    const early = JSON.stringify({
      protocol: "ctf.team.worker.v1",
      type: "fact",
      statement: "early",
      kind: "observation",
      confidence: "observed",
      evidence: [{ type: "command", value: "file ./chall" }],
    })
    const markdown = [`\`\`\`json\n${early}\n\`\`\``, "x".repeat(14_000)].join("\n")
    const packets = parseWorkerPackets(markdown)
    expect(packets.map((packet) => packet.statement)).toContain("early")
  })

  it("retains a tail packet while bounding verbose head output", () => {
    const tail = JSON.stringify({
      protocol: "ctf.team.worker.v1",
      type: "fact",
      statement: "tail",
      kind: "observation",
      confidence: "observed",
      evidence: [{ type: "command", value: "tail-probe" }],
    })
    const packets = parseWorkerPackets(["x".repeat(7_000), `\`\`\`json\n${tail}\n\`\`\``].join("\n"))
    expect(packets.map((packet) => packet.statement)).toContain("tail")
  })

  it("caps accepted packets from a hostile verbose response", () => {
    const packet = JSON.stringify({
      protocol: "ctf.team.worker.v1",
      type: "fact",
      statement: "bounded",
      kind: "observation",
      confidence: "observed",
      evidence: [{ type: "command", value: "probe" }],
    })
    const packets = parseWorkerPackets(Array.from({ length: 80 }, () => `\`\`\`json\n${packet}\n\`\`\``).join("\n"))
    expect(packets).toHaveLength(64)
  })
})
