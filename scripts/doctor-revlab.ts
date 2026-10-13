import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

// 自查:确认所有新增文件、字符、钩子都已落地
// 不实际执行 docker build / pull (那些需要用户授权)

const root = process.cwd()
const checks: Array<{ name: string; ok: boolean; detail?: string }> = []

function checkFile(rel: string) {
  const abs = path.join(root, rel)
  const ok = existsSync(abs)
  checks.push({ name: `file:${rel}`, ok, detail: ok ? "" : "missing" })
}

function checkContains(rel: string, needle: string) {
  const abs = path.join(root, rel)
  if (!existsSync(abs)) {
    checks.push({ name: `contains:${rel}:${needle}`, ok: false, detail: "file missing" })
    return
  }
  const text = readFileSync(abs, "utf8")
  const ok = text.includes(needle)
  checks.push({ name: `contains:${rel}:${needle}`, ok, detail: ok ? "" : "needle not found" })
}

function checkOccurrenceCount(rel: string, needle: string, expected: number) {
  const abs = path.join(root, rel)
  if (!existsSync(abs)) {
    checks.push({ name: `count:${rel}:${needle}`, ok: false, detail: "file missing" })
    return
  }
  const text = readFileSync(abs, "utf8")
  const count = text.split(needle).length - 1
  const ok = count === expected
  checks.push({
    name: `count:${rel}:${needle}`,
    ok,
    detail: ok ? "" : `expected ${expected}, got ${count}`,
  })
}

// Phase A
checkFile("docker/Dockerfile.revlab-ubuntu22.04")
checkContains("docker/Dockerfile.revlab-ubuntu22.04", "tshark")
checkContains("docker/Dockerfile.revlab-ubuntu22.04", "capinfos")
checkContains("docker/Dockerfile.revlab-ubuntu22.04", "binwalk")
checkContains("docker/Dockerfile.revlab-ubuntu22.04", "upx-ucl")
checkContains("docker/Dockerfile.revlab-ubuntu22.04", "golang-go")
checkContains("docker/Dockerfile.revlab-ubuntu22.04", "pycryptodome")
checkContains("docker/Dockerfile.revlab-ubuntu22.04", "scapy")
checkContains("docker/Dockerfile.revlab-ubuntu22.04", "revlab-check")
checkOccurrenceCount("docker/Dockerfile.revlab-ubuntu22.04", 'echo "[revlab] tool check (v2)"', 1)
checkContains("docker/Dockerfile.revlab-ubuntu22.04", "qemu-aarch64-static")
checkContains("docker/Dockerfile.revlab-ubuntu22.04", "one_gadget")
checkContains("docker/Dockerfile.revlab-ubuntu22.04", "seccomp-tools")
checkContains(
  "docker/Dockerfile.revlab-ubuntu22.04",
  "cdn.opensuse.org/repositories/home:/RizinOrg/xUbuntu_22.04/Release.key",
)
checkContains("docker/Dockerfile.revlab-ubuntu22.04", "apt-get install -y --no-install-recommends rizin")
checkContains("docker/Dockerfile.revlab-ubuntu22.04", "uncompyle6")
checkContains("docker/Dockerfile.revlab-ubuntu22.04", "decompyle3")
checkContains("docker/Dockerfile.revlab-ubuntu22.04", "wasm-objdump")
checkContains("docker/Dockerfile.revlab-ubuntu22.04", "wasm2wat")
checkContains("docker/Dockerfile.revlab-ubuntu22.04", "GoReSym")
checkContains("docker/Dockerfile.revlab-ubuntu22.04", "apktool")
checkContains("docker/Dockerfile.revlab-ubuntu22.04", "rr")
checkContains("docker/Dockerfile.revlab-ubuntu22.04", "qiling")
checkContains("docker/Dockerfile.revlab-ubuntu22.04", "triton-library")

checkContains("docker/docker-compose.revlab.yml", "revlab:")
checkContains("docker/docker-compose.revlab.yml", "Dockerfile.revlab-ubuntu22.04")
checkContains("docker/docker-compose.revlab.yml", "revlab")
checkContains("docker/docker-compose.revlab.yml", "pull_policy: if_not_present")
checkContains("docker/docker-compose.revlab.yml", "NET_ADMIN")
checkContains("docker/docker-compose.revlab.yml", "NET_RAW")

// Phase B
checkFile("tools/forensics/ctf-pcap-carve.ts")
checkContains("tools/forensics/ctf-pcap-carve.ts", "parsePcapIfPresent")
checkContains("tools/forensics/ctf-pcap-carve.ts", "xorBytes")
checkContains("tools/forensics/ctf-pcap-carve.ts", "rc4")
checkContains("tools/forensics/ctf-pcap-carve.ts", "autoTryXorBytes")

checkFile("tools/rev/ctf-go-pclntool.ts")
checkContains("tools/rev/ctf-go-pclntool.ts", "go tool nm")
checkContains("tools/rev/ctf-go-pclntool.ts", "go tool objdump")
checkContains("tools/rev/ctf-go-pclntool.ts", "revlab:ubuntu22.04")
checkContains("tools/rev/ctf-go-pclntool.ts", "rename_")
checkContains("tools/rev/ctf-go-pclntool.ts", "emitRenameScript")

// Phase C
checkContains("tools/forensics/ctf-pcap-probe.ts", "probe_backend")
checkContains("tools/forensics/ctf-pcap-probe.ts", "revlab:ubuntu22.04")
checkContains("tools/forensics/ctf-pcap-probe.ts", "dockerImageExists")
checkContains("tools/forensics/ctf-pcap-probe.ts", "ctf-pcap-carve")

// Phase D
checkFile("scripts/build-revlab.ps1")
checkContains("scripts/build-revlab.ps1", "revlab-check")
checkContains("scripts/build-revlab.ps1", "revlab")

// Phase E
checkFile("templates/rev-network-replay.md")
checkContains("templates/rev-network-replay.md", "ctf-pcap-probe")
checkContains("templates/rev-network-replay.md", "ctf-pcap-carve")
checkContains("templates/rev-network-replay.md", "ctf-go-pclntool")
checkContains("templates/rev-network-replay.md", "build-revlab.ps1")

// Phase 扩展检查: REV knowledge / closure-ladder / oob-discipline / AES / mirror / permissions
checkFile("tools/rev/ctf-rev-closure-ladder.ts")
checkContains("tools/rev/ctf-rev-closure-ladder.ts", "REV_CLOSURE_LADDER")
checkContains("tools/rev/ctf-rev-closure-ladder.ts", "rankCandidates")
checkFile("skills/ctf-rev-oob-discipline/SKILL.md")
checkContains("skills/ctf-rev-oob-discipline/SKILL.md", "receive-only")
checkContains("skills/ctf-rev-oob-discipline/SKILL.md", "response-serving")
checkContains("tools/forensics/ctf-pcap-carve.ts", "createDecipheriv")
checkContains("tools/forensics/ctf-pcap-carve.ts", "aes_gcm")
checkContains("tools/forensics/ctf-pcap-carve.ts", "chacha20_poly1305")
checkContains("docker/Dockerfile.revlab-ubuntu22.04", "APT_MIRROR")
checkContains("docker/Dockerfile.revlab-ubuntu22.04", "PIP_INDEX_URL")
checkContains("docker/Dockerfile.revlab-ubuntu22.04", "GOPROXY")
checkContains("scripts/build-revlab.ps1", "UseCNMirror")
checkContains("agents/ctf-rev.md", "ctf-rev-closure-ladder")
checkContains("agents/ctf-rev.md", "ctf-rev-oob-discipline")
checkContains("agents/ctf-expert.md", "ctf-rev-closure-ladder")
checkContains("agents/ctf-expert.md", "ctf-rev-oob-discipline")
checkContains("agents/ctf-rev.md", "ctf-pcap-carve")
checkContains("agents/ctf-rev.md", "ctf-go-pclntool")
checkContains("agents/ctf-fast.md", "ctf-pcap-carve")
checkContains("agents/ctf-fast.md", "ctf-go-pclntool")
checkContains("agents/ctf-expert.md", "ctf-pcap-carve")
checkContains("agents/ctf-expert.md", "ctf-go-pclntool")
checkContains(
  "docker/Dockerfile.revlab-ubuntu22.04",
  "for c in file strings tshark capinfos tcpdump binwalk upx readelf objdump nm gdb strace ltrace python3 scapy r2 rizin go unzip xxd jq patchelf radare2 qemu-aarch64-static qemu-mips-static qemu-riscv64-static one_gadget seccomp-tools uncompyle6 decompyle3 wasm-objdump wasm2wat GoReSym apktool aapt rr;",
)

const failed = checks.filter((c) => !c.ok)
console.log("# Revlab Doctor")
console.log(`# Extended checks (rev knowledge / closure-ladder / oob / AES / mirror / permissions / v2 toolset)`)
console.log(`total: ${checks.length}`)
console.log(`passed: ${checks.length - failed.length}`)
console.log(`failed: ${failed.length}`)
if (failed.length) {
  console.log("")
  console.log("FAILED:")
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`)
  process.exit(1)
}
console.log("OK: revlab tooling + extended checks all wired.")
