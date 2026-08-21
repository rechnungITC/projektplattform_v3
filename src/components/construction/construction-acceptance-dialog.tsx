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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  scheduleConstructionAcceptance,
  updateConstructionAcceptance,
} from "@/lib/construction/api"
import type { ConstructionAcceptance } from "@/types/construction-acceptance"
import type { ConstructionSection, ProjectConstructionTrade } from "@/types/construction"

type Subject = "gewerk" | "abschnitt" | "gesamt"

interface Props {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Gesetzt = Ändern eines angesetzten Termins, leer = neu ansetzen. */
  acceptance?: ConstructionAcceptance | null
  /** Nachabnahme: verweist auf eine VERWEIGERTE Abnahme desselben Bezugs. */
  supersedes?: ConstructionAcceptance | null
  trades: ProjectConstructionTrade[]
  sections: Array<{ id: string; label: string; depth: number }>
  onSaved: () => void
}

function tradeLabel(t: ProjectConstructionTrade): string {
  return t.trade?.label ?? "Gewerk"
}

/**
 * PROJ-45-γ — Abnahmetermin ansetzen oder einen angesetzten Termin ändern.
 *
 * Der Bezug ist das Besondere: **höchstens einer** (D-γ1). Die drei Fälle stehen
 * darum als Auswahl nebeneinander — Gewerk, Bauabschnitt oder **das ganze
 * Projekt**. Der dritte ist nicht „nichts ausgewählt", sondern eine eigene,
 * benannte Wahl; die ursprüngliche Anforderung wollte ihn über den
 * Wurzel-Abschnitt lösen, was in einem Bauprojekt ohne Abschnittsbaum nicht
 * baubar war.
 *
 * Beim **Ändern** ist der Bezug nicht mehr wählbar: er gehört zur Identität der
 * Abnahme, und die Datenbank nimmt ihn in der Änderungs-Funktion gar nicht an.
 * Das wird gesagt statt nur ausgegraut.
 */
export function ConstructionAcceptanceDialog({
  projectId,
  open,
  onOpenChange,
  acceptance = null,
  supersedes = null,
  trades,
  sections,
  onSaved,
}: Props) {
  const isEdit = Boolean(acceptance)
  const locked = supersedes !== null

  const initialSubject: Subject = React.useMemo(() => {
    const src = acceptance ?? supersedes
    if (src?.trade_id) return "gewerk"
    if (src?.section_id) return "abschnitt"
    return "gesamt"
  }, [acceptance, supersedes])

  const [subject, setSubject] = React.useState<Subject>(initialSubject)
  const [tradeId, setTradeId] = React.useState<string>(
    acceptance?.trade_id ?? supersedes?.trade_id ?? ""
  )
  const [sectionId, setSectionId] = React.useState<string>(
    acceptance?.section_id ?? supersedes?.section_id ?? ""
  )
  const [scheduledFor, setScheduledFor] = React.useState<string>(
    acceptance?.scheduled_for ?? ""
  )
  const [title, setTitle] = React.useState<string>(acceptance?.title ?? "")
  const [notes, setNotes] = React.useState<string>(acceptance?.notes ?? "")
  const [busy, setBusy] = React.useState(false)

  const activeTrades = React.useMemo(
    () => trades.filter((t) => t.trade?.is_active !== false),
    [trades]
  )

  async function submit() {
    if (!scheduledFor) {
      toast.error("Bitte einen Abnahmetermin angeben.")
      return
    }
    setBusy(true)
    try {
      if (isEdit && acceptance) {
        // Leeren geht NUR über den Schalter — ein weggelassenes Feld heisst
        // „unverändert" (PROJ-122-Defektklasse). Die Differenz zum
        // Ausgangszustand entscheidet, was gesendet wird.
        const patch: Parameters<typeof updateConstructionAcceptance>[2] = {}
        if (scheduledFor !== acceptance.scheduled_for) {
          patch.scheduled_for = scheduledFor
        }
        const nextTitle = title.trim()
        if (nextTitle !== (acceptance.title ?? "")) {
          if (nextTitle) patch.title = nextTitle
          else patch.clear_title = true
        }
        const nextNotes = notes.trim()
        if (nextNotes !== (acceptance.notes ?? "")) {
          if (nextNotes) patch.notes = nextNotes
          else patch.clear_notes = true
        }
        if (Object.keys(patch).length === 0) {
          toast.info("Keine Änderung.")
          onOpenChange(false)
          return
        }
        await updateConstructionAcceptance(projectId, acceptance.id, patch)
        toast.success("Abnahme geändert.")
      } else {
        await scheduleConstructionAcceptance(projectId, {
          scheduled_for: scheduledFor,
          trade_id: subject === "gewerk" ? tradeId || null : null,
          section_id: subject === "abschnitt" ? sectionId || null : null,
          title: title.trim() || null,
          notes: notes.trim() || null,
          supersedes_acceptance_id: supersedes?.id ?? null,
        })
        toast.success(
          supersedes
            ? `Nachabnahme zu Nr. ${supersedes.acceptance_number} angesetzt.`
            : "Abnahmetermin angesetzt."
        )
      }
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? "Abnahmetermin ändern"
              : supersedes
                ? `Nachabnahme zu Nr. ${supersedes.acceptance_number}`
                : "Abnahmetermin ansetzen"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Der Bezug gehört zur Identität der Abnahme und ist nicht änderbar. Termin, Titel und Bemerkung schon — solange noch nicht protokolliert ist."
              : supersedes
                ? "Die Nachabnahme übernimmt den Bezug der verweigerten Abnahme; die alte bleibt unverändert stehen."
                : "Eine Abnahme bezieht sich auf ein Gewerk, einen Bauabschnitt oder auf das ganze Projekt — auf genau eines davon."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!isEdit && (
            <div className="space-y-2">
              <Label>Bezug</Label>
              <RadioGroup
                value={subject}
                onValueChange={(v) => setSubject(v as Subject)}
                disabled={locked}
                className="gap-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="gewerk" id="subj-gewerk" />
                  <Label htmlFor="subj-gewerk" className="font-normal">
                    Ein Gewerk
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="abschnitt" id="subj-abschnitt" />
                  <Label htmlFor="subj-abschnitt" className="font-normal">
                    Ein Bauabschnitt
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="gesamt" id="subj-gesamt" />
                  <Label htmlFor="subj-gesamt" className="font-normal">
                    Das ganze Projekt (Gesamtabnahme)
                  </Label>
                </div>
              </RadioGroup>
              {locked && (
                <p className="text-xs text-muted-foreground">
                  Der Bezug ist von der verweigerten Abnahme übernommen und
                  deshalb festgelegt.
                </p>
              )}
            </div>
          )}

          {!isEdit && subject === "gewerk" && (
            <div className="space-y-2">
              <Label htmlFor="acc-trade">Gewerk</Label>
              {/* Sentinel statt `undefined`: sonst kippt die Auswahl beim
                  ersten Setzen von unkontrolliert auf kontrolliert
                  (PROJ-Y-45d). */}
              <Select
                value={tradeId}
                onValueChange={setTradeId}
                disabled={locked || activeTrades.length === 0}
              >
                <SelectTrigger id="acc-trade">
                  <SelectValue placeholder="Gewerk wählen …" />
                </SelectTrigger>
                <SelectContent>
                  {activeTrades.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {tradeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeTrades.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Dem Projekt ist noch kein aktives Gewerk zugeordnet.
                </p>
              )}
            </div>
          )}

          {!isEdit && subject === "abschnitt" && (
            <div className="space-y-2">
              <Label htmlFor="acc-section">Bauabschnitt</Label>
              <Select
                value={sectionId}
                onValueChange={setSectionId}
                disabled={locked || sections.length === 0}
              >
                <SelectTrigger id="acc-section">
                  <SelectValue placeholder="Abschnitt wählen …" />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {" ".repeat(s.depth * 2)}
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {sections.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Dieses Projekt hat noch keinen Abschnittsbaum. Die
                  Gesamtabnahme funktioniert auch ohne.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="acc-date">Abnahmetermin</Label>
            <Input
              id="acc-date"
              type="date"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Ein Termin in der Vergangenheit ist zulässig — für die
              Nacherfassung eines längst gelaufenen Termins.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="acc-title">Titel (optional)</Label>
            <Input
              id="acc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z. B. Abnahme Elektro Haus A"
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="acc-notes">Bemerkung (optional)</Label>
            <Textarea
              id="acc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={4000}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Abbrechen
          </Button>
          <Button onClick={submit} disabled={busy}>
            {isEdit ? "Änderung speichern" : "Termin ansetzen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
