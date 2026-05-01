"use client"

import { FileText, Loader2, Sparkles, StickyNote } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { KiNarrativeModal } from "./ki-narrative-modal"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type {
  CreateSnapshotRequest,
  ReportSnapshot,
  SnapshotKind,
} from "@/lib/reports/types"
import { SNAPSHOT_KIND_LABELS } from "@/lib/reports/types"

interface SnapshotCreateButtonProps {
  projectId: string
  /** Comes from `tenant_settings.output_rendering.ki_narrative_enabled`. */
  kiNarrativeEnabled: boolean
  /** Inject the create function from `useSnapshots`. */
  onCreate: (
    body: CreateSnapshotRequest,
  ) => Promise<{ snapshot: ReportSnapshot; snapshotUrl: string } | null>
}

/**
 * "Snapshot erzeugen"-Trigger — exposes the two snapshot kinds in a
 * dropdown so editors can pick Status-Report vs Executive-Summary.
 *
 * When `kiNarrativeEnabled`, each kind also offers a "+ KI-Kurzfazit"
 * variant that opens the preview modal before committing.
 */
export function SnapshotCreateButton({
  projectId,
  kiNarrativeEnabled,
  onCreate,
}: SnapshotCreateButtonProps) {
  const [busy, setBusy] = React.useState<SnapshotKind | null>(null)
  const [kiModal, setKiModal] = React.useState<{
    open: boolean
    kind: SnapshotKind
  }>({ open: false, kind: "status_report" })

  async function commit(body: CreateSnapshotRequest) {
    setBusy(body.kind)
    try {
      const result = await onCreate(body)
      if (result) {
        toast.success(`${SNAPSHOT_KIND_LABELS[body.kind]} erzeugt`, {
          description: result.snapshotUrl,
          action: {
            label: "URL kopieren",
            onClick: () => {
              if (typeof navigator !== "undefined" && navigator.clipboard) {
                void navigator.clipboard.writeText(result.snapshotUrl)
              }
            },
          },
        })
      }
    } catch (err) {
      toast.error("Snapshot konnte nicht erzeugt werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setBusy(null)
    }
  }

  function startQuick(kind: SnapshotKind) {
    void commit({ kind })
  }

  function startKi(kind: SnapshotKind) {
    setKiModal({ open: true, kind })
  }

  const isBusy = busy !== null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" disabled={isBusy}>
            {isBusy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <FileText className="mr-2 h-4 w-4" aria-hidden />
            )}
            {isBusy ? "Wird erzeugt …" : "Snapshot erzeugen"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Status-Report</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => startQuick("status_report")}>
            <StickyNote className="mr-2 h-4 w-4" aria-hidden />
            Direkt erzeugen
          </DropdownMenuItem>
          {kiNarrativeEnabled ? (
            <DropdownMenuItem onClick={() => startKi("status_report")}>
              <Sparkles className="mr-2 h-4 w-4" aria-hidden />
              Mit KI-Kurzfazit
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Executive-Summary</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => startQuick("executive_summary")}>
            <StickyNote className="mr-2 h-4 w-4" aria-hidden />
            Direkt erzeugen
          </DropdownMenuItem>
          {kiNarrativeEnabled ? (
            <DropdownMenuItem onClick={() => startKi("executive_summary")}>
              <Sparkles className="mr-2 h-4 w-4" aria-hidden />
              Mit KI-Kurzfazit
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <KiNarrativeModal
        open={kiModal.open}
        onOpenChange={(open) => setKiModal((s) => ({ ...s, open }))}
        projectId={projectId}
        kind={kiModal.kind}
        onCommit={commit}
      />
    </>
  )
}
