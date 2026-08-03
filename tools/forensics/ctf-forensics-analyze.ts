import { tool } from "@opencode-ai/plugin"
import { open, lstat } from "node:fs/promises"
import path from "node:path"
import {
  directoryFromContext,
  resolveFromDirectoryInsideWorkspace,
  workspaceRootFromContext,
} from "../lib/workspace-path.ts"
import imageOpen from "./ctf-image-open.ts"
import mediaOpen from "./ctf-media-open.ts"
import pcapProbe from "./ctf-pcap-probe.ts"
import stegoProbe from "./ctf-stego-probe.ts"

type Route = "pcap" | "stego" | "media" | "image"

const PCAP_EXT = /\.(pcap|pcapng)$/i
const IMAGE_EXT = /\.(png|jpe?g|gif|bmp|webp|tiff?)$/i
const DOCUMENT_EXT = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|txt|md|csv|tsv|html?|xml|json|ya?ml|log)$/i
const MEDIA_OR_STEGO_EXT = /\.(wav|mp3|flac|ogg|mp4|mov|avi|zip|rar|7z|tar|gz|bz2|xz)$/i

async function readHead(target: string, bytes = 16) {
  const fh = await open(target, "r")
  try {
    const out = Buffer.alloc(bytes)
    const { bytesRead } = await fh.read(out, 0, bytes, 0)
    return out.subarray(0, bytesRead)
  } finally {
    await fh.close()
  }
}

function hasPcapMagic(head: Buffer) {
  const hex = head.subarray(0, 4).toString("hex")
  return ["d4c3b2a1", "a1b2c3d4", "4d3cb2a1", "a1b23c4d", "0a0d0d0a"].includes(hex)
}

function classify(target: string, head: Buffer, forced?: string): { route: Route; reason: string } {
  const mode = (forced ?? "auto").toLowerCase()
  if (["pcap", "stego", "media", "image"].includes(mode)) return { route: mode as Route, reason: `forced:${mode}` }

  const base = path.basename(target)
  if (PCAP_EXT.test(base) || hasPcapMagic(head)) return { route: "pcap", reason: "pcap extension or magic" }
  if (DOCUMENT_EXT.test(base)) return { route: "media", reason: "document/text extension" }
  if (IMAGE_EXT.test(base)) return { route: "stego", reason: "image extension; stego probe is the low-noise default" }
  if (MEDIA_OR_STEGO_EXT.test(base)) return { route: "stego", reason: "media/archive-like extension" }
  return { route: "stego", reason: "unknown artifact; use generic metadata/signature/string probe" }
}

export default tool({
  description:
    "CTF forensics analysis facade: route one artifact to the smallest useful pcap, stego/media, or OCR/document probe before heavy carving or manual raw-tool loops.",
  args: {
    target: tool.schema.string().describe("Workspace-relative forensics artifact path."),
    route: tool.schema.string().optional().describe("auto | pcap | stego | media | image. Default auto."),
    backend: tool.schema.string().optional().describe("For pcap route: auto | host | docker. Default auto."),
    pcapImage: tool.schema.string().optional().describe("For pcap docker route: optional Docker image override."),
    tryOcr: tool.schema
      .boolean()
      .optional()
      .describe("For media/image route: attempt OCR where relevant. Default true."),
    exif: tool.schema.boolean().optional().describe("For image route: run exiftool when available. Default true."),
    maxChars: tool.schema.number().optional().describe("For media/image route: max extracted chars. Default 12000."),
    pageStart: tool.schema.number().optional().describe("For media route: optional PDF page start."),
    pageEnd: tool.schema.number().optional().describe("For media route: optional PDF page end."),
  },
  async execute(args, context) {
    const workspace = workspaceRootFromContext(context)
    const directory = directoryFromContext(context)
    const target = resolveFromDirectoryInsideWorkspace(directory, workspace, args.target)
    const stat = await lstat(target)
    if (!stat.isFile()) throw new Error("target must be a regular file")

    const head = await readHead(target)
    const decision = classify(target, head, args.route)
    let delegated: unknown
    let next = "none"

    if (decision.route === "pcap") {
      delegated = await pcapProbe.execute(
        {
          target: args.target,
          backend: args.backend,
          image: args.pcapImage,
        },
        { directory, worktree: workspace } as never,
      )
      next = "ctf-pcap-carve (forensics-heavy) only if custom framed/encrypted payload evidence appears"
    } else if (decision.route === "media") {
      delegated = await mediaOpen.execute(
        {
          target: args.target,
          tryOcr: args.tryOcr !== false,
          exif: args.exif !== false,
          maxChars: args.maxChars ?? 12000,
          pageStart: args.pageStart,
          pageEnd: args.pageEnd,
        },
        { directory, worktree: workspace } as never,
      )
      next = "ctf-stego-probe if embedded signatures, trailing bytes, or hidden-channel clues appear"
    } else if (decision.route === "image") {
      delegated = await imageOpen.execute(
        {
          target: args.target,
          tryOcr: args.tryOcr !== false,
          exif: args.exif !== false,
          maxChars: args.maxChars ?? 12000,
        },
        { directory, worktree: workspace } as never,
      )
      next = "ctf-stego-probe if OCR/metadata do not explain the artifact"
    } else {
      delegated = await stegoProbe.execute(
        {
          target: args.target,
        },
        { directory, worktree: workspace } as never,
      )
      next = "ctf-media-open for OCR/document extraction, or forensics-heavy only after a concrete offset/channel clue"
    }

    return [
      "CTF_FORENSICS_ANALYZE:",
      `- target: ${target}`,
      `- size: ${stat.size}`,
      `- route: ${decision.route}`,
      `- route_reason: ${decision.reason}`,
      `- next_tool_hint: ${next}`,
      "- delegated_result:",
      String(delegated)
        .split(/\r?\n/)
        .map((line) => `  ${line}`)
        .join("\n"),
    ].join("\n")
  },
})
