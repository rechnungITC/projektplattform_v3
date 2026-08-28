/**
 * PROJ-153-α — geteilter Runner für die Generierung aus dem Vorhaben.
 *
 * **Ein Runner statt sechs Kopien** (Muster PROJ-80-α). Der Zweck muss nach
 * AC-153H.2 von **jedem** Anbieter beherrscht werden — sonst fällt der Router
 * still auf den leeren Stub zurück, und das ist von „die KI hat nichts
 * gefunden" nicht zu unterscheiden (die PROJ-85-Lücke). Sechs fast gleiche
 * Implementierungen wären genau der Ort, an dem die sechste abweicht.
 *
 * `generateObject` mit dem Schema aus `graph-purpose-prompts` — die harten
 * Deckel (Anzahl, Tiefe, Feldliste) wirken damit **nach** dem Modell und sind
 * aus keinem Skill erreichbar (CIA-Auflage A-5).
 */

import { generateObject } from "ai"
import type { LanguageModel } from "ai"

import {
  WORK_ITEMS_FROM_INTENT_SYSTEM_PROMPT,
  WorkItemsFromIntentResponseSchema,
  buildWorkItemsFromIntentPrompt,
} from "./graph-purpose-prompts"
import type {
  WorkItemsFromIntentGenerationOutput,
  WorkItemsFromIntentGenerationRequest,
} from "./types"

/** Strikte Fassung — für Anbieter mit echter Schema-Unterstützung. */
export async function runWorkItemsFromIntent(
  model: LanguageModel,
  request: WorkItemsFromIntentGenerationRequest,
): Promise<WorkItemsFromIntentGenerationOutput> {
  const start = Date.now()
  const result = await generateObject({
    model,
    schema: WorkItemsFromIntentResponseSchema,
    system: WORK_ITEMS_FROM_INTENT_SYSTEM_PROMPT,
    prompt: buildWorkItemsFromIntentPrompt(request),
    temperature: 0.3,
  })

  return {
    suggestions: result.object.suggestions,
    usage: {
      input_tokens: result.usage?.inputTokens ?? 0,
      output_tokens: result.usage?.outputTokens ?? 0,
      latency_ms: Date.now() - start,
    },
  }
}

/**
 * Lockere Fassung für Ollama.
 *
 * Grund steht in PROJ-88/89: lokale Modelle liefern häufiger eine Antwort, die
 * das strikte Schema knapp verfehlt, und `generateObject` verwirft dann die
 * **ganze** Antwort. Wir validieren daher locker und **kappen danach** — die
 * Deckel gelten unverändert, sie werden nur nachgelagert durchgesetzt statt
 * die Antwort zu vernichten.
 */
export async function runWorkItemsFromIntentLoose(
  model: LanguageModel,
  request: WorkItemsFromIntentGenerationRequest,
): Promise<WorkItemsFromIntentGenerationOutput> {
  const start = Date.now()
  const { LooseSchema } = await import("./work-items-from-intent-loose")

  const result = await generateObject({
    model,
    schema: LooseSchema,
    system: WORK_ITEMS_FROM_INTENT_SYSTEM_PROMPT,
    prompt: buildWorkItemsFromIntentPrompt(request),
    temperature: 0.3,
  })

  const { clampLooseSuggestions } = await import("./work-items-from-intent-loose")
  return {
    suggestions: clampLooseSuggestions(result.object.suggestions ?? []),
    usage: {
      input_tokens: result.usage?.inputTokens ?? 0,
      output_tokens: result.usage?.outputTokens ?? 0,
      latency_ms: Date.now() - start,
    },
  }
}
