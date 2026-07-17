import { describe, expect, it } from "vitest"
import { quickHash, parseHashTag, stripHashTags, extractHashTags } from "../src/plugin.js"

// ---------------------------------------------------------------------------
// quickHash
// ---------------------------------------------------------------------------

describe("quickHash", () => {
  it("returns a 4-char base-36 uppercase string", () => {
    const h = quickHash("hello world")
    expect(h).toMatch(/^[0-9A-Z]{4}$/)
  })

  it("is deterministic — same input → same hash", () => {
    expect(quickHash("const x = 42")).toBe(quickHash("const x = 42"))
  })

  it("normalises trailing whitespace", () => {
    expect(quickHash("hello  ")).toBe(quickHash("hello"))
  })

  it("normalises tabs to two spaces", () => {
    expect(quickHash("\thello")).toBe(quickHash("  hello"))
  })

  it("produces different hashes for different content", () => {
    expect(quickHash("foo")).not.toBe(quickHash("bar"))
  })

  it("handles empty string", () => {
    const h = quickHash("")
    expect(h).toMatch(/^[0-9A-Z]{4}$/)
  })

  it("handles strings with special characters", () => {
    const h = quickHash("!@#$%^&*()_+-=[]{}|;':\",./<>?`~")
    expect(h).toMatch(/^[0-9A-Z]{4}$/)
  })
})

// ---------------------------------------------------------------------------
// parseHashTag
// ---------------------------------------------------------------------------

describe("parseHashTag", () => {
  it("parses a valid hash-tagged line", () => {
    const result = parseHashTag("11#A3F2| console.log('hello')")
    expect(result).not.toBeNull()
    expect(result!.lineNum).toBe(11)
    expect(result!.hash).toBe("A3F2")
    expect(result!.content).toBe("console.log('hello')")
  })

  it("parses a line with leading spaces in content", () => {
    const result = parseHashTag("3#XYZ1|   const x = 1")
    expect(result).not.toBeNull()
    expect(result!.lineNum).toBe(3)
    expect(result!.hash).toBe("XYZ1")
    expect(result!.content).toBe("  const x = 1")
  })

  it("returns null for a line without hash tag", () => {
    expect(parseHashTag("11| console.log('hello')")).toBeNull()
  })

  it("returns null for plain content", () => {
    expect(parseHashTag("hello world")).toBeNull()
  })

  it("returns null for empty string", () => {
    expect(parseHashTag("")).toBeNull()
  })

  it("parses multiline when given first line", () => {
    const result = parseHashTag("1#ABCD| function foo() {")
    expect(result).not.toBeNull()
    expect(result!.lineNum).toBe(1)
    expect(result!.hash).toBe("ABCD")
    expect(result!.content).toBe("function foo() {")
  })
})

// ---------------------------------------------------------------------------
// stripHashTags
// ---------------------------------------------------------------------------

describe("stripHashTags", () => {
  it("removes hash tags from a single line", () => {
    const result = stripHashTags("11#A3F2| console.log('hello')")
    expect(result).toBe("console.log('hello')")
  })

  it("removes hash tags from multiple lines", () => {
    const input = `1#A1B2| function foo() {
2#C3D4|   return 42
3#E5F6| }`
    const result = stripHashTags(input)
    expect(result).toBe(`function foo() {
  return 42
}`)
  })

  it("does not modify content without hash tags", () => {
    const input = "hello\nworld"
    expect(stripHashTags(input)).toBe("hello\nworld")
  })

  it("handles empty string", () => {
    expect(stripHashTags("")).toBe("")
  })

  it("removes hash tags with variable hash lengths", () => {
    expect(stripHashTags("1#ABCD| x")).toBe("x")
    expect(stripHashTags("1#ABCDEF| x")).toBe("x")
  })
})

// ---------------------------------------------------------------------------
// extractHashTags
// ---------------------------------------------------------------------------

describe("extractHashTags", () => {
  it("extracts hash tags from multiline string", () => {
    const input = `1#A1B2| function foo() {
2#C3D4|   return 42
}`
    const tags = extractHashTags(input)
    expect(tags).toHaveLength(2)
    expect(tags[0]).toEqual({ lineNum: 1, hash: "A1B2", content: "function foo() {" })
    expect(tags[1]).toEqual({ lineNum: 2, hash: "C3D4", content: "  return 42" })
  })

  it("returns empty array for content without hash tags", () => {
    const tags = extractHashTags("hello\nworld")
    expect(tags).toHaveLength(0)
  })

  it("returns empty array for empty string", () => {
    expect(extractHashTags("")).toHaveLength(0)
  })

  it("extracts only tagged lines, skipping untagged ones", () => {
    const input = `1#A1B2| tagged
untagged
3#C3D4| also tagged`
    const tags = extractHashTags(input)
    expect(tags).toHaveLength(2)
    expect(tags[0].lineNum).toBe(1)
    expect(tags[1].lineNum).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// Integration: round-trip hash → tag → verify
// ---------------------------------------------------------------------------

describe("hash round-trip", () => {
  it("quickHash → tag → parse → hash matches", () => {
    const original = "const greeting = 'hello'"
    const hash = quickHash(original)
    const taggedLine = `42#${hash}| ${original}`

    const parsed = parseHashTag(taggedLine)
    expect(parsed).not.toBeNull()
    expect(parsed!.hash).toBe(hash)
    expect(parsed!.content).toBe(original)
    expect(parsed!.lineNum).toBe(42)

    // Verify the hash still matches the original content
    expect(quickHash(parsed!.content)).toBe(hash)
  })

  it("hash changes when content changes", () => {
    const original = "abcdefghijklmnop"
    const modified = "zzzzzzzzzzzzzzzz"

    const hash1 = quickHash(original)
    const hash2 = quickHash(modified)

    expect(hash1).not.toBe(hash2)
  })
})
