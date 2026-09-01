/**
 * PROJ-153-α — lockeres Schema für lokale Modelle, mit nachgelagerter Kappung.
 *
 * Die harten Deckel aus `graph-purpose-prompts` gelten unverändert; sie werden
 * hier nur **nach** der Antwort durchgesetzt statt sie zu verwerfen. Ohne das
 * scheitert bei Ollama regelmäßig der ganze Lauf an einer Kleinigkeit —
 * gemessen und behoben in PROJ-88/89.
 */

import { z } from "zod"

import {
  INTENT_DEPTH_MAX,
  INTENT_ITEMS_MAX,
  WorkItemsFromIntentSuggestionSchema,
} from "./graph-purpose-prompts"

export const LooseSchema = z.object({
  suggestions: z
    .array(
      z.object({
        temp_id: z.string().optional().nullable(),
        parent_temp_id: z.string().optional().nullable(),
        title: z.string().optional().nullable(),
        description: z.string().optional().nullable(),
        kind: z.string().optional().nullable(),
        confidence: z.string().optional().nullable(),
      }),
    )
    .optional()
    .nullable(),
})

const ALLOWED_KINDS = new Set([
  "epic", "story", "task", "subtask", "bug", "work_package", "todo", "milestone",
])
const ALLOWED_CONFIDENCE = new Set(["low", "medium", "high"])

type Suggestion = z.infer<typeof WorkItemsFromIntentSuggestionSchema>

/**
 * Kappt eine lockere Antwort auf das, was das strikte Schema erlaubt.
 *
 * Verworfen wird nur, was **unbrauchbar** ist (kein Titel); alles andere wird
 * auf zulässige Werte gezogen. Die Reihenfolge ist bewusst: erst je Item
 * säubern, dann Verweise prüfen — ein Elternverweis auf ein verworfenes Item
 * würde sonst überleben.
 */
export function clampLooseSuggestions(
  raw: readonly {
    temp_id?: string | null
    parent_temp_id?: string | null
    title?: string | null
    description?: string | null
    kind?: string | null
    confidence?: string | null
  }[],
): Suggestion[] {
  const cleaned: Suggestion[] = []

  for (let i = 0; i < raw.length && cleaned.length < INTENT_ITEMS_MAX; i++) {
    const r = raw[i]!
    const title = (r.title ?? "").trim()
    if (title.length < 3) continue // ohne Titel ist ein Item wertlos

    cleaned.push({
      temp_id: (r.temp_id ?? `t_${i + 1}`).slice(0, 40),
      parent_temp_id: r.parent_temp_id ? r.parent_temp_id.slice(0, 40) : null,
      title: title.slice(0, 200),
      description: r.description ? r.description.slice(0, 1000) : null,
      kind: ALLOWED_KINDS.has(r.kind ?? "") ? (r.kind as Suggestion["kind"]) : "task",
      confidence: ALLOWED_CONFIDENCE.has(r.confidence ?? "")
        ? (r.confidence as Suggestion["confidence"])
        : "low",
    })
  }

  // Doppelte Kennungen eindeutig machen, bevor Verweise geprüft werden.
  const seen = new Set<string>()
  for (const s of cleaned) {
    let id = s.temp_id
    let n = 2
    while (seen.has(id)) id = `${s.temp_id}_${n++}`.slice(0, 40)
    s.temp_id = id
    seen.add(id)
  }

  // Verweise auf Unbekanntes, Selbstbezüge und zu tiefe Ketten auf oberste
  // Ebene zurückholen statt das Item zu verlieren.
  const byId = new Map(cleaned.map((s) => [s.temp_id, s] as const))
  for (const s of cleaned) {
    if (!s.parent_temp_id) continue
    if (s.parent_temp_id === s.temp_id || !byId.has(s.parent_temp_id)) {
      s.parent_temp_id = null
      continue
    }
    let cursor: string | null = s.parent_temp_id
    const path = new Set<string>([s.temp_id])
    let depth = 1
    while (cursor) {
      if (path.has(cursor) || depth >= INTENT_DEPTH_MAX) {
        s.parent_temp_id = null
        break
      }
      path.add(cursor)
      depth += 1
      cursor = byId.get(cursor)?.parent_temp_id ?? null
    }
  }

  return cleaned
}
