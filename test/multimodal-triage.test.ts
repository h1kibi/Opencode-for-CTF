import { describe, expect, it } from "vitest"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const MOD_PATH = "../tools/misc/ctf-multimodal-triage.ts"

function tinyPng() {
  return Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082",
    "hex",
  )
}

function largeDimensionPng() {
  const buffer = tinyPng()
  buffer.writeUInt32BE(4000, 16)
  buffer.writeUInt32BE(3000, 20)
  return buffer
}

function tinyWav() {
  const buffer = Buffer.alloc(44)
  buffer.write("RIFF", 0, "ascii")
  buffer.writeUInt32LE(36, 4)
  buffer.write("WAVE", 8, "ascii")
  buffer.write("fmt ", 12, "ascii")
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(8000, 24)
  buffer.writeUInt32LE(16000, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write("data", 36, "ascii")
  buffer.writeUInt32LE(0, 40)
  return buffer
}

function fakeMp4() {
  const buffer = Buffer.alloc(24)
  buffer.writeUInt32BE(24, 0)
  buffer.write("ftyp", 4, "ascii")
  buffer.write("isom", 8, "ascii")
  return buffer
}

describe("ctf-multimodal-triage", () => {
  it("attaches a bounded image and returns structured visual metadata", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-multimodal-image-"))
    await writeFile(path.join(root, "clue.png"), tinyPng())
    const mod = await import(MOD_PATH)
    const result = await mod.default.execute({ target: "clue.png", ocr: false, jsonOnly: true }, {
      directory: root,
      worktree: root,
    } as never)
    expect(typeof result).toBe("object")
    const output = JSON.parse((result as { output: string }).output)
    expect(output.schemaVersion).toBe("misc_multimodal.v1")
    expect(output.mediaKind).toBe("image")
    expect(output.mime).toBe("image/png")
    expect(output.attachments).toHaveLength(1)
    expect(output.reviewChecklist).toEqual(expect.arrayContaining([expect.stringMatching(/visible text/i)]))
    expect((result as { attachments: Array<{ mime: string; url: string }> }).attachments[0].mime).toBe("image/png")
    expect((result as { attachments: Array<{ mime: string; url: string }> }).attachments[0].url).toMatch(
      /^data:image\/png;base64,/,
    )
  })

  it("can expose a bounded alpha-channel preview for transparent images", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-multimodal-alpha-"))
    await writeFile(path.join(root, "transparent.png"), tinyPng())
    const mod = await import(MOD_PATH)
    const result = await mod.default.execute(
      { target: "transparent.png", ocr: false, barcode: false, channelPreviews: true, jsonOnly: true },
      { directory: root, worktree: root } as never,
    )
    const output = JSON.parse((result as { output: string }).output)
    expect(output.channels).toMatchObject({ format: "png", colorModel: "rgba", alpha: true })
    expect(output.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "channel_preview", filename: "transparent.png.alpha.png" }),
      ]),
    )
  })

  it("plans bounded ROI tiles for large images without requiring a decoder", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-multimodal-large-image-"))
    await writeFile(path.join(root, "poster.png"), largeDimensionPng())
    const mod = await import(MOD_PATH)
    const result = await mod.default.execute({ target: "poster.png", ocr: false, jsonOnly: true }, {
      directory: root,
      worktree: root,
    } as never)
    const output = JSON.parse((result as { output: string }).output)
    expect(output.mediaKind).toBe("image")
    expect(output.dimensions).toEqual({ width: 4000, height: 3000 })
    expect(output.largeImageTiling.attempted).toBe(true)
    expect(output.largeImageTiling.maxTiles).toBe(4)
    expect(output.observations.join(" ")).toMatch(/ROI tiling|ROI tile/i)
  })

  it("recognizes WAV metadata and reports signal-image capability without requiring ffmpeg", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-multimodal-audio-"))
    await writeFile(path.join(root, "signal.wav"), tinyWav())
    const mod = await import(MOD_PATH)
    const result = await mod.default.execute({ target: "signal.wav", spectrogram: false, jsonOnly: true }, {
      directory: root,
      worktree: root,
    } as never)
    const output = JSON.parse((result as { output: string }).output)
    expect(output.mediaKind).toBe("audio")
    expect(output.sampleRate).toBe(8000)
    expect(output.channels).toBe(1)
    expect(output.observations.join(" ")).toMatch(/Audio metadata|metadata/i)
    expect(output.capabilities.ffmpeg.available).toBe(false)
    expect(output.capabilities.ffmpeg.detail).toMatch(/not requested|ffmpeg/i)
  })

  it("records focused video sampling coordinates for temporal follow-up", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-multimodal-video-focus-"))
    await writeFile(path.join(root, "clip.mp4"), fakeMp4())
    const mod = await import(MOD_PATH)
    const result = await mod.default.execute(
      {
        target: "clip.mp4",
        maxFrames: 2,
        frameInterval: 3,
        startTime: 12,
        segmentDuration: 6,
        ocr: false,
        jsonOnly: true,
      },
      { directory: root, worktree: root } as never,
    )
    const output = JSON.parse((result as { output: string }).output)
    expect(output.sampling).toMatchObject({
      mode: "interval",
      startTime: 12,
      segmentDuration: 6,
      endTime: 18,
      interval: 3,
    })
    expect(output.sampling.positions).toEqual([12, 15])
    expect(output.signalWindow).toMatchObject({ startTime: 12, duration: 6, endTime: 18 })
    expect(output.reviewChecklist.join(" ")).toMatch(/chronological|timestamped/i)
  })

  it("does not duplicate bounded video timestamps when an interval reaches the segment end", async () => {
    const mod = await import(MOD_PATH)
    expect(mod.boundedSamplingPositions(12, 18, 6, 3)).toEqual([12, 15, 18])
    expect(mod.boundedSamplingPositions(12, 12, 6, 3)).toEqual([12])
    expect(mod.boundedSamplingPositions(12, 18, 6, 0)).toEqual([12])
  })

  it("recognizes video containers and bounds requested key frames", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-multimodal-video-"))
    await writeFile(path.join(root, "clip.mp4"), fakeMp4())
    const mod = await import(MOD_PATH)
    const result = await mod.default.execute({ target: "clip.mp4", maxFrames: 99, ocr: false, jsonOnly: true }, {
      directory: root,
      worktree: root,
    } as never)
    const output = JSON.parse((result as { output: string }).output)
    expect(output.mediaKind).toBe("video")
    expect(output.nextTool).toBe("ctf-multimodal-triage")
    expect(output.artifacts.filter((item: { kind: string }) => item.kind === "video_frame").length).toBeLessThanOrEqual(
      12,
    )
  })

  it("enforces a combined attachment budget and reports skipped evidence", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-multimodal-budget-"))
    const oversizedWav = Buffer.concat([tinyWav(), Buffer.alloc(70 * 1024)])
    await writeFile(path.join(root, "large.wav"), oversizedWav)
    const mod = await import(MOD_PATH)
    const result = await mod.default.execute(
      { target: "large.wav", spectrogram: false, maxTotalAttachmentBytes: 64 * 1024, jsonOnly: true },
      { directory: root, worktree: root } as never,
    )
    const output = JSON.parse((result as { output: string }).output)
    expect(output.attachmentBudget.limitBytes).toBe(64 * 1024)
    expect(output.attachmentBudget.usedBytes).toBe(0)
    expect(output.attachments).toHaveLength(0)
    expect(output.attachmentBudget.skipped[0].filename).toBe("large.wav")
    expect(output.attachmentBudget.skipped[0].reason).toMatch(/total attachment budget/)
  })

  it("reports a focused standalone audio signal window", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-multimodal-audio-window-"))
    await writeFile(path.join(root, "signal.wav"), tinyWav())
    const mod = await import(MOD_PATH)
    const result = await mod.default.execute(
      { target: "signal.wav", spectrogram: false, signalStartTime: 2, signalDuration: 3, jsonOnly: true },
      { directory: root, worktree: root } as never,
    )
    const output = JSON.parse((result as { output: string }).output)
    expect(output.signalWindow.startTime).toBe(2)
    expect(output.signalWindow.duration).toBe(3)
    expect(output.observations.join(" ")).toMatch(/focused on 2s-/i)
  })

  it("records OCR language intent and barcode capability without conflating disabled probes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-multimodal-capabilities-"))
    await writeFile(path.join(root, "clue.png"), tinyPng())
    const mod = await import(MOD_PATH)
    const result = await mod.default.execute(
      { target: "clue.png", ocr: false, ocrLanguage: "chi_sim", barcode: false, jsonOnly: true },
      { directory: root, worktree: root } as never,
    )
    const output = JSON.parse((result as { output: string }).output)
    expect(output.capabilities.ocr).toMatchObject({ requested: "chi_sim", available: false, detail: "not requested" })
    expect(output.capabilities.barcode).toMatchObject({ available: false, detail: "not requested" })
    expect(output.barcode.results).toEqual([])
  })

  it("supports an explicit mode override for misleading extensions", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-multimodal-mode-"))
    await writeFile(path.join(root, "blob.bin"), tinyWav())
    const mod = await import(MOD_PATH)
    const result = await mod.default.execute(
      { target: "blob.bin", mode: "audio", spectrogram: false, jsonOnly: true },
      { directory: root, worktree: root } as never,
    )
    const output = JSON.parse((result as { output: string }).output)
    expect(output.mediaKind).toBe("audio")
    expect(output.detectedKind).toBe("audio")
  })
})
