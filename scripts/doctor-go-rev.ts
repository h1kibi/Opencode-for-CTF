import { readFileSync } from "node:fs"
import path from "node:path"

const files = [
  path.join(process.cwd(), "tools", "ctf-elf-slice.ts"),
  path.join(process.cwd(), "tools", "ctf-binary-probe.ts"),
  path.join(process.cwd(), "tools", "ctf-go-pclntool.ts"),
  path.join(process.cwd(), "tools", "lib", "go-elf-analysis.ts"),
]
const text = files.map((f) => readFileSync(f, "utf8")).join("\n")
const needles = [
  "gopclntab_offsets",
  "collectGoNameCandidates",
  "classifyGoFunctions",
  "parseElfSections",
  "parseGoPclntab",
  "function_address_map",
  "analysis_pivots",
  "priority_function_addresses",
  "go_call_summary",
  "call_summary",
  "call_hints",
  "helper_chains",
  "shortest_logic_chain",
  "best_first_targets",
  "preferred_reva_targets",
  "preferred_ida_targets",
  "preferred_slice_targets",
  "go_execution_plan",
  "execution_plan_steps",
  "helper_chains",
  "shortest_logic_chain",
  "best_first_targets",
  "user_code_candidates",
  "runtime_noise_candidates",
  "decoder_like_candidates",
]

const missing = needles.filter((n) => !text.includes(n))
if (missing.length) {
  console.error("GO_REV_DOCTOR_FAIL missing=" + missing.join(","))
  process.exit(1)
}

console.log("GO_REV_DOCTOR_OK needles=" + needles.length)
