import { existsSync, readFileSync } from "fs"
import { resolve } from "path"

const target = process.argv[2] ?? ".ctf-state.json"
const path = resolve(target)

if (!existsSync(path)) {
  console.log(`State file not found: ${path}`)
  process.exit(1)
}

const raw = readFileSync(path, "utf8")
const data = JSON.parse(raw) as {
  challenge?: { name?: string; category?: string; flagFormat?: string; target?: string }
  phase?: string
  nextAction?: string
  hypotheses?: string[]
  confirmedPrimitives?: string[]
  blockedPaths?: string[]
}

console.log("# CTF State")
console.log(`- file: ${path}`)
console.log(`- challenge: ${data.challenge?.name ?? ""}`)
console.log(`- category: ${data.challenge?.category ?? "unknown"}`)
console.log(`- flag format: ${data.challenge?.flagFormat ?? ""}`)
console.log(`- target: ${data.challenge?.target ?? ""}`)
console.log(`- phase: ${data.phase ?? "unknown"}`)
console.log(`- next action: ${data.nextAction ?? ""}`)
console.log(`- hypotheses: ${(data.hypotheses ?? []).length}`)
console.log(`- confirmed primitives: ${(data.confirmedPrimitives ?? []).join(", ") || "none"}`)
console.log(`- blocked paths: ${(data.blockedPaths ?? []).join(", ") || "none"}`)
