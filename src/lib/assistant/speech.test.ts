import { describe, expect, it } from "vitest"

import { detectBrowserSpeechCapabilities } from "./speech"

describe("detectBrowserSpeechCapabilities", () => {
  it("reports browser STT/TTS when Web Speech APIs exist", () => {
    const caps = detectBrowserSpeechCapabilities({
      SpeechRecognition: function SpeechRecognition() {},
      speechSynthesis: {},
    })

    expect(caps.stt.browser).toBe(true)
    expect(caps.tts.browser).toBe(true)
    expect(caps.wakeWord.enabled).toBe(false)
  })

  it("falls back to text when speech APIs are absent", () => {
    const caps = detectBrowserSpeechCapabilities({})
    expect(caps.stt).toEqual({
      browser: false,
      external: false,
      fallback: "text",
    })
    expect(caps.tts.fallback).toBe("text")
  })
})
