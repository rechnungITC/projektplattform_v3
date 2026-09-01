/**
 * PROJ-151-α — Aufbewahrung des Chat-Verlaufs (AC-151H.4, Q2).
 *
 * **Eigene Einstellung, nicht die des Assistenten.** Gemessen am 2026-08-27:
 * alle sechs Mandanten — auch der Produktivmandant — stehen auf
 * `persist_metadata_only`; beim Assistenten wird dann kein Text gespeichert.
 * Wörtlich geerbt wäre der Chat-Verlauf im Produktivmandanten am ersten Tag
 * leer gewesen, und das Feature damit unbrauchbar (Klasse PROJ-86/PROJ-137).
 *
 * Die Einstellung des Assistenten regelt zudem **Sprachtranskripte** —
 * mitgeschnittene Rede. Ein Chat-Verlauf ist bewusst getippt, und der Nutzer
 * erwartet, dass er bleibt; das ist der Zweck der Fläche.
 *
 * Die **Bereinigung** kommt unverändert aus PROJ-40 (`redactTranscript`), damit
 * es keine zweite Regelliste gibt, die auseinanderdriftet.
 */

import { redactTranscript } from "@/lib/assistant/transcript"

export type ChatRetentionMode = "store" | "redacted" | "none"

/** Voreinstellung: speichern. Ohne Verlauf ist ein Chat kein Chat. */
export const DEFAULT_CHAT_RETENTION: ChatRetentionMode = "store"

export function resolveChatRetention(settings: unknown): ChatRetentionMode {
  const raw =
    settings &&
    typeof settings === "object" &&
    "ai_chat_settings" in settings &&
    settings.ai_chat_settings &&
    typeof settings.ai_chat_settings === "object" &&
    "history_retention" in settings.ai_chat_settings
      ? (settings.ai_chat_settings as { history_retention?: unknown }).history_retention
      : undefined

  return raw === "none" || raw === "redacted" || raw === "store"
    ? raw
    : DEFAULT_CHAT_RETENTION
}

/**
 * Was vom Text gespeichert werden darf.
 *
 * `none` → nichts. Der Aufrufer muss das der Fläche **sagen** — ein still
 * leerer Verlauf sähe aus wie ein Fehler.
 */
export function contentForPersistence(
  text: string,
  mode: ChatRetentionMode,
): string | null {
  if (mode === "none") return null
  if (mode === "redacted") return redactTranscript(text)
  return text
}
