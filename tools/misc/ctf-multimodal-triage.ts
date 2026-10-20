import { access, mkdtemp, open, readFile, rm, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { tool, type ToolAttachment, type ToolResult } from "@opencode-ai/plugin"
import docRead from "../core/doc-read.ts"
import imageFileInfo from "../core/image-file-info.ts"
import { safeExecWithStreams } from "../lib/exec-utils.ts"
import {
  directoryFromContext,
  resolveFromDirectoryInsideWorkspace,
  workspaceRootFromContext,
} from "../lib/workspace-path.ts"

type MediaKind = "image" | "video" | "audio" | "document" | "unknown"
type Capability = { available: boolean; detail?: string }
type OcrCapability = Capability & { requested: string; effective?: string; languages?: string[] }
type BarcodeInput = { path: string; label: string; timestamp?: number }
type BarcodeProbe = Capability & { decoder?: string; results: string[] }
type AttachmentBudget = {
  limit: number
  used: number
  skipped: Array<{ filename: string; bytes: number; reason: string }>
}
type Artifact = {
  kind: "original" | "thumbnail" | "image_tile" | "channel_preview" | "video_frame" | "waveform" | "spectrogram"
  filename: string
  mime: string
  attached: boolean
  bytes?: number
  reason?: string
  timestamp?: number
}

type Ffprobe = {
  format?: { duration?: string; format_name?: string; bit_rate?: string }
  streams?: Array<{
    codec_type?: string
    codec_name?: string
    width?: number
    height?: number
    duration?: string
    r_frame_rate?: string
    avg_frame_rate?: string
    sample_rate?: string
    channels?: number
    bit_rate?: string
    tags?: Record<string, string>
    nb_frames?: string
  }>
}

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".webp": "image/webp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
}
const VIDEO_MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".gif": "image/gif",
}
const AUDIO_MIME: Record<string, string> = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".opus": "audio/opus",
}
const DOCUMENT_EXTENSIONS = new Set([
  ".pdf",
  ".docx",
  ".xlsx",
  ".pptx",
  ".csv",
  ".tsv",
  ".html",
  ".htm",
  ".epub",
  ".txt",
  ".md",
  ".json",
  ".xml",
  ".yaml",
  ".yml",
  ".log",
])
const DEFAULT_MAX_FRAMES = 6
const MAX_FRAMES_LIMIT = 12
const DEFAULT_MAX_IMAGE_TILES = 4
const MAX_IMAGE_TILES = 4
const LARGE_IMAGE_DIMENSION = 2400
const DEFAULT_MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024
const DEFAULT_MAX_TOTAL_ATTACHMENT_BYTES = 16 * 1024 * 1024
const MAX_TOTAL_ATTACHMENT_BYTES = 32 * 1024 * 1024
const MAX_DATA_URL_BYTES = 8 * 1024 * 1024
const DEFAULT_OCR_LANGUAGE = "eng"
const MAX_OCR_LANGUAGE_LENGTH = 80

function finiteNumber(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) ? number : undefined
}

function ratio(value: string | undefined): number | undefined {
  if (!value || !value.includes("/")) return finiteNumber(value)
  const [a, b] = value.split("/").map(Number)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return undefined
  return a / b
}

export function boundedSamplingPositions(
  startTime: number,
  endTime: number | undefined,
  count: number,
  interval: number | undefined,
): number[] {
  const safeCount = Math.max(1, Math.min(MAX_FRAMES_LIMIT, Math.floor(count)))
  const positions: number[] = []
  const pushUnique = (value: number) => {
    if (!Number.isFinite(value)) return
    const rounded = Math.round(Math.max(startTime, value) * 1000) / 1000
    if (endTime !== undefined && rounded > endTime + 0.0005) return
    if (!positions.some((existing) => Math.abs(existing - rounded) < 0.0005)) positions.push(rounded)
  }

  if (interval !== undefined) {
    for (let index = 0; index < safeCount; index++) {
      const candidate = startTime + Math.max(0, interval) * index
      if (endTime !== undefined && candidate > endTime + 0.0005) break
      pushUnique(candidate)
    }
  } else if (endTime !== undefined && endTime > startTime && safeCount > 1) {
    for (let index = 0; index < safeCount; index++) {
      pushUnique(startTime + ((endTime - startTime) * index) / (safeCount - 1))
    }
  } else {
    pushUnique(startTime)
  }

  return positions.length ? positions : [Math.max(0, startTime)]
}

function detectKind(target: string, sample: Buffer): MediaKind {
  const ext = path.extname(target).toLowerCase()
  if (sample.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image"
  if (sample.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image"
  if (sample.subarray(0, 6).toString("ascii") === "GIF87a" || sample.subarray(0, 6).toString("ascii") === "GIF89a")
    return "image"
  if (sample.subarray(0, 4).toString("ascii") === "RIFF" && sample.subarray(8, 12).toString("ascii") === "WAVE")
    return "audio"
  if (sample.subarray(0, 4).toString("ascii") === "OggS" || sample.subarray(0, 4).toString("ascii") === "fLaC")
    return "audio"
  if (sample.subarray(0, 3).toString("ascii") === "ID3" || (sample[0] === 0xff && (sample[1] & 0xe0) === 0xe0))
    return "audio"
  if (sample.subarray(0, 4).toString("ascii") === "%PDF") return "document"
  if (sample.subarray(0, 4).toString("ascii") === "RIFF") return "video"
  if (sample.length >= 12 && sample.subarray(4, 8).toString("ascii") === "ftyp") return "video"
  if (IMAGE_MIME[ext]) return "image"
  if (VIDEO_MIME[ext] && ext !== ".gif") return "video"
  if (AUDIO_MIME[ext]) return "audio"
  if (DOCUMENT_EXTENSIONS.has(ext)) return "document"
  return "unknown"
}

function reviewChecklist(kind: MediaKind): string[] {
  if (kind === "image") {
    return [
      "Read visible text from the original and each attached ROI/preview; separate OCR candidates from visually verified text.",
      "Inspect corners, borders, repeated pixels, color/alpha structure, QR/barcode-like geometry, and suspicious blank regions.",
      "Correlate dimensions, EXIF, trailing-data hints, and visual anomalies before invoking stego or QR extraction.",
    ]
  }
  if (kind === "video") {
    return [
      "Compare frames in chronological order and record transient text, QR/barcode geometry, scene cuts, overlays, and anomalous frame-local regions.",
      "Treat OCR as a timestamped candidate; if a clue is localized, rerun with startTime plus segmentDuration or a bounded frameInterval.",
      "Inspect audio waveform/spectrogram attachments when present before assuming the clue is purely visual.",
    ]
  }
  if (kind === "audio") {
    return [
      "Inspect waveform shape and spectrogram axes together; distinguish speech, Morse, DTMF, FSK/PSK-like bands, silence, and clipped samples.",
      "Check duration, sample rate, channels, codec, and metadata tags before decoding or resampling.",
      "Treat transcription as optional evidence and verify any candidate against the signal or an independent decoder.",
    ]
  }
  if (kind === "document") {
    return [
      "Read extracted text and structured metadata, then enumerate embedded media for a separate multimodal pass.",
    ]
  }
  return ["Identify the container signature first; do not force a media decoder from the filename alone."]
}

function mimeFor(target: string, kind: MediaKind): string {
  const ext = path.extname(target).toLowerCase()
  if (IMAGE_MIME[ext]) return IMAGE_MIME[ext]
  if (VIDEO_MIME[ext] && kind === "video") return VIDEO_MIME[ext]
  if (AUDIO_MIME[ext]) return AUDIO_MIME[ext]
  if (kind === "image") return "image/*"
  if (kind === "video") return "video/*"
  if (kind === "audio") return "audio/*"
  return "application/octet-stream"
}

async function resolveMediaCommand(cmd: string): Promise<string> {
  const candidates = [cmd]
  if (process.platform === "win32") {
    const programFiles = process.env.ProgramFiles ?? "C:\\Program Files"
    const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)"
    const localAppData = process.env.LOCALAPPDATA
    if (cmd === "tesseract") {
      candidates.push(
        path.join(programFiles, "Tesseract-OCR", "tesseract.exe"),
        path.join(programFilesX86, "Tesseract-OCR", "tesseract.exe"),
        ...(localAppData ? [path.join(localAppData, "Tesseract-OCR", "tesseract.exe")] : []),
      )
    }
    if (cmd === "ffmpeg" || cmd === "ffprobe") {
      candidates.push(
        path.join("C:\\Tools", "ctf-bin", `${cmd}.exe`),
        path.join(programFiles, "ffmpeg", "bin", `${cmd}.exe`),
      )
    }
    if (cmd === "zbarimg") {
      candidates.push(
        path.join("C:\\Tools", "ctf-bin", "zbarimg.exe"),
        path.join(programFiles, "ZBar", "bin", "zbarimg.exe"),
        path.join(programFiles, "ZBar", "zbarimg.exe"),
      )
    }
  }
  for (const candidate of candidates) {
    if (candidate === cmd) continue
    try {
      await access(candidate)
      return candidate
    } catch {
      // Continue until PATH or another known installation is available.
    }
  }
  return cmd
}

async function runOptional(cmd: string, args: string[], cwd: string, timeoutMs = 20_000) {
  const resolved = await resolveMediaCommand(cmd)
  const result = await safeExecWithStreams(resolved, args, { cwd, timeoutMs, maxBuffer: 2 * 1024 * 1024 })
  return {
    ...result,
    text: `${result.stdout}${result.stderr ? `\n${result.stderr}` : ""}`.trim(),
  }
}

function normalizeOcrLanguage(value: unknown): string {
  const candidate = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_OCR_LANGUAGE
  if (candidate.length > MAX_OCR_LANGUAGE_LENGTH || !/^[A-Za-z0-9_.+,-]+$/.test(candidate)) return DEFAULT_OCR_LANGUAGE
  return candidate
}

async function prepareOcr(language: unknown, cwd: string): Promise<OcrCapability> {
  const requested = normalizeOcrLanguage(language)
  const result = await runOptional("tesseract", ["--list-langs"], cwd, 10_000)
  if (!result.ok) {
    return {
      available: false,
      requested,
      effective: requested,
      detail: result.text.slice(0, 400) || "tesseract unavailable; OCR cannot be verified",
      languages: [],
    }
  }
  const languages = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[A-Za-z0-9_.-]+$/.test(line) && line !== "List of available languages in ")
  const requestedParts = requested.split("+")
  const allRequestedAvailable = requestedParts.every((part) => languages.includes(part))
  if (allRequestedAvailable) return { available: true, requested, effective: requested, languages }
  const fallback = languages.includes(DEFAULT_OCR_LANGUAGE) ? DEFAULT_OCR_LANGUAGE : undefined
  return {
    available: Boolean(fallback),
    requested,
    effective: fallback,
    languages,
    detail: fallback
      ? `requested OCR language ${requested} is unavailable; using ${fallback}`
      : `requested OCR language ${requested} is unavailable and no ${DEFAULT_OCR_LANGUAGE} fallback is installed`,
  }
}

function ocrArgs(language: string | undefined): string[] {
  return ["--psm", "6", ...(language ? ["-l", language] : [])]
}

async function probeBarcodes(inputPaths: BarcodeInput[], cwd: string, maxChars: number): Promise<BarcodeProbe> {
  const version = await runOptional("zbarimg", ["--version"], cwd, 8_000)
  if (!version.ok) {
    return { available: false, results: [], detail: version.text.slice(0, 400) || "zbarimg unavailable" }
  }
  const results: string[] = []
  for (const input of inputPaths.slice(0, 13)) {
    const decoded = await runOptional("zbarimg", ["--quiet", "--raw", input.path], cwd, 12_000)
    const text = decoded.stdout.trim()
    if (text) {
      const source = input.timestamp === undefined ? input.label : `${input.label} @ ${input.timestamp.toFixed(3)}s`
      results.push(`${source}: ${text.slice(0, maxChars)}`)
    }
  }
  return {
    available: true,
    decoder: "zbarimg",
    results,
    detail: results.length
      ? `decoded ${results.length} barcode/QR candidate(s)`
      : "decoder available; no barcode/QR payload was returned",
  }
}

async function readFfprobe(target: string, cwd: string): Promise<{ data?: Ffprobe; capability: Capability }> {
  const result = await runOptional(
    "ffprobe",
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", target],
    cwd,
    15_000,
  )
  if (!result.ok)
    return { capability: { available: false, detail: result.text.slice(0, 400) || "ffprobe unavailable" } }
  try {
    return { data: JSON.parse(result.stdout) as Ffprobe, capability: { available: true } }
  } catch {
    return { capability: { available: false, detail: "ffprobe returned non-JSON output" } }
  }
}

function wavFallback(sample: Buffer, size: number) {
  if (sample.length < 28 || sample.subarray(0, 4).toString("ascii") !== "RIFF") return undefined
  const channels = sample.readUInt16LE(22)
  const sampleRate = sample.readUInt32LE(24)
  const bitsPerSample = sample.length >= 36 ? sample.readUInt16LE(34) : undefined
  const byteRate = sample.length >= 32 ? sample.readUInt32LE(28) : undefined
  const duration = byteRate && byteRate > 0 ? size / byteRate : undefined
  return { channels, sampleRate, bitsPerSample, duration }
}

async function attachmentFromFile(
  filePath: string,
  mime: string,
  filename: string,
  maxBytes: number,
  budget?: AttachmentBudget,
): Promise<{ attachment?: ToolAttachment; bytes: number; reason?: string }> {
  const fileStat = await stat(filePath)
  if (!fileStat.isFile()) return { bytes: 0, reason: "not a regular file" }
  if (fileStat.size > Math.min(maxBytes, MAX_DATA_URL_BYTES)) {
    const reason = `exceeds attachment cap (${Math.min(maxBytes, MAX_DATA_URL_BYTES)} bytes)`
    if (budget) budget.skipped.push({ filename, bytes: fileStat.size, reason })
    return { bytes: fileStat.size, reason }
  }
  const remaining = budget ? budget.limit - budget.used : undefined
  if (budget && remaining !== undefined && fileStat.size > remaining) {
    const reason = `exceeds total attachment budget (remaining ${Math.max(0, remaining)} bytes)`
    budget.skipped.push({ filename, bytes: fileStat.size, reason })
    return { bytes: fileStat.size, reason }
  }
  const data = await readFile(filePath)
  if (budget) budget.used += data.length
  return {
    bytes: data.length,
    attachment: {
      type: "file",
      mime,
      url: `data:${mime};base64,${data.toString("base64")}`,
      filename,
    },
  }
}

function parseImageInfo(text: string) {
  const kind = text.match(/^kind:\s*(.+)$/m)?.[1]?.trim()
  const size = finiteNumber(text.match(/^size:\s*(\d+)$/m)?.[1])
  const dimensions = text.match(/^dimensions:\s*(\d+)x(\d+)$/m)
  return {
    format: kind,
    size,
    width: dimensions ? Number(dimensions[1]) : undefined,
    height: dimensions ? Number(dimensions[2]) : undefined,
    raw: text,
  }
}

function detectImageChannels(
  target: string,
  sample: Buffer,
): { format?: string; colorModel?: string; alpha: boolean; alphaReason?: string } {
  const ext = path.extname(target).toLowerCase()
  if (
    sample.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) &&
    sample.length >= 26
  ) {
    const colorType = sample[25]
    const models: Record<number, string> = { 0: "gray", 2: "rgb", 3: "indexed", 4: "gray+alpha", 6: "rgba" }
    const alpha = colorType === 4 || colorType === 6 || sample.includes(Buffer.from("tRNS", "ascii"))
    return {
      format: "png",
      colorModel: models[colorType] ?? `unknown(${colorType})`,
      alpha,
      alphaReason: alpha ? "PNG color type or tRNS transparency" : undefined,
    }
  }
  if (
    ext === ".gif" &&
    (sample.includes(Buffer.from("NETSCAPE", "ascii")) || sample.includes(Buffer.from([0x21, 0xf9, 0x04])))
  ) {
    return {
      format: "gif",
      colorModel: "indexed",
      alpha: true,
      alphaReason: "GIF transparency/graphic-control extension may be present",
    }
  }
  if (ext === ".jpg" || ext === ".jpeg") return { format: "jpeg", colorModel: "rgb", alpha: false }
  return { format: ext.replace(/^\./, "") || undefined, alpha: false }
}

async function inspectImage(
  target: string,
  args: {
    ocr: boolean
    ocrLanguage: string
    barcode: boolean
    channelPreviews: boolean
    sample: Buffer
    maxChars: number
    maxAttachmentBytes: number
    imageTiles: boolean
    maxImageTiles: number
    budget: AttachmentBudget
  },
  context: { directory: string; worktree: string },
  tempDir: string,
) {
  const infoText = String(
    await imageFileInfo.execute({ target: path.relative(context.directory, target), exif: true }, context as never),
  )
  const info = parseImageInfo(infoText)
  const attachments: ToolAttachment[] = []
  const artifacts: Artifact[] = []
  const observations: string[] = []
  const tileOcr: string[] = []
  const barcodeInputs: BarcodeInput[] = [{ path: target, label: path.basename(target) }]
  const channelInfo = detectImageChannels(target, args.sample)
  const ocrCapability: OcrCapability = args.ocr
    ? await prepareOcr(args.ocrLanguage, context.directory)
    : { available: false, requested: normalizeOcrLanguage(args.ocrLanguage), detail: "not requested", languages: [] }
  const original = await attachmentFromFile(
    target,
    mimeFor(target, "image"),
    path.basename(target),
    args.maxAttachmentBytes,
    args.budget,
  )
  if (original.attachment) {
    attachments.push(original.attachment)
    artifacts.push({
      kind: "original",
      filename: path.basename(target),
      mime: original.attachment.mime,
      attached: true,
      bytes: original.bytes,
    })
  } else {
    const preview = path.join(tempDir, "image-preview.png")
    const previewResult = await runOptional(
      "ffmpeg",
      ["-y", "-i", target, "-vf", "scale=1600:1600:force_original_aspect_ratio=decrease", "-frames:v", "1", preview],
      context.directory,
      20_000,
    )
    if (previewResult.ok) {
      const previewAttachment = await attachmentFromFile(
        preview,
        "image/png",
        `${path.basename(target)}.preview.png`,
        args.maxAttachmentBytes,
        args.budget,
      )
      if (previewAttachment.attachment) attachments.push(previewAttachment.attachment)
      artifacts.push({
        kind: "thumbnail",
        filename: `${path.basename(target)}.preview.png`,
        mime: "image/png",
        attached: Boolean(previewAttachment.attachment),
        bytes: previewAttachment.bytes,
        reason: previewAttachment.reason,
      })
    } else {
      artifacts.push({
        kind: "original",
        filename: path.basename(target),
        mime: mimeFor(target, "image"),
        attached: false,
        bytes: original.bytes,
        reason: original.reason || "preview generation unavailable",
      })
    }
  }

  if (args.channelPreviews && channelInfo.alpha) {
    const alphaPath = path.join(tempDir, "image-alpha.png")
    const alphaResult = await runOptional(
      "ffmpeg",
      [
        "-y",
        "-i",
        target,
        "-vf",
        "format=rgba,alphaextract,scale=1600:1600:force_original_aspect_ratio=decrease",
        "-frames:v",
        "1",
        alphaPath,
      ],
      context.directory,
      25_000,
    )
    const alphaFilename = `${path.basename(target)}.alpha.png`
    if (alphaResult.ok) {
      const alphaAttachment = await attachmentFromFile(
        alphaPath,
        "image/png",
        alphaFilename,
        args.maxAttachmentBytes,
        args.budget,
      )
      artifacts.push({
        kind: "channel_preview",
        filename: alphaFilename,
        mime: "image/png",
        attached: Boolean(alphaAttachment.attachment),
        bytes: alphaAttachment.bytes,
        reason: alphaAttachment.reason,
      })
      if (alphaAttachment.attachment) attachments.push(alphaAttachment.attachment)
      observations.push(
        "Generated an alpha-channel preview; inspect it for transparent text, masks, or hidden payload geometry separately from the visible composite.",
      )
    } else {
      artifacts.push({
        kind: "channel_preview",
        filename: alphaFilename,
        mime: "image/png",
        attached: false,
        reason: alphaResult.text.slice(0, 400) || "alpha preview generation failed",
      })
      observations.push(
        "The image appears to contain transparency, but the alpha-channel preview could not be generated.",
      )
    }
  }

  const shouldTile =
    args.imageTiles &&
    args.maxImageTiles > 0 &&
    ((info.width ?? 0) >= LARGE_IMAGE_DIMENSION || (info.height ?? 0) >= LARGE_IMAGE_DIMENSION)
  let tileAttached = 0
  let tileAttempted = false
  if (shouldTile) {
    tileAttempted = true
    const tilePositions = [
      ["top-left", "0", "0"],
      ["top-right", "iw/2", "0"],
      ["bottom-left", "0", "ih/2"],
      ["bottom-right", "iw/2", "ih/2"],
    ].slice(0, args.maxImageTiles)
    for (const [label, x, y] of tilePositions) {
      const tilePath = path.join(tempDir, `image-tile-${label}.png`)
      const tileResult = await runOptional(
        "ffmpeg",
        [
          "-y",
          "-i",
          target,
          "-vf",
          `crop=iw/2:ih/2:${x}:${y},scale=1600:1600:force_original_aspect_ratio=decrease`,
          "-frames:v",
          "1",
          tilePath,
        ],
        context.directory,
        25_000,
      )
      if (!tileResult.ok) break
      const tileFilename = `${path.basename(target)}.${label}.png`
      barcodeInputs.push({ path: tilePath, label: tileFilename })
      const tileAttachment = await attachmentFromFile(
        tilePath,
        "image/png",
        tileFilename,
        args.maxAttachmentBytes,
        args.budget,
      )
      artifacts.push({
        kind: "image_tile",
        filename: tileFilename,
        mime: "image/png",
        attached: Boolean(tileAttachment.attachment),
        bytes: tileAttachment.bytes,
        reason: tileAttachment.reason,
      })
      if (tileAttachment.attachment) {
        attachments.push(tileAttachment.attachment)
        tileAttached++
      }
      if (args.ocr) {
        const tileOcrResult = await runOptional(
          "tesseract",
          [tilePath, "stdout", ...ocrArgs(ocrCapability.effective)],
          context.directory,
          15_000,
        )
        if (tileOcrResult.ok && tileOcrResult.stdout.trim()) {
          tileOcr.push(`${label}: ${tileOcrResult.stdout.trim().slice(0, args.maxChars)}`)
        }
      }
    }
    if (tileAttached > 0)
      observations.push(
        `Generated ${tileAttached} bounded large-image ROI tile(s); inspect small text and corner regions separately from the full image.`,
      )
    else
      observations.push(
        "Large-image ROI tiling was requested, but ffmpeg was unavailable or the tile evidence exceeded the attachment budget.",
      )
  }

  let ocr: string | undefined
  if (args.ocr) {
    const ocrResult = await runOptional(
      "tesseract",
      [target, "stdout", ...ocrArgs(ocrCapability.effective)],
      context.directory,
      20_000,
    )
    if (ocrResult.ok && ocrResult.stdout.trim()) {
      ocr = ocrResult.stdout.trim().slice(0, args.maxChars)
    } else {
      try {
        ocr = String(
          await docRead.execute(
            { target: path.relative(context.directory, target), includeJson: true, ocr: true, maxChars: args.maxChars },
            context as never,
          ),
        ).slice(0, args.maxChars)
      } catch {
        ocr = undefined
      }
    }
    if (ocr)
      observations.push(
        `OCR output was requested with language ${ocrCapability.effective ?? ocrCapability.requested}; inspect it together with the attached image.`,
      )
  }
  const barcode = args.barcode
    ? await probeBarcodes(barcodeInputs, context.directory, args.maxChars)
    : ({ available: false, results: [], detail: "not requested" } satisfies BarcodeProbe)
  if (/qr|barcode|datamatrix|aztec/i.test(info.raw) || barcode.results.length)
    observations.push(
      "Metadata or a dedicated barcode probe indicates QR/barcode evidence; verify decoded payloads against the visual regions before treating them as a flag.",
    )
  if (info.raw.includes("trailing data") || info.raw.includes("embedded zip"))
    observations.push(
      "Image metadata indicates possible appended or embedded data; preserve the visual evidence before stego extraction.",
    )
  if (!observations.length)
    observations.push(
      "Use the attached image for visual inspection; metadata alone is not sufficient to rule out visual steganography.",
    )

  return {
    dimensions: { width: info.width, height: info.height },
    channels: channelInfo,
    largeImageTiling: { attempted: tileAttempted, attached: tileAttached, maxTiles: args.maxImageTiles },
    format: info.format,
    ocr,
    tileOcr: tileOcr.length ? tileOcr.join("\n") : undefined,
    barcode: { decoder: barcode.decoder, results: barcode.results },
    info: info.raw,
    artifacts,
    attachments,
    observations,
    capabilities: {
      imageAttachment: { available: attachments.length > 0 },
      ocr: { ...ocrCapability, available: ocrCapability.available || Boolean(ocr) || tileOcr.length > 0 },
      barcode: { available: barcode.available, detail: barcode.detail },
    },
  }
}

async function inspectVideo(
  target: string,
  args: {
    maxFrames: number
    frameInterval?: number
    startTime?: number
    segmentDuration?: number
    ocr: boolean
    ocrLanguage: string
    barcode: boolean
    maxChars: number
    maxAttachmentBytes: number
    analyzeAudio: boolean
    budget: AttachmentBudget
  },
  context: { directory: string; worktree: string },
  tempDir: string,
) {
  const probe = await readFfprobe(target, context.directory)
  const streams = probe.data?.streams ?? []
  const video = streams.find((stream) => stream.codec_type === "video")
  const audio = streams.find((stream) => stream.codec_type === "audio")
  const subtitleCount = streams.filter((stream) => stream.codec_type === "subtitle").length
  const duration = finiteNumber(probe.data?.format?.duration) ?? finiteNumber(video?.duration) ?? 0
  const frameCount = finiteNumber(video?.nb_frames)
  const fps = ratio(video?.avg_frame_rate) ?? ratio(video?.r_frame_rate)
  const attachments: ToolAttachment[] = []
  const artifacts: Artifact[] = []
  const observations: string[] = []
  let frameExtractionAvailable = false

  const frameCountToExtract = Math.max(1, Math.min(MAX_FRAMES_LIMIT, args.maxFrames))
  const startTime = Math.max(0, finiteNumber(args.startTime) ?? 0)
  const requestedSegmentDuration =
    args.segmentDuration === undefined ? undefined : Math.max(0, finiteNumber(args.segmentDuration) ?? 0)
  const segmentEnd =
    duration > 0
      ? Math.min(duration, startTime + (requestedSegmentDuration ?? Math.max(0, duration - startTime)))
      : requestedSegmentDuration !== undefined
        ? startTime + requestedSegmentDuration
        : undefined
  const interval = args.frameInterval === undefined ? undefined : Math.max(0, finiteNumber(args.frameInterval) ?? 0)
  const positions = boundedSamplingPositions(startTime, segmentEnd, frameCountToExtract, interval)
  if (duration > 0 && startTime >= duration)
    observations.push(
      `Requested video startTime ${startTime}s is at or beyond the ${duration}s duration; frame extraction may be empty.`,
    )
  const ocrCapability: OcrCapability = args.ocr
    ? await prepareOcr(args.ocrLanguage, context.directory)
    : { available: false, requested: normalizeOcrLanguage(args.ocrLanguage), detail: "not requested", languages: [] }
  const barcodeInputs: BarcodeInput[] = []
  const ocrResults: string[] = []
  for (let index = 0; index < positions.length; index++) {
    const framePath = path.join(tempDir, `frame-${String(index + 1).padStart(2, "0")}.png`)
    const frameResult = await runOptional(
      "ffmpeg",
      [
        "-y",
        "-ss",
        String(Math.max(0, positions[index])),
        "-i",
        target,
        "-vf",
        "scale=1600:1600:force_original_aspect_ratio=decrease",
        "-frames:v",
        "1",
        framePath,
      ],
      context.directory,
      25_000,
    )
    if (!frameResult.ok) {
      if (!probe.capability.available)
        observations.push("ffprobe and ffmpeg are unavailable; video metadata/frame extraction could not run.")
      else
        observations.push(
          `Frame extraction stopped at frame ${index + 1}; preserve the video and use an external frame viewer if needed.`,
        )
      break
    }
    frameExtractionAvailable = true
    barcodeInputs.push({
      path: framePath,
      label: `${path.basename(target)}.frame-${index + 1}.png`,
      timestamp: positions[index],
    })
    const frameAttachment = await attachmentFromFile(
      framePath,
      "image/png",
      `${path.basename(target)}.frame-${index + 1}.png`,
      args.maxAttachmentBytes,
      args.budget,
    )
    artifacts.push({
      kind: "video_frame",
      filename: `${path.basename(target)}.frame-${index + 1}.png`,
      mime: "image/png",
      attached: Boolean(frameAttachment.attachment),
      bytes: frameAttachment.bytes,
      reason: frameAttachment.reason,
      timestamp: positions[index],
    })
    if (frameAttachment.attachment) attachments.push(frameAttachment.attachment)
    if (args.ocr) {
      const ocrResult = await runOptional(
        "tesseract",
        [framePath, "stdout", ...ocrArgs(ocrCapability.effective)],
        context.directory,
        15_000,
      )
      if (ocrResult.ok && ocrResult.stdout.trim())
        ocrResults.push(`frame ${index + 1}: ${ocrResult.stdout.trim().slice(0, args.maxChars)}`)
    }
  }
  const barcode = args.barcode
    ? await probeBarcodes(barcodeInputs, context.directory, args.maxChars)
    : ({ available: false, results: [], detail: "not requested" } satisfies BarcodeProbe)
  let audioSignalCapability: Capability = audio
    ? { available: false, detail: "ffmpeg waveform/spectrogram not generated" }
    : { available: false, detail: "video has no audio stream" }
  const signalStartTime = startTime
  const signalDuration = requestedSegmentDuration
  if (audio && args.analyzeAudio) {
    const makeSignalImage = async (kind: "waveform" | "spectrogram", filter: string, filename: string) => {
      const outputPath = path.join(tempDir, filename)
      const seek = signalStartTime > 0 ? ["-ss", String(signalStartTime)] : []
      const durationArgs = signalDuration !== undefined ? ["-t", String(signalDuration)] : []
      const signalResult = await runOptional(
        "ffmpeg",
        [
          "-y",
          ...seek,
          "-i",
          target,
          ...durationArgs,
          "-filter_complex",
          `[0:a]${filter}[v]`,
          "-map",
          "[v]",
          "-frames:v",
          "1",
          outputPath,
        ],
        context.directory,
        30_000,
      )
      if (!signalResult.ok) {
        audioSignalCapability = { available: false, detail: signalResult.text.slice(0, 400) || "ffmpeg unavailable" }
        return
      }
      const artifact = await attachmentFromFile(
        outputPath,
        "image/png",
        `${path.basename(target)}.${filename}`,
        args.maxAttachmentBytes,
        args.budget,
      )
      artifacts.push({
        kind,
        filename: `${path.basename(target)}.${filename}`,
        mime: "image/png",
        attached: Boolean(artifact.attachment),
        bytes: artifact.bytes,
        reason: artifact.reason,
      })
      if (artifact.attachment) {
        attachments.push(artifact.attachment)
        audioSignalCapability = { available: true }
      } else if (artifact.reason) {
        audioSignalCapability = { available: false, detail: artifact.reason }
      }
    }
    await makeSignalImage("waveform", "showwavespic=s=1600x400:colors=white", "audio-waveform.png")
    await makeSignalImage(
      "spectrogram",
      "showspectrumpic=s=1600x900:legend=disabled:color=rainbow",
      "audio-spectrogram.png",
    )
  }
  if (subtitleCount > 0)
    observations.push(
      `Detected ${subtitleCount} subtitle stream(s); extract/render subtitles only after checking the frame evidence.`,
    )
  if (audio) {
    if (audioSignalCapability.available)
      observations.push(
        "Video audio was rendered as bounded waveform/spectrogram attachments; inspect them before speech or signal decoding.",
      )
    else if (args.analyzeAudio)
      observations.push(
        "Video contains an audio stream, but waveform/spectrogram rendering was unavailable or over the attachment budget.",
      )
    else
      observations.push(
        "Video contains an audio stream; rerun with analyzeAudio enabled for waveform/spectrogram evidence.",
      )
  }
  if (ocrResults.length)
    observations.push(
      `Frame OCR produced text candidates with language ${ocrCapability.effective ?? ocrCapability.requested}; treat them as untrusted evidence and verify against the attached frames.`,
    )
  if (barcode.results.length)
    observations.push(
      "A dedicated barcode probe returned payload candidates from one or more sampled frames; verify the timestamp and visible geometry before decoding further.",
    )
  if (!observations.length)
    observations.push(
      "Inspect the bounded key-frame set first; do not scan every frame unless a temporal clue is established.",
    )

  return {
    duration: duration || undefined,
    width: video?.width,
    height: video?.height,
    fps,
    frameCount,
    codec: video?.codec_name,
    audio: audio
      ? { codec: audio.codec_name, sampleRate: finiteNumber(audio.sample_rate), channels: audio.channels }
      : undefined,
    subtitleCount,
    sampling: {
      mode: interval !== undefined ? "interval" : "uniform",
      startTime,
      segmentDuration: requestedSegmentDuration,
      endTime: segmentEnd,
      interval,
      positions,
    },
    signalWindow: { startTime: signalStartTime, duration: signalDuration, endTime: segmentEnd },
    ocr: ocrResults.length ? ocrResults.join("\n") : undefined,
    barcode: { decoder: barcode.decoder, results: barcode.results },
    artifacts,
    attachments,
    observations,
    capabilities: {
      ffprobe: probe.capability,
      ffmpeg: {
        available: frameExtractionAvailable || audioSignalCapability.available,
        detail:
          frameExtractionAvailable || audioSignalCapability.available
            ? undefined
            : "no bounded frame or signal render succeeded",
      },
      ocr: { ...ocrCapability, available: ocrCapability.available || ocrResults.length > 0 },
      barcode: { available: barcode.available, detail: barcode.detail },
      audioSignals: audioSignalCapability,
    },
  }
}

type SilenceSegment = { startTime: number; endTime?: number; duration?: number }
type SignalAnalysis = Capability & { silenceSegments: SilenceSegment[]; candidatePatterns: string[] }

async function analyzeAudioSignal(
  target: string,
  cwd: string,
  startTime: number,
  duration: number | undefined,
): Promise<SignalAnalysis> {
  const seek = startTime > 0 ? ["-ss", String(startTime)] : []
  const durationArgs = duration !== undefined ? ["-t", String(duration)] : []
  const result = await runOptional(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "info",
      ...seek,
      "-i",
      target,
      ...durationArgs,
      "-af",
      "silencedetect=noise=-35dB:d=0.05",
      "-f",
      "null",
      "-",
    ],
    cwd,
    30_000,
  )
  if (!result.ok)
    return {
      available: false,
      silenceSegments: [],
      candidatePatterns: [],
      detail: result.text.slice(0, 400) || "ffmpeg signal analysis unavailable",
    }
  const silenceSegments: SilenceSegment[] = []
  let pendingStart: number | undefined
  for (const line of result.stderr.split(/\r?\n/)) {
    const start = line.match(/silence_start:\s*([0-9.]+)/i)
    if (start) {
      pendingStart = startTime + Number(start[1])
      continue
    }
    const end = line.match(/silence_end:\s*([0-9.]+).*?silence_duration:\s*([0-9.]+)/i)
    if (end) {
      const endTime = startTime + Number(end[1])
      silenceSegments.push({
        startTime: pendingStart ?? Math.max(startTime, endTime - Number(end[2])),
        endTime,
        duration: Number(end[2]),
      })
      pendingStart = undefined
    }
  }
  if (pendingStart !== undefined) silenceSegments.push({ startTime: pendingStart })
  const candidatePatterns =
    silenceSegments.length >= 3
      ? ["repeated silence/pulse timing candidate; inspect Morse/DTMF/FSK hypotheses against the spectrogram"]
      : silenceSegments.length > 0
        ? ["silence boundary candidate; compare timing with waveform and spectrogram before decoding"]
        : []
  return {
    available: true,
    silenceSegments: silenceSegments.slice(0, 64),
    candidatePatterns,
    detail: silenceSegments.length
      ? `detected ${silenceSegments.length} bounded silence segment(s)`
      : "no silence segment crossed the configured threshold",
  }
}

async function inspectAudio(
  target: string,
  args: {
    spectrogram: boolean
    transcribe: boolean
    signalStartTime?: number
    signalDuration?: number
    maxAttachmentBytes: number
    budget: AttachmentBudget
  },
  context: { directory: string; worktree: string },
  tempDir: string,
  size: number,
  sample: Buffer,
) {
  const probe = await readFfprobe(target, context.directory)
  const stream = probe.data?.streams?.find((candidate) => candidate.codec_type === "audio")
  const fallback = wavFallback(sample, size)
  const duration = finiteNumber(probe.data?.format?.duration) ?? finiteNumber(stream?.duration) ?? fallback?.duration
  const sampleRate = finiteNumber(stream?.sample_rate) ?? fallback?.sampleRate
  const channels = stream?.channels ?? fallback?.channels
  const signalStartTime = Math.max(0, finiteNumber(args.signalStartTime) ?? 0)
  const requestedSignalDuration =
    args.signalDuration === undefined ? undefined : Math.max(0, finiteNumber(args.signalDuration) ?? 0)
  const signalEndTime =
    duration !== undefined
      ? Math.min(duration, signalStartTime + (requestedSignalDuration ?? Math.max(0, duration - signalStartTime)))
      : signalStartTime + (requestedSignalDuration ?? 0)
  const attachments: ToolAttachment[] = []
  const artifacts: Artifact[] = []
  const observations: string[] = []
  let signalCapability: Capability = {
    available: false,
    detail: args.spectrogram ? "ffmpeg waveform/spectrogram not generated" : "not requested",
  }
  let signalAnalysis: SignalAnalysis = {
    available: false,
    silenceSegments: [],
    candidatePatterns: [],
    detail: args.spectrogram ? "ffmpeg signal analysis not generated" : "not requested",
  }
  const makeSignalImage = async (kind: "waveform" | "spectrogram", filter: string, filename: string) => {
    const outputPath = path.join(tempDir, filename)
    const seek = signalStartTime > 0 ? ["-ss", String(signalStartTime)] : []
    const durationArgs = requestedSignalDuration !== undefined ? ["-t", String(requestedSignalDuration)] : []
    const result = await runOptional(
      "ffmpeg",
      [
        "-y",
        ...seek,
        "-i",
        target,
        ...durationArgs,
        "-filter_complex",
        `[0:a]${filter}[v]`,
        "-map",
        "[v]",
        "-frames:v",
        "1",
        outputPath,
      ],
      context.directory,
      30_000,
    )
    if (!result.ok) {
      signalCapability = { available: false, detail: result.text.slice(0, 400) || "ffmpeg unavailable" }
      return
    }
    const artifact = await attachmentFromFile(
      outputPath,
      "image/png",
      `${path.basename(target)}.${filename}`,
      args.maxAttachmentBytes,
      args.budget,
    )
    artifacts.push({
      kind,
      filename: `${path.basename(target)}.${filename}`,
      mime: "image/png",
      attached: Boolean(artifact.attachment),
      bytes: artifact.bytes,
      reason: artifact.reason,
    })
    if (artifact.attachment) {
      attachments.push(artifact.attachment)
      signalCapability = { available: true }
    } else if (artifact.reason) {
      signalCapability = { available: false, detail: artifact.reason }
    }
  }
  if (args.spectrogram) {
    await makeSignalImage("waveform", "showwavespic=s=1600x400:colors=white", "waveform.png")
    await makeSignalImage("spectrogram", "showspectrumpic=s=1600x900:legend=disabled:color=rainbow", "spectrogram.png")
    signalAnalysis = await analyzeAudioSignal(target, context.directory, signalStartTime, requestedSignalDuration)
  }
  const original = await attachmentFromFile(
    target,
    mimeFor(target, "audio"),
    path.basename(target),
    args.maxAttachmentBytes,
    args.budget,
  )
  if (original.attachment) {
    attachments.push(original.attachment)
    artifacts.push({
      kind: "original",
      filename: path.basename(target),
      mime: original.attachment.mime,
      attached: true,
      bytes: original.bytes,
    })
  } else
    artifacts.push({
      kind: "original",
      filename: path.basename(target),
      mime: mimeFor(target, "audio"),
      attached: false,
      bytes: original.bytes,
      reason: original.reason,
    })

  if (args.transcribe)
    observations.push(
      "Transcription was not assumed automatically; use the attached waveform/spectrogram and an authorized local speech backend only when speech evidence is present.",
    )
  if (sampleRate || channels || duration)
    observations.push(
      "Audio metadata is available; inspect waveform and spectrogram for Morse, DTMF, hidden bands, or visually encoded text before decoding.",
    )
  if (signalAnalysis.candidatePatterns.length)
    observations.push(...signalAnalysis.candidatePatterns.map((candidate) => `Signal probe: ${candidate}.`))
  if (signalStartTime > 0 || requestedSignalDuration !== undefined)
    observations.push(
      `Signal visualization is focused on ${signalStartTime}s-${signalEndTime}s; widen the window if the clue may cross its boundaries.`,
    )
  if (!observations.length)
    observations.push(
      "Audio metadata and signal images are incomplete; check ffmpeg/ffprobe capability before widening to specialized signal tooling.",
    )

  return {
    duration,
    signalWindow: {
      startTime: signalStartTime,
      duration: requestedSignalDuration,
      endTime: signalEndTime,
    },
    sampleRate,
    channels,
    bitsPerSample: fallback?.bitsPerSample,
    codec: stream?.codec_name,
    bitrate: finiteNumber(stream?.bit_rate) ?? finiteNumber(probe.data?.format?.bit_rate),
    metadata: probe.data?.format,
    tags: stream?.tags,
    artifacts,
    attachments,
    observations,
    capabilities: {
      ffprobe: probe.capability,
      ffmpeg: signalCapability,
      signalAnalysis,
      transcription: { available: false, detail: args.transcribe ? "no backend assumed" : "not requested" },
    },
  }
}

function resultFor(payload: Record<string, unknown>, attachments: ToolAttachment[], jsonOnly: boolean): ToolResult {
  const output = jsonOnly
    ? JSON.stringify(
        { ...payload, attachments: attachments.map(({ type, mime, filename }) => ({ type, mime, filename })) },
        null,
        2,
      )
    : [
        "CTF_MULTIMODAL_TRIAGE:",
        `- target: ${String(payload.target)}`,
        `- media_kind: ${String(payload.mediaKind)}`,
        `- mime: ${String(payload.mime)}`,
        ...(payload.duration !== undefined ? [`- duration: ${payload.duration}s`] : []),
        ...(payload.width !== undefined && payload.height !== undefined
          ? [`- dimensions: ${payload.width}x${payload.height}`]
          : []),
        `- artifacts_attached: ${attachments.length}`,
        "- observations:",
        ...(Array.isArray(payload.observations) && payload.observations.length
          ? payload.observations.map((item) => `  - ${String(item)}`)
          : ["  - none"]),
        `- next_tool: ${String(payload.nextTool)}`,
        `- first_probe: ${String(payload.firstProbe)}`,
        "- structured_output:",
        JSON.stringify(
          { ...payload, attachments: attachments.map(({ type, mime, filename }) => ({ type, mime, filename })) },
          null,
          2,
        )
          .split(/\r?\n/)
          .map((line) => `  ${line}`)
          .join("\n"),
      ].join("\n")
  return {
    title: `Multimodal triage: ${String(payload.mediaKind)}`,
    output,
    metadata: {
      schemaVersion: payload.schemaVersion,
      mediaKind: payload.mediaKind,
      attachmentCount: attachments.length,
    },
    attachments,
  }
}

export default tool({
  description:
    "CTF Misc multimodal triage: inspect an image, video, or audio artifact, attach bounded visual/signal evidence for a vision-capable model, and return structured metadata plus the safest next probe.",
  args: {
    target: tool.schema.string().describe("Workspace-relative image, video, audio, or document path."),
    mode: tool.schema
      .enum(["auto", "image", "video", "audio"])
      .optional()
      .describe("Override media-kind detection when the suffix/container is misleading."),
    maxFrames: tool.schema
      .number()
      .optional()
      .describe("Maximum bounded video frames to attach. Default 6, hard cap 12."),
    frameInterval: tool.schema
      .number()
      .optional()
      .describe("Optional seconds between video frames; otherwise sample the selected segment evenly."),
    startTime: tool.schema
      .number()
      .optional()
      .describe("Optional video segment start in seconds. Also scopes video audio-signal renders. Default 0."),
    segmentDuration: tool.schema
      .number()
      .optional()
      .describe(
        "Optional duration in seconds for focused video sampling and video audio-signal renders. Defaults to the remaining video duration.",
      ),
    signalStartTime: tool.schema
      .number()
      .optional()
      .describe("Optional start time in seconds for standalone audio waveform/spectrogram renders. Default 0."),
    signalDuration: tool.schema
      .number()
      .optional()
      .describe("Optional duration in seconds for standalone audio waveform/spectrogram renders."),
    ocr: tool.schema.boolean().optional().describe("Request OCR for images/video frames. Default true."),
    ocrLanguage: tool.schema
      .string()
      .optional()
      .describe(
        "Tesseract language or language combination, for example eng, chi_sim, eng+chi_sim, or jpn. Default eng.",
      ),
    barcode: tool.schema
      .boolean()
      .optional()
      .describe(
        "Probe images and sampled video frames with a local zbarimg QR/barcode decoder when installed. Default true.",
      ),
    channelPreviews: tool.schema
      .boolean()
      .optional()
      .describe(
        "For images with detected transparency, attach a bounded alpha-channel preview. Default false to preserve attachment budget.",
      ),
    imageTiles: tool.schema
      .boolean()
      .optional()
      .describe("For images at least 2400px wide or tall, generate bounded 2x2 ROI tiles. Default true."),
    maxImageTiles: tool.schema.number().optional().describe("Maximum large-image ROI tiles. Default 4, hard cap 4."),
    spectrogram: tool.schema
      .boolean()
      .optional()
      .describe("Generate waveform and spectrogram attachments for audio. Default true."),
    transcribe: tool.schema
      .boolean()
      .optional()
      .describe("Record transcription capability/fallback guidance. Does not invoke an unconfigured remote service."),
    maxChars: tool.schema.number().optional().describe("Maximum OCR text retained. Default 12000."),
    maxAttachmentBytes: tool.schema
      .number()
      .optional()
      .describe("Maximum bytes per data-url attachment. Default 6 MiB."),
    maxTotalAttachmentBytes: tool.schema
      .number()
      .optional()
      .describe("Maximum combined raw bytes across all returned attachments. Default 16 MiB, hard cap 32 MiB."),
    analyzeAudio: tool.schema
      .boolean()
      .optional()
      .describe("For videos with an audio stream, generate bounded waveform/spectrogram attachments. Default true."),
    jsonOnly: tool.schema
      .boolean()
      .optional()
      .describe("Use structured JSON in output instead of the readable summary."),
  },
  async execute(args, context) {
    const workspace = workspaceRootFromContext(context)
    const directory = directoryFromContext(context)
    const target = resolveFromDirectoryInsideWorkspace(directory, workspace, args.target)
    const fileStat = await stat(target)
    if (!fileStat.isFile()) throw new Error(`multimodal target is not a regular file: ${args.target}`)

    const sampleBuffer = Buffer.alloc(Math.min(fileStat.size, 64 * 1024))
    const sampleHandle = await open(target, "r")
    let sample: Buffer
    try {
      const { bytesRead } = await sampleHandle.read(sampleBuffer, 0, sampleBuffer.length, 0)
      sample = sampleBuffer.subarray(0, bytesRead)
    } finally {
      await sampleHandle.close()
    }

    const detectedKind = detectKind(target, sample)
    const mediaKind: MediaKind = args.mode && args.mode !== "auto" ? args.mode : detectedKind
    const mime = mimeFor(target, mediaKind)
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "ctf-multimodal-"))
    const baseContext = { directory, worktree: workspace }
    const maxAttachmentBytes = Math.max(
      64 * 1024,
      Math.min(args.maxAttachmentBytes ?? DEFAULT_MAX_ATTACHMENT_BYTES, MAX_DATA_URL_BYTES),
    )
    const attachmentBudget: AttachmentBudget = {
      limit: Math.max(
        64 * 1024,
        Math.min(args.maxTotalAttachmentBytes ?? DEFAULT_MAX_TOTAL_ATTACHMENT_BYTES, MAX_TOTAL_ATTACHMENT_BYTES),
      ),
      used: 0,
      skipped: [],
    }
    try {
      let details: Record<string, unknown>
      if (mediaKind === "image") {
        details = await inspectImage(
          target,
          {
            ocr: args.ocr !== false,
            ocrLanguage: args.ocrLanguage ?? DEFAULT_OCR_LANGUAGE,
            barcode: args.barcode !== false,
            channelPreviews: args.channelPreviews === true,
            sample,
            maxChars: args.maxChars ?? 12_000,
            maxAttachmentBytes,
            imageTiles: args.imageTiles !== false,
            maxImageTiles: Math.max(
              0,
              Math.min(MAX_IMAGE_TILES, Math.floor(args.maxImageTiles ?? DEFAULT_MAX_IMAGE_TILES)),
            ),
            budget: attachmentBudget,
          },
          baseContext,
          tempDir,
        )
      } else if (mediaKind === "video") {
        details = await inspectVideo(
          target,
          {
            maxFrames: Math.max(1, Math.min(MAX_FRAMES_LIMIT, Math.floor(args.maxFrames ?? DEFAULT_MAX_FRAMES))),
            frameInterval: args.frameInterval,
            startTime: args.startTime,
            segmentDuration: args.segmentDuration,
            ocr: args.ocr !== false,
            ocrLanguage: args.ocrLanguage ?? DEFAULT_OCR_LANGUAGE,
            barcode: args.barcode !== false,
            maxChars: args.maxChars ?? 12_000,
            maxAttachmentBytes,
            analyzeAudio: args.analyzeAudio !== false,
            budget: attachmentBudget,
          },
          baseContext,
          tempDir,
        )
      } else if (mediaKind === "audio") {
        details = await inspectAudio(
          target,
          {
            spectrogram: args.spectrogram !== false,
            transcribe: args.transcribe === true,
            signalStartTime: args.signalStartTime,
            signalDuration: args.signalDuration,
            maxAttachmentBytes,
            budget: attachmentBudget,
          },
          baseContext,
          tempDir,
          fileStat.size,
          sample,
        )
      } else if (mediaKind === "document") {
        const extracted = String(
          await docRead.execute(
            { target: args.target, includeJson: true, ocr: args.ocr !== false, maxChars: args.maxChars ?? 12_000 },
            baseContext as never,
          ),
        )
        details = {
          extracted,
          artifacts: [],
          attachments: [],
          observations: [
            "This is a document; use document extraction first, then route embedded images/audio/video back through multimodal triage.",
          ],
          capabilities: { docRead: { available: true } },
        }
      } else {
        details = {
          artifacts: [],
          attachments: [],
          observations: [
            "Container type is unknown. Preserve the original bytes and run file/container identification before forcing a media decoder.",
          ],
          capabilities: { ffprobe: { available: false, detail: "unknown media kind" } },
        }
      }

      const attachments = Array.isArray(details.attachments) ? (details.attachments as ToolAttachment[]) : []
      const artifacts = Array.isArray(details.artifacts) ? details.artifacts : []
      const payload = {
        schemaVersion: "misc_multimodal.v1",
        target,
        mediaKind,
        detectedKind,
        mime,
        size: fileStat.size,
        ...details,
        artifactCount: artifacts.length,
        attachmentCount: attachments.length,
        attachmentBudget: {
          limitBytes: attachmentBudget.limit,
          usedBytes: attachmentBudget.used,
          remainingBytes: Math.max(0, attachmentBudget.limit - attachmentBudget.used),
          skipped: attachmentBudget.skipped,
        },
        nextTool:
          mediaKind === "image"
            ? "ctf-stego-probe"
            : mediaKind === "video" || mediaKind === "audio"
              ? "ctf-multimodal-triage"
              : "ctf-file-triage",
        nextArgsHint:
          mediaKind === "image"
            ? "Use the attached image and OCR/metadata together; only run stego/QR extraction when visual or metadata evidence supports it."
            : mediaKind === "video"
              ? "Inspect the bounded key frames first; if a temporal clue appears, rerun with startTime plus segmentDuration or a focused frameInterval."
              : mediaKind === "audio"
                ? "Inspect waveform and spectrogram attachments for Morse, DTMF, hidden bands, or visual text before decoding."
                : "Identify the container and choose one bounded extraction path before widening.",
        reviewChecklist: reviewChecklist(mediaKind),
        firstProbe:
          mediaKind === "image"
            ? "Ask the vision-capable model to describe salient visual structure, text, QR/barcode, channels, and suspicious regions, then correlate with metadata."
            : mediaKind === "video"
              ? "Compare the attached start/middle/end key frames and note temporal changes, text, QR codes, or anomalous frames."
              : mediaKind === "audio"
                ? "Read sample rate/channels and inspect both waveform and spectrogram before attempting Morse/DTMF/speech decoding."
                : "Inspect the highest-value artifact or container signature with one bounded probe.",
      }
      return resultFor(payload, attachments, args.jsonOnly === true)
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
    }
  },
})
