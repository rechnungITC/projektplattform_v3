"use client"

import { ArrowLeft, ArrowRight, GitBranch, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"
import {
  PROJECT_METHOD_LABELS,
  type ProjectMethod,
} from "@/types/project-method"
import type { WorkItem, WorkItemWithProfile } from "@/types/work-item"

interface CreateSubprojectFromWpDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  parentProjectId: string
  workItem: WorkItem | WorkItemWithProfile
  onCreated?: (newProjectId: string) => void | Promise<void>
}

// Methods relevant for the "Umsetzung"-Pfad. Scrum is the default per
// Designer § 8; SAFe + Kanban as alternatives. Waterfall/PMI/PRINCE2/VXT2
// are excluded because the wizard's UX-promise is "Scrum-Sub-Projekt
// für Umsetzung" — choosing Waterfall under a Waterfall WP makes no sense.
const ELIGIBLE_METHODS: ProjectMethod[] = ["scrum", "kanban", "safe"]

/**
 * PROJ-27 Designer § 8 — 2-Step-Wizard to spawn a Scrum-Sub-Projekt
 * from a Waterfall-Arbeitspaket.
 *
 *  Step 1 — Name + Methode + optionale Beschreibung
 *  Step 2 — Confirmation summary + Anlage-Button
 *
 * On submit calls `POST /api/projects` with the new optional parameter
 * `bootstrap_link_from_work_item_id` (handled in /backend).
 */
export function CreateSubprojectFromWpDialog({
  open,
  onOpenChange,
  parentProjectId,
  workItem,
  onCreated,
}: CreateSubprojectFromWpDialogProps) {
  const router = useRouter()
  const { currentTenant, user } = useAuth()

  const [step, setStep] = React.useState<1 | 2>(1)
  const [name, setName] = React.useState("")
  const [method, setMethod] = React.useState<ProjectMethod>("scrum")
  const [description, setDescription] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setStep(1)
      setName(`${workItem.title} — Umsetzung`)
      setMethod("scrum")
      setDescription("")
      setSubmitting(false)
    })
    return () => {
      cancelled = true
    }
  }, [open, workItem.title])

  const trimmedName = name.trim()
  const canProceed = trimmedName.length > 0 && trimmedName.length <= 255

  const submit = async () => {
    if (!currentTenant?.id || !user?.id) {
      toast.error("Kein aktiver Mandant — bitte neu einloggen")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: currentTenant.id,
          name: trimmedName,
          description: description.trim() || null,
          project_method: method,
          parent_project_id: parentProjectId,
          responsible_user_id: user.id,
          bootstrap_link_from_work_item_id: workItem.id,
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }
      const json = (await res.json()) as { project?: { id: string } }
      const newId = json.project?.id
      if (!newId) throw new Error("Antwort enthielt keine Projekt-ID")
      toast.success("Sub-Projekt angelegt", {
        description: `${trimmedName} — Methode: ${PROJECT_METHOD_LABELS[method]}`,
        action: {
          label: "Öffnen",
          onClick: () => router.push(`/projects/${newId}`),
        },
      })
      await onCreated?.(newId)
      onOpenChange(false)
    } catch (err) {
      toast.error("Sub-Projekt konnte nicht angelegt werden", {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-lg sm:rounded-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" aria-hidden />
            Sub-Projekt für Umsetzung anlegen
          </DialogTitle>
          <DialogDescription>
            Erzeugt ein neues Projekt unterhalb dieses Arbeitspakets und
            verknüpft beide automatisch via &quot;Liefert an&quot;.
          </DialogDescription>
        </DialogHeader>

        <StepIndicator step={step} />

        {step === 1 ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sp-name">Projekt-Name</Label>
              <Input
                id="sp-name"
                value={name}
                maxLength={255}
                onChange={(e) => setName(e.target.value)}
                placeholder="z. B. WP-007 Umsetzung"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sp-method">Methode</Label>
              <Select
                value={method}
                onValueChange={(v) => setMethod(v as ProjectMethod)}
              >
                <SelectTrigger id="sp-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ELIGIBLE_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {PROJECT_METHOD_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Alert className="mt-1 border-outline-variant bg-surface-container-low/60 py-2">
                <AlertDescription className="text-xs text-on-surface-variant">
                  Die Methode wird nach Anlage hart gesperrt (PROJ-6). Eine
                  Änderung erfordert das Neuanlegen des Projekts.
                </AlertDescription>
              </Alert>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sp-desc">Beschreibung (optional)</Label>
              <Textarea
                id="sp-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={5000}
                placeholder="Kurze Beschreibung, was im Sub-Projekt umgesetzt wird."
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Alert className="border-primary/40 bg-primary/10">
              <GitBranch className="h-4 w-4 text-primary" aria-hidden />
              <AlertTitle className="text-primary">
                Bereit zur Anlage
              </AlertTitle>
              <AlertDescription className="text-primary/80">
                Wir erstellen ein neues Projekt + setzen automatisch die
                Verknüpfung &quot;Arbeitspaket liefert an Projekt&quot;.
              </AlertDescription>
            </Alert>

            <dl className="grid grid-cols-1 gap-y-2 rounded-md border border-outline-variant bg-surface-container-low p-3 text-sm">
              <SummaryRow label="Projekt-Name" value={trimmedName} />
              <SummaryRow
                label="Methode"
                value={
                  <Badge variant="secondary" className="font-medium">
                    {PROJECT_METHOD_LABELS[method]}
                  </Badge>
                }
              />
              <SummaryRow
                label="Übergeordnetes Projekt"
                value={
                  <span className="text-xs text-on-surface-variant">
                    Dieses Projekt (Hierarchie)
                  </span>
                }
              />
              <SummaryRow
                label="Verknüpfung"
                value={
                  <span className="text-xs text-on-surface-variant">
                    {workItem.title}{" "}
                    <span className="font-medium text-foreground">liefert an</span>{" "}
                    {trimmedName}
                  </span>
                }
              />
              {description.trim() ? (
                <SummaryRow
                  label="Beschreibung"
                  value={
                    <span className="text-xs text-on-surface-variant line-clamp-3">
                      {description.trim()}
                    </span>
                  }
                />
              ) : null}
            </dl>
          </div>
        )}

        <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
          {step === 1 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Abbrechen
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep(1)}
              disabled={submitting}
            >
              <ArrowLeft className="mr-1 h-4 w-4" aria-hidden /> Zurück
            </Button>
          )}

          {step === 1 ? (
            <Button
              type="button"
              onClick={() => setStep(2)}
              disabled={!canProceed}
            >
              Weiter <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
            </Button>
          ) : (
            <Button type="button" onClick={() => void submit()} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />
                  Wird angelegt …
                </>
              ) : (
                "Sub-Projekt anlegen"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StepIndicator({ step }: { step: 1 | 2 }) {
  return (
    <ol
      className="flex items-center gap-2 text-xs text-on-surface-variant"
      aria-label="Schritte"
    >
      <li
        className={cn(
          "flex items-center gap-1.5",
          step === 1 ? "font-medium text-primary" : "",
        )}
      >
        <span
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
            step === 1
              ? "bg-primary text-primary-foreground"
              : "bg-surface-container",
          )}
        >
          1
        </span>
        Konfiguration
      </li>
      <span aria-hidden>·</span>
      <li
        className={cn(
          "flex items-center gap-1.5",
          step === 2 ? "font-medium text-primary" : "",
        )}
      >
        <span
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
            step === 2
              ? "bg-primary text-primary-foreground"
              : "bg-surface-container",
          )}
        >
          2
        </span>
        Bestätigung
      </li>
    </ol>
  )
}

function SummaryRow({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[10rem,1fr] items-baseline gap-2">
      <dt className="text-xs uppercase tracking-wide text-on-surface-variant">
        {label}
      </dt>
      <dd className="break-words text-sm">{value}</dd>
    </div>
  )
}
