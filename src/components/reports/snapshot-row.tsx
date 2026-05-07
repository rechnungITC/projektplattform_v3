"use client"

import {
  AlertCircle,
  Download,
  ExternalLink,
  Loader2,
  RefreshCcw,
  Sparkles,
} from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { isPdfPendingStale } from "@/lib/reports/pdf-status"
import {
  SNAPSHOT_KIND_LABELS,
  type SnapshotListItem,
} from "@/lib/reports/types"

interface SnapshotRowProps {
  projectId: string
  snapshot: SnapshotListItem
  onRetryPdf: (snapshotId: string) => Promise<void>
}

export function SnapshotRow({
  projectId,
  snapshot,
  onRetryPdf,
}: SnapshotRowProps) {
  const [retrying, setRetrying] = React.useState(false)
  const generatedAt = new Date(snapshot.generated_at)
  const snapshotUrl = `/reports/snapshots/${snapshot.id}`
  const pdfUrl = `/api/projects/${projectId}/snapshots/${snapshot.id}/pdf`
  const pendingIsStale =
    snapshot.pdf_status === "pending" && isPdfPendingStale(snapshot.generated_at)
  const pdfStatus = pendingIsStale ? "failed" : snapshot.pdf_status

  async function handleRetry() {
    setRetrying(true)
    try {
      await onRetryPdf(snapshot.id)
      toast.success("PDF-Render gestartet", {
        description: "Der Status aktualisiert sich in wenigen Sekunden.",
      })
    } catch (err) {
      toast.error("Retry fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{SNAPSHOT_KIND_LABELS[snapshot.kind]}</Badge>
          <Badge variant="outline">v{snapshot.version}</Badge>
          {snapshot.has_ki_summary ? (
            <Badge variant="outline" className="gap-1">
              <Sparkles className="h-3 w-3" aria-hidden />
              KI
            </Badge>
          ) : null}
          {snapshot.pdf_status === "pending" && !pendingIsStale ? (
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              PDF in Arbeit
            </Badge>
          ) : pendingIsStale ? (
            <Badge variant="destructive" className="gap-1">
              <AlertCircle className="h-3 w-3" aria-hidden />
              PDF hängt
            </Badge>
          ) : snapshot.pdf_status === "failed" ? (
            <Badge variant="destructive" className="gap-1">
              <AlertCircle className="h-3 w-3" aria-hidden />
              PDF fehlgeschlagen
            </Badge>
          ) : null}
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {generatedAt.toLocaleString("de-DE", {
            dateStyle: "long",
            timeStyle: "short",
          })}{" "}
          · {snapshot.generated_by_name}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild type="button" variant="ghost" size="sm">
          <Link href={snapshotUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-1 h-4 w-4" aria-hidden />
            HTML öffnen
          </Link>
        </Button>
        {pdfStatus === "available" ? (
          <Button asChild type="button" variant="outline" size="sm">
            <a href={pdfUrl} download>
              <Download className="mr-1 h-4 w-4" aria-hidden />
              PDF
            </a>
          </Button>
        ) : pdfStatus === "failed" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleRetry()}
            disabled={retrying}
          >
            {retrying ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCcw className="mr-1 h-4 w-4" aria-hidden />
            )}
            {pendingIsStale ? "PDF erneut versuchen" : "PDF erneut rendern"}
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" disabled>
            PDF wird erzeugt …
          </Button>
        )}
      </div>
    </div>
  )
}
