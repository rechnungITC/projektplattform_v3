"use client"

import { formatDistanceToNow } from "date-fns"
import { de } from "date-fns/locale"
import { History, Loader2, RotateCcw, Undo2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  AuditConflictError,
  fetchHistory,
  restoreEntity,
  undoAuditEntry,
} from "@/lib/audit/api"
import { cn } from "@/lib/utils"
import type { AuditEntityType, AuditLogEntry } from "@/types/audit"

interface HistoryTabProps {
  entityType: AuditEntityType
  entityId: string
  /**
   * Optional: render `old_value` and `new_value` more nicely than the
   * default JSON.stringify. Receives the raw JSONB-as-unknown — return
   * a string or React node.
   */
  formatValue?: (fieldName: string, value: unknown) => React.ReactNode
  /** Called after a successful undo or restore so the parent can refetch. */
  onMutated?: () => void
}

function formatDefault(value: unknown): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return JSON.stringify(value)
}

function dateBucketKey(iso: string): string {
  return iso.slice(0, 10) // YYYY-MM-DD
}

function reasonBadge(reason: string | null): React.ReactNode {
  if (!reason) return null
  if (reason === "undo") return <Badge variant="outline">Rücknahme</Badge>
  if (reason.startsWith("restore_from_"))
    return <Badge variant="outline">Restore</Badge>
  if (reason === "ki_acceptance")
    return (
      <Badge
        variant="outline"
        className="border-primary/50 bg-primary/10 text-primary"
        title="Aus KI-Vorschlag übernommen"
      >
        KI-Akzeptanz
      </Badge>
    )
  if (reason === "decision_logged")
    return <Badge variant="outline">Entscheidung geloggt</Badge>
  if (reason === "decision_revised")
    return <Badge variant="outline">Entscheidung revidiert</Badge>
  if (reason === "open_item_converted_to_task")
    return <Badge variant="outline">→ Aufgabe</Badge>
  if (reason === "open_item_converted_to_decision")
    return <Badge variant="outline">→ Entscheidung</Badge>
  if (reason === "compliance_trigger")
    return <Badge variant="outline">Compliance</Badge>
  return <Badge variant="outline">{reason}</Badge>
}

/**
 * Generic field-level history renderer (PROJ-10).
 * Mounts inside any entity drawer/page to show that entity's audit trail.
 *
 * - Groups entries by date.
 * - Shows old → new value diffs.
 * - Per-row "Rücknahme" button (calls /api/audit/entries/[id]/undo with stale-write
 *   guard handled server-side).
 * - "Auf Stand zurücksetzen" button per entry triggers full-entity restore
 *   to that entry's timestamp.
 */
export function HistoryTab({
  entityType,
  entityId,
  formatValue,
  onMutated,
}: HistoryTabProps) {
  const [entries, setEntries] = React.useState<AuditLogEntry[]>([])
  const [loading, setLoading] = React.useState(true)
  const [pendingId, setPendingId] = React.useState<string | null>(null)

  const reload = React.useCallback(async () => {
    try {
      setLoading(true)
      const list = await fetchHistory(entityType, entityId, { limit: 200 })
      setEntries(list)
    } catch (err) {
      toast.error("Historie konnte nicht geladen werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setLoading(false)
    }
  }, [entityType, entityId])

  React.useEffect(() => {
    void reload()
  }, [reload])

  const onUndo = async (entry: AuditLogEntry) => {
    setPendingId(entry.id)
    try {
      await undoAuditEntry(entry.id)
      toast.success(`„${entry.field_name}" zurückgesetzt`)
      await reload()
      onMutated?.()
    } catch (err) {
      if (err instanceof AuditConflictError) {
        toast.warning("Stale-Write erkannt", {
          description:
            "Das Feld wurde nach diesem Eintrag erneut geändert. Bitte Historie neu laden.",
        })
      } else {
        toast.error("Rücknahme fehlgeschlagen", {
          description: err instanceof Error ? err.message : "Unbekannter Fehler",
        })
      }
    } finally {
      setPendingId(null)
    }
  }

  const onRestore = async (entry: AuditLogEntry) => {
    const ok = window.confirm(
      `Alle Felder auf den Stand vom ${new Date(entry.changed_at).toLocaleString("de-DE")} zurücksetzen?`
    )
    if (!ok) return
    setPendingId(entry.id)
    try {
      const result = await restoreEntity(
        entityType,
        entityId,
        entry.changed_at
      )
      toast.success(`Auf Stand zurückgesetzt`, {
        description: `${result.fields_restored} Feld(er) angepasst.`,
      })
      if (result.warnings.length > 0) {
        const fields = result.warnings.map((w) => w.field).join(", ")
        toast.warning("Personenbezogene Daten wiederhergestellt", {
          description: `Restore hat zuvor bereinigte Class-3-Felder erneut gesetzt: ${fields}. Bitte DSGVO-Vorgaben prüfen.`,
        })
      }
      await reload()
      onMutated?.()
    } catch (err) {
      toast.error("Restore fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setPendingId(null)
    }
  }

  if (loading) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        Historie wird geladen …
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <History className="h-6 w-6 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            Noch keine Änderungshistorie. Sobald jemand ein verfolgtes Feld
            ändert, erscheint hier ein Eintrag.
          </p>
        </CardContent>
      </Card>
    )
  }

  // Group by date bucket
  const buckets = new Map<string, AuditLogEntry[]>()
  for (const entry of entries) {
    const key = dateBucketKey(entry.changed_at)
    const arr = buckets.get(key) ?? []
    arr.push(entry)
    buckets.set(key, arr)
  }

  return (
    <ScrollArea className="max-h-[60vh] pr-2">
      <div className="space-y-6">
        {Array.from(buckets.entries()).map(([dateKey, group]) => (
          <section key={dateKey} className="space-y-2">
            <h3 className="sticky top-0 bg-background py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {new Date(dateKey).toLocaleDateString("de-DE", {
                year: "numeric",
                month: "long",
                day: "2-digit",
              })}
            </h3>
            {group.map((entry) => {
              const renderValue = (value: unknown) =>
                formatValue
                  ? formatValue(entry.field_name, value)
                  : formatDefault(value)
              return (
                <Card key={entry.id}>
                  <CardContent className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-mono text-xs text-muted-foreground">
                          {entry.field_name}
                        </span>
                        {reasonBadge(entry.change_reason)}
                        <span className="ml-auto text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(entry.changed_at), {
                            locale: de,
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                      <div className="grid gap-1 text-sm sm:grid-cols-[auto_1fr]">
                        <span className="text-xs text-muted-foreground">
                          vorher
                        </span>
                        <span
                          className={cn(
                            "truncate text-muted-foreground line-through"
                          )}
                          title={formatDefault(entry.old_value)}
                        >
                          {renderValue(entry.old_value)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          nachher
                        </span>
                        <span
                          className="truncate"
                          title={formatDefault(entry.new_value)}
                        >
                          {renderValue(entry.new_value)}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void onUndo(entry)}
                        disabled={pendingId !== null}
                        title="Diese eine Änderung rückgängig"
                      >
                        {pendingId === entry.id ? (
                          <Loader2
                            className="h-4 w-4 animate-spin"
                            aria-hidden
                          />
                        ) : (
                          <Undo2 className="h-4 w-4" aria-hidden />
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void onRestore(entry)}
                        disabled={pendingId !== null}
                        title="Auf diesen Stand zurücksetzen"
                      >
                        <RotateCcw className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </section>
        ))}
      </div>
    </ScrollArea>
  )
}
