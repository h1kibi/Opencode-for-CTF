import { tool } from "@opencode-ai/plugin"
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { directoryFromContext, resolveInsideWorkspace, workspaceRootFromContext } from "../lib/workspace-path.ts"

/**
 * Session-state invariant check + explicit resync for locked PWN runtime
 * profiles (roadmap W1 resync/invariant primitives).
 *
 * A locked session (ctf-pwn-linux-session) is only trustworthy while its
 * invariants hold: the referenced files exist and their content hashes match
 * the baseline recorded at lock time. When a long interaction desyncs — file
 * replaced, libc swapped, loader moved — silently continuing on the stale
 * profile produces corrupted observations that look like exploit failures.
 * This tool makes drift explicit (`action=check`) and provides a single,
 * audited way to re-baseline (`action=resync`) instead of ad-hoc edits.
 */

type SessionPayload = {
  schema_version?: string
  session_id?: string
  runtime_profile_id?: string
  binary?: string
  libc?: string
  ld?: string
  arch?: string
  libc_version?: string
  remote?: { host?: string; port?: string }
  invariant_baseline?: {
    binary_sha256?: string
    libc_sha256?: string
    ld_sha256?: string
    recorded_at?: string
  }
  resync_history?: Array<{ at: string; changed: string[]; reason: string }>
}

export type InvariantReport = {
  invariant: string
  status: "ok" | "drift" | "unknown"
  detail: string
}

async function fileHash(abs: string): Promise<string> {
  try {
    return createHash("sha256")
      .update(await readFile(abs))
      .digest("hex")
  } catch {
    return ""
  }
}

async function exists(abs: string): Promise<boolean> {
  try {
    await readFile(abs)
    return true
  } catch {
    return false
  }
}

async function checkInvariants(workspace: string, payload: SessionPayload): Promise<InvariantReport[]> {
  const reports: InvariantReport[] = []
  const baseline = payload.invariant_baseline
  const checkFile = async (label: string, rel: string | undefined, expectedHash: string | undefined) => {
    if (!rel) return
    const abs = resolveInsideWorkspace(workspace, rel)
    if (!(await exists(abs))) {
      reports.push({ invariant: `${label}_present`, status: "drift", detail: `${rel} is missing` })
      return
    }
    if (!expectedHash) {
      reports.push({ invariant: `${label}_sha256`, status: "unknown", detail: `no baseline hash recorded for ${rel}` })
      return
    }
    const actual = await fileHash(abs)
    reports.push({
      invariant: `${label}_sha256`,
      status: actual === expectedHash ? "ok" : "drift",
      detail: actual === expectedHash ? `${rel} matches baseline` : `${rel} hash changed since lock`,
    })
  }
  await checkFile("binary", payload.binary, baseline?.binary_sha256)
  await checkFile("libc", payload.libc, baseline?.libc_sha256)
  await checkFile("ld", payload.ld, baseline?.ld_sha256)
  if (payload.remote?.host && !payload.remote.port) {
    reports.push({ invariant: "remote_endpoint", status: "drift", detail: "remote host set without port" })
  }
  return reports
}

export default tool({
  description:
    "Verify a locked PWN runtime session's state invariants (file presence + sha256 baseline) and explicitly re-baseline after drift. Use action=check before relying on a locked profile in a long interaction; use action=resync to re-record baselines with an audit trail instead of hand-editing the session JSON.",
  args: {
    action: tool.schema
      .enum(["check", "resync"])
      .describe("check = verify invariants; resync = re-record baselines (audited)."),
    sessionId: tool.schema.string().describe("Locked session id (file work/pwn-linux-sessions/<id>.json)."),
    outDir: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative sessions dir. Default work/pwn-linux-sessions."),
    reason: tool.schema.string().optional().describe("Why the resync is happening (required for the audit trail)."),
  },
  async execute(args, context) {
    const workspace = workspaceRootFromContext(context)
    const directory = directoryFromContext(context)
    const sessionsDir = resolveInsideWorkspace(workspace, args.outDir || "work/pwn-linux-sessions")
    const sessionPath = path.join(sessionsDir, `${args.sessionId}.json`)
    let payload: SessionPayload
    try {
      payload = JSON.parse(await readFile(sessionPath, "utf8")) as SessionPayload
    } catch {
      return `ERROR: session not found or unreadable: ${args.sessionId} (${path.relative(directory, sessionPath)})`
    }

    const reports = await checkInvariants(workspace, payload)
    const drift = reports.filter((r) => r.status === "drift")

    if (args.action === "check") {
      const lines = [
        "PWN_SESSION_DOCTOR check",
        `session: ${args.sessionId}`,
        `status: ${drift.length ? "DRIFT" : reports.some((r) => r.status === "unknown") ? "OK_WITH_UNKNOWN" : "OK"}`,
        ...reports.map((r) => `- ${r.invariant}: ${r.status} — ${r.detail}`),
      ]
      if (drift.length) {
        lines.push(
          "Drift detected: do NOT continue exploit iteration on this profile.",
          `Recover with: ctf-pwn-session-doctor action=resync sessionId=${args.sessionId} reason="<what changed and why>"`,
        )
      }
      return lines.join("\n")
    }

    // action === "resync"
    if (!args.reason?.trim()) {
      return "ERROR: resync requires a reason for the audit trail (what changed and why you are re-baselining)."
    }
    if (!drift.length && !reports.some((r) => r.status === "unknown")) {
      return "Nothing to resync: all invariants already hold. Refusing to rewrite a clean session."
    }
    const changed: string[] = []
    const next: SessionPayload = { ...payload, invariant_baseline: { ...payload.invariant_baseline } }
    for (const report of drift) {
      const label = report.invariant.replace(/_sha256$|_present$/, "")
      const rel =
        label === "binary" ? payload.binary : label === "libc" ? payload.libc : label === "ld" ? payload.ld : undefined
      if (!rel) continue
      const abs = resolveInsideWorkspace(workspace, rel)
      if (!(await exists(abs))) continue // missing files cannot be re-baselined; fix manually
      const hash = await fileHash(abs)
      ;(next.invariant_baseline as Record<string, string>)[`${label}_sha256`] = hash
      changed.push(`${label}: ${report.detail} -> re-baselined`)
    }
    if (!changed.length) {
      return [
        "ERROR: drift involves missing files or endpoint problems that resync cannot fix.",
        ...reports.filter((r) => r.status === "drift").map((r) => `- ${r.invariant}: ${r.detail}`),
        "Restore the files (or re-lock with ctf-pwn-linux-session) and re-check.",
      ].join("\n")
    }
    next.invariant_baseline!.recorded_at = new Date().toISOString()
    next.resync_history = [
      ...(payload.resync_history ?? []),
      { at: new Date().toISOString(), changed, reason: args.reason.trim() },
    ]
    await writeFile(sessionPath, JSON.stringify(next, null, 2), "utf8")

    const after = await checkInvariants(workspace, next)
    return [
      "PWN_SESSION_DOCTOR resync",
      `session: ${args.sessionId}`,
      `reason: ${args.reason.trim()}`,
      ...changed.map((c) => `- ${c}`),
      `history_entries: ${next.resync_history.length}`,
      `post-check: ${after.some((r) => r.status === "drift") ? "STILL_DRIFTING" : "OK"}`,
    ].join("\n")
  },
})
