export type AssistantTranscriptRetentionMode =
  | "no_persist"
  | "persist_metadata_only"
  | "persist_redacted_transcript"

export type AssistantSpeechProvider = "browser" | "external" | "none"

export interface AssistantSettings {
  transcript_retention_mode: AssistantTranscriptRetentionMode
  retention_days: number
  stt_provider: AssistantSpeechProvider
  tts_provider: AssistantSpeechProvider
  wake_word_enabled: boolean
}

export const ASSISTANT_SETTINGS_DEFAULTS: AssistantSettings = {
  transcript_retention_mode: "persist_metadata_only",
  retention_days: 30,
  stt_provider: "browser",
  tts_provider: "browser",
  wake_word_enabled: false,
}

const RETENTION_MODES: readonly AssistantTranscriptRetentionMode[] = [
  "no_persist",
  "persist_metadata_only",
  "persist_redacted_transcript",
] as const

const SPEECH_PROVIDERS: readonly AssistantSpeechProvider[] = [
  "browser",
  "external",
  "none",
] as const

function isRetentionMode(
  value: unknown,
): value is AssistantTranscriptRetentionMode {
  return (
    typeof value === "string" &&
    RETENTION_MODES.includes(value as AssistantTranscriptRetentionMode)
  )
}

function isSpeechProvider(value: unknown): value is AssistantSpeechProvider {
  return (
    typeof value === "string" &&
    SPEECH_PROVIDERS.includes(value as AssistantSpeechProvider)
  )
}

export function normalizeAssistantSettings(
  value: unknown,
): AssistantSettings {
  if (!value || typeof value !== "object") return ASSISTANT_SETTINGS_DEFAULTS
  const raw = value as Record<string, unknown>
  const retentionDays =
    typeof raw.retention_days === "number" &&
    Number.isInteger(raw.retention_days) &&
    raw.retention_days >= 1 &&
    raw.retention_days <= 3650
      ? raw.retention_days
      : ASSISTANT_SETTINGS_DEFAULTS.retention_days

  return {
    transcript_retention_mode: isRetentionMode(
      raw.transcript_retention_mode,
    )
      ? raw.transcript_retention_mode
      : ASSISTANT_SETTINGS_DEFAULTS.transcript_retention_mode,
    retention_days: retentionDays,
    stt_provider: isSpeechProvider(raw.stt_provider)
      ? raw.stt_provider
      : ASSISTANT_SETTINGS_DEFAULTS.stt_provider,
    tts_provider: isSpeechProvider(raw.tts_provider)
      ? raw.tts_provider
      : ASSISTANT_SETTINGS_DEFAULTS.tts_provider,
    wake_word_enabled:
      typeof raw.wake_word_enabled === "boolean"
        ? raw.wake_word_enabled
        : ASSISTANT_SETTINGS_DEFAULTS.wake_word_enabled,
  }
}
