export type BenchmarkExpectation = {
  family: "web" | "pwn" | "crypto" | "rev" | "forensics" | "misc"
  name: string
  description: string
}

export const benchmarkFamilies: BenchmarkExpectation[] = [
  { family: "web", name: "recon-before-exploit", description: "Recon map exists before exploit payload selection." },
  { family: "pwn", name: "checksec-before-rop", description: "Mitigations are recorded before exploit strategy selection." },
  { family: "crypto", name: "rsa-probe-before-manual", description: "Structured crypto probe runs before ad-hoc attacks." },
  { family: "rev", name: "static-before-dynamic", description: "Static analysis happens before dynamic instrumentation." },
  { family: "forensics", name: "preserve-original", description: "Original evidence is preserved before extraction work." },
]
