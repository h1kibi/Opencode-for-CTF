/**
 * OpenCode compatibility is based on the host release we actually verify.
 * There is no supported host-version API, so unknown host versions remain
 * informational and never make plugin startup fatal.
 */
export const OPENCODE_COMPATIBILITY = {
  pluginPackage: "@opencode-ai/plugin",
  pluginPackageVersion: "1.19.4",
  sdkPackage: "@opencode-ai/sdk",
  sdkPackageVersion: "1.19.4",
  verifiedHostVersion: "1.19.4",
  unverifiedHostVersions: ["1.18.x"],
  unsupportedHostVersions: ["2.x"],
} as const

export const OPENCODE_COMPATIBILITY_POLICY =
  "verified against OpenCode 1.19.4; OpenCode 1.18.x is unverified; OpenCode 2.x is unsupported"

export function formatOpenCodeCompatibilityDiagnostic(): string {
  return [
    `plugin=${OPENCODE_COMPATIBILITY.pluginPackage}@${OPENCODE_COMPATIBILITY.pluginPackageVersion}`,
    `sdk=${OPENCODE_COMPATIBILITY.sdkPackage}@${OPENCODE_COMPATIBILITY.sdkPackageVersion}`,
    OPENCODE_COMPATIBILITY_POLICY,
    "host_version=unknown (host version is not detected automatically)",
  ].join("; ")
}
