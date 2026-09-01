"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { DependencyApiError, createDependency } from "@/lib/dependencies/api"
import {
  DEPENDENCY_CONSTRAINT_HINTS,
  DEPENDENCY_CONSTRAINT_LABELS,
  DEPENDENCY_CONSTRAINT_TYPES,
  DEPENDENCY_LAG_MAX,
  DEPENDENCY_LAG_MIN,
  type DependencyConstraintType,
} from "@/types/dependency"

/** Ein wählbares Ende — Phase oder Arbeitspaket/Aufgabe dieses Projekts. */
export interface DependencyCandidate {
  /** Kanten-Vokabular: `phase` · `work_package` · `todo`. */
  type: "phase" | "work_package" | "todo"
  id: string
  label: string
}

interface Props {
  projectId: string
  candidates: DependencyCandidate[]
  onCreated: () => void
}

/**
 * Abhängigkeit im Register anlegen.
 *
 * **Warum das Register einen Anlege-Weg braucht und nicht nur der Gantt.**
 * Eine Kante entsteht im Diagramm durch Ziehen von Balken zu Balken — das
 * setzt voraus, dass beide Objekte **Termine** haben, sonst gibt es keine
 * Balken. In einem frisch angelegten Projekt hat nichts Termine. Gemessen ist
 * das der Normalfall: von 138 lebenden Arbeitspaketen tragen **4** einen
 * eigenen Termin. Ohne diesen Dialog ist eine Abhängigkeit dort also
 * **überhaupt nicht** erreichbar, obwohl die Registerfläche sie auflistet und
 * löschen kann.
 */
export function CreateDependencyDialog({
  projectId,
  candidates,
  onCreated,
}: Props) {
  const [open, setOpen] = React.useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={candidates.length < 2}>
          Abhängigkeit anlegen
        </Button>
      </DialogTrigger>
      {open ? (
        <CreateDependencyForm
          projectId={projectId}
          candidates={candidates}
          onDone={(created) => {
            setOpen(false)
            if (created) onCreated()
          }}
        />
      ) : null}
    </Dialog>
  )
}

function CreateDependencyForm({
  projectId,
  candidates,
  onDone,
}: {
  projectId: string
  candidates: DependencyCandidate[]
  onDone: (created: boolean) => void
}) {
  const [fromKey, setFromKey] = React.useState("")
  const [toKey, setToKey] = React.useState("")
  const [constraintType, setConstraintType] =
    React.useState<DependencyConstraintType>("FS")
  const [lagText, setLagText] = React.useState("0")
  const [busy, setBusy] = React.useState(false)

  const byKey = React.useMemo(
    () => new Map(candidates.map((c) => [`${c.type}:${c.id}`, c])),
    [candidates],
  )
  const from = byKey.get(fromKey)
  const to = byKey.get(toKey)

  const lag = Number.parseInt(lagText, 10)
  const lagValid =
    lagText.trim() !== "" &&
    Number.isFinite(lag) &&
    lag >= DEPENDENCY_LAG_MIN &&
    lag <= DEPENDENCY_LAG_MAX
  // Die Datenbank lehnt eine Selbstkante per CHECK ab (`dependencies_no_self`).
  // Sie hier gar nicht anzubieten ist freundlicher als ein 422 danach.
  const sameEnds = fromKey !== "" && fromKey === toKey
  const canSubmit = from !== undefined && to !== undefined && !sameEnds && lagValid

  async function handleSubmit() {
    if (!from || !to || !canSubmit) return
    setBusy(true)
    try {
      await createDependency(projectId, {
        from_type: from.type,
        from_id: from.id,
        to_type: to.type,
        to_id: to.id,
        constraint_type: constraintType,
        lag_days: lag,
      })
      toast.success("Abhängigkeit angelegt")
      onDone(true)
    } catch (err) {
      toast.error("Anlegen fehlgeschlagen", {
        description:
          err instanceof DependencyApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Abhängigkeit anlegen</DialogTitle>
        <DialogDescription>
          Verbindet zwei Objekte dieses Projekts. Im Diagramm entsteht eine
          Kante nur zwischen Balken — hier geht es auch ohne Termine.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="dep-from">Vorgänger</Label>
          <Select value={fromKey} onValueChange={setFromKey} disabled={busy}>
            <SelectTrigger id="dep-from">
              <SelectValue placeholder="Objekt wählen" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((c) => (
                <SelectItem key={`${c.type}:${c.id}`} value={`${c.type}:${c.id}`}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dep-to">Nachfolger</Label>
          <Select value={toKey} onValueChange={setToKey} disabled={busy}>
            <SelectTrigger id="dep-to">
              <SelectValue placeholder="Objekt wählen" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((c) => (
                <SelectItem key={`${c.type}:${c.id}`} value={`${c.type}:${c.id}`}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {sameEnds ? (
            <p className="text-xs text-destructive">
              Vorgänger und Nachfolger müssen verschieden sein.
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="dep-new-type">Typ</Label>
            <Select
              value={constraintType}
              onValueChange={(v) =>
                setConstraintType(v as DependencyConstraintType)
              }
              disabled={busy}
            >
              <SelectTrigger id="dep-new-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEPENDENCY_CONSTRAINT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {DEPENDENCY_CONSTRAINT_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dep-new-lag">Abstand in Tagen</Label>
            <Input
              id="dep-new-lag"
              type="number"
              inputMode="numeric"
              value={lagText}
              min={DEPENDENCY_LAG_MIN}
              max={DEPENDENCY_LAG_MAX}
              onChange={(e) => setLagText(e.target.value)}
              disabled={busy}
              aria-invalid={!lagValid}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {DEPENDENCY_CONSTRAINT_HINTS[constraintType]} Ein negativer Abstand
          bedeutet Überlappung.
        </p>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onDone(false)}
          disabled={busy}
        >
          Abbrechen
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={busy || !canSubmit}>
          {busy ? "Wird angelegt …" : "Anlegen"}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
