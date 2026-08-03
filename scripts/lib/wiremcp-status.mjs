import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { parse } from "jsonc-parser"

/**
 * Shared WireMCP backend status used by both doctors. Single source of truth
 * so the install doctor and toolchain doctor cannot drift apart again.
 *
 * Returns { configured, label } where label is human-readable.
 */
export function wireMcpBackendStatus() {
  if (process.env.WIREMCP_LAUNCHER) return { configured: true, label: "env configured" }

  const configDir = process.env.OPENCODE_CONFIG_DIR || join(homedir(), ".config", "opencode")
  const bundledWireMcp = join(configDir, "opencode-for-ctf", "mcp-server", "vendor", "WireMCP", "index.js")
  if (existsSync(bundledWireMcp)) return { configured: true, label: "managed bundled backend present" }

  const configFile = existsSync(join(configDir, "opencode.jsonc"))
    ? join(configDir, "opencode.jsonc")
    : join(configDir, "opencode.json")
  if (existsSync(configFile)) {
    try {
      const config = parse(readFileSync(configFile, "utf8"), [], { allowTrailingComma: true, disallowComments: false })
      if (config?.mcp?.["wireshark-mcp"]?.enabled) return { configured: true, label: "opencode config enabled" }
    } catch {
      // The config parse error is reported by install doctor; keep this line focused on WireMCP.
    }
  }
  return { configured: false, label: "not configured (install full profile or enable mcp.wireshark-mcp)" }
}
