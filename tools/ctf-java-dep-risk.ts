import { tool } from "@opencode-ai/plugin"
import path from "node:path"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`target must stay inside the current workspace: ${input}`)
  }
  return target
}

type Risk = {
  names: string[]
  family: string
  configGate: string
  reachableSink: string
  dataShape: string
  firstSafeCheck: string
  reference: string
}

const risks: Risk[] = [
  {
    names: ["shiro"],
    family: "Shiro rememberMe/session token",
    configGate: "Shiro filter chain, CookieRememberMeManager, cipher key",
    reachableSink: "rememberMe cookie processing",
    dataShape: "base64/encrypted serialized cookie",
    firstSafeCheck: "Verify rememberMe behavior, key/config clue, and tamper oracle before gadget payloads",
    reference: "java-deser-shiro-fastjson.md",
  },
  {
    names: ["fastjson"],
    family: "Fastjson autoType/deserialization",
    configGate: "version plus autoType/parser config",
    reachableSink: "JSON endpoint using parseObject/parseArray",
    dataShape: "controlled JSON body with type-like fields",
    firstSafeCheck: "Send harmless type/error probe to confirm parser behavior",
    reference: "java-deser-shiro-fastjson.md",
  },
  {
    names: ["jackson-databind", "jackson-dataformat-yaml"],
    family: "Jackson polymorphic/default typing",
    configGate: "default typing, annotated polymorphism, YAML factory",
    reachableSink: "ObjectMapper reads controlled body",
    dataShape: "controlled JSON/YAML type field or polymorphic property",
    firstSafeCheck: "Verify type field is accepted or produces Jackson-specific error",
    reference: "java-deser-shiro-fastjson.md",
  },
  {
    names: ["xstream", "snakeyaml"],
    family: "XML/YAML object construction",
    configGate: "parser configuration and allowed types",
    reachableSink: "XStream/SnakeYAML loads controlled document",
    dataShape: "controlled XML/YAML document",
    firstSafeCheck: "Use benign type/tag parse probe and observe parser-specific error",
    reference: "java-deser-shiro-fastjson.md",
  },
  {
    names: ["mybatis"],
    family: "MyBatis raw SQL",
    configGate: "mapper XML/annotation uses ${} or string dynamic SQL",
    reachableSink: "controller/service calls mapper with controlled field",
    dataShape: "controlled sort/table/column/search parameter",
    firstSafeCheck: "Inspect mapper binding and test one harmless SQL differential",
    reference: "java-sql-mybatis.md",
  },
  {
    names: ["thymeleaf", "freemarker", "velocity", "spring-expression", "struts"],
    family: "Template/expression injection",
    configGate: "engine/parser context and sandbox",
    reachableSink: "template/view/expression receives controlled input",
    dataShape: "controlled template body/name/fragment/expression/model field",
    firstSafeCheck: "Use engine-specific harmless arithmetic/string marker",
    reference: "java-template-expression.md",
  },
  {
    names: ["spring-boot-starter-actuator"],
    family: "Spring Boot actuator/config exposure",
    configGate: "management endpoints exposure and auth boundary",
    reachableSink: "actuator endpoints reachable",
    dataShape: "HTTP path access",
    firstSafeCheck: "Check /actuator and mappings/env/logfile exposure with auth status",
    reference: "spring-boot-source-map.md",
  },
  {
    names: ["h2"],
    family: "H2 console/debug database",
    configGate: "spring.h2.console.enabled and console path",
    reachableSink: "H2 console route reachable",
    dataShape: "JDBC URL/user/password from config or defaults",
    firstSafeCheck: "Verify console route and config-derived credentials",
    reference: "spring-boot-source-map.md",
  },
  {
    names: ["commons-fileupload", "commons-io"],
    family: "Upload/path/archive handling",
    configGate: "upload controller/storage/extraction code",
    reachableSink: "MultipartFile/FileItem/archive extraction route",
    dataShape: "controlled filename/content/archive member",
    firstSafeCheck: "Upload benign canary and map storage/served path",
    reference: "java-file-upload-path.md",
  },
  {
    names: ["log4j"],
    family: "Logging/input lookup behavior",
    configGate: "affected version/config and user input reaches logger",
    reachableSink: "logger logs controlled string",
    dataShape: "controlled logged string",
    firstSafeCheck: "Verify version/config and logging reachability with harmless marker",
    reference: "java-dependency-risk.md",
  },
]

function extractPomDeps(content: string) {
  const deps: { artifact: string; version: string }[] = []
  for (const m of content.matchAll(/<dependency>[\s\S]*?<artifactId>([^<]+)<\/artifactId>[\s\S]*?<\/dependency>/gi)) {
    const block = m[0]
    deps.push({ artifact: m[1], version: block.match(/<version>([^<]+)<\/version>/i)?.[1] ?? "unknown" })
  }
  return deps
}

function extractGradleDeps(content: string) {
  const deps: { artifact: string; version: string }[] = []
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/["'](?:[\w.-]+):([\w.-]+):([^"']+)["']/)
    if (m) deps.push({ artifact: m[1], version: m[2] })
  }
  return deps
}

function versionHint(version: string) {
  if (!version || version === "unknown" || version.includes("${"))
    return "version must be resolved from parent/properties/lockfile"
  return `version=${version}`
}

export default tool({
  description:
    "CTF Java dependency risk: scan pom.xml/build.gradle or source tree for Java Web CTF-relevant dependencies and produce risk family, config gate, reachability, data shape, first safe check, and reference dispatch.",
  args: {
    target: tool.schema.string().describe("pom.xml, build.gradle, or source directory to scan"),
  },
  async execute(args, context) {
    const fs = await import("fs/promises")
    const root = resolveInsideWorkspace(context.directory, args.target)
    const foundFiles: string[] = []

    async function collect(p: string) {
      const st = await fs.stat(p)
      if (st.isDirectory()) {
        for (const e of await fs.readdir(p, { withFileTypes: true })) {
          if (e.isDirectory() && [".git", "target", "build", "node_modules"].includes(e.name)) continue
          const child = path.join(p, e.name)
          if (e.isDirectory()) await collect(child)
          else if (/^(pom\.xml|build\.gradle|build\.gradle\.kts)$/i.test(e.name) || /\.jar$/i.test(e.name))
            foundFiles.push(child)
        }
      } else foundFiles.push(p)
    }

    await collect(root)
    const deps: { artifact: string; version: string; file: string }[] = []
    for (const file of foundFiles) {
      const rel = path.relative(root, file) || path.basename(file)
      if (/\.jar$/i.test(file)) {
        const artifact = path.basename(file).replace(/\.jar$/i, "")
        deps.push({ artifact, version: artifact.match(/-(\d+(?:\.\d+)+(?:[-.\w]*)?)$/)?.[1] ?? "unknown", file: rel })
        continue
      }
      try {
        const content = await fs.readFile(file, "utf8")
        const parsed = /pom\.xml$/i.test(file) ? extractPomDeps(content) : extractGradleDeps(content)
        for (const d of parsed) deps.push({ ...d, file: rel })
      } catch {
        // skip unreadable
      }
    }

    const matches: string[] = []
    const queue: string[] = []
    for (const dep of deps) {
      const lower = dep.artifact.toLowerCase()
      for (const risk of risks) {
        if (risk.names.some((n) => lower.includes(n.toLowerCase()))) {
          matches.push(
            [
              `dependency: ${dep.artifact} (${versionHint(dep.version)}) in ${dep.file}`,
              `  risk_family: ${risk.family}`,
              `  config_gate: ${risk.configGate}`,
              `  reachable_sink: ${risk.reachableSink}`,
              `  controlled_data_shape: ${risk.dataShape}`,
              `  first_safe_check: ${risk.firstSafeCheck}`,
              `  reference: ${risk.reference}`,
            ].join("\n"),
          )
          queue.push(`${risk.family}: ${risk.firstSafeCheck} -> load ${risk.reference}`)
        }
      }
    }

    return [
      "# Java Dependency Risk",
      `target: ${root}`,
      `dependency_files: ${foundFiles.length}`,
      `dependencies_seen: ${deps.length}`,
      "",
      "## Risk Matches",
      ...(matches.length ? matches : ["- none"]),
      "",
      "## Attack Queue Seed",
      ...(queue.length
        ? Array.from(new Set(queue)).map((x, i) => `${i + 1}. ${x}`)
        : ["1. No dependency risk match; prioritize source-proven routes/sinks from ctf-java-map"]),
      "",
      "## First Safe Checks",
      "- Confirm version resolution if version is unknown/property-based.",
      "- Confirm config gate before payloads.",
      "- Confirm reachable route/sink and controlled data shape.",
      "- Prefer Java Constraint Equation and matching reference before exploit probes.",
    ].join("\n")
  },
})
