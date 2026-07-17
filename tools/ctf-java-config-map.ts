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

const interestingConfig =
  /(^|\/)(application[^/]*\.(properties|yml|yaml)|bootstrap[^/]*\.(properties|yml|yaml)|web\.xml|shiro\.ini|MANIFEST\.MF|pom\.properties|log4j[^/]*\.xml|logback[^/]*\.xml)$/i

const secretish = /(password|passwd|pwd|secret|token|key|credential|apikey|api-key|access-key|rememberMe|cipherKey)/i

function redact(line: string) {
  if (!secretish.test(line)) return line
  const idx = line.search(/[:=]/)
  if (idx === -1) return line.replace(/(.{0,80}).*/, "$1 [secret-like]")
  const k = line.slice(0, idx + 1)
  const v = line.slice(idx + 1).trim()
  if (!v) return line
  return `${k} <redacted:${v.length} chars>`
}

function pickLines(content: string, re: RegExp, limit = 40) {
  return content
    .split(/\r?\n/)
    .filter((line) => re.test(line))
    .slice(0, limit)
    .map(redact)
}

function flattenConfig(content: string, rel: string) {
  const out: string[] = []
  if (/\.properties$/i.test(rel)) {
    for (const raw of content.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith("#") || !line.includes("=")) continue
      out.push(redact(line))
    }
    return out.slice(0, 80)
  }
  if (/\.ya?ml$/i.test(rel)) {
    const stack: { indent: number; key: string }[] = []
    for (const raw of content.split(/\r?\n/)) {
      if (!raw.trim() || raw.trim().startsWith("#")) continue
      const m = raw.match(/^(\s*)([A-Za-z0-9_.-]+)\s*:\s*(.*)$/)
      if (!m) continue
      const indent = m[1].length
      const key = m[2]
      const val = m[3]
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
      const full = [...stack.map((x) => x.key), key].join(".")
      if (val !== "" && val !== "|" && val !== ">") out.push(redact(`${full}: ${val}`))
      stack.push({ indent, key })
    }
    return out.slice(0, 80)
  }
  return []
}

function classify(content: string, rel: string) {
  const hits: string[] = []
  const add = (label: string, re: RegExp) => {
    const lines = pickLines(content, re, 20)
    if (lines.length) hits.push(`${label}: ${rel}\n${lines.map((x) => `  - ${x.trim()}`).join("\n")}`)
  }
  add(
    "server-context",
    /(server\.(port|servlet\.context-path)|contextPath|context-path|<url-pattern>|<servlet-mapping>)/i,
  )
  add("datasource", /(spring\.datasource|jdbc:|datasource|driver-class-name|username|password)/i)
  add("actuator", /(management\.endpoints|management\.endpoint|management\.server|actuator|show-details)/i)
  add("h2", /(spring\.h2\.console|h2-console|jdbc:h2)/i)
  add(
    "security-auth",
    /(spring\.security|security\.|login|admin|role|session|cookie|rememberMe|shiro|filterChain|authc|anon|perms|roles)/i,
  )
  add(
    "upload-file",
    /(multipart|upload|file\.upload|storage|static-locations|resources\.static|web\.resources|location|path)/i,
  )
  add("template", /(thymeleaf|freemarker|velocity|template|view|prefix|suffix)/i)
  add("profiles", /(spring\.profiles|profiles\.active|spring\.config|include)/i)
  add("logging", /(logging\.|log4j|logback|logger|level)/i)
  add("secret-like", secretish)
  return hits
}

export default tool({
  description:
    "CTF Java config map: scan extracted Java Web config files for profiles, context path, datasource, actuator, H2, Shiro/security, upload paths, static resources, template config, logging, and secret-like clues with redaction and attack queue seed.",
  args: {
    target: tool.schema.string().describe("Extracted Java source/archive directory or a config file"),
  },
  async execute(args, context) {
    const fs = await import("fs/promises")
    const root = resolveInsideWorkspace(context.directory, args.target)
    const files: string[] = []

    async function collect(p: string) {
      const st = await fs.stat(p)
      if (st.isDirectory()) {
        for (const e of await fs.readdir(p, { withFileTypes: true })) {
          if (e.isDirectory() && [".git", "node_modules", "target", "build"].includes(e.name)) continue
          const child = path.join(p, e.name)
          if (e.isDirectory()) await collect(child)
          else if (interestingConfig.test(child.replace(/\\/g, "/"))) files.push(child)
        }
      } else files.push(p)
    }

    await collect(root)
    const sections: string[] = []
    const queue = new Set<string>()

    for (const file of files.slice(0, 120)) {
      try {
        const content = await fs.readFile(file, "utf8")
        const rel = path.relative(root, file) || path.basename(file)
        const flat = flattenConfig(content, rel)
        if (flat.length) sections.push(`flattened-config: ${rel}\n${flat.map((x) => `  - ${x.trim()}`).join("\n")}`)
        const hits = classify(content, rel)
        if (hits.length) sections.push(...hits)
        if (/management\.endpoints|actuator/i.test(content))
          queue.add("Actuator/config: verify management base path, exposed endpoints, and auth boundary")
        if (/spring\.h2\.console|jdbc:h2|h2-console/i.test(content))
          queue.add("H2 console: verify route and config-derived JDBC credentials")
        if (/shiro|rememberMe|cipherKey|filterChain/i.test(content))
          queue.add("Shiro/security: map filter chain and rememberMe/key/config gates before token payloads")
        if (/spring\.datasource|jdbc:|username|password/i.test(content))
          queue.add(
            "Datasource: use DB config to identify DB type, local console, default creds, and flag/admin table path",
          )
        if (/multipart|upload|static-locations|resources\.static|file\.upload|storage/i.test(content))
          queue.add("Upload/static paths: map storage, served path, extension checks, and canary write behavior")
        if (/thymeleaf|freemarker|velocity|template|view/i.test(content))
          queue.add("Template config: identify engine, prefix/suffix, view resolver, and expression context")
        if (secretish.test(content))
          queue.add(
            "Secret-like config: use redacted key names/locations to guide auth/token/session checks without exposing secrets",
          )
      } catch {
        // skip unreadable
      }
    }

    return [
      "# Java Config Map",
      `target: ${root}`,
      `config_files: ${files.length}`,
      "",
      "## Config Findings",
      ...(sections.length ? sections.slice(0, 200) : ["- none"]),
      "",
      "## Attack Queue Seed",
      ...(queue.size
        ? Array.from(queue).map((x, i) => `${i + 1}. ${x}`)
        : ["1. No high-value config clues; prioritize ctf-java-map route/sink output"]),
      "",
      "## First Safe Checks",
      "- Confirm context path and port before route probes.",
      "- Confirm actuator/H2/security gates before payloads.",
      "- Treat secret-like values as sensitive; use key names/locations and do not print full values.",
      "- Pair config clues with route reachability and controlled input before exploitation.",
    ].join("\n")
  },
})
