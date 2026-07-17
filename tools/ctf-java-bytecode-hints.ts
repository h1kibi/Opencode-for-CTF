import { tool } from "@opencode-ai/plugin"
import path from "node:path"
import { safeExec } from "./lib/exec-utils.ts"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`target must stay inside the current workspace: ${input}`)
  }
  return target
}

const interestingClass =
  /(Controller|Servlet|Filter|Interceptor|Security|Config|Shiro|Login|Admin|User|File|Upload|Download|Template|View|Xml|Url|Proxy|Http|Sql|Mapper|Service|Repository|Actuator|H2)/i
const interestingString =
  /(RequestMapping|GetMapping|PostMapping|PutMapping|DeleteMapping|PathVariable|RequestParam|RequestBody|JSESSIONID|rememberMe|actuator|h2-console|shiro|login|admin|flag|upload|download|\.jsp|\.ftl|\.vm|\.html|jdbc:|select |insert |update |delete |\$\{|#\{|http:|https:|file:|DocumentBuilder|RestTemplate|ObjectInputStream|Fastjson|parseObject)/i

async function safeJavap(classFile: string, cwd: string) {
  const r = await safeExec("javap", ["-v", "-p", classFile], { cwd, timeoutMs: 6000, maxBuffer: 1024 * 1024 })
  if (!r.ok) return `<javap failed: ${r.output}>`
  return r.output
}

function pick(lines: string[], re: RegExp, limit = 80) {
  return lines.filter((x) => re.test(x)).slice(0, limit)
}

export default tool({
  description:
    "CTF Java bytecode hints: scan extracted .class files with names and javap constant-pool snippets to recover route annotations, strings, class roles, sinks, and decompile targets for bytecode-only Java Web challenges.",
  args: {
    target: tool.schema.string().describe("Extracted Java archive/source directory containing .class files"),
    maxClasses: tool.schema
      .number()
      .optional()
      .describe("Maximum interesting classes to javap. Default 24, hard cap 80."),
  },
  async execute(args, context) {
    const fs = await import("fs/promises")
    const root = resolveInsideWorkspace(context.directory, args.target)
    const rootStat = await fs.stat(root)
    if (rootStat.isFile() && /\.(jar|war|zip)$/i.test(root)) {
      return [
        "# Java Bytecode Hints",
        `target: ${root}`,
        "status: wrong_target_type",
        "reason: target is an archive file, but ctf-java-bytecode-hints scans extracted class directories or individual .class files.",
        "",
        "## Correct Flow",
        "1. Run ctf-java-archive-map on the JAR/WAR/ZIP first.",
        "2. Run ctf-safe-extract to extract it into extracted/<archive-name>/.",
        "3. Run ctf-java-bytecode-hints on BOOT-INF/classes, WEB-INF/classes, or another extracted class directory.",
        "",
        "## Example Targets",
        "- extracted/<name>/BOOT-INF/classes",
        "- extracted/<name>/WEB-INF/classes",
      ].join("\n")
    }
    const classFiles: string[] = []
    const scanRoot = rootStat.isFile() ? path.dirname(root) : root

    async function walk(dir: string) {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory() && ![".git", "node_modules"].includes(e.name)) await walk(p)
        else if (e.isFile() && e.name.endsWith(".class")) classFiles.push(p)
      }
    }

    if (rootStat.isFile()) {
      if (!root.endsWith(".class"))
        throw new Error("target file must be a .class file, or use an extracted class directory")
      classFiles.push(root)
    } else {
      await walk(root)
    }
    const rels = classFiles.map((p) => path.relative(scanRoot, p).replace(/\\/g, "/"))
    const roleClasses = rels.filter((x) => interestingClass.test(x)).slice(0, 120)
    const maxClasses = Math.max(4, Math.min(args.maxClasses ?? 24, 80))
    const javapTargets = [
      ...classFiles.filter((p) => interestingClass.test(path.basename(p))).slice(0, maxClasses),
      ...classFiles.filter((p) => /Controller|Servlet|Filter|Security|Config/i.test(p)).slice(0, maxClasses),
    ]
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, maxClasses)

    const snippets: string[] = []
    const sinks = new Set<string>()
    const routeHints = new Set<string>()
    const decompileTargets = new Set<string>()

    for (const file of javapTargets) {
      const rel = path.relative(scanRoot, file).replace(/\\/g, "/")
      const out = await safeJavap(file, path.dirname(file))
      const lines = out.split(/\r?\n/)
      const hits = pick(lines, interestingString, 50)
      const ann = pick(
        lines,
        /(RuntimeVisibleAnnotations|RequestMapping|GetMapping|PostMapping|WebServlet|Controller|RestController|RequestParam|PathVariable|RequestBody)/i,
        50,
      )
      if (hits.length || ann.length) {
        snippets.push(
          `class: ${rel}\n${[...ann, ...hits]
            .slice(0, 60)
            .map((x) => `  - ${x.trim()}`)
            .join("\n")}`,
        )
        decompileTargets.add(rel)
      }
      if (/RequestMapping|GetMapping|PostMapping|WebServlet|Controller|RestController/i.test(out)) routeHints.add(rel)
      if (/FileInputStream|FileOutputStream|Files\.|Paths\.|MultipartFile|ZipInputStream/i.test(out))
        sinks.add(`file/upload: ${rel}`)
      if (/Statement|PreparedStatement|JdbcTemplate|createNativeQuery|select |insert |update |delete |\$\{/i.test(out))
        sinks.add(`sql: ${rel}`)
      if (/TemplateEngine|Freemarker|FreeMarker|Velocity|ExpressionParser|SpelExpressionParser|Ognl/i.test(out))
        sinks.add(`template/expression: ${rel}`)
      if (/ObjectInputStream|readObject|parseObject|ObjectMapper|Yaml|XStream|XMLDecoder/i.test(out))
        sinks.add(`deserialization/parser: ${rel}`)
      if (/DocumentBuilder|SAXParser|XMLInputFactory|SAXReader|TransformerFactory/i.test(out)) sinks.add(`xxe: ${rel}`)
      if (/RestTemplate|HttpClient|WebClient|openConnection|OkHttpClient|URL\b|URI\b/i.test(out))
        sinks.add(`ssrf/url-fetch: ${rel}`)
    }

    const queue: string[] = []
    if (routeHints.size)
      queue.push(
        "Route annotations found in bytecode: decompile the listed controller/servlet classes first and build route/input table",
      )
    if (sinks.size) queue.push("Sink hints found in bytecode: decompile only sink classes and trace backward to routes")
    if (roleClasses.length)
      queue.push(
        "Role-like class names found: prioritize Controller/Servlet/Filter/Security/Config/Admin/File/Upload classes",
      )
    if (!queue.length)
      queue.push(
        "No strong bytecode hints; combine config/dependency maps and decompile smallest package containing app classes",
      )

    return [
      "# Java Bytecode Hints",
      `target: ${root}`,
      `scan_root: ${scanRoot}`,
      `class_files: ${classFiles.length}`,
      "",
      "## Role-like Classes",
      ...(roleClasses.length ? roleClasses.map((x) => `- ${x}`) : ["- none"]),
      "",
      "## Route Hint Classes",
      ...(routeHints.size ? Array.from(routeHints).map((x) => `- ${x}`) : ["- none"]),
      "",
      "## Sink Hint Classes",
      ...(sinks.size ? Array.from(sinks).map((x) => `- ${x}`) : ["- none"]),
      "",
      "## Constant / Annotation Snippets",
      ...(snippets.length ? snippets.slice(0, 80) : ["- none"]),
      "",
      "## Decompile Targets",
      ...(decompileTargets.size ? Array.from(decompileTargets).map((x) => `- ${x}`) : ["- none"]),
      "",
      "## Attack Queue Seed",
      ...queue.map((x, i) => `${i + 1}. ${x}`),
      "",
      "## First Safe Checks",
      "- Decompile only Decompile Targets first; avoid full-project decompilation until route/sink evidence requires it.",
      "- Pair bytecode route hints with ctf-java-config-map context path and security filters.",
      "- Pair sink hint classes with Java Constraint Equation before payloads.",
    ].join("\n")
  },
})
