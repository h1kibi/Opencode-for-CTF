import { existsSync, readFileSync } from "fs"
import { getTargetPath } from "./evidence-helper.ts"

function main() {
  const slug = process.argv[2]
  const field = process.argv[3]

  if (!slug) {
    console.log("Usage: node scripts/read-rev-team-memory.ts <challenge-slug> [field]")
    process.exit(1)
  }

  const root = process.cwd()
  const target = getTargetPath(root, slug, "rev-team-memory.json")
  if (!existsSync(target)) {
    console.log(`Rev Team memory not found: ${target}`)
    process.exit(1)
  }

  const data = JSON.parse(readFileSync(target, "utf8")) as Record<string, unknown>
  if (field) {
    console.log(JSON.stringify(data[field], null, 2))
    return
  }
  console.log(JSON.stringify(data, null, 2))
}

main()
