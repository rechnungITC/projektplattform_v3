/**
 * PROJ-151-α — gemeinsamer Erzeugungsweg für den projektbezogenen Chat.
 *
 * **Warum geteilt statt je Anbieter kopiert:** PROJ-85 hat live gezeigt, was
 * passiert, wenn ein Zweck nicht bei jedem Anbieter ankommt — der Router fällt
 * still auf den leeren Stub zurück, und das ist von „die KI hat nichts
 * gefunden" nicht zu unterscheiden. Fünf gleichlautende Kopien desselben
 * Aufrufs sind genau die Fläche, auf der so etwas entsteht. Hier gibt es einen
 * Aufruf; die Anbieter reichen nur ihr Modell herein.
 *
 * Anders als die Geschwister-Zwecke erzeugt der Chat **freien Text**
 * (`generateText`), kein Objekt: eine Gesprächsantwort hat kein Schema.
 * Damit entfällt auch die strikt/locker-Aufteilung aus PROJ-88 — es gibt keine
 * Längengrenze, an der ein lokales Modell die ganze Antwort verlieren könnte.
 */

import { generateText } from "ai"
import type { LanguageModel } from "ai"

import type {
  ProjectChatAutoContext,
  ProjectChatGenerationOutput,
} from "../types"

/**
 * Der unverhandelbare Teil der Anweisung. Steht **im Code**, nicht in einem
 * Skill — sonst könnte eine Mandanten-Anpassung Lock L5 aushebeln (PROJ-80-α).
 */
export const PROJECT_CHAT_SYSTEM_PROMPT = [
  "Du bist ein Assistent innerhalb einer Projektplattform und beantwortest Fragen",
  "zu genau einem Projekt.",
  "",
  "Unverhandelbare Regeln:",
  "- Du änderst nichts. Du legst nichts an, du löschst nichts, du verschiebst nichts.",
  "  Wirst du darum gebeten, erkläre, wo die Person es selbst tun kann.",
  "- Du erfindest keine Projektdaten. Was nicht im Kontext steht, weißt du nicht —",
  "  sage das dann ausdrücklich, statt zu raten.",
  "- Ist der Kontext abgeschnitten, weise darauf hin, statt Vollständigkeit zu behaupten.",
  "- Antworte in der Sprache der Frage, standardmäßig Deutsch.",
  "- Fasse dich knapp und konkret; keine Höflichkeitsfloskeln vorweg.",
].join("\n")

/** Baut den Kontextblock. Bewusst kompakt — der Verlauf ist wichtiger. */
export function buildProjectChatContextBlock(ctx: ProjectChatAutoContext): string {
  const p = ctx.project
  const lines: string[] = [
    "## Projekt",
    `Name: ${p.name}`,
    p.description ? `Vorhaben: ${p.description}` : null,
    p.project_type ? `Typ: ${p.project_type}` : null,
    p.project_method ? `Methode: ${p.project_method}` : null,
    p.lifecycle_status ? `Status: ${p.lifecycle_status}` : null,
  ].filter((l): l is string => l !== null)

  if (ctx.phases.length > 0) {
    lines.push("", "## Phasen")
    for (const ph of ctx.phases) {
      lines.push(`- ${ph.name}${ph.status ? ` (${ph.status})` : ""}`)
    }
  }

  if (ctx.open_work_items.length > 0) {
    lines.push("", "## Offene Arbeitspakete")
    for (const wi of ctx.open_work_items) {
      const due = wi.due_date ? `, fällig ${wi.due_date}` : ""
      lines.push(`- ${wi.title} (${wi.status}${due})`)
    }
    if (ctx.open_work_items_total > ctx.open_work_items.length) {
      lines.push(
        `- … insgesamt ${ctx.open_work_items_total}; hier nur die ersten ${ctx.open_work_items.length}.`,
      )
    }
  }

  if (ctx.history_truncated) {
    lines.push(
      "",
      "Hinweis: Der Gesprächsverlauf ist gekürzt; frühere Nachrichten fehlen.",
    )
  }

  if (ctx.skill_instructions) {
    // Ergänzung, kein Ersatz — die Regeln oben bleiben verbindlich.
    lines.push("", "## Zusätzliche Vorgaben für dieses Projekt", ctx.skill_instructions)
  }

  return lines.join("\n")
}

/**
 * Führt eine Chat-Antwort aus. Wirft bei Anbieterfehlern — der Router bildet
 * das auf `provider_error` ab (PROJ-137), damit eine leere Antwort immer einen
 * benennbaren Grund hat.
 */
export async function runProjectChat(
  model: LanguageModel,
  ctx: ProjectChatAutoContext,
): Promise<ProjectChatGenerationOutput> {
  const result = await generateText({
    model,
    system: `${PROJECT_CHAT_SYSTEM_PROMPT}\n\n${buildProjectChatContextBlock(ctx)}`,
    messages: ctx.history.map((m) => ({ role: m.role, content: m.content })),
  })

  return {
    text: result.text ?? "",
    token_input: result.usage?.inputTokens ?? null,
    token_output: result.usage?.outputTokens ?? null,
  }
}
