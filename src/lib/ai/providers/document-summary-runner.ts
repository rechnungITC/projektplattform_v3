/**
 * PROJ-80-α.2b — gemeinsamer Erzeugungsweg für die Quintessenz.
 *
 * **Warum geteilt statt je Anbieter kopiert:** PROJ-85 hat live gezeigt, was
 * passiert, wenn ein Zweck nicht bei jedem Anbieter ankommt — der Router fällt
 * still auf den leeren Stub zurück, und das ist von „die KI hat nichts
 * gefunden" nicht zu unterscheiden. Vier gleichlautende Kopien des
 * `generateObject`-Aufrufs sind genau die Fläche, auf der so etwas entsteht.
 * Hier gibt es einen Aufruf; die Anbieter reichen nur ihr Modell herein.
 *
 * Die Aufteilung streng/locker folgt PROJ-88: lokale Modelle scheitern
 * regelmäßig an `.max()`-Grenzen und verwerfen dann die **ganze** Antwort.
 * Deshalb für Ollama ein lockeres Schema und Kappen **danach** — lieber eine
 * gekürzte Quintessenz als gar keine.
 */

import { generateObject } from "ai"
import type { LanguageModel } from "ai"
import { z } from "zod"

import type {
  DocumentSummaryAutoContext,
  DocumentSummaryGenerationOutput,
  DocumentSummaryStructured,
} from "../types"

import {
  DOCUMENT_SUMMARY_SYSTEM_PROMPT,
  DocumentSummaryResponseSchema,
  buildDocumentSummaryPrompt,
  renderDocumentSummaryMarkdown,
} from "./graph-purpose-prompts"

/** Lockeres Gegenstück ohne Längengrenzen — für lokale Modelle. */
const DocumentSummaryResponseSchemaLoose = z.object({
  summary: z.object({
    title: z.string(),
    key_topics: z.array(z.string()).optional(),
    entities: z
      .array(z.object({ name: z.string(), type: z.string().optional() }))
      .optional(),
    summary_paragraphs: z.array(z.string()).optional(),
    references: z.array(z.string()).optional(),
    language: z.string().optional(),
  }),
})

/** Kappt auf die Grenzen des strengen Schemas, statt zu verwerfen. */
export function clampDocumentSummary(raw: {
  title: string
  key_topics?: string[]
  entities?: { name: string; type?: string }[]
  summary_paragraphs?: string[]
  references?: string[]
  language?: string
}): DocumentSummaryStructured {
  const cut = (s: string, n: number) => s.slice(0, n)
  return {
    title: cut(raw.title, 300) || "Ohne Titel",
    key_topics: (raw.key_topics ?? []).slice(0, 12).map((t) => cut(t, 120)),
    entities: (raw.entities ?? []).slice(0, 30).map((e) => ({
      name: cut(e.name, 160),
      type: cut(e.type ?? "unbekannt", 60),
    })),
    summary_paragraphs: (raw.summary_paragraphs ?? [])
      .slice(0, 8)
      .map((p) => cut(p, 2_000)),
    references: (raw.references ?? []).slice(0, 20).map((r) => cut(r, 300)),
    language: cut(raw.language ?? "de", 20),
  }
}

/**
 * Erzeugt die Quintessenz mit einem strengen Schema (Cloud-Anbieter).
 */
export async function runDocumentSummaryStrict(
  model: LanguageModel,
  ctx: DocumentSummaryAutoContext,
  temperature = 0.2,
): Promise<DocumentSummaryGenerationOutput> {
  const start = Date.now()
  const result = await generateObject({
    model,
    schema: DocumentSummaryResponseSchema,
    system: DOCUMENT_SUMMARY_SYSTEM_PROMPT,
    prompt: buildDocumentSummaryPrompt(ctx),
    temperature,
  })
  const usage = result.usage as
    | { inputTokens?: number; outputTokens?: number }
    | undefined

  const summary = result.object.summary
  return {
    summary,
    summary_markdown: renderDocumentSummaryMarkdown(summary, {
      truncated: ctx.document.truncated,
    }),
    usage: {
      input_tokens: usage?.inputTokens ?? null,
      output_tokens: usage?.outputTokens ?? null,
      latency_ms: Date.now() - start,
    },
  }
}

/**
 * Erzeugt die Quintessenz mit lockerem Schema und Kappung danach (Ollama).
 */
export async function runDocumentSummaryLoose(
  model: LanguageModel,
  ctx: DocumentSummaryAutoContext,
  temperature = 0.2,
): Promise<DocumentSummaryGenerationOutput> {
  const start = Date.now()
  const result = await generateObject({
    model,
    schema: DocumentSummaryResponseSchemaLoose,
    system: DOCUMENT_SUMMARY_SYSTEM_PROMPT,
    prompt: buildDocumentSummaryPrompt(ctx),
    temperature,
  })
  const usage = result.usage as
    | { inputTokens?: number; outputTokens?: number }
    | undefined

  const summary = clampDocumentSummary(result.object.summary)
  return {
    summary,
    summary_markdown: renderDocumentSummaryMarkdown(summary, {
      truncated: ctx.document.truncated,
    }),
    usage: {
      input_tokens: usage?.inputTokens ?? null,
      output_tokens: usage?.outputTokens ?? null,
      latency_ms: Date.now() - start,
    },
  }
}
