import { tool } from "@opencode-ai/plugin"

type Chain = {
  id: string
  title: string
  family: string
  terms: string[]
  value: number
  confidence: number
  infoGain: number
  cost: number
  risk: number
  stateDamage: number
  stability: number
  requires: string[]
  produces: string[]
  firstProbe: string
  confirm: string
  falsify: string
  pivot: string
  closure: string[]
}

const chains: Chain[] = [
  {
    id: "java-actuator-control-plane",
    title: "Spring Boot actuator/config control plane to closure",
    family: "control-plane",
    terms: [
      "actuator",
      "management.endpoint",
      "management.endpoints",
      "spring-boot-starter-actuator",
      "mappings",
      "heapdump",
    ],
    value: 5,
    confidence: 3,
    infoGain: 5,
    cost: 1,
    risk: 1,
    stateDamage: 1,
    stability: 5,
    requires: ["Spring Boot evidence", "actuator/config route or property", "auth boundary status"],
    produces: ["route map", "config/env key names", "heap/log/source leak", "direct flag path candidate"],
    firstProbe:
      "Fetch actuator index or mappings/env availability only; record status, content-type, length, and auth differential.",
    confirm: "Endpoint list/mappings/env/heapdump/logfile or meaningful auth differential appears.",
    falsify: "All actuator-shaped routes flat 404/403 and source/config has no exposure signal.",
    pivot: "Pivot to Spring Security route table or source/config map.",
    closure: [
      "config/env key read",
      "mappings to hidden route",
      "heapdump/logfile to secret/flag",
      "H2/Swagger follow-up",
    ],
  },
  {
    id: "java-h2-console-db",
    title: "H2 console or datasource to database/flag closure",
    family: "database-control-plane",
    terms: ["h2-console", "jdbc:h2", "spring.h2.console", "com.h2database", "h2"],
    value: 5,
    confidence: 3,
    infoGain: 5,
    cost: 1,
    risk: 2,
    stateDamage: 1,
    stability: 4,
    requires: ["H2 dependency/config", "console or SQL route", "JDBC URL/credential or query oracle"],
    produces: ["database read", "admin creds/session data", "flag row", "parser mismatch route"],
    firstProbe: "Verify /h2-console and config-derived JDBC settings; use metadata/read-only checks first.",
    confirm: "Console page, successful connection, metadata query, or H2 parser-specific differential.",
    falsify: "H2 is test-only/unreachable and no runtime SQL route uses it.",
    pivot: "Pivot to MyBatis/HQL/JDBC source slice.",
    closure: [
      "read flag table",
      "read users/admin",
      "read config from DB",
      "H2 parser chain only if route gates exist",
    ],
  },
  {
    id: "java-mybatis-dollar-sqli",
    title: "MyBatis raw dollar SQL injection to DB read",
    family: "sqli",
    terms: ["mybatis", "mapper", "${", "@Select", "@Update", "@Insert", "@Delete", "mybatis-raw-sql-candidate"],
    value: 5,
    confidence: 3,
    infoGain: 5,
    cost: 2,
    risk: 2,
    stateDamage: 1,
    stability: 4,
    requires: ["Mapper sink", "controller/service reachability", "route-controlled parameter", "SQL oracle"],
    produces: ["DB read primitive", "auth bypass", "flag/admin data"],
    firstProbe: "Trace exact controller/service/mapper parameter, then run one harmless boolean/quote differential.",
    confirm: "Response/error/row count/logged SQL changes as predicted for that parameter.",
    falsify: "Sink uses safe binding or parameter is not route-controlled/reachable.",
    pivot: "Pivot to H2/HQL parser mismatch or auth/logic route if SQL is guarded.",
    closure: ["read flag row", "read admin/session table", "login as admin through DB primitive"],
  },
  {
    id: "java-template-expression",
    title: "Template/SpEL expression to file read or command primitive",
    family: "template-expression",
    terms: [
      "thymeleaf",
      "spel",
      "ExpressionParser",
      "SpelExpressionParser",
      "Freemarker",
      "FreeMarker",
      "Velocity",
      "ModelAndView",
      "setViewName",
      "template-expression-candidate",
    ],
    value: 5,
    confidence: 3,
    infoGain: 4,
    cost: 2,
    risk: 2,
    stateDamage: 1,
    stability: 4,
    requires: ["engine/context identified", "controlled template/view/expression input", "render/error oracle"],
    produces: ["file read", "template render primitive", "command only if required"],
    firstProbe:
      "Use one harmless engine-specific expression or template-resolution marker against the controlled field.",
    confirm: "Expression evaluation, engine parse error, resolver differential, or local harness render result.",
    falsify: "Controlled value is escaped model data only or never reaches template/expression parser.",
    pivot: "Pivot to file read/static resource/auth if engine context is absent.",
    closure: [
      "read flag/config via Spring/JDK file utilities",
      "admin preview render",
      "command only after file-read closure fails",
    ],
  },
  {
    id: "java-upload-writeback",
    title: "Upload/file write to served readback or JSP closure",
    family: "file-write",
    terms: [
      "MultipartFile",
      "transferTo",
      "FileOutputStream",
      "Files.write",
      "getRealPath",
      "upload-archive-sink",
      "jsp",
    ],
    value: 5,
    confidence: 3,
    infoGain: 4,
    cost: 2,
    risk: 3,
    stateDamage: 3,
    stability: 3,
    requires: [
      "write/upload route",
      "controlled name/content/path",
      "canary create/readback",
      "served/reload behavior for JSP",
    ],
    produces: ["file write", "static readback", "JSP execution if served", "config/source writeback"],
    firstProbe: "Use ctf-file-write-matrix; write/read a harmless canary and prove served path before final writes.",
    confirm: "Canary appears at expected filesystem/HTTP readback path or storage path is proven controllable.",
    falsify: "Fixed safe filename/path outside served/consumed location and no traversal/readback.",
    pivot: "Pivot to file read, include consumer, archive extraction, or path traversal.",
    closure: ["readback flag via write primitive", "JSP only if served/reloaded", "overwrite-free canary-based final"],
  },
  {
    id: "java-shiro-gated",
    title: "Shiro rememberMe/filter-chain gated branch",
    family: "shiro",
    terms: ["shiro", "rememberMe", "deleteMe", "CookieRememberMeManager", "cipherKey"],
    value: 5,
    confidence: 2,
    infoGain: 4,
    cost: 3,
    risk: 3,
    stateDamage: 1,
    stability: 3,
    requires: [
      "Shiro present",
      "rememberMe parser or filter-chain evidence",
      "key/config/classpath or auth route oracle",
    ],
    produces: ["auth bypass", "deserialization primitive", "admin route"],
    firstProbe:
      "Confirm rememberMe/deleteMe or filter-chain behavior before gadgets; map key/classpath if parser route exists.",
    confirm: "Shiro-specific cookie parse behavior, auth boundary change, or filter-chain route differential.",
    falsify: "No rememberMe behavior/key/classpath or no filter-chain mismatch.",
    pivot: "Pivot from gadget to Shiro authz/filter-chain, or to source-proven sinks.",
    closure: ["admin route", "session/role boundary", "gadget only after gates"],
  },
  {
    id: "java-parser-deser-gated",
    title: "Java parser/deserialization branch with strict gates",
    family: "deserialization",
    terms: [
      "ObjectInputStream",
      "readObject",
      "XMLDecoder",
      "fastjson",
      "parseObject",
      "ObjectMapper",
      "activateDefaultTyping",
      "enableDefaultTyping",
      "XStream",
      "Yaml",
      "rO0AB",
      "aced0005",
      "@type",
    ],
    value: 5,
    confidence: 2,
    infoGain: 4,
    cost: 3,
    risk: 3,
    stateDamage: 1,
    stability: 3,
    requires: [
      "parser call",
      "controlled bytes/string/body/cookie/file",
      "type/parser config",
      "classpath or feature",
      "oracle",
    ],
    produces: ["parser primitive", "file read/write", "command only if closure needs it"],
    firstProbe: "Send or harness one benign malformed/typed object to prove parser-specific behavior.",
    confirm: "Parser-specific exception/acceptance/timing/writeback/class resolution differential.",
    falsify: "No controlled parser path or type metadata/serialized bytes ignored.",
    pivot: "Pivot to business sinks, auth logic, or file/template route.",
    closure: ["file/config/flag read", "writeback", "command/gadget only after all gates"],
  },
  {
    id: "java-auth-logic",
    title: "Java auth/filter/interceptor/mass-assignment logic chain",
    family: "authz-logic",
    terms: [
      "SecurityFilterChain",
      "antMatchers",
      "requestMatchers",
      "permitAll",
      "hasRole",
      "HandlerInterceptor",
      "excludePathPatterns",
      "@RequestBody",
      "@ModelAttribute",
      "isAdmin",
      "role",
    ],
    value: 5,
    confidence: 3,
    infoGain: 5,
    cost: 2,
    risk: 1,
    stateDamage: 2,
    stability: 4,
    requires: ["protected route or privileged object", "auth/filter/session/binder evidence", "clean oracle"],
    produces: ["admin route", "role/owner escalation", "workflow bypass", "flag page access"],
    firstProbe: "Build route-auth table or add one harmless hidden DTO field with clean-session oracle.",
    confirm: "403/302/200 boundary, role/owner/session, or stored-field behavior changes.",
    falsify: "Focused auth/path/field variants produce flat decisions and binder rejects extras.",
    pivot: "Pivot to source-proven sink behind the auth boundary or IDOR matrix.",
    closure: ["admin-only route", "owner object read", "session/role boundary", "privileged preview/sink"],
  },
]

function termScore(evidence: string, chain: Chain) {
  const lower = evidence.toLowerCase()
  let hits = 0
  for (const term of chain.terms) {
    if (lower.includes(term.toLowerCase())) hits++
  }
  return hits
}

function rankScore(chain: Chain, hits: number, mode: string) {
  const base =
    2 * chain.value +
    chain.confidence +
    chain.infoGain +
    chain.stability -
    (chain.cost + chain.risk + chain.stateDamage)
  const hardBonus = mode === "hard" && ["deserialization", "shiro", "authz-logic"].includes(chain.family) ? 2 : 0
  return base + hits * 4 + hardBonus
}

export default tool({
  description:
    "CTF Java Web chain planner: convert Java map/config/dep/source-slice evidence into ranked exploit-chain candidates with gates, first probes, and closure paths.",
  args: {
    evidence: tool.schema
      .string()
      .describe("Compact Java Web evidence from ctf-java-map/config/source-slice/dep-risk/blackbox output."),
    mode: tool.schema.string().optional().describe("direct | medium | hard. Default medium."),
    maxChains: tool.schema.number().optional().describe("Maximum chains. Default 5, hard cap 8."),
  },
  async execute(args) {
    const mode = (args.mode || "medium").toLowerCase()
    const maxChains = Math.max(1, Math.min(args.maxChains ?? 5, 8))
    const ranked = chains
      .map((chain) => ({ chain, hits: termScore(args.evidence, chain) }))
      .filter((x) => x.hits > 0)
      .map((x) => ({ ...x, score: rankScore(x.chain, x.hits, mode) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxChains)

    const fallback = ranked.length
      ? []
      : [
          "No chain had strong keyword evidence. First run ctf-java-config-map, ctf-java-map, ctf-java-source-slice, and ctf-java-dep-risk or provide their Attack Queue Seed output.",
          "If URL-only, run ctf-web-fingerprint and ctf-web-blackbox-map with Java indicators before planning chains.",
        ]

    return [
      "# Java Web Chain Planner",
      `mode: ${mode}`,
      `evidence_chars: ${args.evidence.length}`,
      `chains_ranked: ${ranked.length}`,
      "",
      "## Ranked Chains",
      ...(ranked.length
        ? ranked.map(({ chain, hits, score }, i) =>
            [
              `### #${i + 1} ${chain.id}`,
              `title: ${chain.title}`,
              `family: ${chain.family}`,
              `score: ${score} hits: ${hits}`,
              `value/confidence/infoGain/cost/risk/stateDamage/stability: ${chain.value}/${chain.confidence}/${chain.infoGain}/${chain.cost}/${chain.risk}/${chain.stateDamage}/${chain.stability}`,
              `requires: ${chain.requires.join(" | ")}`,
              `produces: ${chain.produces.join(" | ")}`,
              `first_probe: ${chain.firstProbe}`,
              `confirm: ${chain.confirm}`,
              `falsify: ${chain.falsify}`,
              `pivot: ${chain.pivot}`,
              `closure: ${chain.closure.join(" | ")}`,
            ].join("\n"),
          )
        : ["- none", ...fallback.map((x) => `- ${x}`)]),
      "",
      "## Decision Contract",
      "- Promote at most the top 3 OPEN chains into ctf-decision-state hypotheses.",
      "- Dependency/gadget chains remain capped until route, config, controlled data shape, classpath/feature, and oracle gates are proven.",
      "- Execute exactly one first_probe for the selected chain; observe confirm/falsify before trying sibling payloads.",
      "- Once a primitive is confirmed, stop broad Java scanning and build the closure queue.",
    ].join("\n")
  },
})
