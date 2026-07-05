"use client"

import { Check, Loader2, Plus, ShieldCheck, X } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import {
  listDeliverableApprovals,
  respondToDeliverableApproval,
  submitDeliverableForApproval,
  withdrawDeliverableApproval,
} from "@/lib/ma-project/deliverable-approvals-api"
import type { Deliverable } from "@/types/deliverable"
import {
  DELIVERABLE_APPROVAL_STATUS_LABELS,
  type DeliverableApproval,
  type DeliverableApprovalEventType,
  type DeliverableApprovalStage,
} from "@/types/deliverable-approval-workflow"
import type { Stakeholder } from "@/types/stakeholder"

const EVENT_LABELS: Record<DeliverableApprovalEventType, string> = {
  submitted: "Eingereicht",
  approver_responded: "Stufe beantwortet",
  approved: "Freigegeben",
  rejected: "Zurückgewiesen",
  withdrawn: "Zurückgezogen",
}

function stageBadge(stage: DeliverableApprovalStage, isActive: boolean) {
  if (stage.response === "approve")
    return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Freigegeben</Badge>
  if (stage.response === "reject")
    return <Badge className="bg-red-500/15 text-red-700 dark:text-red-400">Zurückgewiesen</Badge>
  if (isActive)
    return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">Wartet auf Freigabe</Badge>
  return <Badge variant="secondary">Ausstehend</Badge>
}

interface DeliverableApprovalSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  deliverable: Deliverable | null
  canManage: boolean
  currentUserId: string | null
  stakeholders: Stakeholder[]
  memberName: Map<string, string>
  onChanged: () => void | Promise<void>
}

export function DeliverableApprovalSheet({
  open,
  onOpenChange,
  projectId,
  deliverable,
  canManage,
  currentUserId,
  stakeholders,
  memberName,
  onChanged,
}: DeliverableApprovalSheetProps) {
  const [approvals, setApprovals] = React.useState<DeliverableApproval[] | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [stagePicks, setStagePicks] = React.useState<string[]>([""])
  const [comment, setComment] = React.useState("")

  const did = deliverable?.id ?? null

  const candidates = React.useMemo(
    () => stakeholders.filter((s) => s.linked_user_id && s.is_active !== false),
    [stakeholders]
  )
  const stkName = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const s of stakeholders) m.set(s.id, s.name)
    return m
  }, [stakeholders])

  const load = React.useCallback(async () => {
    if (!did) return
    setStagePicks([""])
    setComment("")
    setLoading(true)
    setError(null)
    try {
      setApprovals(await listDeliverableApprovals(projectId, did))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Freigaben konnten nicht geladen werden.")
      setApprovals([])
    } finally {
      setLoading(false)
    }
  }, [projectId, did])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot fetch + form reset when the sheet opens
    if (open && did) void load()
  }, [open, did, load])

  const active = approvals?.find((a) => a.status === "pending") ?? null
  const activeStage = active?.stages
    ?.slice()
    .sort((a, b) => a.stage_order - b.stage_order)
    .find((s) => s.stage_order === active.current_stage_order)
  const activeApproverStk = activeStage
    ? stakeholders.find((s) => s.id === activeStage.approver_stakeholder_id)
    : null
  const iAmActiveApprover =
    !!activeStage &&
    activeStage.response === null &&
    activeApproverStk?.linked_user_id === currentUserId
  const canWithdraw =
    !!active && (canManage || active.submitted_by === currentUserId)

  async function doSubmit() {
    if (!did) return
    const ids = stagePicks.filter((v) => v)
    if (ids.length === 0) {
      toast.error("Mindestens eine Freigabe-Stufe auswählen.")
      return
    }
    setBusy(true)
    try {
      await submitDeliverableForApproval(projectId, did, ids)
      toast.success("Zur Freigabe eingereicht.")
      await load()
      await onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Einreichen fehlgeschlagen.")
    } finally {
      setBusy(false)
    }
  }

  async function doRespond(stageId: string, response: "approve" | "reject") {
    if (!did) return
    setBusy(true)
    try {
      await respondToDeliverableApproval(projectId, did, stageId, response, comment || undefined)
      toast.success(response === "approve" ? "Freigegeben." : "Zurückgewiesen.")
      setComment("")
      await load()
      await onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Aktion fehlgeschlagen.")
    } finally {
      setBusy(false)
    }
  }

  async function doWithdraw() {
    if (!did || !active) return
    setBusy(true)
    try {
      await withdrawDeliverableApproval(projectId, did, active.id)
      toast.success("Freigabe zurückgezogen.")
      await load()
      await onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Zurückziehen fehlgeschlagen.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" aria-hidden />
            Freigabe
          </SheetTitle>
          <SheetDescription>{deliverable?.name}</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-8">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Freigaben werden geladen…
            </div>
          ) : error ? (
            <p className="py-8 text-sm text-destructive">{error}</p>
          ) : (
            <>
              {/* Active workflow */}
              {active && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Laufende Freigabe</h3>
                    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">
                      {DELIVERABLE_APPROVAL_STATUS_LABELS[active.status]}
                    </Badge>
                  </div>
                  <ol className="space-y-2">
                    {active.stages
                      ?.slice()
                      .sort((a, b) => a.stage_order - b.stage_order)
                      .map((s) => {
                        const isActive = s.stage_order === active.current_stage_order
                        return (
                          <li
                            key={s.id}
                            className={`rounded-md border p-3 ${isActive ? "border-amber-500/50 bg-amber-500/5" : ""}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium">
                                Stufe {s.stage_order}: {stkName.get(s.approver_stakeholder_id) ?? "—"}
                              </span>
                              {stageBadge(s, isActive)}
                            </div>
                            {s.comment && (
                              <p className="mt-1 text-xs text-muted-foreground">„{s.comment}“</p>
                            )}
                          </li>
                        )
                      })}
                  </ol>

                  {iAmActiveApprover && (
                    <div className="space-y-2 rounded-md border bg-card p-3">
                      <Label className="text-xs">Kommentar (optional)</Label>
                      <Textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        rows={2}
                        placeholder="Begründung / Anmerkung…"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" disabled={busy} onClick={() => doRespond(activeStage!.id, "approve")}>
                          <Check className="mr-1 h-4 w-4" />
                          Freigeben
                        </Button>
                        <Button size="sm" variant="destructive" disabled={busy} onClick={() => doRespond(activeStage!.id, "reject")}>
                          <X className="mr-1 h-4 w-4" />
                          Zurückweisen
                        </Button>
                      </div>
                    </div>
                  )}

                  {canWithdraw && (
                    <Button variant="outline" size="sm" disabled={busy} onClick={doWithdraw}>
                      Freigabe zurückziehen
                    </Button>
                  )}
                </section>
              )}

              {/* Submit new workflow */}
              {!active && canManage && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">Zur Freigabe einreichen</h3>
                  {deliverable?.status !== "in_review" ? (
                    <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                      Das Deliverable muss im Status „In Review“ sein, um es zur Freigabe einzureichen.
                    </p>
                  ) : candidates.length === 0 ? (
                    <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                      Keine Freigeber verfügbar. Es werden Stakeholder mit verknüpftem Benutzerkonto benötigt.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {stagePicks.map((pick, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="w-16 shrink-0 text-xs text-muted-foreground">Stufe {i + 1}</span>
                          <Select
                            value={pick}
                            onValueChange={(v) =>
                              setStagePicks((prev) => prev.map((p, idx) => (idx === i ? v : p)))
                            }
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Freigeber wählen…" />
                            </SelectTrigger>
                            <SelectContent>
                              {candidates.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {stagePicks.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 shrink-0"
                              aria-label={`Stufe ${i + 1} entfernen`}
                              onClick={() => setStagePicks((prev) => prev.filter((_, idx) => idx !== i))}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setStagePicks((prev) => [...prev, ""])}
                        >
                          <Plus className="mr-1 h-4 w-4" />
                          Stufe hinzufügen
                        </Button>
                        <Button size="sm" disabled={busy} onClick={doSubmit}>
                          Einreichen
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Sequenziell: Stufe 2 wird erst nach Freigabe von Stufe 1 benachrichtigt.
                      </p>
                    </div>
                  )}
                </section>
              )}

              {!active && !canManage && (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  Aktuell läuft keine Freigabe für dieses Deliverable.
                </p>
              )}

              {/* History */}
              {approvals && approvals.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">Freigabehistorie</h3>
                  <ul className="space-y-3">
                    {approvals.map((a) => (
                      <li key={a.id} className="rounded-md border p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            {DELIVERABLE_APPROVAL_STATUS_LABELS[a.status]}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(a.submitted_at).toLocaleDateString("de-DE")}
                          </span>
                        </div>
                        <ul className="mt-2 space-y-1">
                          {a.events
                            ?.slice()
                            .sort((x, y) => x.created_at.localeCompare(y.created_at))
                            .map((ev) => (
                              <li key={ev.id} className="text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">
                                  {EVENT_LABELS[ev.event_type]}
                                </span>
                                {ev.actor_user_id && (
                                  <> · {memberName.get(ev.actor_user_id) ?? "—"}</>
                                )}
                                {ev.comment && <> · „{ev.comment}“</>}
                                {" · "}
                                {new Date(ev.created_at).toLocaleString("de-DE")}
                              </li>
                            ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
