"use client"

/**
 * PROJ-50 β — Jira sync conflict review (project-scoped, editor+).
 *
 * A button that opens a dialog listing PENDING conflicts where both V3 and
 * Jira changed the same field. The reviewer picks a winner per conflict
 * (V3 behalten / Jira übernehmen / Manuell erledigt). `jira_wins` on a
 * free-text field (title/description) applies the Jira value server-side;
 * `status` conflicts are record-only in α (the resolve result reports
 * `applied:false`). Mounted behind the caller's canEdit gate.
 */

import { GitCompareArrows, Loader2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  type JiraConflictResolution,
  type JiraSyncConflict,
  listJiraConflicts,
  resolveJiraConflict,
} from "@/lib/jira/inbound-api"

type Resolution = Exclude<JiraConflictResolution, "pending">

function ValueBlock({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="break-words rounded bg-muted px-2 py-1 text-sm">
        {value === null || value === "" ? (
          <span className="italic text-muted-foreground">(leer)</span>
        ) : (
          value
        )}
      </p>
    </div>
  )
}

export function JiraConflictsDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = React.useState(false)
  const [conflicts, setConflicts] = React.useState<JiraSyncConflict[]>([])
  const [loading, setLoading] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      setConflicts(await listJiraConflicts(projectId, { resolution: "pending" }))
    } catch (err) {
      toast.error("Konflikte konnten nicht geladen werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setLoading(false)
    }
  }, [projectId])

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) void refresh() // fetch on open (event-driven, no effect)
  }

  async function handleResolve(conflict: JiraSyncConflict, resolution: Resolution) {
    setBusy(conflict.id)
    try {
      const result = await resolveJiraConflict(projectId, conflict.id, resolution)
      // Drop the resolved row from the pending list.
      setConflicts((prev) => prev.filter((c) => c.id !== conflict.id))
      toast.success("Konflikt aufgelöst", {
        description: result.applied
          ? "Jira-Wert wurde übernommen."
          : resolution === "jira_wins" && conflict.field === "status"
            ? "Status-Konflikt vermerkt (Auto-Übernahme folgt in β)."
            : "Entscheidung gespeichert.",
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unbekannter Fehler"
      toast.error("Auflösen fehlgeschlagen", { description: msg })
      // A 409 means someone else resolved it — refresh to resync.
      void refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <GitCompareArrows className="mr-1.5 h-4 w-4" aria-hidden />
          Jira-Konflikte
          {conflicts.length > 0 ? (
            <Badge variant="secondary" className="ml-1.5">
              {conflicts.length}
            </Badge>
          ) : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Jira-Sync-Konflikte</DialogTitle>
          <DialogDescription>
            Felder, die seit dem letzten Sync sowohl in V3 als auch in Jira
            geändert wurden. Wähle pro Konflikt die gültige Quelle — es wird
            nichts still überschrieben.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />
            Lade Konflikte …
          </p>
        ) : conflicts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Keine offenen Konflikte. 🎉
          </p>
        ) : (
          <ul className="space-y-3">
            {conflicts.map((c) => (
              <li key={c.id} className="space-y-2 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {c.field}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    erkannt {new Date(c.detected_at).toLocaleString("de-DE")}
                  </span>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <ValueBlock label="V3 (aktuell)" value={c.v3_value} />
                  <ValueBlock label="Jira (eingehend)" value={c.jira_value} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy === c.id}
                    onClick={() => void handleResolve(c, "v3_wins")}
                  >
                    V3 behalten
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy === c.id}
                    onClick={() => void handleResolve(c, "jira_wins")}
                  >
                    Jira übernehmen
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy === c.id}
                    onClick={() => void handleResolve(c, "manual")}
                  >
                    Manuell erledigt
                  </Button>
                  {busy === c.id ? (
                    <Loader2 className="h-4 w-4 animate-spin self-center" aria-hidden />
                  ) : null}
                </div>
                {c.field === "status" ? (
                  <p className="text-xs text-muted-foreground">
                    Hinweis: Status-Konflikte werden in α nur vermerkt —
                    „Jira übernehmen“ schreibt den Status (noch) nicht
                    automatisch.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
