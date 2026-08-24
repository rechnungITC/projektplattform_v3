import { requireProjectAccess } from "@/app/api/_lib/route-helpers"
import type { VisibleQuestionLookup } from "@/lib/ma-project/dd-finding-source-visibility"

/**
 * PROJ-Y-114d — sichtbare Fragen mit der **Nutzersitzung** ermitteln. Die Antwort
 * der RLS *ist* die Sichtbarkeitsprüfung; mit Dienst-Schlüssel wäre sie wirkungslos.
 *
 * Liegt in einem eigenen `_`-Modul und nicht in einer der beiden `route.ts`, weil
 * Next.js aus einem Route-Handler nur die bekannten Felder exportieren lässt — und
 * weil die Regel genau **einmal** existieren soll: beide Wege (Liste/Anlegen und
 * Bearbeiten) maskieren dieselbe Kennung, zwei Kopien könnten in der
 * Fail-closed-Richtung auseinanderlaufen.
 */
export function visibleQuestions(
  supabase: Parameters<typeof requireProjectAccess>[0]
): VisibleQuestionLookup {
  return async (ids) => {
    const { data, error } = await supabase
      .from("dd_questions")
      .select("id")
      .in("id", ids as string[])
    // Fail-closed: kann nicht festgestellt werden, was sichtbar ist, wird nichts
    // durchgelassen — eine verschwiegene Verknüpfung ist harmlos, eine verratene nicht.
    if (error) return []
    return ((data ?? []) as { id: string }[]).map((r) => r.id)
  }
}
