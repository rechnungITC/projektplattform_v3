"use client"

import { Eraser } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { ResponsibleUserPicker } from "@/components/projects/responsible-user-picker"
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
import { buildSectionTree, flattenSectionTree } from "@/hooks/use-construction"
import {
  createConstructionDefect,
  updateConstructionDefect,
} from "@/lib/construction/api"
import {
  buildDefectUpdatePayload,
  draftFromDefect,
  type DefectDraft,
} from "@/lib/construction/defect-actions"
import { CONSTRUCTION_DEFECT_SEVERITY_LABELS } from "@/lib/construction/defects"
import type { ConstructionSection, ProjectConstructionTrade } from "@/types/construction"
import {
  CONSTRUCTION_DEFECT_SEVERITIES,
  type ConstructionDefect,
  type ConstructionDefectSeverity,
} from "@/types/construction-defect"
import type { VendorWithStats } from "@/types/vendor"

const NONE = "__none__"

interface Props {
  projectId: string
  /** null = erfassen, sonst bearbeiten. */
  defect: ConstructionDefect | null
  trades: readonly ProjectConstructionTrade[]
  sections: readonly ConstructionSection[]
  vendors: readonly VendorWithStats[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void | Promise<void>
}

/**
 * PROJ-45-β — Mangel erfassen und ändern.
 *
 * Zwei Dinge unterscheiden diese Maske von den α-Dialogen:
 *
 *  1. **Sie hat zwei Rechte-Ebenen.** Erfassen darf jedes Projektmitglied, auch
 *     ein Betrachter (L15); ändern nur Projektleitung oder Mandanten-
 *     Administration (B-β2). Die Maske entscheidet das nicht — sie wird von der
 *     Fläche im passenden Modus geöffnet, und die Funktionen weisen ohnehin ab.
 *     `responsible_user_id` erscheint nur beim Ändern, weil die Anlege-Funktion
 *     das Feld gar nicht annimmt.
 *  2. **Jedes optionale Feld trägt einen sichtbaren „Leeren"-Schalter.** Für die
 *     Änderungs-Funktion bedeutet ein weggelassener Wert „unverändert"; ohne den
 *     Schalter liesse sich ein einmal gesetzter Text nie wieder entfernen. Genau
 *     dieser Defekt ist in PROJ-122 live aufgetreten. Die Übersetzung von
 *     „in der Maske geleert" nach `clear_*: true` macht
 *     `buildDefectUpdatePayload`, damit sie ohne Rendern prüfbar ist.
 *
 * Der Dialog wird von der Fläche mit einem `key` gemountet, deshalb kommt der
 * Anfangszustand aus `useState`-Initialisierern statt aus einem Effekt (ein
 * Reset per Effekt wäre eine set-state-in-effect-Verletzung).
 */
export function ConstructionDefectDialog({
  projectId,
  defect,
  trades,
  sections,
  vendors,
  open,
  onOpenChange,
  onSaved,
}: Props) {
  const isEdit = defect !== null
  const { currentTenant } = useAuth()

  const [draft, setDraft] = React.useState<DefectDraft>(() =>
    defect
      ? draftFromDefect(defect)
      : {
          title: "",
          trade_id: "",
          severity: "gering",
          description: "",
          section_id: "",
          due_date: "",
          responsible_user_id: "",
          vendor_id: "",
        }
  )
  const [saving, setSaving] = React.useState(false)

  const set = <K extends keyof DefectDraft>(field: K, value: DefectDraft[K]) =>
    setDraft((prev) => ({ ...prev, [field]: value }))

  /**
   * Ein nur DEAKTIVIERTES Gewerk behält seine Mängel und verschwindet lediglich
   * aus der Neuauswahl (Edge Case β). Beim Ändern bleibt das aktuell gesetzte
   * Gewerk deshalb wählbar, auch wenn es aus dem Katalog gefallen ist — sonst
   * könnte man den Mangel nicht mehr speichern, ohne ihn umzuhängen.
   */
  const tradeOptions = React.useMemo(
    () =>
      trades.filter(
        (t) => (t.trade?.is_active ?? true) || t.id === defect?.trade_id
      ),
    [trades, defect?.trade_id]
  )

  const sectionOptions = React.useMemo(
    () => flattenSectionTree(buildSectionTree(sections)),
    [sections]
  )

  /**
   * Der aktuell gesetzte Nachunternehmer bleibt wählbar, auch wenn er nicht in
   * der geladenen Liste steht — etwa weil das Lieferanten-Modul abgeschaltet ist
   * oder der Stammdatensatz inzwischen gelöscht wurde. Ohne diesen Zusatz
   * verlöre ein Speichervorgang die Zuordnung stillschweigend.
   */
  const currentVendor = defect?.vendor ?? null
  const vendorOptions = React.useMemo(() => {
    const known = vendors.map((v) => ({ id: v.id, name: v.name }))
    if (!currentVendor || known.some((v) => v.id === currentVendor.id)) return known
    return [...known, { id: currentVendor.id, name: currentVendor.name }]
  }, [vendors, currentVendor])

  const canSave = draft.title.trim().length > 0 && draft.trade_id.length > 0 && !saving

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSave) return
    setSaving(true)
    try {
      if (defect) {
        const payload = buildDefectUpdatePayload(defect, draft)
        if (!payload) {
          // Die Funktion weist einen leeren Rumpf mit 422 ab; das als Fehler zu
          // zeigen wäre irreführend, es gab schlicht nichts zu ändern.
          toast.info("Keine Änderung")
          onOpenChange(false)
          return
        }
        await updateConstructionDefect(projectId, defect.id, payload)
        toast.success("Mangel gespeichert")
      } else {
        await createConstructionDefect(projectId, {
          title: draft.title.trim(),
          trade_id: draft.trade_id,
          severity: draft.severity,
          section_id: draft.section_id.length > 0 ? draft.section_id : null,
          description:
            draft.description.trim().length > 0 ? draft.description.trim() : null,
          due_date: draft.due_date.length > 0 ? draft.due_date : null,
          // Bewusst weggelassen, wenn leer: die Anlege-Funktion belegt den
          // Nachunternehmer dann aus dem Gewerk vor (B-β3).
          vendor_id: draft.vendor_id.length > 0 ? draft.vendor_id : null,
        })
        toast.success("Mangel erfasst")
      }
      await onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error(isEdit ? "Speichern fehlgeschlagen" : "Erfassen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSaving(false)
    }
  }

  /** Der sichtbare Leeren-Schalter eines optionalen Feldes. */
  const clearButton = (field: keyof DefectDraft, label: string) =>
    draft[field].length > 0 ? (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-muted-foreground"
        aria-label={`${label} leeren`}
        onClick={() => set(field, "" as DefectDraft[typeof field])}
      >
        <Eraser className="mr-1 h-3 w-3" />
        Leeren
      </Button>
    ) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEdit
                ? `Mangel Nr. ${defect.defect_number} bearbeiten`
                : "Mangel erfassen"}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Ein geleertes Feld wird wirklich entfernt — nicht stillschweigend beibehalten."
                : "Titel, Gewerk und Schweregrad genügen. Alles andere kann später folgen."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="defect-title">Titel</Label>
              <Input
                id="defect-title"
                value={draft.title}
                maxLength={200}
                autoFocus
                placeholder="z. B. Undichte Dachhaut an der Attika"
                onChange={(e) => set("title", e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="defect-trade">Gewerk</Label>
                {/* PROJ-Y-45d: der Wert ist NIE `undefined`. Ein undefined-Wert
                    macht die Komponente unkontrolliert und sie kippt bei der
                    ersten Auswahl auf kontrolliert („Select is changing from
                    uncontrolled to controlled"). Das Gewerk ist Pflicht
                    (`canSave`), der Sentinel ist deshalb nur ein anwählbarer
                    Platzhalter — er speichert nichts, sondern macht Speichern
                    unmöglich. Gleiche Form wie `section_id`/`vendor_id` unten und
                    wie der Geschwister-Dialog `construction-defect-notice-dialog`. */}
                <Select
                  value={draft.trade_id.length > 0 ? draft.trade_id : NONE}
                  onValueChange={(value) =>
                    set("trade_id", value === NONE ? "" : value)
                  }
                >
                  <SelectTrigger id="defect-trade">
                    <SelectValue placeholder="Gewerk wählen …" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— bitte wählen —</SelectItem>
                    {tradeOptions.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.trade?.label ?? "Unbekanntes Gewerk"}
                        {t.trade && !t.trade.is_active ? " (inaktiv)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {tradeOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Dem Projekt ist noch kein Gewerk zugeordnet. Ein Mangel braucht
                    einen Adressaten — die Projektleitung ordnet Gewerke unter
                    „Gewerke“ zu.
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="defect-severity">Schweregrad</Label>
                <Select
                  value={draft.severity}
                  onValueChange={(value) =>
                    set("severity", value as ConstructionDefectSeverity)
                  }
                >
                  <SelectTrigger id="defect-severity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONSTRUCTION_DEFECT_SEVERITIES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {CONSTRUCTION_DEFECT_SEVERITY_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="defect-section">Ort (Bauabschnitt)</Label>
                {clearButton("section_id", "Bauabschnitt")}
              </div>
              <Select
                value={draft.section_id.length > 0 ? draft.section_id : NONE}
                onValueChange={(value) =>
                  set("section_id", value === NONE ? "" : value)
                }
              >
                <SelectTrigger id="defect-section">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— ohne Ortsangabe —</SelectItem>
                  {sectionOptions.map((node) => (
                    <SelectItem key={node.id} value={node.id}>
                      {" ".repeat(node.depth * 3)}
                      {node.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {sectionOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Das Projekt hat noch keine Bauabschnitte. Der Ort bleibt dann
                  schlicht leer — die Erfassung funktioniert trotzdem.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="defect-description">Beschreibung</Label>
                {clearButton("description", "Beschreibung")}
              </div>
              <Textarea
                id="defect-description"
                value={draft.description}
                rows={3}
                maxLength={4000}
                placeholder="Optional — was genau ist zu beheben?"
                onChange={(e) => set("description", e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="defect-due">Nachbesserungsfrist</Label>
                  {clearButton("due_date", "Frist")}
                </div>
                <Input
                  id="defect-due"
                  type="date"
                  value={draft.due_date}
                  onChange={(e) => set("due_date", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Ein zurückliegendes Datum ist erlaubt (Nacherfassung) und gilt
                  sofort als überfällig.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="defect-vendor">Nachunternehmer</Label>
                  {clearButton("vendor_id", "Nachunternehmer")}
                </div>
                <Select
                  value={draft.vendor_id.length > 0 ? draft.vendor_id : NONE}
                  onValueChange={(value) =>
                    set("vendor_id", value === NONE ? "" : value)
                  }
                >
                  <SelectTrigger id="defect-vendor">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>
                      {isEdit ? "— keiner —" : "— aus dem Gewerk übernehmen —"}
                    </SelectItem>
                    {vendorOptions.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Wer zum Zeitpunkt des Mangels ausgeführt hat. Bleibt erhalten,
                  auch wenn das Gewerk später anders belegt wird.
                </p>
              </div>
            </div>

            {isEdit ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="defect-responsible">Verantwortlich</Label>
                  {clearButton("responsible_user_id", "Verantwortlicher")}
                </div>
                <ResponsibleUserPicker
                  id="defect-responsible"
                  tenantId={currentTenant?.id ?? ""}
                  value={
                    draft.responsible_user_id.length > 0
                      ? draft.responsible_user_id
                      : undefined
                  }
                  placeholder="Niemand zugewiesen"
                  ariaLabel="Verantwortlich für die Nachbesserung"
                  disabled={!currentTenant}
                  onChange={(userId) => set("responsible_user_id", userId)}
                />
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={!canSave}>
              {saving ? "Speichern …" : isEdit ? "Speichern" : "Mangel erfassen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
