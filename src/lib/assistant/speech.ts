export interface AssistantSpeechCapabilities {
  stt: {
    browser: boolean
    external: boolean
    fallback: "text"
  }
  tts: {
    browser: boolean
    external: boolean
    fallback: "text"
  }
  wakeWord: {
    available: boolean
    enabled: boolean
  }
}

export function detectBrowserSpeechCapabilities(
  globalObject: Pick<typeof globalThis, "speechSynthesis"> &
    Record<string, unknown> = globalThis,
): AssistantSpeechCapabilities {
  const hasSpeechRecognition =
    typeof globalObject.SpeechRecognition === "function" ||
    typeof globalObject.webkitSpeechRecognition === "function"

  return {
    stt: {
      browser: hasSpeechRecognition,
      external: false,
      fallback: "text",
    },
    tts: {
      browser: typeof globalObject.speechSynthesis !== "undefined",
      external: false,
      fallback: "text",
    },
    wakeWord: {
      available: false,
      enabled: false,
    },
  }
}
