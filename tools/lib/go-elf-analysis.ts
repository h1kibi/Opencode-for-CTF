function scanAsciiAt(buf: Buffer, start: number, maxLen = 256) {
  let end = start
  while (end < buf.length && end - start < maxLen) {
    const b = buf[end]
    if (b < 0x20 || b > 0x7e) break
    end++
  }
  return end > start ? buf.subarray(start, end).toString("latin1") : ""
}

export function collectGoNameCandidates(buf: Buffer, max = 200) {
  const names: string[] = []
  const seen = new Set<string>()
  for (let i = 0; i < buf.length - 12 && names.length < max; i++) {
    const s = scanAsciiAt(buf, i, 192)
    if (!s) continue
    if (
      /^(?:main|runtime|fmt|bytes|strings|os|io|net|crypto(?:\/[A-Za-z0-9_]+)?|encoding(?:\/[A-Za-z0-9_]+)?)\.[A-Za-z0-9_$.]+$/.test(
        s,
      )
    ) {
      if (!seen.has(s)) {
        seen.add(s)
        names.push(s)
      }
      i += Math.max(0, s.length - 1)
    }
  }
  return names
}

export function findGopclntabOffsets(buf: Buffer, max = 12) {
  const hits: string[] = []
  const markers = [
    Buffer.from(".gopclntab", "latin1"),
    Buffer.from("runtime.main", "latin1"),
    Buffer.from("main.main", "latin1"),
  ]
  for (const marker of markers) {
    let off = 0
    while (off < buf.length && hits.length < max) {
      const idx = buf.indexOf(marker, off)
      if (idx < 0) break
      hits.push(`0x${idx.toString(16)}`)
      off = idx + 1
    }
  }
  return Array.from(new Set(hits)).slice(0, max)
}

export function classifyGoFunctions(names: string[]) {
  const userCode = names.filter((s) => /^main\./.test(s) && !/^main\.init(\.|$)/.test(s))
  const runtimeNoise = names.filter((s) => /^runtime\./.test(s))
  const initChain = names.filter((s) => /(?:^main\.init|\.init$|\.init\.)/.test(s)).slice(0, 40)
  const decoderLike = names
    .filter((s) => /base64|decode|decrypt|unmarshal|parse|check|verify|compare/i.test(s))
    .slice(0, 60)
  return { userCode, runtimeNoise, initChain, decoderLike }
}

export function detectGoFromStrings(strings: string[]) {
  const joined = strings.join("\n")
  const goSignals = [
    /go build id[:=]/i.test(joined) ? "go.buildid" : "",
    /\.gopclntab/i.test(joined) ? ".gopclntab" : "",
    /runtime\.main/i.test(joined) ? "runtime.main" : "",
    /main\.main/i.test(joined) ? "main.main" : "",
    /\/usr\/local\/go\/src\//i.test(joined) ? "goroot-source-paths" : "",
    /go1\.[0-9]+/.test(joined) ? "go-version-hint" : "",
  ].filter(Boolean)
  const functionNameHits = Array.from(
    new Set(
      strings.filter(
        (s) =>
          /\b(?:main|runtime)\.[A-Za-z0-9_]+\b/.test(s) ||
          /\b(?:fmt|bytes|strings|os|io|encoding(?:\/[A-Za-z0-9_]+)?|crypto(?:\/[A-Za-z0-9_]+)?)\.[A-Za-z0-9_]+\b/.test(
            s,
          ),
      ),
    ),
  ).slice(0, 120)
  const runtime = goSignals.length >= 2 || functionNameHits.some((x) => x === "main.main") ? "go" : "unknown"
  return { runtime, goSignals, functionNameHits }
}
