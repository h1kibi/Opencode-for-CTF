import { tool } from "@opencode-ai/plugin"
import { spawn } from "node:child_process"
import path from "node:path"
import { existsSync } from "node:fs"

type Args = {
  target: string
  maxChars?: number
  pageStart?: number
  pageEnd?: number
  includeJson?: boolean
  ocr?: boolean
}

function isSensitivePath(input: string): boolean {
  const normalized = input.toLowerCase()
  const base = path.basename(normalized)

  if (
    base === ".env" ||
    base.startsWith(".env.") ||
    base === "id_rsa" ||
    base === "id_ed25519" ||
    base.endsWith(".pem") ||
    base.endsWith(".key") ||
    base.endsWith(".p12") ||
    base.endsWith(".pfx")
  ) {
    return true
  }

  return normalized.includes(`${path.sep}.ssh${path.sep}`) ||
    normalized.includes(`${path.sep}.gnupg${path.sep}`)
}

function assertInsideAllowedRoots(target: string, roots: string[]) {
  const resolved = path.resolve(target)
  const ok = roots.some((root) => {
    const rr = path.resolve(root)
    return resolved === rr || resolved.startsWith(rr + path.sep)
  })

  if (!ok) {
    throw new Error(
      `Refusing to read outside allowed roots. target=${resolved}, roots=${roots.join(", ")}`
    )
  }
}

export default tool({
  description:
    "Read and structure local documents such as PDF, DOCX, XLSX, PPTX, CSV, HTML, EPUB, images, archives, and text. Supports PDF page ranges, bounded output, optional OCR, and JSON metadata.",
  args: {
    target: tool.schema.string().describe("Local file path to read."),
    maxChars: tool.schema.number().optional().describe("Maximum output characters. Default: 20000."),
    pageStart: tool.schema.number().optional().describe("1-based starting page for PDF extraction."),
    pageEnd: tool.schema.number().optional().describe("1-based ending page for PDF extraction."),
    includeJson: tool.schema.boolean().optional().describe("Return structured JSON instead of Markdown."),
    ocr: tool.schema.boolean().optional().describe("Enable OCR for images or image-like documents when available."),
  },
  async execute(args: Args, context: any) {
    const target = path.resolve(context.directory, args.target)

    if (isSensitivePath(target)) {
      throw new Error(`Refusing to read sensitive file path: ${args.target}`)
    }

    const roots = Array.from(
      new Set(
        [
          context.directory,
          context.worktree,
          process.env.DOC_AGENT_WORKSPACE,
          process.env.WORKSPACE,
        ].filter(Boolean) as string[]
      )
    )

    assertInsideAllowedRoots(target, roots)

    if (!existsSync(target)) {
      throw new Error(`File not found: ${target}`)
    }

    const script = path.join(context.worktree ?? context.directory, ".opencode/tools/document_extract.py")
    if (!existsSync(script)) {
      throw new Error(`Missing helper script: ${script}`)
    }

    const payload = JSON.stringify({
      target,
      maxChars: args.maxChars ?? 20000,
      pageStart: args.pageStart,
      pageEnd: args.pageEnd,
      includeJson: args.includeJson ?? false,
      ocr: args.ocr ?? false,
    })

    return new Promise<string>((resolve, reject) => {
      const proc = spawn("python3", [script], {
        cwd: context.directory,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
        stdio: ["pipe", "pipe", "pipe"],
      })

      let stdout = ""
      let stderr = ""

      proc.stdout.on("data", (d: Buffer) => (stdout += d.toString()))
      proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()))

      proc.on("close", (code: number) => {
        if (code !== 0) {
          reject(new Error(`doc-read failed with exit code ${code}\nSTDERR:\n${stderr}\nSTDOUT:\n${stdout}`))
        } else {
          resolve(stderr.trim() ? `${stdout.trim()}\n\n[stderr]\n${stderr.trim()}` : stdout.trim())
        }
      })

      proc.on("error", (err: Error) => reject(err))
      proc.stdin.write(payload)
      proc.stdin.end()
    })
  },
})
