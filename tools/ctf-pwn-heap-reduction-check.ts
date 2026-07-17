import { tool } from "@opencode-ai/plugin"

type Signal = {
  name: string
  present: boolean
}

function has(text: string, re: RegExp) {
  return re.test(text)
}

export default tool({
  description:
    "CTF pwn heap reduction check: decide the shortest next heap-specific reduction step from version, lifecycle, leak, and primitive evidence without jumping to named techniques too early.",
  args: {
    evidence: tool.schema
      .string()
      .describe(
        "Heap notes, menu operations, glibc/version clues, leak state, and bug proof summary for a heap-style challenge.",
      ),
  },
  async execute(args) {
    const text = String(args.evidence || "")
    const lower = text.toLowerCase()
    if (text.trim().length < 10) return "BLOCK: provide heap notes, version clues, and primitive evidence"

    const signals: Signal[] = [
      { name: "glibc_234_plus", present: has(lower, /glibc\s*2\.(3[4-9]|[4-9]\d)|2\.4\d|2\.5\d|>=\s*2\.34/) },
      { name: "safe_linking", present: has(lower, /safe-linking|safe linking/) },
      { name: "has_show_or_leak", present: has(lower, /show|leak|unsorted|pointer|libc leak|heap leak/) },
      { name: "uaf_or_double_free", present: has(lower, /uaf|use-after-free|double free/) },
      { name: "overflow_or_off_by_one", present: has(lower, /overflow|off-by-one|off by one|partial overwrite/) },
      {
        name: "alloc_free_edit_surface",
        present:
          has(lower, /alloc|malloc|create|new/) &&
          has(lower, /free|delete|remove/) &&
          has(lower, /edit|write|update|set/),
      },
      { name: "version_known", present: has(lower, /glibc|libc version|allocator version|tcache|fastbin|unsorted/) },
      { name: "target_hook_bias", present: has(lower, /__free_hook|__malloc_hook/) },
    ]

    const missing: string[] = []
    if (!signals.find((s) => s.name === "version_known")?.present) missing.push("allocator/glibc version")
    if (!signals.find((s) => s.name === "alloc_free_edit_surface")?.present) missing.push("menu lifecycle reduction")
    if (
      !signals.find((s) => s.name === "has_show_or_leak")?.present &&
      signals.find((s) => s.name === "safe_linking")?.present
    )
      missing.push("heap/libc leak before safe-linking-era poisoning")
    if (!(
      signals.find((s) => s.name === "uaf_or_double_free")?.present ||
      signals.find((s) => s.name === "overflow_or_off_by_one")?.present
    ))
      missing.push("one concrete write/lifetime primitive proof")

    const antiRoutes: string[] = []
    if (signals.find((s) => s.name === "glibc_234_plus")?.present)
      antiRoutes.push("do not default to __free_hook / __malloc_hook closure")
    if (
      signals.find((s) => s.name === "safe_linking")?.present &&
      !signals.find((s) => s.name === "has_show_or_leak")?.present
    )
      antiRoutes.push("do not jump to tcache poisoning before a heap leak or safe-linking key strategy")
    if (missing.includes("allocator/glibc version"))
      antiRoutes.push("do not choose a named house/tcache/fastbin technique before version reduction")

    let nextStep = "reduce menu lifecycle, chunk size rules, and one concrete primitive before naming techniques"
    if (missing[0] === "allocator/glibc version")
      nextStep = "determine allocator/glibc version first and map it to viable target families"
    else if (missing[0] === "menu lifecycle reduction")
      nextStep = "reduce alloc/free/edit/show rules and index reuse before further payload mutation"
    else if (missing[0] === "heap/libc leak before safe-linking-era poisoning")
      nextStep = "prioritize one leak path (show/unsorted/libc/heap) before poisoning attempts"
    else if (missing[0] === "one concrete write/lifetime primitive proof")
      nextStep = "prove one UAF/double-free/overflow/off-by-one effect with the cheapest local oracle"
    else if (
      signals.find((s) => s.name === "uaf_or_double_free")?.present &&
      signals.find((s) => s.name === "has_show_or_leak")?.present
    )
      nextStep = "upgrade the proved lifetime bug into a shortest leak-to-write or leak-to-closure path"

    const primitiveUpgradePath = [
      signals.find((s) => s.name === "has_show_or_leak")?.present
        ? "use stable leak to classify heap/libc base and target viability"
        : "get one stable leak",
      signals.find((s) => s.name === "uaf_or_double_free")?.present
        ? "use lifetime bug to prove controlled reuse / dup / overlap"
        : "prove one lifetime bug",
      signals.find((s) => s.name === "overflow_or_off_by_one")?.present
        ? "measure overwrite boundary and affected metadata/neighbor object"
        : "prove one overwrite boundary",
      "only then choose the version-gated closure target",
    ]

    return [
      "pwn_heap_reduction_check:",
      "signals:",
      ...signals.map((s) => `- ${s.name}: ${s.present}`),
      "missing_prerequisites:",
      ...(missing.length ? missing.map((m) => `- ${m}`) : ["- none obvious"]),
      "anti_routes:",
      ...(antiRoutes.length ? antiRoutes.map((x) => `- ${x}`) : ["- none specific"]),
      `next_reduction_step: ${nextStep}`,
      "primitive_upgrade_path:",
      ...primitiveUpgradePath.map((x) => `- ${x}`),
      "stop_rule:",
      "- Do not promote a named heap technique until version, lifecycle rules, and one concrete leak/write/lifetime primitive are all evidenced.",
    ].join("\n")
  },
})
