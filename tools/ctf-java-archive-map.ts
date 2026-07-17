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

async function listArchive(target: string, cwd: string) {
  const r1 = await safeExec("jar", ["tf", target], { cwd, timeoutMs: 8000, maxBuffer: 2 * 1024 * 1024 })
  if (r1.ok) {
    const text = r1.output === "<no output>" ? "" : r1.output
    return text.split(/\r?\n/).filter(Boolean)
  }
  const r2 = await safeExec("unzip", ["-Z1", target], { cwd, timeoutMs: 8000, maxBuffer: 2 * 1024 * 1024 })
  if (r2.ok) {
    const text = r2.output === "<no output>" ? "" : r2.output
    return text.split(/\r?\n/).filter(Boolean)
  }
  return [`<failed to list archive: ${r2.output}>`]
}

function topMatches(items: string[], re: RegExp, limit = 40) {
  return items.filter((x) => re.test(x)).slice(0, limit)
}

function inferLayout(items: string[]) {
  const hasBoot = items.some((x) => x.startsWith("BOOT-INF/"))
  const hasWeb = items.some((x) => x.startsWith("WEB-INF/"))
  const hasMeta = items.some((x) => x.startsWith("META-INF/"))
  if (hasBoot) return "spring-boot-fat-jar"
  if (hasWeb) return "war-or-servlet-app"
  if (hasMeta) return "plain-jar"
  return "unknown-java-archive"
}

function depNameFromLib(p: string) {
  return path.basename(p).replace(/\.jar$/i, "")
}

export default tool({
  description:
    "CTF Java archive map: list JAR/WAR members and summarize Spring Boot/Servlet layout, configs, JSPs, libraries, routes clues, risky dependency names, and next safe extraction/map steps without extracting.",
  args: {
    target: tool.schema.string().describe("JAR/WAR/ZIP Java web archive path to inspect"),
  },
  async execute(args, context) {
    const target = resolveInsideWorkspace(context.directory, args.target)
    const cwd = path.dirname(target)
    const items = await listArchive(target, cwd)
    const layout = inferLayout(items)

    const configs = topMatches(
      items,
      /(^|\/)(application[^/]*\.(properties|yml|yaml)|bootstrap[^/]*\.(properties|yml|yaml)|web\.xml|shiro\.ini|log4j[^/]*\.xml|logback[^/]*\.xml)$/i,
      80,
    )
    const manifests = topMatches(items, /(^|\/)META-INF\/(MANIFEST\.MF|maven\/.*\/(pom\.xml|pom\.properties))$/i, 80)
    const classes = topMatches(items, /\.(class)$/i, 80)
    const jsp = topMatches(items, /\.(jsp|jspx)$/i, 80)
    const templates = topMatches(items, /\.(ftl|vm|html|xhtml|mustache)$/i, 80)
    const staticFiles = topMatches(items, /(^|\/)(static|public|resources|META-INF\/resources)\//i, 80)
    const libs = topMatches(items, /(^|\/)(BOOT-INF\/lib|WEB-INF\/lib|lib)\/.*\.jar$/i, 200)
    const riskyLibs = libs.filter((x) =>
      /(shiro|fastjson|jackson-databind|jackson-dataformat-yaml|xstream|snakeyaml|mybatis|thymeleaf|freemarker|velocity|struts|actuator|h2|commons-fileupload|commons-io|log4j)/i.test(
        x,
      ),
    )

    const queue: string[] = []
    if (configs.length)
      queue.push(
        "Extract/read config files first: application/bootstrap/web.xml/shiro/logging may expose profiles, actuator, DB, keys, routes, or auth gates",
      )
    if (riskyLibs.length)
      queue.push("Run ctf-java-dep-risk after safe extraction or use risky library list to build dependency gates")
    if (layout === "spring-boot-fat-jar")
      queue.push(
        "Spring Boot fat JAR: extract and run ctf-java-map on BOOT-INF/classes plus ctf-java-dep-risk on BOOT-INF/lib",
      )
    if (layout === "war-or-servlet-app")
      queue.push(
        "WAR/Servlet app: inspect WEB-INF/web.xml, WEB-INF/classes, WEB-INF/lib, JSP files, and servlet mappings",
      )
    if (jsp.length) queue.push("JSP present: inspect JSP params/includes/EL and upload/write-to-webroot possibilities")
    if (templates.length)
      queue.push("Templates present: identify engine and view/template control before expression payloads")
    if (!queue.length)
      queue.push("Safely extract archive, then run ctf-java-map and ctf-java-dep-risk on extracted tree")

    return [
      "# Java Archive Map",
      `target: ${target}`,
      `entries: ${items.length}`,
      `layout: ${layout}`,
      "",
      "## Config / Metadata",
      ...(configs.length ? configs.map((x) => `- ${x}`) : ["- none"]),
      ...(manifests.length ? ["", "## Manifest / Maven Metadata", ...manifests.map((x) => `- ${x}`)] : []),
      "",
      "## JSP / Templates",
      ...(jsp.length ? jsp.map((x) => `- JSP ${x}`) : ["- JSP none"]),
      ...(templates.length ? templates.map((x) => `- template ${x}`) : ["- templates none"]),
      "",
      "## Static / Resource Paths",
      ...(staticFiles.length ? staticFiles.map((x) => `- ${x}`) : ["- none"]),
      "",
      "## Libraries",
      ...(libs.length ? libs.slice(0, 80).map((x) => `- ${depNameFromLib(x)} (${x})`) : ["- none"]),
      "",
      "## Risky Libraries",
      ...(riskyLibs.length ? riskyLibs.map((x) => `- ${depNameFromLib(x)} (${x})`) : ["- none"]),
      "",
      "## Class Samples",
      ...(classes.length ? classes.map((x) => `- ${x}`) : ["- none"]),
      "",
      "## Attack Queue Seed",
      ...queue.map((x, i) => `${i + 1}. ${x}`),
      "",
      "## First Safe Checks",
      "- Use ctf-safe-extract for extraction; do not manually overwrite target directories.",
      "- After extraction, run ctf-java-map on BOOT-INF/classes, WEB-INF/classes, or extracted root.",
      "- Run ctf-java-dep-risk on extracted root or build metadata before dependency payloads.",
      "- Read config and route/auth surfaces before exploit payloads.",
    ].join("\n")
  },
})
