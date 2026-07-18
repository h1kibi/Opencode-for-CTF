export type BenchmarkExpectation = {
  family: "web" | "pwn" | "crypto" | "rev" | "forensics" | "misc"
  name: string
  description: string
  routeClass?: "dispatcher" | "specialist" | "fallback" | "readiness"
  fallbackExpectation?: string
  evidenceExpectation?: string
  benchmarkStatus?: "covered" | "partial" | "planned"
}

export const benchmarkFamilies: BenchmarkExpectation[] = [
  {
    family: "web",
    name: "recon-before-exploit",
    description: "Recon map exists before exploit payload selection.",
    routeClass: "dispatcher",
    fallbackExpectation: "Switch from browser/runtime to source-first or blackbox fallback before payload mutation.",
    evidenceExpectation: "Route map, candidate queue, primitive lock, and final chain are all recorded.",
    benchmarkStatus: "covered",
  },
  {
    family: "web",
    name: "attack-queue-ranking",
    description: "Candidate web routes are ranked before deep probing.",
    routeClass: "dispatcher",
    fallbackExpectation: "Return to attack-queue and rerank before repeating payload families.",
    evidenceExpectation: "Attack queue entries with value/cost/risk/stability/confidence are recorded.",
    benchmarkStatus: "covered",
  },
  {
    family: "web",
    name: "upload-vs-file-write-routing",
    description: "Upload validation and file-write closure are routed through the correct web specialist lanes.",
    routeClass: "fallback",
    fallbackExpectation: "Route upload behavior to ctf-web-upload first and explicit write/overwrite behavior to ctf-web-file-write.",
    evidenceExpectation: "The chosen control plane and canary path are recorded before state-changing file operations.",
    benchmarkStatus: "covered",
  },
  {
    family: "pwn",
    name: "ret2win-basic",
    description: "Direct or shortest ret2win-style closure is preferred before unnecessary route expansion.",
    routeClass: "specialist",
    fallbackExpectation: "Use the shortest direct closure family before adding more leak or heap complexity.",
    evidenceExpectation: "A direct or minimum-closure exploit sketch is recorded once the primitive is known.",
    benchmarkStatus: "covered",
  },
  {
    family: "pwn",
    name: "control-confirmed-calibration",
    description: "Once control is confirmed, the next step is calibration and closure, not gadget roulette.",
    routeClass: "fallback",
    fallbackExpectation: "Move from control proof into calibration and one-variable closure checks before route drift.",
    evidenceExpectation: "Control proof, calibration notes, and the next closure hypothesis are recorded.",
    benchmarkStatus: "covered",
  },
  {
    family: "pwn",
    name: "remote-drift",
    description: "Local-vs-remote divergence is investigated before exploit-family roulette.",
    routeClass: "fallback",
    fallbackExpectation: "Check libc/runtime/IO drift before rotating primitives or payload families.",
    evidenceExpectation: "Runtime substrate, transcript diff, or IO drift evidence is recorded.",
    benchmarkStatus: "covered",
  },
  {
    family: "crypto",
    name: "rsa-probe-before-manual",
    description: "Structured crypto probe runs before ad-hoc attacks.",
    routeClass: "specialist",
    fallbackExpectation: "Normalize parameters and pivot to reversible-first or oracle-backed fallback before brute force.",
    evidenceExpectation: "Parameter inventory, weakness statement, and recovery script are recorded.",
    benchmarkStatus: "partial",
  },
  {
    family: "rev",
    name: "static-before-dynamic",
    description: "Static analysis happens before dynamic instrumentation.",
    routeClass: "specialist",
    fallbackExpectation: "Use the artifact-family reference index and fallback matrix before broad decompilation or runtime work.",
    evidenceExpectation: "Checker path, constants/transform chain, and verification oracle are recorded.",
    benchmarkStatus: "partial",
  },
  {
    family: "forensics",
    name: "preserve-original",
    description: "Original evidence is preserved before extraction work.",
    routeClass: "dispatcher",
    fallbackExpectation: "Dedicated probes first, raw tools second, and preserve provenance for every derived artifact.",
    evidenceExpectation: "Hashes, triage notes, extraction log, and reconstruction provenance are recorded.",
    benchmarkStatus: "partial",
  },
  {
    family: "misc",
    name: "classify-before-heavy-tools",
    description: "Classify the challenge before committing to a specialist route.",
    routeClass: "dispatcher",
    fallbackExpectation: "Use a classification-first fallback and hand off immediately once the real family is obvious.",
    evidenceExpectation: "Classification evidence, eliminated families, and final route are recorded.",
    benchmarkStatus: "planned",
  },
]
