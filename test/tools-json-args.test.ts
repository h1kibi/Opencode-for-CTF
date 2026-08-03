import { describe, expect, it } from "vitest"
import {
  objectToStringRecord,
  parseJsonArg,
  parseJsonArrayArg,
  parseJsonObjectArg,
  parseStringArrayArg,
} from "../tools/lib/json-args.js"

describe("JSON argument helpers", () => {
  it("returns fallback for omitted values", () => {
    expect(parseJsonArg("xJson", undefined, { ok: true })).toEqual({ ok: true })
    expect(parseJsonArrayArg("itemsJson", undefined)).toEqual([])
  })

  it("parses and validates object and array shapes", () => {
    expect(parseJsonObjectArg("envJson", '{"A":1}')).toEqual({ A: 1 })
    expect(parseJsonArrayArg("stepsJson", '[{"send":"x"}]')).toEqual([{ send: "x" }])
    expect(parseStringArrayArg("argvPrefixJson", '["--x","1"]')).toEqual(["--x", "1"])
  })

  it("throws targeted errors for malformed or wrong-shaped JSON", () => {
    expect(() => parseJsonObjectArg("envJson", "[1]")).toThrow(/envJson/)
    expect(() => parseJsonArrayArg("stepsJson", "{}")).toThrow(/stepsJson/)
    expect(() => parseStringArrayArg("argvPrefixJson", "[1]")).toThrow(/argvPrefixJson/)
    expect(() => parseJsonArg("patchesJson", "{", [])).toThrow(/patchesJson/)
  })

  it("converts env-like objects to string records with env key validation", () => {
    expect(objectToStringRecord("envJson", { REMOTE: 1, DEBUG: true })).toEqual({
      REMOTE: "1",
      DEBUG: "true",
    })
    expect(() => objectToStringRecord("envJson", { "BAD-NAME": 1 })).toThrow(/envJson/)
  })
})
