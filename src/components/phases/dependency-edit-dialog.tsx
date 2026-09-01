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
import {
  DependencyApiError,
  deleteDependency,
  updateDependency,
} from "@/lib/dependencies/api"
import {
  DEPENDENCY_CONSTRAINT_HINTS,
  DEPENDENCY_CONSTRAINT_LABELS,
  DEPENDENCY_CONSTRAINT_TYPES,
  DEPENDENCY_LAG_MAX,
  DEPENDENCY_LAG_MIN,
  type DependencyConstraintType,
} from "@/types/dependency"

export interface EditableDependency {
  id: string
  constraint_type: DependencyConstraintType
  lag_days: number
  /** Nur zur Anzeige — „Fundament gießen → Rohbau starten". */
  fromLabel: string
  toLabel: string
}

interface Props {
  projectId: string
  dependency: EditableDependency | null
  onOpenChange: (open: boolean) => void
  onChanged: () => void
  canEdit: boolean
}

/**
 * Kantentyp und Abstand ändern — oder die Kante entfernen.
 *
 * **Ersetzt einen reinen Löschpfad.** Vor PROJ-155-β.1 war ein Klick auf einen
 * Abhängigkeitspfeil im Gantt unmittelbar der Weg zur Bestätigungsabfrage: die
 * einzige Handlung an einer Kante war ihre Vernichtung. Typ und Abstand waren
 * über die ganze Anwendung **nirgends** setzbar, obwohl Datenbank und beide
 * Routen sie seit PROJ-9-Round-2 tragen — der Gantt schrieb hartkodiert
 * `FS`/`0`, die Registerfläche konnte nur lesen und löschen. Entsprechend
 * einheitlich sah der Bestand aus: alle Kanten in Produktion `FS`, Abstand 0.
 *
 * Bewusst ein Dialog und kein Popover, abweichend vom Design-Brief: ein
 * Popover müsste an einem SVG-Pfad verankert werden, dessen Position von Zoom,
 * Bildlauf und Zeilenhöhe abhängt. Das ist Risiko ohne Ertrag — die Substanz
 * des Kriteriums ist „Löschen ist eine von drei Handlungen", nicht die Bauform.
 */
export function DependencyEditDialog({
  projectId,
  dependency,
  onOpenChange,
  onChanged,
  canEdit,
}: Props) {
  if (!dependency) return null
  // Der Formularzustand wird ueber `key` neu aufgesetzt, nicht in einem Effekt
  // zurueckgesetzt: `react-hooks/set-state-in-effect` verbietet Letzteres, und
  // die Regel hat recht — ein Effekt, der beim Wechsel der Kante nachzieht,
  // rendert erst einmal die Werte der vorigen. Dasselbe Muster wie in
  // PROJ-155-α und PROJ-70-β.
  return (
    <DependencyEditForm
      key={dependency.id}
      projectId={projectId}
      dependency={dependency}
      onOpenChange={onOpenChange}
      onChanged={onChanged}
      canEdit={canEdit}
    />
  )
}

function DependencyEditForm({
  projectId,
  dependency,
  onOpenChange,
  onChanged,
  canEdit,
}: Props & { dependency: EditableDependency }) {
  const [constraintType, setConstraintType] =
    React.useState<DependencyConstraintType>(dependency.constraint_type)
  const [lagText, setLagText] = React.useState(
    String(dependency.lag_days ?? 0),
  )
  const [busy, setBusy] = React.useState<null | "save" | "delete">(null)

  const lag = Number.parseInt(lagText, 10)
  const lagValid =
    lagText.trim() !== "" &&
    Number.isFinite(lag) &&
    lag >= DEPENDENCY_LAG_MIN &&
    lag <= DEPENDENCY_LAG_MAX
  const dirty =
    constraintType !== dependency.constraint_type ||
    (lagValid && lag !== (dependency.lag_days ?? 0))

  async function handleSave() {
    if (!lagValid) return
    setBusy("save")
    try {
      // Nur das Geänderte senden — die Route weist einen leeren Rumpf ab, und
      // ein Feld mitzuschicken, das sich nicht geändert hat, erzeugte eine
      // Audit-Zeile ohne Anlass.
      const patch: {
        constraint_type?: DependencyConstraintType
        lag_days?: number
      } = {}
      if (constraintType !== dependency.constraint_type) {
        patch.constraint_type = constraintType
      }
      if (lag !== (dependency.lag_days ?? 0)) patch.lag_days = lag
      await updateDependency(projectId, dependency.id, patch)
      toast.success("Abhängigkeit gespeichert")
      onOpenChange(false)
      onChanged()
    } catch (err) {
      toast.error("Speichern fehlgeschlagen", {
        description:
          err instanceof DependencyApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : undefined,
      })
    } finally {
      setBusy(null)
    }
  }

  async function handleDelete() {
    setBusy("delete")
    try {
      await deleteDependency(projectId, dependency.id)
      toast.success("Abhängigkeit entfernt")
      onOpenChange(false)
      onChanged()
    } catch (err) {
      toast.error("Entfernen fehlgeschlagen", {
        description:
          err instanceof DependencyApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : undefined,
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Abhängigkeit</DialogTitle>
          <DialogDescription>
            {dependency.fromLabel} → {dependency.toLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="dep-type">Typ</Label>
            <Select
              value={constraintType}
              onValueChange={(v) =>
                setConstraintType(v as DependencyConstraintType)
              }
              disabled={!canEdit || busy !== null}
            >
              <SelectTrigger id="dep-type">
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
            <p className="text-xs text-muted-foreground">
              {DEPENDENCY_CONSTRAINT_HINTS[constraintType]}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dep-lag">Abstand in Tagen</Label>
            <Input
              id="dep-lag"
              type="number"
              inputMode="numeric"
              value={lagText}
              min={DEPENDENCY_LAG_MIN}
              max={DEPENDENCY_LAG_MAX}
              onChange={(e) => setLagText(e.target.value)}
              disabled={!canEdit || busy !== null}
              aria-invalid={!lagValid}
            />
            <p className="text-xs text-muted-foreground">
              Negativ bedeutet Überlappung — der Nachfolger beginnt, bevor der
              Vorgänger fertig ist.
            </p>
            {!lagValid ? (
              <p className="text-xs text-destructive">
                Bitte eine ganze Zahl zwischen {DEPENDENCY_LAG_MIN} und{" "}
                {DEPENDENCY_LAG_MAX} angeben.
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          {canEdit ? (
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={busy !== null}
            >
              {busy === "delete" ? "Wird entfernt …" : "Entfernen"}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">
              Nur Ansicht — zum Ändern fehlt die Berechtigung.
            </span>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy !== null}
            >
              Schliessen
            </Button>
            {canEdit ? (
              <Button
                type="button"
                onClick={handleSave}
                disabled={busy !== null || !dirty || !lagValid}
              >
                {busy === "save" ? "Wird gespeichert …" : "Sichern"}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
