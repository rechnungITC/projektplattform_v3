/**
 * PROJ-45-γ — die benennende Absage beim Entfernen eines Gewerks oder
 * Bauabschnitts.
 *
 * BEFUND (Tech Design γ, Befund 1): α/β haben den Fremdschlüssel-Konflikt in
 * einem Zweig behandelt, der WÖRTLICH von Mängeln sprach — Fehlercode
 * `defects_present`, Text „… bestehen noch Mängel". Sobald auch eine ABNAHME
 * den Bezug hält, blockiert sie das Entfernen genauso, und der Nutzer läse eine
 * Meldung über Mängel, die es gar nicht gibt. Die Meldung wäre also FALSCH
 * geworden, nicht bloss unvollständig — deshalb wird sie hier verallgemeinert
 * statt in γ ein zweites Mal danebengestellt.
 *
 * Der breitere Fall (eine gemeinsame Abbildung `23503` → 409 mit
 * Registrierungspunkt) bleibt PROJ-Y-45b.
 */

/** Eine Zeile, die das Entfernen blockiert. Kommt aus den INVOKER-Auskünften. */
export interface ConstructionBlockingRef {
  kind: "mangel" | "abnahme"
  id: string
  ref_number: number
  label: string | null
}

const KIND_LABEL: Record<ConstructionBlockingRef["kind"], string> = {
  mangel: "Mängel",
  abnahme: "Abnahmen",
}

/** Kurzform einer Zeile: „#3 Riss im Putz". */
function describe(ref: ConstructionBlockingRef): string | null {
  if (!ref.ref_number) return null
  return `#${ref.ref_number} ${ref.label ?? ""}`.trim()
}

/**
 * Baut die Absage-Meldung aus dem, was WIRKLICH blockiert.
 *
 * Bleibt bei genau einer Art bei deren Wort („… bestehen noch Mängel: …") —
 * der β-Fall liest sich damit unverändert — und nennt bei mehreren Arten beide.
 * Ohne benennbare Zeilen bleibt die allgemeine Form; das kann eintreten, wenn
 * die INVOKER-Auskunft dem Aufrufer weniger zeigt als der Fremdschlüssel weiss.
 */
export function buildBlockingMessage(
  subject: "Gewerk" | "Abschnitt",
  refs: ConstructionBlockingRef[],
  limit = 10
): string {
  const where =
    subject === "Gewerk"
      ? "Zu diesem Gewerk"
      : "In diesem Abschnitt oder darunter"
  const kinds = Array.from(new Set(refs.map((r) => r.kind)))
  // Nichts benennbar? Dann nennen wir die beiden Arten, die den Bezug
  // ÜBERHAUPT halten können — das ist ehrlicher als „Einträge" und hilft mehr.
  // Eintreten kann das, wenn die INVOKER-Auskunft dem Aufrufer weniger zeigt
  // als der Fremdschlüssel weiss, oder wenn sie selbst fehlschlägt.
  const what =
    kinds.length === 0
      ? "Mängel oder Abnahmen"
      : kinds.map((k) => KIND_LABEL[k]).join(" und ")

  const named = refs
    .map(describe)
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, limit)

  if (named.length === 0) {
    return `${where} bestehen noch ${what}. Bitte zuerst abschliessen oder umhängen.`
  }
  return `${where} bestehen noch ${what}: ${named.join(", ")}. Bitte zuerst abschliessen oder umhängen.`
}

/** Antwort der beiden INVOKER-Auskünfte in eine geprüfte Liste bringen. */
export function parseBlockingRefs(raw: unknown): ConstructionBlockingRef[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const r = entry as Record<string, unknown>
    const kind = r.kind === "abnahme" ? "abnahme" : r.kind === "mangel" ? "mangel" : null
    if (!kind || typeof r.id !== "string") return []
    return [
      {
        kind,
        id: r.id,
        ref_number: typeof r.ref_number === "number" ? r.ref_number : 0,
        label: typeof r.label === "string" ? r.label : null,
      },
    ]
  })
}
