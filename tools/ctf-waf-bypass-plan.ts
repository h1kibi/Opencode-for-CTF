import { tool } from "@opencode-ai/plugin"

type MatrixRow = {
  order: number
  family: string
  technique: string
  payloadTemplate: string
  oracle: string
  stopCondition: string
  risk: "low" | "medium" | "high"
}

type FamilyDef = Omit<MatrixRow, "order">

function has(text: string, words: RegExp) {
  return words.test(text)
}

function uniqueRows(rows: FamilyDef[]) {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const key = `${row.family}:${row.technique}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function selectedFamilies(blocker: string, stack: string, sink: string, evidence: string): FamilyDef[] {
  const blob = `${blocker} ${stack} ${sink} ${evidence}`.toLowerCase()
  const rows: FamilyDef[] = []

  if (has(blob, /extension|suffix|filename|upload|mime|content-type|file type|magic/)) {
    rows.push(
      {
        family: "parser-differential",
        technique: "filename and content-type split",
        payloadTemplate: "keep body harmless; vary filename/content-type separately (e.g. .txt vs allowed extension vs polyglot marker)",
        oracle: "accepted/rejected or stored/readback path changes while payload content remains harmless",
        stopCondition: "no differential across three single-variable filename/content-type variants",
        risk: "low",
      },
      {
        family: "normalization",
        technique: "case/double-extension/trailing-dot normalization",
        payloadTemplate: "name.allowed.txt / name.txt.allowed / NAME.ALLOWED / name.allowed.",
        oracle: "server-side stored extension or downstream parser differs from front-end validator",
        stopCondition: "storage/readback always canonicalizes to blocked extension or rejects uniformly",
        risk: "low",
      },
    )
  }

  if (has(blob, /keyword|denylist|blacklist|waf|filtered|script|select|union|eval|class|constructor|import|process/)) {
    rows.push(
      {
        family: "encoding",
        technique: "single encoding boundary test",
        payloadTemplate: "replace one blocked token with URL/HTML/Unicode escape appropriate to context",
        oracle: "blocked-token error disappears or reflected/stored/server behavior changes without increasing payload power",
        stopCondition: "encoded token is decoded before the same filter or reaches no sink differential",
        risk: "low",
      },
      {
        family: "token-splitting",
        technique: "semantic equivalent without exact keyword",
        payloadTemplate: "split or concatenate the blocked token using language/framework-supported syntax",
        oracle: "validator no longer detects keyword while sink still interprets equivalent value",
        stopCondition: "sink does not support recombination or filter normalizes before checking",
        risk: "medium",
      },
    )
  }

  if (has(blob, /path|traversal|slash|dot|directory|base|jail|lfi|download|include/)) {
    rows.push(
      {
        family: "path-normalization",
        technique: "separator and dot-segment differential",
        payloadTemplate: "use one variant at a time: ./, ../, encoded slash, backslash, doubled separator",
        oracle: "file/error differential changes for harmless known path only",
        stopCondition: "all variants normalize to same canonical path/error",
        risk: "low",
      },
      {
        family: "wrapper-or-alias",
        technique: "alternate read mechanism after normalization block",
        payloadTemplate: "framework-specific wrapper/alias for harmless source/config probe, not flag path first",
        oracle: "wrapper-specific error or harmless file read confirms alternate parser",
        stopCondition: "wrappers disabled or no parser-specific differential",
        risk: "medium",
      },
    )
  }

  if (has(blob, /scheme|protocol|ssrf|url|host|redirect|gopher|file|metadata|allowlist/)) {
    rows.push(
      {
        family: "url-parser-differential",
        technique: "host/scheme parsing boundary",
        payloadTemplate: "same benign destination with one parser mutation: userinfo, trailing dot, IPv6/IPv4 form, redirect hop",
        oracle: "server-side fetch destination or allow/deny decision differs from displayed URL",
        stopCondition: "all URL variants resolve/fetch identically or egress is disabled",
        risk: "low",
      },
      {
        family: "redirect-chain",
        technique: "allowlist front then controlled redirect",
        payloadTemplate: "allowed URL that 302s to harmless internal/canary endpoint",
        oracle: "server follows redirect and produces callback/status differential",
        stopCondition: "redirects disabled or final host revalidated consistently",
        risk: "medium",
      },
    )
  }

  if (has(blob, /json|xml|yaml|deserialize|deser|fastjson|jackson|type|class|binding|content-type/)) {
    rows.push(
      {
        family: "content-type-confusion",
        technique: "same body shape under alternate parser",
        payloadTemplate: "hold harmless canary constant; vary Content-Type between json/xml/yaml/form if endpoint accepts it",
        oracle: "parser-specific error/type-binding differential appears",
        stopCondition: "endpoint accepts exactly one parser with identical error behavior",
        risk: "low",
      },
      {
        family: "shape-confusion",
        technique: "object/array/scalar boundary",
        payloadTemplate: "change one field shape to array/object/null while preserving harmless canary value",
        oracle: "binding/validation error differs or downstream field interpretation changes",
        stopCondition: "schema validation rejects all shape variants before sink",
        risk: "low",
      },
    )
  }

  if (has(blob, /template|ssti|jinja|twig|smarty|\{\{|__class__/)) {
    rows.push(
      {
        family: "template-bypass",
        technique: "delimiter or object-path semantic equivalent",
        payloadTemplate: "keep the template effect harmless; vary one blocked delimiter, attribute path, or built-in accessor representation at a time",
        oracle: "template parse/escape/sandbox behavior changes while the semantic goal stays constant",
        stopCondition: "three single-variable delimiter/object-path variants produce no new parse or render differential",
        risk: "medium",
      },
      {
        family: "sandbox-surface",
        technique: "harmless built-in and context pivot",
        payloadTemplate: "switch one harmless object/function/context reference at a time to learn what the sandbox still exposes",
        oracle: "error class, undefined handling, or rendered value changes reveal surviving template surface",
        stopCondition: "sandbox rejects all harmless context pivots identically before evaluation",
        risk: "low",
      },
    )
  }

  if (has(blob, /command|rce|exec|system|pipe|backtick|semicolon|\$\(/)) {
    rows.push(
      {
        family: "command-injection-bypass",
        technique: "separator and subshell equivalence",
        payloadTemplate: "replace exactly one blocked shell separator/subshell form with a context-valid equivalent while keeping the command harmless",
        oracle: "filter outcome or command-side observable changes without increasing the payload beyond a harmless canary",
        stopCondition: "three separator/subshell equivalents normalize to the same filter decision and runtime behavior",
        risk: "medium",
      },
      {
        family: "argument-shape",
        technique: "option/value boundary probe",
        payloadTemplate: "keep the target command harmless; vary one quoting, whitespace, or argument-boundary representation",
        oracle: "argument parsing or validation changes reveal whether bypass should target the shell, wrapper, or downstream binary",
        stopCondition: "wrapper and command parse all harmless boundary variants identically",
        risk: "low",
      },
    )
  }

  if (has(blob, /xss|script|onerror|javascript|svg|math|iframe|csp/)) {
    rows.push(
      {
        family: "xss-content-bypass",
        technique: "alternative active content container",
        payloadTemplate: "swap one blocked active-content form for a harmless equivalent container such as svg/mathml/iframe/srcdoc depending on context",
        oracle: "sanitizer/filter behavior differs while the marker remains harmless and observable",
        stopCondition: "all alternative containers are stripped, escaped, or CSP-blocked identically",
        risk: "medium",
      },
      {
        family: "eventless-script-gadget",
        technique: "non-inline execution surface",
        payloadTemplate: "replace a blocked inline handler or javascript: URL with one non-inline same-origin/external resource reference suitable for the context",
        oracle: "DOM/storage/render or CSP violation behavior changes indicate a viable non-inline execution path",
        stopCondition: "CSP/sanitizer treats all non-inline gadget attempts identically with no new differential",
        risk: "medium",
      },
    )
  }

  if (has(blob, /php|file\.write|file_put|upload\.content|prefix|suffix|wrapper/)) {
    rows.push(
      {
        family: "file-write-bypass",
        technique: "prefix/suffix and wrapper boundary",
        payloadTemplate: "hold the write target harmless; vary one prefix/suffix/wrapper representation to learn whether filtering happens before or after final content assembly",
        oracle: "stored bytes, length, parser error, or readback behavior changes without deploying an active payload",
        stopCondition: "all harmless prefix/suffix/wrapper variants are normalized or rejected identically",
        risk: "medium",
      },
      {
        family: "content-assembly",
        technique: "split-and-recombine harmless marker",
        payloadTemplate: "split one blocked content marker across fields/encodings/wrappers while keeping the reconstructed effect harmless",
        oracle: "storage pipeline or downstream parser recombines content differently from the validator",
        stopCondition: "validator and final writer observe the same bytes across three recombination variants",
        risk: "medium",
      },
    )
  }

  if (has(blob, /sql|sqli|quote|space|comma|union|where|order|limit/)) {
    rows.push(
      {
        family: "sql-syntax-equivalence",
        technique: "whitespace/comment/operator alternative",
        payloadTemplate: "replace exactly one blocked syntax element with DB-specific equivalent; use harmless boolean oracle",
        oracle: "boolean/error/timing differential changes without broad extraction",
        stopCondition: "three syntax-equivalent probes show no controlled differential",
        risk: "medium",
      },
      {
        family: "query-shape",
        technique: "numeric/string/context fingerprint before bypass",
        payloadTemplate: "one harmless type boundary probe: numeric delta, quote balance, order index",
        oracle: "stable DB-context fingerprint identifies correct bypass family",
        stopCondition: "all context probes identical to baseline",
        risk: "low",
      },
    )
  }

  if (!rows.length) {
    rows.push(
      {
        family: "baseline-differential",
        technique: "single-variable blocker characterization",
        payloadTemplate: "start with harmless marker; mutate only the suspected blocked character/token once",
        oracle: "identify exact filter boundary: request rejected, normalized, escaped, or sink-only failure",
        stopCondition: "no observable difference between baseline and one-variable mutant",
        risk: "low",
      },
      {
        family: "semantic-mismatch",
        technique: "precheck/sink consumer split",
        payloadTemplate: "keep semantic value harmless; test whether validator and sink parse the same representation",
        oracle: "validator accepts but downstream parser reports a different interpretation",
        stopCondition: "precheck and sink normalize identically across three representations",
        risk: "low",
      },
    )
  }

  return uniqueRows(rows)
}

export default tool({
  description: "CTF WAF/filter bypass planner: generate a strict, low-noise bypass matrix from a BLOCKED chain/segment. It does not execute payloads.",
  args: {
    blocker: tool.schema.string().describe("Observed blocker/filter/WAF behavior, e.g. extension filter, keyword blacklist, slash normalization."),
    stack: tool.schema.string().optional().describe("Technology stack/framework if known, e.g. Spring, PHP, nginx, Node, Tomcat."),
    sink: tool.schema.string().optional().describe("Target sink/primitive context, e.g. upload storage, SSRF URL fetch, SQL query, template render."),
    evidence: tool.schema.string().optional().describe("Relevant route, error, validation text, SecKB hit, or chain-state observation."),
    maxFamilies: tool.schema.number().optional().describe("Maximum bypass families to output. Default 5, hard cap 8."),
  },
  async execute(args) {
    const maxFamilies = Math.max(1, Math.min(Number(args.maxFamilies ?? 5), 8))
    const rows: MatrixRow[] = selectedFamilies(args.blocker, args.stack || "", args.sink || "", args.evidence || "")
      .slice(0, maxFamilies)
      .map((row, idx) => ({ order: idx + 1, ...row }))

    const out: string[] = []
    out.push("verdict: waf_bypass_plan_v1")
    out.push(`blocker: ${args.blocker}`)
    if (args.stack) out.push(`stack: ${args.stack}`)
    if (args.sink) out.push(`sink: ${args.sink}`)
    out.push("rules:")
    out.push("- Execute one family at a time; do not combine bypasses until a differential is observed.")
    out.push("- Every attempt must have an oracle and must be recorded via ctf-decision-state observe and chain-state observe.")
    out.push("- After 3 failed families with no new differential, mark the branch BLOCKED or backtrack to the nearest confirmed shared segment; mark DEAD only when the sink/parser family itself is falsified.")
    out.push("bypass_matrix:")
    for (const row of rows) {
      out.push(`- order: ${row.order}`)
      out.push(`  family: ${row.family}`)
      out.push(`  technique: ${row.technique}`)
      out.push(`  payload_template: ${row.payloadTemplate}`)
      out.push(`  oracle: ${row.oracle}`)
      out.push(`  stop_condition: ${row.stopCondition}`)
      out.push(`  risk: ${row.risk}`)
    }
    out.push("next_required:")
    out.push("- Pick order=1 unless evidence clearly rules it out; create a one-variable probe contract before executing.")
    out.push("- If a bypass works, mark the segment BYPASSED and rerank chains before continuing.")
    return out.join("\n")
  },
})
