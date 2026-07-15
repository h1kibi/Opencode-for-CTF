import { tool } from "@opencode-ai/plugin"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`path must stay inside current workspace: ${input}`)
  return target
}

export default tool({
  description: "CTF pwn stage harness: plan and emit a reproducible staged-payload harness packet with per-stage payload artifacts, snapshot points, and delta targets for pwntools + gdb workflows.",
  args: {
    binary: tool.schema.string().describe("Workspace-relative ELF binary path."),
    stagesJson: tool.schema.string().optional().describe("JSON array of stages; each item may include name,payloadText,payloadHex,breakpoints,memoryExprs,memoryLabels,notes."),
    preset: tool.schema.string().optional().describe("Optional preset such as saved_rbp_ret_to_callsite."),
    outDir: tool.schema.string().optional().describe("Workspace-relative output directory for emitted payload files. Default work/stage-harness."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const binary = resolveInsideWorkspace(context.directory, args.binary)
    const outDir = resolveInsideWorkspace(context.directory, args.outDir || "work/stage-harness")
    let stages = JSON.parse(String(args.stagesJson || "[]")) as Array<Record<string, unknown>>
    const preset = String(args.preset || "")
    if ((!Array.isArray(stages) || !stages.length) && preset === "saved_rbp_ret_to_callsite") {
      stages = [
        { name: "stage1_saved_rbp_land", notes: "visualize the first payload that overwrites saved rbp and returns to the original call-site without assuming libc stability", breakpoints: "main", memoryExprs: "$rbp,$rsp,$rip", memoryLabels: "rbp,rsp,rip" },
        { name: "stage2_frame_indexed_leak", notes: "set rbp so rbp-k points at printf@got or a readable global, then observe the original print path leak", breakpoints: "printf", memoryExprs: "$rbp,$rsp,$rip", memoryLabels: "rbp,rsp,rip" },
        { name: "stage3_post_leak_closure", notes: "only after leak confirmation, move to ret2libc/closure using the shortest path", breakpoints: "main", memoryExprs: "$rbp,$rsp,$rip", memoryLabels: "rbp,rsp,rip" },
      ]
    }
    if ((!Array.isArray(stages) || !stages.length) && preset === "leave_ret_pseudostack_midcall") {
      stages = [
        { name: "stage1_saved_rbp_ret", notes: "send first payload that overwrites saved rbp/saved ret; stop before or at leave;ret to confirm rbp/rsp handoff", breakpoints: "*leave_ret_site,main", memoryExprs: "$rbp,$rsp,$rip,$rbp-0x30,$rbp-0x10", memoryLabels: "rbp,rsp,rip,rbp_minus_30,rbp_minus_10" },
        { name: "stage2_bss_frame_landing", notes: "confirm rsp/rbp migrated to .bss or chosen fake frame; inspect saved rbp, saved ret, and local variable slots", breakpoints: "*callsite_before_printf,*printf@plt", memoryExprs: "$rbp,$rsp,$rip,$rbp-0x30,$rbp-0x10", memoryLabels: "rbp,rsp,rip,rbp_minus_30,rbp_minus_10" },
        { name: "stage3_mid_function_reentry", notes: "re-enter original callsite or mid-function target and verify first argument / varargs state before libc closure", breakpoints: "*callsite_before_printf,*printf@plt", memoryExprs: "$rdi,$rsi,$rdx,$rbp,$rsp,$rip", memoryLabels: "rdi,rsi,rdx,rbp,rsp,rip" },
      ]
    }
    if (!Array.isArray(stages) || !stages.length) return "BLOCK: provide stagesJson or use preset=saved_rbp_ret_to_callsite"
    await mkdir(outDir, { recursive: true })

    const emittedStages = [] as Array<Record<string, unknown>>
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i]
      const name = String(stage.name || `stage${i + 1}`)
      let payloadRel = ""
      if (stage.payloadHex || stage.payloadText) {
        payloadRel = path.relative(context.directory, path.join(outDir, `${i + 1}-${name}${stage.payloadHex ? ".bin" : ".txt"}`)).replace(/\\/g, "/")
        const abs = resolveInsideWorkspace(context.directory, payloadRel)
        if (stage.payloadHex) await writeFile(abs, Buffer.from(String(stage.payloadHex).replace(/[^0-9a-fA-F]/g, ""), "hex"))
        else await writeFile(abs, String(stage.payloadText || ""), "utf8")
      }
      emittedStages.push({
        index: i + 1,
        name,
        payload_file: payloadRel,
        breakpoints: String(stage.breakpoints || ""),
        memoryExprs: String(stage.memoryExprs || "$rsp,$rbp,$rip"),
        memoryLabels: String(stage.memoryLabels || "rsp,rbp,rip"),
        notes: String(stage.notes || ""),
      })
    }

    const payload = {
      schema_version: "pwn_stage_harness.v1",
      binary: path.relative(context.directory, binary).replace(/\\/g, "/"),
      out_dir: path.relative(context.directory, outDir).replace(/\\/g, "/"),
      stages: emittedStages,
      recommended_flow: [
        "Use ctf-pwn-docker-runner with payload_file per stage to replay the exact bytes sent.",
        "Use ctf-pwn-gdb-snapshot after each stage with matching breakpoints and memoryExprs to capture rbp/rsp/rip and leak deltas.",
        "Compare stage outputs with ctf-pwn-remote-transcript-diff or ctf-pwn-io-diff-check when local/remote diverge.",
        "For leave-ret pseudostack or mid-function reentry, keep breakpoints at the leave;ret site, fake-frame landing, and reused callsite; verify rdi/rsi/rdx before assuming printf/puts semantics.",
      ],
      preset,
    }
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "pwn_stage_harness:",
      `binary: ${payload.binary}`,
      `out_dir: ${payload.out_dir}`,
      `preset: ${payload.preset || "none"}`,
      "stages:",
      ...payload.stages.map((stage) => `- #${stage.index} ${stage.name} payload_file=${stage.payload_file || "none"} breakpoints=${stage.breakpoints || "none"} memoryExprs=${stage.memoryExprs}`),
      "recommended_flow:",
      ...payload.recommended_flow.map((x) => `- ${x}`),
    ].join("\n")
  },
})
