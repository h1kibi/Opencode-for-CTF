export type PwnDisasmAnalysis = {
  redFlagTags: string[]
  redFlagNotes: string[]
  stackLayoutHints: string[]
  constraintHints: string[]
  routePressure: string[]
}

function uniq(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

export function analyzePwnDisasmText(text: string): PwnDisasmAnalysis {
  const lines = String(text || "").split(/\r?\n/)
  const lower = text.toLowerCase()
  const redFlagTags: string[] = []
  const redFlagNotes: string[] = []
  const constraintHints: string[] = []
  const routePressure: string[] = []
  const frameMap = new Map<string, { tags: Set<string> }>()
  let currentFunction = ""
  let lastAddressTakenOffset = ""
  let lastAddressTakenLine = -100

  const ensure = (offset: string) => {
    if (!frameMap.has(offset)) frameMap.set(offset, { tags: new Set<string>() })
    return frameMap.get(offset)!
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fn = line.match(/^([0-9a-f]+)\s+<([^>]+)>:$/i)
    if (fn) {
      currentFunction = fn[2]
      continue
    }

    const refs = Array.from(line.matchAll(/\[(?:r|e)bp([+-])0x([0-9a-f]+)(?:[^\]]*)\]/gi))
    for (const ref of refs) {
      const offset = `${ref[1]}0x${ref[2].toLowerCase()}`
      const slot = ensure(offset)
      if (/lea\s+\w+,\s*\[(?:r|e)bp-0x/i.test(line)) {
        slot.tags.add("address-taken")
        lastAddressTakenOffset = offset
        lastAddressTakenLine = i
      }
      if (/mov\s+byte ptr\s+\[(?:r|e)bp-0x[0-9a-f]+\],0x0/i.test(line)) slot.tags.add("null-terminator-write")
      if (/(cmp|add|sub|inc|dec)\s+(?:dword|qword|byte)?\s*ptr\s+\[(?:r|e)bp-0x/i.test(line))
        slot.tags.add("counter-or-state")
      if (/mov\s+byte ptr\s+\[(?:r|e)bp[^\]]*\+[^\]]*\],/i.test(line)) slot.tags.add("indexed-byte-write")
    }

    if (
      /call\s+.*<(read|recv|gets|fgets)@plt>/i.test(line) &&
      lastAddressTakenOffset &&
      i - lastAddressTakenLine <= 6
    ) {
      ensure(lastAddressTakenOffset).tags.add("input-buffer")
    }

    const cmpImm = line.match(/cmp\s+(?:dword|qword|byte)?\s*ptr\s+\[(?:r|e)bp-0x([0-9a-f]+)\],0x([0-9a-f]+)/i)
    if (cmpImm) {
      constraintHints.push(
        `${currentFunction || "?"}: stack local -0x${cmpImm[1].toLowerCase()} compared against 0x${cmpImm[2].toLowerCase()}`,
      )
    }
    const cmpReg = line.match(/cmp\s+(?:dword|qword|byte)?\s*ptr\s+\[(?:r|e)bp-0x([0-9a-f]+)\],\s*([a-z][a-z0-9]+)/i)
    if (cmpReg) {
      constraintHints.push(
        `${currentFunction || "?"}: stack local -0x${cmpReg[1].toLowerCase()} compared against register ${cmpReg[2]}`,
      )
    }
    const jne = line.match(/\bj(e|ne|g|ge|l|le|a|ae|b|be)\b\s+([0-9a-fx<>_+.@-]+)/i)
    if (jne && constraintHints.length) {
      constraintHints.push(
        `${currentFunction || "?"}: branch ${jne[0].trim()} follows a nearby comparison; treat as checker gate, not just normal loop flow`,
      )
    }
  }

  if (
    /call.*<read@plt>|call.*<recv@plt>|call.*<fgets@plt>|call.*<gets@plt>/.test(lower) &&
    /mov\s+byte ptr\s+\[.*bp-0x[0-9a-f]+\],0x0/.test(lower)
  ) {
    redFlagTags.push("off-by-null/full-length-terminator")
    redFlagNotes.push(
      "exact-length stack read plus explicit null-termination: suspect off-by-null or full-length terminator overwrite when the returned length reaches the buffer boundary",
    )
  }
  if (/mov\s+byte ptr\s+\[.*bp[^\n]*\+.*\],/.test(lower)) {
    redFlagTags.push("indexed-stack-byte-write")
    redFlagNotes.push(
      "indexed BYTE write into an rbp/ebp-relative stack region: treat this as a single-byte arbitrary stack write candidate if the index is clobberable",
    )
  }
  if (
    /cmp\s+dword ptr\s+\[.*bp-0x[0-9a-f]+\],0x[0-9a-f]+/.test(lower) &&
    /mov\s+byte ptr\s+\[.*bp[^\n]*\+.*\],/.test(lower)
  ) {
    redFlagTags.push("checker-loop-stack-smash")
    redFlagNotes.push(
      "checker-style loop plus indexed stack write: do not assume a benign multi-round protocol first; test whether one oversized packet can corrupt the loop/state variable, saved rbp, or a return-adjacent byte",
    )
  }
  if (/read\s*\([^,]+,[^,]+,\s*0x100\s*\)/.test(lower)) {
    redFlagTags.push("single-large-packet-candidate")
    redFlagNotes.push(
      "single large packet stage detected: verify whether one send can populate the whole stack frame before modeling the challenge as many clean rounds",
    )
  }

  if (redFlagTags.includes("checker-loop-stack-smash") || redFlagTags.includes("single-large-packet-candidate")) {
    routePressure.push("prefer raw/checker-stack-smash lane before broad symbolic-constraint or gadget-first drift")
  }
  if (redFlagTags.includes("off-by-null/full-length-terminator")) {
    routePressure.push(
      "test max-length input and terminator side-effects before assuming a pure arithmetic/checker problem",
    )
  }

  const stackLayoutHints = Array.from(frameMap.entries())
    .filter(([offset]) => offset.startsWith("-"))
    .sort((a, b) => parseInt(b[0].slice(3), 16) - parseInt(a[0].slice(3), 16))
    .slice(0, 12)
    .map(([offset, info]) => {
      const tags = Array.from(info.tags)
      const role = tags.includes("input-buffer")
        ? "likely input buffer"
        : tags.includes("indexed-byte-write")
          ? "indexed write target"
          : tags.includes("counter-or-state")
            ? "likely loop/state variable"
            : tags.includes("address-taken")
              ? "address-taken local"
              : "stack local"
      return `${offset}: ${role}${tags.length ? `; tags=${tags.join(",")}` : ""}`
    })

  if (stackLayoutHints.length) {
    stackLayoutHints.push("+0x0: saved rbp / frame-pointer boundary")
    stackLayoutHints.push("+0x8: return address boundary")
  }

  return {
    redFlagTags: uniq(redFlagTags),
    redFlagNotes: uniq(redFlagNotes),
    stackLayoutHints: uniq(stackLayoutHints),
    constraintHints: uniq(constraintHints).slice(0, 18),
    routePressure: uniq(routePressure),
  }
}
