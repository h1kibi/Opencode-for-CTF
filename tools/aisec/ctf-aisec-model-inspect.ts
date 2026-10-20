import { tool } from "@opencode-ai/plugin"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { lstat, open, readdir } from "node:fs/promises"
import path from "node:path"
import {
  resolveFromDirectoryInsideWorkspace,
  workspaceRootFromContext,
  directoryFromContext,
} from "../lib/workspace-path.ts"

type ArtifactFile = {
  path: string
  relative_path: string
  size: number
  sha256: string | null
  kind: string
  hints: string[]
  metadata?: Record<string, unknown>
  unsafe_deserialization_risk: boolean
}

const MAX_FILES = 256
const MAX_HASH_BYTES = 256 * 1024 * 1024
const MAX_HEADER_BYTES = 1024 * 1024

function magicKind(buffer: Buffer, ext: string): string {
  if (buffer.subarray(0, 4).toString("ascii") === "GGUF") return "gguf"
  if (buffer.subarray(0, 4).toString("ascii") === "ONNX") return "onnx"
  if (buffer.subarray(0, 4).toString("ascii") === "PK\u0003\u0004") return "zip/container"
  if (buffer.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) return "elf"
  if (buffer.subarray(0, 2).equals(Buffer.from([0x4d, 0x5a]))) return "pe"
  if (buffer[0] === 0x80 && buffer[1] <= 0x05) return "pickle/protocol"
  if (buffer.subarray(0, 6).toString("ascii") === "\xfd7zXZ\u0000") return "xz"
  if (buffer.subarray(0, 2).equals(Buffer.from([0x1f, 0x8b]))) return "gzip"
  if (ext === ".safetensors") return "safetensors"
  if ([".pt", ".pth", ".pkl", ".pickle", ".bin"].includes(ext)) return "torch/pickle-like"
  if (ext === ".onnx") return "onnx"
  if (ext === ".gguf") return "gguf"
  if (ext === ".jsonl") return "jsonl"
  if (ext === ".json") return "json"
  if ([".csv", ".tsv", ".parquet"].includes(ext)) return "dataset"
  return "file"
}

function filenameHints(name: string): string[] {
  const lower = name.toLowerCase()
  const hints: string[] = []
  if (/tokenizer|vocab|merges/.test(lower)) hints.push("tokenizer_or_vocabulary")
  if (/config|generation_config|model_index/.test(lower)) hints.push("model_configuration")
  if (/adapter|lora|peft/.test(lower)) hints.push("adapter_or_lora")
  if (/dataset|train|eval|prompt|instruction|label/.test(lower)) hints.push("dataset_or_prompt_data")
  if (/\.p(?:kl|th|t)$|\.pickle$/.test(lower)) hints.push("possible_pickle_deserialization")
  return hints
}

function safetensorsMetadata(buffer: Buffer): Record<string, unknown> | undefined {
  if (buffer.length < 8) return undefined
  const headerLength = Number(buffer.readBigUInt64LE(0))
  if (
    !Number.isSafeInteger(headerLength) ||
    headerLength <= 0 ||
    headerLength > MAX_HEADER_BYTES ||
    8 + headerLength > buffer.length
  )
    return undefined
  try {
    const header = JSON.parse(buffer.subarray(8, 8 + headerLength).toString("utf8")) as Record<string, unknown>
    const tensors = Object.keys(header).filter((key) => key !== "__metadata__")
    return {
      header_bytes: headerLength,
      tensor_count: tensors.length,
      metadata_keys:
        header.__metadata__ && typeof header.__metadata__ === "object"
          ? Object.keys(header.__metadata__ as object)
          : [],
      tensor_names_sample: tensors.slice(0, 12),
    }
  } catch {
    return undefined
  }
}

async function collectFiles(target: string): Promise<{ files: string[]; skipped: string[] }> {
  const files: string[] = []
  const skipped: string[] = []
  async function walk(current: string) {
    if (files.length >= MAX_FILES) return
    const stats = await lstat(current)
    if (stats.isSymbolicLink()) {
      skipped.push(current)
      return
    }
    if (stats.isDirectory()) {
      const entries = await readdir(current, { withFileTypes: true })
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "__pycache__") continue
        await walk(path.join(current, entry.name))
        if (files.length >= MAX_FILES) break
      }
      return
    }
    if (stats.isFile()) files.push(current)
  }
  await walk(target)
  return { files, skipped }
}

async function inspectFile(filePath: string, root: string): Promise<ArtifactFile> {
  const stats = await lstat(filePath)
  const relativePath = path.relative(root, filePath) || path.basename(filePath)
  const ext = path.extname(filePath).toLowerCase()
  const headerLength = Math.min(stats.size, MAX_HEADER_BYTES)
  const header = Buffer.alloc(headerLength)
  const handle = await open(filePath, "r")
  try {
    await handle.read(header, 0, headerLength, 0)
  } finally {
    await handle.close()
  }
  const sample = header
  const kind = magicKind(sample, ext)
  const hints = filenameHints(path.basename(filePath))
  if (kind === "safetensors") hints.push("safe_tensor_header")
  if (kind === "pickle/protocol" || kind === "torch/pickle-like") hints.push("do_not_deserialize_untrusted_artifact")
  if (kind === "zip/container") hints.push("container_or_archive_requires_member_review")

  let sha256: string | null = null
  if (stats.size <= MAX_HASH_BYTES) {
    const digest = createHash("sha256")
    for await (const chunk of createReadStream(filePath, { highWaterMark: 1024 * 1024 })) digest.update(chunk)
    sha256 = digest.digest("hex")
  }
  let metadata: Record<string, unknown> | undefined
  if (kind === "safetensors") metadata = safetensorsMetadata(sample)
  if (kind === "json" && stats.size <= MAX_HEADER_BYTES) {
    try {
      const parsed = JSON.parse(header.toString("utf8")) as Record<string, unknown>
      const keys = Object.keys(parsed)
      metadata = { top_level_keys: keys.slice(0, 40), key_count: keys.length }
      if (parsed.architectures) metadata.architectures = parsed.architectures
      if (parsed.model_type) metadata.model_type = parsed.model_type
      if (parsed.tokenizer_class) metadata.tokenizer_class = parsed.tokenizer_class
    } catch {
      hints.push("json_parse_failed")
    }
  }
  return {
    path: filePath,
    relative_path: relativePath,
    size: stats.size,
    sha256,
    kind,
    hints: [...new Set(hints)],
    metadata,
    unsafe_deserialization_risk:
      kind === "pickle/protocol" || kind === "torch/pickle-like" || hints.includes("possible_pickle_deserialization"),
  }
}

export default tool({
  description:
    "Static AI model/dataset artifact inspector: fingerprints files, hashes bounded artifacts, reads safe metadata, and never deserializes pickle/PyTorch objects.",
  args: {
    target: tool.schema.string().describe("Workspace-relative model, dataset, tokenizer, archive, or artifact path."),
    jsonOnly: tool.schema.boolean().optional().describe("Return machine-readable JSON only."),
  },
  async execute(args, context) {
    const workspace = workspaceRootFromContext(context)
    const directory = directoryFromContext(context)
    const target = resolveFromDirectoryInsideWorkspace(directory, workspace, args.target)
    const stats = await lstat(target).catch(() => null)
    if (!stats) return `[ctf-aisec-model-inspect] target not found: ${target}`
    const { files, skipped } = await collectFiles(target)
    const artifacts = await Promise.all(files.map((filePath) => inspectFile(filePath, workspace)))
    const risks = artifacts
      .filter((artifact) => artifact.unsafe_deserialization_risk)
      .map((artifact) => artifact.relative_path)
    const output = {
      schema_version: 1,
      target,
      target_kind: stats.isDirectory() ? "directory" : "file",
      file_count: artifacts.length,
      truncated: files.length >= MAX_FILES,
      skipped_symlinks: skipped.map((filePath) => path.relative(workspace, filePath)),
      unsafe_deserialization_risk: risks.length > 0,
      unsafe_artifacts: risks,
      artifacts,
      safety: {
        static_only: true,
        pickle_executed: false,
        model_loaded: false,
        network_access: false,
      },
    }
    if (args.jsonOnly) return JSON.stringify(output, null, 2)
    const lines = [
      "=== AI Security Model Artifact Inspection ===",
      `target: ${target}`,
      `files: ${artifacts.length}${output.truncated ? " (truncated)" : ""}`,
      `unsafe_deserialization_risk: ${output.unsafe_deserialization_risk ? "YES" : "NO"}`,
      "",
    ]
    for (const artifact of artifacts) {
      lines.push(`  [${artifact.kind}] ${artifact.relative_path} (${artifact.size} bytes)`)
      if (artifact.hints.length) lines.push(`    hints: ${artifact.hints.join(", ")}`)
      if (artifact.sha256) lines.push(`    sha256: ${artifact.sha256}`)
    }
    lines.push("", "Safety: static inspection only; pickle/model loading was not performed.")
    return lines.join("\n")
  },
})
