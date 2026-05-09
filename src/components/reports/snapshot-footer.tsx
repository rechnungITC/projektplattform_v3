import type { SnapshotContent, SnapshotKind } from "@/lib/reports/types"
import { SNAPSHOT_KIND_LABELS } from "@/lib/reports/types"

interface SnapshotFooterProps {
  kind: SnapshotKind
  version: number
  content: SnapshotContent
}

export function SnapshotFooter({
  kind,
  version,
  content,
}: SnapshotFooterProps) {
  const generatedAt = new Date(content.generated_at)
  return (
    <footer className="mt-8 break-inside-avoid border-t pt-4 text-xs text-muted-foreground print:break-inside-avoid">
      <p>
        {SNAPSHOT_KIND_LABELS[kind]} v{version} ·{" "}
        {generatedAt.toLocaleDateString("de-DE", { dateStyle: "long" })} ·{" "}
        Generiert von {content.generated_by_name}
      </p>
      <p className="mt-1 print:hidden">
        Diese Seite ist druckoptimiert (Browser → Drucken → PDF).
      </p>
      {content.ki_summary ? (
        <p className="mt-1">
          KI-Quelle: {content.ki_summary.provider} · Datenklasse {content.ki_summary.classification}
        </p>
      ) : null}
    </footer>
  )
}
