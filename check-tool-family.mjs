// Check if we can derive tool family from pack
const toolName = "ctf-web-runtime-map"
const agentName = "ctf-web"

// Extract family from tool name prefix
const toolPrefix = toolName.match(/^ctf-([^-]+)-/)?.[1]
const agentSuffix = agentName.replace(/^ctf-/, "")

console.log("Tool prefix:", toolPrefix)
console.log("Agent suffix:", agentSuffix)
console.log("Match:", toolPrefix === agentSuffix)
