import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, readdirSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import ctfSafeExtract from "../tools/ctf-safe-extract.ts"
import archiveSafeExtract from "../tools/archive-safe-extract.ts"
import pwnRemoteFingerprint from "../tools/ctf-pwn-remote-fingerprint.ts"

type Ctx = { directory: string }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function findFile(root: string, name: string): string {
  for (const entry of readdirSync(root)) {
    const full = path.join(root, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      const found = findFile(full, name)
      if (found) return found
    } else if (st.isFile() && entry === name) {
      return full
    }
  }
  return ""
}

async function expectThrows(label: string, fn: () => Promise<unknown>, re: RegExp) {
  try {
    await fn()
    throw new Error(`${label}: expected throw but got success`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    assert(re.test(msg), `${label}: unexpected error message: ${msg}`)
    return `${label}: PASS (${msg})`
  }
}

async function main() {
  const context: Ctx = { directory: process.cwd() }
  const lines: string[] = []

  lines.push(
    await expectThrows(
      "ctf-safe-extract-missing-target",
      () =>
        ctfSafeExtract.execute(
          { target: "", out: "extracted", maxFiles: 10, maxBytes: 1024 * 1024, overwrite: false, flagPattern: "" },
          context as any,
        ),
      /target is required/i,
    ),
  )

  lines.push(
    await expectThrows(
      "archive-safe-extract-missing-target",
      () =>
        archiveSafeExtract.execute(
          { target: "", out: "extracted", maxFiles: 10, maxBytes: 1024 * 1024, overwrite: false },
          context as any,
        ),
      /target is required/i,
    ),
  )

  const tempRoot = mkdtempSync(path.join(tmpdir(), "opencode-tool-bug-"))
  try {
    const zipWorkdir = path.join(tempRoot, "zip-root-file")
    const extractRoot = path.join(zipWorkdir, "out")
    const archivePath = path.join(zipWorkdir, "single-file.zip")
    const payloadPath = path.join(zipWorkdir, "flag.txt")
    const payloadText = "flag{zip-root-file-ok}"
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        [
          "$ErrorActionPreference='Stop'",
          `[System.IO.Directory]::CreateDirectory(${JSON.stringify(zipWorkdir)}) | Out-Null`,
          `[System.IO.File]::WriteAllText(${JSON.stringify(payloadPath)}, ${JSON.stringify(payloadText)})`,
          `Compress-Archive -LiteralPath ${JSON.stringify(payloadPath)} -DestinationPath ${JSON.stringify(archivePath)} -Force`,
        ].join("; "),
      ],
      { stdio: "pipe" },
    )

    const zipContext: Ctx = { directory: zipWorkdir }
    const ctfOut = String(
      await ctfSafeExtract.execute(
        {
          target: "single-file.zip",
          out: "out",
          maxFiles: 50,
          maxBytes: 1024 * 1024,
          overwrite: true,
          flagPattern: "",
        },
        zipContext as any,
      ),
    )
    const archiveOut = String(
      await archiveSafeExtract.execute(
        {
          target: "single-file.zip",
          out: "out",
          maxFiles: 50,
          maxBytes: 1024 * 1024,
          overwrite: true,
        },
        zipContext as any,
      ),
    )

    const extractedPath = findFile(path.join(extractRoot, "single-file"), "flag.txt")
    assert(
      extractedPath,
      `root-level zip extraction should contain flag.txt under ${path.join(extractRoot, "single-file")}`,
    )
    const extractedText = readFileSync(extractedPath, "utf8").replace(/\r\n/g, "\n").trim()
    assert(
      extractedText === payloadText,
      [
        "root-level zip file should be extracted without parent-directory errors",
        `expected=${JSON.stringify(payloadText)}`,
        `actual=${JSON.stringify(extractedText)}`,
        `ctfOut=${JSON.stringify(ctfOut)}`,
        `archiveOut=${JSON.stringify(archiveOut)}`,
      ].join(" | "),
    )
    assert(
      /status: extracted|verdict: direct_flag|verdict: archive_extracted/i.test(ctfOut),
      `ctf-safe-extract unexpected output: ${ctfOut}`,
    )
    assert(/status: extracted/i.test(archiveOut), `archive-safe-extract unexpected output: ${archiveOut}`)
    lines.push("zip-root-single-file-extraction: PASS (ctf-safe-extract + archive-safe-extract)")
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }

  const remoteOut = await pwnRemoteFingerprint.execute(
    {
      host: "127.0.0.1",
      port: 1,
      timeoutMs: 1500,
      preReadMs: 150,
      postReadMs: 150,
      baselinePayloadText: "x",
      mutantPayloadText: "y",
      jsonOnly: true,
    },
    context as any,
  )

  const parsed = JSON.parse(String(remoteOut)) as any
  const baselineStatus = parsed?.baseline?.status
  const mutantStatus = parsed?.mutant?.status
  assert(
    baselineStatus === "connection_error",
    `remote fingerprint baseline status should be connection_error, got ${baselineStatus}`,
  )
  assert(
    mutantStatus === "connection_error",
    `remote fingerprint mutant status should be connection_error, got ${mutantStatus}`,
  )
  lines.push(`ctf-pwn-remote-fingerprint-connection-error: PASS (baseline=${baselineStatus}, mutant=${mutantStatus})`)

  console.log("tool_bug_regression_ok")
  for (const line of lines) console.log(`- ${line}`)
}

main().catch((err) => {
  console.error("tool bug regression failed:")
  console.error(err instanceof Error ? err.stack || err.message : String(err))
  process.exit(1)
})
