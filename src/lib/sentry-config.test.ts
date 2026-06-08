import { describe, expect, it } from "vitest"

import { isSensitiveSentryKey, scrubSentryEvent } from "./sentry-config"

describe("sentry parser-output scrubber", () => {
  it("identifies parser excerpt and raw-output keys", () => {
    expect(isSensitiveSentryKey("content_excerpt")).toBe(true)
    expect(isSensitiveSentryKey("contentExcerpt")).toBe(true)
    expect(isSensitiveSentryKey("parser_output")).toBe(true)
    expect(isSensitiveSentryKey("rawParserOutput")).toBe(true)
    expect(isSensitiveSentryKey("source_metadata")).toBe(true)
    expect(isSensitiveSentryKey("safe_field")).toBe(false)
  })

  it("removes parser output recursively from Sentry events", () => {
    const event = {
      message: "parse failed",
      extra: {
        content_excerpt: "Alice Schmidt <alice@example.com>",
        safe_count: 3,
        nested: {
          parserOutput: "raw PDF text",
          title_excerpt: "sensitive title excerpt",
          keep: "visible",
        },
      },
      contexts: {
        parser_output: {
          raw_text: "raw body",
        },
        request: {
          url: "/api/context-sources",
        },
      },
    }

    expect(scrubSentryEvent(event)).toEqual({
      message: "parse failed",
      extra: {
        safe_count: 3,
        nested: {
          keep: "visible",
        },
      },
      contexts: {
        request: {
          url: "/api/context-sources",
        },
      },
    })
  })

  it("does not recurse forever on cyclic structures", () => {
    const event: Record<string, unknown> = { message: "cycle" }
    event.self = event

    expect(scrubSentryEvent(event)).toEqual({
      message: "cycle",
      self: "[Circular]",
    })
  })
})
