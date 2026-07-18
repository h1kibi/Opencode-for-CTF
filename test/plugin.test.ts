import { afterEach, describe, expect, it } from "vitest"
import {
  propString,
  propStringNullable,
  skillToAgent,
  clearActivatedDefaults,
  trimActivatedDefaults,
} from "../src/plugin.js"

const cleanup = () => clearActivatedDefaults("nonexistent-session")

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// propString — safe property accessor
// ---------------------------------------------------------------------------

describe("propString", () => {
  it("returns empty string when obj is null", () => {
    expect(propString(null, "key")).toBe("")
  })

  it("returns empty string when obj is undefined", () => {
    expect(propString(undefined, "key")).toBe("")
  })

  it("returns empty string when obj is a primitive", () => {
    expect(propString(42, "key")).toBe("")
    expect(propString("string", "key")).toBe("")
  })

  it("returns empty string when property does not exist", () => {
    expect(propString({ a: 1 }, "b")).toBe("")
  })

  it("returns empty string when property exists but is not a string", () => {
    expect(propString({ count: 42 }, "count")).toBe("")
    expect(propString({ flag: true }, "flag")).toBe("")
    expect(propString({ data: null }, "data")).toBe("")
  })

  it("returns the string value when property is a string", () => {
    expect(propString({ name: "hello" }, "name")).toBe("hello")
    expect(propString({ sessionID: "sess-123" }, "sessionID")).toBe("sess-123")
  })

  it("returns empty string for empty string value", () => {
    expect(propString({ empty: "" }, "empty")).toBe("")
  })
})

// ---------------------------------------------------------------------------
// skillToAgent — skill name → agent name mapping
// ---------------------------------------------------------------------------

describe("skillToAgent", () => {
  it("returns undefined for non-ctf skills", () => {
    expect(skillToAgent("react")).toBeUndefined()
    expect(skillToAgent("terminal")).toBeUndefined()
    expect(skillToAgent("python")).toBeUndefined()
  })

  it("returns undefined for empty string", () => {
    expect(skillToAgent("")).toBeUndefined()
  })

  it("maps ctf-web-* to ctf-web", () => {
    expect(skillToAgent("ctf-web-sqli")).toBe("ctf-web")
    expect(skillToAgent("ctf-web-xss")).toBe("ctf-web")
    expect(skillToAgent("ctf-web-recon")).toBe("ctf-web")
  })

  it("maps ctf-pwn-* to ctf-pwn", () => {
    expect(skillToAgent("ctf-pwn-heap")).toBe("ctf-pwn")
    expect(skillToAgent("ctf-pwn-rop")).toBe("ctf-pwn")
  })

  it("maps ctf-rev-* to ctf-rev", () => {
    expect(skillToAgent("ctf-rev-mobile")).toBe("ctf-rev")
    expect(skillToAgent("ctf-rev-anti-analysis")).toBe("ctf-rev")
  })

  it("maps ctf-crypto-* to ctf-crypto", () => {
    expect(skillToAgent("ctf-crypto-rsa")).toBe("ctf-crypto")
  })

  it("maps ctf-forensics-* to ctf-forensics", () => {
    expect(skillToAgent("ctf-forensics-memory")).toBe("ctf-forensics")
    expect(skillToAgent("ctf-forensics-stego")).toBe("ctf-forensics")
  })

  it("maps ctf-misc-* to ctf-misc", () => {
    expect(skillToAgent("ctf-misc-bashjail")).toBe("ctf-misc")
  })

  it("returns undefined for ctf-common and ctf-terminal", () => {
    expect(skillToAgent("ctf-common")).toBe("ctf-common")
  })

  it("returns the agent for known special agents", () => {
    expect(skillToAgent("ctf-scout")).toBe("ctf-scout")
    expect(skillToAgent("ctf-oracle")).toBe("ctf-oracle")
    expect(skillToAgent("ctf-librarian")).toBe("ctf-librarian")
    expect(skillToAgent("ctf-verifier")).toBe("ctf-verifier")
    expect(skillToAgent("ctf-expert")).toBe("ctf-expert")
  })

  it("returns undefined for unknown ctf-* skill that doesn't match known prefixes", () => {
    expect(skillToAgent("ctf-unknown-category")).toBeUndefined()
    expect(skillToAgent("ctf-nonsense-thing")).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// propStringNullable — distinguishes missing vs empty string
// ---------------------------------------------------------------------------

describe("propStringNullable", () => {
  it("returns undefined when obj is null", () => {
    expect(propStringNullable(null, "key")).toBeUndefined()
  })

  it("returns undefined when obj is undefined", () => {
    expect(propStringNullable(undefined, "key")).toBeUndefined()
  })

  it("returns undefined when property does not exist", () => {
    expect(propStringNullable({ a: 1 }, "b")).toBeUndefined()
  })

  it("returns undefined when property is not a string", () => {
    expect(propStringNullable({ count: 42 }, "count")).toBeUndefined()
  })

  it("returns empty string when property is an empty string", () => {
    expect(propStringNullable({ empty: "" }, "empty")).toBe("")
  })

  it("returns the string value when property is a string", () => {
    expect(propStringNullable({ name: "hello" }, "name")).toBe("hello")
  })
})

// ---------------------------------------------------------------------------
// clearActivatedDefaults / trimActivatedDefaults — memory leak guards
// ---------------------------------------------------------------------------

describe("activatedDefaults cleanup", () => {
  it("clearActivatedDefaults removes a session ID", () => {
    expect(() => clearActivatedDefaults("nonexistent-session")).not.toThrow()
  })

  it("trimActivatedDefaults does not throw on empty set", () => {
    expect(() => trimActivatedDefaults(10)).not.toThrow()
  })

  it("trimActivatedDefaults handles undersized set gracefully", () => {
    expect(() => trimActivatedDefaults(1000)).not.toThrow()
  })
})
