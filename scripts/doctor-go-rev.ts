import { readFileSync } from "node:fs"
import path from "node:path"

const files = [
  path.join(process.cwd(), "tools", "core", "ctf-elf-slice.ts"),
  path.join(process.cwd(), "tools", "core", "ctf-binary-probe.ts"),
  path.join(process.cwd(), "tools", "rev", "ctf-go-pclntool.ts"),
  path.join(process.cwd(), "tools", "lib", "go-elf-analysis.ts"),
]
const text = files.map((f) => readFileSync(f, "utf8")).join("\n")
const needles = [
  "gopclntab_offsets",
  "collectGoNameCandidates",
  "classifyGoFunctions",
  "function_address_map",
  "analysis_pivots",
  "priority_function_addresses",
  "go_call_summary",
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
