import { FAST_TOOL_ALLOWLIST } from "./src/agent-equipment-policy.ts"
import { toolTier } from "./src/tool-metadata.ts"

for (const toolName of FAST_TOOL_ALLOWLIST) {
  const tier = toolTier(toolName)
  if (tier !== "light" && tier !== "compat") {
    console.log(`${toolName}: ${tier}`)
  }
}
