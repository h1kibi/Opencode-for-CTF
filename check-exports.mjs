// Check which exports from flag-utils are used
import { promises as fs } from 'fs'
import { glob } from 'glob'

const flagUtilsExports = [
  'DEFAULT_FLAG_PATTERN',
  'DEFAULT_FLAG_REGEX', 
  'FLAG_PATTERN',
  'FLAG_REGEX',
  'FLAG_REGEX_ONCE',
  'extractFlagCandidates',
  'findFlags',
  'FlagCandidate'
]

const adapterExports = [
  'COMMAND_SURFACE',
  'decideRoute',
  'formatRouteDecision',
  'scoreCategories',
  'CategoryScore',
  'RouteDecision',
  'RouteInput',
  'SolveMode',
  'ToolPack',
  'PRIMARY_AGENTS',
  'DEFAULT_ENTRY_COMMAND',
  'agentForMode',
  'effectiveSolveMode',
  'isL0Command'
]

const files = await glob('**/*.ts', { 
  ignore: ['node_modules/**', '**/flag-utils.ts', '**/ctf-adapter-opencode/**']
})

const usage = {}

for (const exp of [...flagUtilsExports, ...adapterExports]) {
  usage[exp] = 0
}

for (const file of files) {
  const content = await fs.readFile(file, 'utf-8')
  for (const exp of [...flagUtilsExports, ...adapterExports]) {
    // Check if the export is actually used (not just in import)
    const importRegex = new RegExp(`\\b${exp}\\b`)
    if (importRegex.test(content)) {
      // Count actual usage (not in import line)
      const lines = content.split('\n')
      for (const line of lines) {
        if (!line.includes('import') && !line.includes('export') && importRegex.test(line)) {
          usage[exp]++
          break
        }
      }
    }
  }
}

console.log('=== flag-utils exports usage ===')
for (const exp of flagUtilsExports) {
  console.log(`${exp}: ${usage[exp]}`)
}

console.log('\n=== ctf-adapter-opencode exports usage ===')
for (const exp of adapterExports) {
  console.log(`${exp}: ${usage[exp]}`)
}
