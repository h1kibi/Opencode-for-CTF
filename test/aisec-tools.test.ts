import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"

const contextFor = (root: string) => ({ directory: root, worktree: root }) as never

describe("aisec specialist tools", () => {
  it("returns a degraded environment matrix without throwing when optional packages are absent", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ctf-aisec-env-"))
    const mod = await import("../tools/aisec/ctf-aisec-env-check.js")
    const raw = await mod.default.execute(
      { packages: ["numpy", "not-a-real-package"], jsonOnly: true },
      contextFor(root),
    )
    const result = JSON.parse(String(raw))

    expect(result.category).toBe("aisec")
    expect(result.safety.model_deserialization).toBe("not performed")
    expect(result.safety.installs_performed).toBe(false)
    expect(result.rejected_packages).toContain("not-a-real-package")
    expect(Array.isArray(result.results)).toBe(true)
  }, 30_000)

  it("fingerprints model artifacts without deserializing pickle-like bytes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ctf-aisec-model-"))
    const modelDir = path.join(root, "model")
    await mkdir(modelDir)
    const header = Buffer.from(
      JSON.stringify({ __metadata__: { format: "test" }, weight: { dtype: "F32", shape: [1] } }),
    )
    const safetensors = Buffer.alloc(8 + header.length + 4)
    safetensors.writeBigUInt64LE(BigInt(header.length), 0)
    header.copy(safetensors, 8)
    await writeFile(path.join(modelDir, "model.safetensors"), safetensors)
    await writeFile(path.join(modelDir, "untrusted.pth"), Buffer.from([0x80, 0x04, 0x63, 0x6f, 0x73]))
    await writeFile(
      path.join(modelDir, "config.json"),
      JSON.stringify({ model_type: "test", architectures: ["TestModel"] }),
    )

    const mod = await import("../tools/aisec/ctf-aisec-model-inspect.js")
    const raw = await mod.default.execute({ target: "model", jsonOnly: true }, contextFor(root))
    const result = JSON.parse(String(raw))

    expect(result.file_count).toBe(3)
    expect(result.safety.pickle_executed).toBe(false)
    expect(result.unsafe_deserialization_risk).toBe(true)
    expect(result.unsafe_artifacts).toContain(path.join("model", "untrusted.pth"))
    expect(result.artifacts.find((item: { kind: string }) => item.kind === "safetensors").metadata.tensor_count).toBe(1)
  })

  it("captures a deterministic local wrapper baseline with bounded arguments", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ctf-aisec-probe-"))
    const wrapper = path.join(root, "wrapper.cjs")
    await writeFile(
      wrapper,
      "const fs=require('node:fs'); const input=fs.readFileSync(process.argv[2], 'utf8'); process.stdout.write(JSON.stringify({length: input.length, ok: true}));\n",
      "utf8",
    )
    const mod = await import("../tools/aisec/ctf-aisec-inference-probe.js")
    const raw = await mod.default.execute(
      {
        command: "node",
        argv: [wrapper, "{input_file}"],
        input: "benign-baseline",
        repetitions: 2,
        timeoutMs: 5000,
        jsonOnly: true,
      },
      contextFor(root),
    )
    const result = JSON.parse(String(raw))

    expect(result.summary.all_ok).toBe(true)
    expect(result.summary.deterministic).toBe(true)
    expect(result.summary.response_shapes[0]).toContain("object")
    expect(result.runs).toHaveLength(2)
  }, 30_000)
})
