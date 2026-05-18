import { describe, expect, it } from "vitest"

import {
  ASSISTANT_SETTINGS_DEFAULTS,
  normalizeAssistantSettings,
} from "./settings"

describe("normalizeAssistantSettings", () => {
  it("returns defaults when settings are missing", () => {
    expect(normalizeAssistantSettings(null)).toEqual(
      ASSISTANT_SETTINGS_DEFAULTS,
    )
  })

  it("keeps valid tenant policy fields", () => {
    expect(
      normalizeAssistantSettings({
        transcript_retention_mode: "persist_redacted_transcript",
        retention_days: 90,
        stt_provider: "external",
        tts_provider: "none",
        wake_word_enabled: true,
      }),
    ).toEqual({
      transcript_retention_mode: "persist_redacted_transcript",
      retention_days: 90,
      stt_provider: "external",
      tts_provider: "none",
      wake_word_enabled: true,
    })
  })

  it("falls back field-by-field for invalid policy values", () => {
    expect(
      normalizeAssistantSettings({
        transcript_retention_mode: "persist_everything",
        retention_days: 99999,
        stt_provider: "magic",
        tts_provider: "browser",
        wake_word_enabled: "yes",
      }),
    ).toEqual({
      ...ASSISTANT_SETTINGS_DEFAULTS,
      tts_provider: "browser",
    })
  })
})
