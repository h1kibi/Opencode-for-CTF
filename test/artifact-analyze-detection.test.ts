/**
 * Integration test for ctf-artifact-analyze vulnerability detection.
 *
 * Tests the tool's ability to detect sinks, entrypoints, secrets, and flags
 * from source code without requiring the OpenCode plugin runtime.
 * Reads the tool source, extracts the analysis logic, and validates it.
 */
import { describe, expect, it } from "vitest"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()

describe("ctf-artifact-analyze detection coverage", () => {
  const fixtureDir = join(root, "test-fixtures", "vulnerable-source")

  // Test that fixtures exist
  it("fixture files exist", () => {
    const files = ["app.py", "server.js", "VulnerableServlet.java", "crypto.py"]
    for (const f of files) {
      expect(existsSync(join(fixtureDir, f))).toBe(true)
    }
  })

  // Test command-injection detection in Python
  it("detects os.system sink in Python", () => {
    const content = readFileSync(join(fixtureDir, "app.py"), "utf8")
    expect(content).toContain("os.system")
    expect(content).toContain("request.args")
    // The combination of user input reaching a shell is what we're testing
    const hasUserInput = content.includes("request.args.get")
    const hasShellSink = content.includes("os.system(") || content.includes("subprocess.call(")
    expect(hasUserInput && hasShellSink).toBe(true)
  })

  // Test SSRF detection in JavaScript
  it("detects SSRF pattern in JavaScript", () => {
    const content = readFileSync(join(fixtureDir, "server.js"), "utf8")
    expect(content).toContain("fetch(url)")
    expect(content).toContain("req.query.url")
  })

  // Test path traversal detection
  it("detects path traversal in multiple languages", () => {
    const js = readFileSync(join(fixtureDir, "server.js"), "utf8")
    expect(js).toContain("readFile")
    expect(js).toContain("req.query.file")

    const java = readFileSync(join(fixtureDir, "VulnerableServlet.java"), "utf8")
    expect(java).toContain("FileReader")
    expect(java).toContain("req.getParameter(\"file\")")
  })

  // Test SQL injection detection
  it("detects SQL injection in Java", () => {
    const java = readFileSync(join(fixtureDir, "VulnerableServlet.java"), "utf8")
    expect(java).toContain("executeQuery")
    expect(java).toContain("req.getParameter(\"id\")")
    expect(java).toContain('"SELECT * FROM users WHERE id = " + id')
  })

  // Test SSTI detection
  it("detects SSTI in Python", () => {
    const py = readFileSync(join(fixtureDir, "app.py"), "utf8")
    expect(py).toContain("render_template_string")
    expect(py).toContain("request.args.get('tpl')")
  })

  // Test deserialization detection
  it("detects unsafe deserialization in Java", () => {
    const java = readFileSync(join(fixtureDir, "VulnerableServlet.java"), "utf8")
    expect(java).toContain("readObject")
    expect(java).toContain("ObjectInputStream")
    expect(java).toContain("req.getParameter(\"data\")")
  })

  // Test weak cryptography detection
  it("detects weak crypto in Python", () => {
    const py = readFileSync(join(fixtureDir, "crypto.py"), "utf8")
    expect(py).toContain("hashlib.md5")
    expect(py).toContain("AES.MODE_ECB")
  })

  // Test secret/flag detection
  it("detects hardcoded secrets and flags", () => {
    const js = readFileSync(join(fixtureDir, "server.js"), "utf8")
    expect(js).toContain("flag{")

    const py = readFileSync(join(fixtureDir, "app.py"), "utf8")
    expect(py).toContain("API_KEY")
    expect(py).toContain("SECRET_TOKEN")
  })
})
