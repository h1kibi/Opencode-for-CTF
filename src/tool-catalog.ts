/**
 * Canonical declarations for aliases retained for compatibility.
 *
 * Keep lifecycle metadata here so alias removal can be planned in one place
 * without changing the runtime alias surface before the migration is ready.
 */
export type ToolAliasKind = "compat" | "pack"
export type ToolAliasLifecycle = "active" | "deprecated"

export type ToolAliasEntry<TTarget extends string = string> = {
  kind: ToolAliasKind
  alias: string
  target: TTarget
  owner: string
  lifecycle: ToolAliasLifecycle
  removal: {
    status: "unplanned" | "scheduled"
    targetVersion?: string
    issue?: string
  }
}

export const TOOL_ALIAS_CATALOG = Object.freeze([
  {
    kind: "compat",
    alias: "archive-safe-extract",
    target: "ctf-safe-extract",
    owner: "tooling",
    lifecycle: "active",
    removal: { status: "unplanned" },
  },
  {
    kind: "compat",
    alias: "ctf-java-analyze-pack",
    target: "ctf-java-analyze",
    owner: "java",
    lifecycle: "active",
    removal: { status: "unplanned" },
  },
  {
    kind: "compat",
    alias: "ctf-pwn-remote-check",
    target: "ctf-pwn-remote-fingerprint",
    owner: "pwn",
    lifecycle: "active",
    removal: { status: "unplanned" },
  },
  {
    kind: "compat",
    alias: "ctf-web-recon-pack",
    target: "ctf-web-analyze",
    owner: "web",
    lifecycle: "active",
    removal: { status: "unplanned" },
  },
  {
    kind: "pack",
    alias: "java-heavy",
    target: "java",
    owner: "java",
    lifecycle: "active",
    removal: { status: "unplanned" },
  },
] as const satisfies readonly ToolAliasEntry[])

export type ToolAliasCatalogEntry = (typeof TOOL_ALIAS_CATALOG)[number]
export type CompatAliasCatalogEntry = Extract<ToolAliasCatalogEntry, { kind: "compat" }>
export type PackAliasCatalogEntry = Extract<ToolAliasCatalogEntry, { kind: "pack" }>

/** Read-only filtered views for diagnostics and migration tooling. */
export const COMPAT_ALIAS_CATALOG: readonly CompatAliasCatalogEntry[] = Object.freeze(
  TOOL_ALIAS_CATALOG.filter((entry): entry is CompatAliasCatalogEntry => entry.kind === "compat"),
)
export const PACK_ALIAS_CATALOG: readonly PackAliasCatalogEntry[] = Object.freeze(
  TOOL_ALIAS_CATALOG.filter((entry): entry is PackAliasCatalogEntry => entry.kind === "pack"),
)
export const COMPAT_ALIAS_TARGETS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(COMPAT_ALIAS_CATALOG.map(({ alias, target }) => [alias, target])),
)
export const PACK_ALIAS_TARGETS: Readonly<Record<string, PackAliasCatalogEntry["target"]>> = Object.freeze(
  Object.fromEntries(PACK_ALIAS_CATALOG.map(({ alias, target }) => [alias, target])) as Record<
    string,
    PackAliasCatalogEntry["target"]
  >,
)
