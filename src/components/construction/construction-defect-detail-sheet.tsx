"use client"

import { AlertTriangle, Clock, Pencil, ShieldQuestion } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { ConstructionPhotoStrip } from "./construction-photo-strip"
import { Textarea } from "@/components/ui/textarea"
import { useConstructionDefectEvents } from "@/hooks/use-construction-defects"
import { transitionConstructionDefect } from "@/lib/construction/api"
import {
  defectActionNeedsReason,
  describeReviewBlock,
  offeredDefectActions,
} from "@/lib/construction/defect-actions"
import {
  CONSTRUCTION_DEFECT_ACTION_LABELS,
  CONSTRUCTION_DEFECT_EVENT_LABELS,
  CONSTRUCTION_DEFECT_SEVERITY_LABELS,
  CONSTRUCTION_DEFECT_STATUS_LABELS,
  deriveDefectFlags,
} from "@/lib/construction/defects"
import type {
  ConstructionDefect,
  ConstructionDefectAction,
} from "@/types/construction-defect"

function fmtDate(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-DE")
}

function fmtDateTime(value: string): string {
  const d = new Date(value)
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })
}

interface Props {
  projectId: string
  defect: ConstructionDefect | null
  /** Projektleitung oder Mandanten-Administration (B-β2). */
  canManage: boolean
  /** Für die Vier-Augen-Erklärung — verglichen mit `reported_done_by`. */
  currentUserId: string | null
  onOpenChange: (open: boolean) => void
  onEdit: (defect: ConstructionDefect) => void
  onChanged: () => void | Promise<void>
}

/**
 * PROJ-45-β — Detailansicht eines Mangels: Statuswechsel und Verlauf.
 *
 * Zum Zwei-Akteur-Gate: die Regel selbst steht in
 * `transition_construction_defect_status` und weist mit `42501` ab — hier wird
 * sie weder nachgebaut noch umgangen. Die Fläche tut zwei Dinge:
 *
 *  - sie bietet nur Handlungen an, die der Aufrufer wirklich ausführen kann
 *    (`offeredDefectActions`), damit kein Knopf in eine Absage führt, und
 *  - sie **erklärt** den zurückgehaltenen Fall statt ihn zu verschweigen: wer
 *    fertiggemeldet hat, sieht, warum die Abnahme jemand anderem zusteht, und
 *    im klemmenden Fall (Projektleitung = einzige Administration) auch, was der
 *    legitime Ausweg ist. Ein stiller Übersteuerungsschalter wäre die falsche
 *    Antwort (B-β7, PROJ-119-Haltung).
 */
export function ConstructionDefectDetailSheet({
  projectId,
  defect,
  canManage,
  currentUserId,
  onOpenChange,
  onEdit,
  onChanged,
}: Props) {
  const [busy, setBusy] = React.useState(false)
  const [pending, setPending] = React.useState<ConstructionDefectAction | null>(null)
  const [reason, setReason] = React.useState("")
  const [reloadKey, setReloadKey] = React.useState(0)

  const { events, loading: eventsLoading, error: eventsError } =
    useConstructionDefectEvents(projectId, defect?.id ?? null, reloadKey)

  const flags = defect
    ? deriveDefectFlags(defect)
    : { isOverdue: false, isAwaitingReview: false }
  const reviewBlock = defect ? describeReviewBlock(defect, currentUserId) : null
  const actions = defect ? offeredDefectActions(defect, currentUserId) : []

  const run = async (action: ConstructionDefectAction, withReason?: string) => {
    if (!defect) return
    setBusy(true)
    try {
      await transitionConstructionDefect(projectId, defect.id, action, withReason)
      toast.success(`${CONSTRUCTION_DEFECT_ACTION_LABELS[action]} gespeichert`)
      setPending(null)
      setReason("")
      setReloadKey((k) => k + 1)
      await onChanged()
    } catch (err) {
      toast.error("Statuswechsel fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setBusy(false)
    }
  }

  const onAction = (action: ConstructionDefectAction) => {
    if (defectActionNeedsReason(action)) {
      setPending(action)
      setReason("")
      return
    }
    void run(action)
  }

  return (
    <Sheet open={defect !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {defect ? (
          <>
            <SheetHeader>
              <SheetTitle className="pr-8">
                Nr. {defect.defect_number} · {defect.title}
              </SheetTitle>
              <SheetDescription asChild>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Badge variant="outline">
                    {CONSTRUCTION_DEFECT_STATUS_LABELS[defect.status]}
                  </Badge>
                  <Badge variant="secondary">
                    {CONSTRUCTION_DEFECT_SEVERITY_LABELS[defect.severity]}
                  </Badge>
                  {flags.isOverdue ? (
                    <Badge variant="destructive">
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      überfällig
                    </Badge>
                  ) : null}
                  {flags.isAwaitingReview ? (
                    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300">
                      <Clock className="mr-1 h-3 w-3" />
                      wartet auf Prüfung
                    </Badge>
                  ) : null}
                </div>
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 py-6">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Gewerk</dt>
                  <dd>{defect.trade?.trade?.label ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Ort</dt>
                  <dd>{defect.section?.label ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Nachunternehmer</dt>
                  <dd>{defect.vendor?.name ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Nachbesserungsfrist
                  </dt>
                  <dd className={flags.isOverdue ? "font-medium text-destructive" : ""}>
                    {fmtDate(defect.due_date)}
                  </dd>
                </div>
              </dl>

              {defect.description ? (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Beschreibung</p>
                  <p className="whitespace-pre-wrap text-sm">{defect.description}</p>
                </div>
              ) : null}

              {canManage ? (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Nachbesserung steuern</p>
                    {actions.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {actions.map((action) => (
                          <Button
                            key={action}
                            size="sm"
                            variant={action === "pruefen" ? "default" : "outline"}
                            disabled={busy}
                            onClick={() => onAction(action)}
                          >
                            {CONSTRUCTION_DEFECT_ACTION_LABELS[action]}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Für diesen Status ist kein weiterer Schritt vorgesehen.
                      </p>
                    )}

                    {reviewBlock ? (
                      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                        <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{reviewBlock}</span>
                      </div>
                    ) : null}

                    {pending ? (
                      <div className="space-y-2 rounded-md border p-3">
                        <Label htmlFor="defect-reason">
                          Begründung für „
                          {CONSTRUCTION_DEFECT_ACTION_LABELS[pending]}“
                        </Label>
                        <Textarea
                          id="defect-reason"
                          rows={3}
                          maxLength={2000}
                          value={reason}
                          autoFocus
                          placeholder={
                            pending === "zurueckweisen"
                              ? "Was fehlt noch an der Nachbesserung?"
                              : "Warum ist das kein Mangel?"
                          }
                          onChange={(e) => setReason(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Ohne Begründung weist der Server den Schritt ab — sie
                          steht dauerhaft im Verlauf.
                        </p>
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => {
                              setPending(null)
                              setReason("")
                            }}
                          >
                            Abbrechen
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy || reason.trim().length === 0}
                            onClick={() => void run(pending, reason.trim())}
                          >
                            {CONSTRUCTION_DEFECT_ACTION_LABELS[pending]}
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    <div>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => onEdit(defect)}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Angaben bearbeiten
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Fristen setzen, fertigmelden und abnehmen liegt bei der
                  Projektleitung oder der Mandanten-Administration.
                </p>
              )}

              <Separator />

              {/*
                PROJ-45-ε — Fotostrecke des Mangels (AC-45ε.1). `key` an der
                Mangel-Kennung: wechselt die Detailansicht auf einen anderen
                Mangel, wird die Strecke neu aufgebaut statt im Effect
                zurückgesetzt (γ-Lehre, `react-hooks/set-state-in-effect`).
                „Foto hinzufügen" ist bewusst NICHT an `canManage` gebunden —
                jedes Projektmitglied darf fotografieren (β-Regel).
              */}
              <ConstructionPhotoStrip
                key={defect.id}
                projectId={projectId}
                anchor={{ defect_id: defect.id }}
                canManage={canManage}
                heading="Fotos zum Mangel"
              />

              <div className="space-y-3">
                <p className="text-sm font-medium">Verlauf</p>
                {eventsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : eventsError ? (
                  <p className="text-sm text-destructive">{eventsError}</p>
                ) : events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Noch keine Einträge.
                  </p>
                ) : (
                  <ol className="space-y-3 border-l pl-4">
                    {events.map((event) => (
                      <li key={event.id} className="relative text-sm">
                        <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-border" />
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-medium">
                            {CONSTRUCTION_DEFECT_EVENT_LABELS[event.event_type]}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {fmtDateTime(event.created_at)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {event.status_before
                            ? `${CONSTRUCTION_DEFECT_STATUS_LABELS[event.status_before]} → `
                            : ""}
                          {CONSTRUCTION_DEFECT_STATUS_LABELS[event.status_after]}
                        </p>
                        {event.reason ? (
                          <p className="mt-1 whitespace-pre-wrap rounded bg-muted/50 p-2 text-xs">
                            {event.reason}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                )}
                <p className="text-xs text-muted-foreground">
                  Jede Runde bleibt stehen — Einträge sind unveränderlich.
                </p>
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
