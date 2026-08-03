import { readFileSync } from "node:fs"
import { globSync } from "node:fs"
import { basename } from "node:path"
import { describe, expect, it } from "vitest"
import { normalizeMethod, normalizeUrl, parseHeadersJson, unique } from "../tools/lib/web-http.js"

describe("web HTTP tool helpers", () => {
  it("normalizes local and host:port URLs without changing explicit schemes", () => {
    expect(normalizeUrl("localhost:8080/app")).toBe("http://localhost:8080/app")
    expect(normalizeUrl("127.0.0.1:5000")).toBe("http://127.0.0.1:5000")
    expect(normalizeUrl("https://example.test/a")).toBe("https://example.test/a")
  })

  it("parses primitive headers and optional cookie", () => {
    expect(parseHeadersJson('{"X-Test":1,"X-On":true,"X-S":"v","Nested":{"no":1}}', "sid=abc")).toEqual({
      "X-Test": "1",
      "X-On": "true",
      "X-S": "v",
      Cookie: "sid=abc",
    })
  })

  it("rejects invalid headersJson with a targeted error", () => {
    expect(() => parseHeadersJson("[1,2]")).toThrow(/headersJson/)
    expect(() => parseHeadersJson("{")).toThrow(/headersJson/)
  })

  it("normalizes methods and rejects invalid tokens", () => {
    expect(normalizeMethod("post")).toBe("POST")
    expect(() => normalizeMethod("GET /")).toThrow(/invalid HTTP method/)
  })

  it("keeps unique ordering with a limit", () => {
    expect(unique(["a", "", "b", "a", "c"], 2)).toEqual(["a", "b"])
  })
})

describe("ctf-web tool helper consolidation", () => {
  it("does not reintroduce local HTTP helper copies in ctf-web tools", () => {
    const files = globSync("tools/web/ctf-web-*.ts")
    const forbidden = /function\s+(normalizeUrl|parseHeadersJson|fetchWithTimeout|readTextCapped|normalizeMethod)\b/
    const offenders = files
      .map((file) => ({ file: basename(file), text: readFileSync(file, "utf8") }))
      .filter(({ text }) => forbidden.test(text))
      .map(({ file }) => file)
    expect(offenders).toEqual([])
  })
})
