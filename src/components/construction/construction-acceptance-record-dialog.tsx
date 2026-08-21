"use client"

import { Plus, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import {
  recordConstructionAcceptance,
  setConstructionAcceptanceParticipants,
} from "@/lib/construction/api"
import {
  ACCEPTANCE_OPEN_DEFECT_STATUSES,
  warrantyEndDate,
} from "@/lib/construction/acceptances"
import { CONSTRUCTION_DEFECT_SEVERITY_LABELS } from "@/lib/construction/defects"
import {
  CONSTRUCTION_ACCEPTANCE_PARTICIPANT_ROLE_LABELS,
  CONSTRUCTION_ACCEPTANCE_PARTICIPANT_ROLES,
  CONSTRUCTION_WARRANTY_PRESETS,
  type ConstructionAcceptance,
  type ConstructionAcceptanceParticipantRole,
  type ConstructionAcceptanceResult,
} from "@/types/construction-acceptance"
import type { ConstructionDefect } from "@/types/construction-defect"
import type { ProjectConstructionTrade } from "@/types/construction"

interface ParticipantRow {
  key: string
  source: "stakeholder" | "vendor" | "name"
  stakeholderId: string
  vendorId: string
  name: string
  role: ConstructionAcceptanceParticipantRole
  present: boolean
}

interface NewReservationRow {
  key: string
  title: string
  tradeId: string
  severity: "gering" | "erheblich" | "gravierend"
}

interface Props {
  projectId: string
  acceptance: ConstructionAcceptance
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Offene Mängel DIESES Bezugs — Vorschlag für die Vorbehalte. */
  openDefects: ConstructionDefect[]
  trades: ProjectConstructionTrade[]
  stakeholders: Array<{ id: string; name: string }>
  vendors: Array<{ id: string; name: string }>
  onRecorded: () => void
}

const RESULT_LABELS: Record<ConstructionAcceptanceResult, string> = {
  abgenommen: "Abgenommen",
  abgenommen_unter_vorbehalt: "Abgenommen unter Vorbehalt",
  verweigert: "Verweigert",
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * PROJ-45-γ — die Abnahme protokollieren.
 *
 * Drei Dinge machen diese Maske aus:
 *
 *  1. **Vorbehalte sind Verweise, keine Kopien.** Die offenen Mängel dieses
 *     Bezugs stehen zum Anhaken bereit und sind vorausgewählt; neue Vorbehalte
 *     werden serverseitig über die **bestehende** β-Anlegefunktion zu echten
 *     Mängeln. Es entsteht keine zweite Mängelliste (L20).
 *  2. **„Abgenommen" bei offenen Mängeln braucht eine ausdrückliche
 *     Bestätigung.** Genau hier verfallen Vorbehalte in der Praxis, deshalb
 *     wird die Abweichung benannt und angehakt, nicht weggelassen.
 *  3. **Teilnehmer werden VOR dem Ergebnis gespeichert.** Sie frieren mit dem
 *     Ergebnis ein — die Datenbank nimmt sie danach nicht mehr an. Die Maske
 *     sendet sie darum zuerst; schlägt das Protokollieren danach fehl, bleibt
 *     die Teilnehmerliste erhalten und der Vorgang ist wiederholbar.
 */
export { ACCEPTANCE_OPEN_DEFECT_STATUSES }

export function ConstructionAcceptanceRecordDialog({
  projectId,
  acceptance,
  open,
  onOpenChange,
  openDefects,
  trades,
  stakeholders,
  vendors,
  onRecorded,
}: Props) {
  const [result, setResult] = React.useState<ConstructionAcceptanceResult | "">("")
  const [acceptedOn, setAcceptedOn] = React.useState(today())
  const [reason, setReason] = React.useState("")
  const [warrantyMonths, setWarrantyMonths] = React.useState<string>("")
  const [ticked, setTicked] = React.useState<Set<string>>(
    () => new Set(openDefects.map((d) => d.id))
  )
  const [newRows, setNewRows] = React.useState<NewReservationRow[]>([])
  const [participants, setParticipants] = React.useState<ParticipantRow[]>([])
  const [despite, setDespite] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const activeTrades = React.useMemo(
    () => trades.filter((t) => t.trade?.is_active !== false),
    [trades]
  )

  const reservationCount = ticked.size + newRows.filter((r) => r.title.trim()).length
  const untickedOpen = openDefects.filter((d) => !ticked.has(d.id)).length
  const needsDespite = result === "abgenommen" && untickedOpen > 0
  const isRefusal = result === "verweigert"
  const showWarranty =
    result === "abgenommen" || result === "abgenommen_unter_vorbehalt"
  // Geprüfte, geklemmte Rechnung aus der geteilten Lib — die naive Fassung
  // hier lief am Monatsende über und zeigte ein anderes Fristende als die
  // Datenbank speichert.
  const computedEnd = warrantyEndDate(
    acceptedOn,
    warrantyMonths ? Number(warrantyMonths) : null
  )

  function toggle(id: string) {
    setTicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function addParticipant() {
    setParticipants((prev) => [
      ...prev,
      {
        key: `p${prev.length}-${Date.now()}`,
        source: "name",
        stakeholderId: "",
        vendorId: "",
        name: "",
        role: "sonstige",
        present: true,
      },
    ])
  }

  function patchParticipant(key: string, patch: Partial<ParticipantRow>) {
    setParticipants((prev) =>
      prev.map((p) => (p.key === key ? { ...p, ...patch } : p))
    )
  }

  async function submit() {
    if (!result) {
      toast.error("Bitte ein Ergebnis wählen.")
      return
    }
    if (isRefusal && !reason.trim()) {
      toast.error("Eine verweigerte Abnahme braucht eine Begründung.")
      return
    }
    if (result === "abgenommen_unter_vorbehalt" && reservationCount === 0) {
      toast.error("Ergebnis „unter Vorbehalt“ braucht mindestens einen Vorbehalt.")
      return
    }
    if (needsDespite && !despite) {
      toast.error(
        `Es sind noch ${untickedOpen} offene Mängel für diesen Bezug erfasst. Bitte als Vorbehalt anhaken oder die Abweichung ausdrücklich bestätigen.`
      )
      return
    }

    setBusy(true)
    try {
      // Teilnehmer ZUERST: sie frieren mit dem Ergebnis ein.
      const usable = participants.filter((p) =>
        p.source === "stakeholder"
          ? Boolean(p.stakeholderId)
          : p.source === "vendor"
            ? Boolean(p.vendorId)
            : Boolean(p.name.trim())
      )
      if (usable.length > 0) {
        await setConstructionAcceptanceParticipants(
          projectId,
          acceptance.id,
          usable.map((p) => ({
            stakeholder_id: p.source === "stakeholder" ? p.stakeholderId : null,
            vendor_id: p.source === "vendor" ? p.vendorId : null,
            display_name: p.source === "name" ? p.name.trim() : null,
            role_in_acceptance: p.role,
            attendance: p.present ? "anwesend" : "abwesend",
          }))
        )
      }

      await recordConstructionAcceptance(projectId, acceptance.id, {
        result,
        accepted_on: acceptedOn,
        reason: reason.trim() || undefined,
        warranty_months:
          showWarranty && warrantyMonths ? Number(warrantyMonths) : null,
        reservation_defect_ids: [...ticked],
        new_reservations: newRows
          .filter((r) => r.title.trim() && r.tradeId)
          .map((r) => ({
            title: r.title.trim(),
            trade_id: r.tradeId,
            severity: r.severity,
          })),
        accept_despite_open_defects: despite || undefined,
      })

      toast.success(`Abnahme Nr. ${acceptance.acceptance_number} protokolliert.`)
      onRecorded()
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Protokollieren fehlgeschlagen."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Abnahme Nr. {acceptance.acceptance_number} protokollieren
          </DialogTitle>
          <DialogDescription>
            Das Ergebnis ist endgültig. Eine Nachabnahme nach einer Verweigerung
            ist ein neuer Vorgang, der auf diesen verweist — dieser hier bleibt
            unverändert stehen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Ergebnis</Label>
            <RadioGroup
              value={result}
              onValueChange={(v) => setResult(v as ConstructionAcceptanceResult)}
              className="gap-2"
            >
              {(
                Object.keys(RESULT_LABELS) as ConstructionAcceptanceResult[]
              ).map((r) => (
                <div key={r} className="flex items-center gap-2">
                  <RadioGroupItem value={r} id={`res-${r}`} />
                  <Label htmlFor={`res-${r}`} className="font-normal">
                    {RESULT_LABELS[r]}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rec-date">Abnahmedatum</Label>
              <Input
                id="rec-date"
                type="date"
                value={acceptedOn}
                onChange={(e) => setAcceptedOn(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Angesetzt war der {new Date(acceptance.scheduled_for).toLocaleDateString("de-DE")}.
              </p>
            </div>

            {showWarranty && (
              <div className="space-y-2">
                <Label htmlFor="rec-warranty">Gewährleistung</Label>
                <Select
                  value={warrantyMonths}
                  onValueChange={setWarrantyMonths}
                >
                  <SelectTrigger id="rec-warranty">
                    <SelectValue placeholder="Dauer wählen …" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONSTRUCTION_WARRANTY_PRESETS.map((p) => (
                      <SelectItem key={p.months} value={String(p.months)}>
                        {p.label}
                      </SelectItem>
                    ))}
                    <SelectItem value="24">24 Monate</SelectItem>
                    <SelectItem value="12">12 Monate</SelectItem>
                  </SelectContent>
                </Select>
                {computedEnd ? (
                  <p className="text-xs text-muted-foreground">
                    Frist endet am{" "}
                    <span className="font-medium">
                      {new Date(computedEnd).toLocaleDateString("de-DE")}
                    </span>
                    . Der Wert wird mit dem Protokoll festgeschrieben.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Ohne Angabe wird keine Frist festgehalten.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="rec-reason">
              {isRefusal ? "Begründung der Verweigerung" : "Bemerkung (optional)"}
            </Label>
            <Textarea
              id="rec-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder={isRefusal ? "z. B. Estrich nicht trocken" : ""}
            />
            {isRefusal && (
              <p className="text-xs text-muted-foreground">
                Eine verweigerte Abnahme setzt keine Gewährleistungsfrist in Gang.
              </p>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Vorbehalte</Label>
              <Badge variant="secondary">{reservationCount} erklärt</Badge>
            </div>

            {openDefects.length > 0 ? (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-xs text-muted-foreground">
                  Offene Mängel dieses Bezugs — vorausgewählt. Abhaken, was nicht
                  als Vorbehalt erklärt wird.
                </p>
                {openDefects.map((d) => (
                  <div key={d.id} className="flex items-start gap-2">
                    <Checkbox
                      id={`res-def-${d.id}`}
                      checked={ticked.has(d.id)}
                      onCheckedChange={() => toggle(d.id)}
                    />
                    <Label
                      htmlFor={`res-def-${d.id}`}
                      className="font-normal leading-tight"
                    >
                      #{d.defect_number} {d.title}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {CONSTRUCTION_DEFECT_SEVERITY_LABELS[d.severity]}
                      </span>
                    </Label>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Für diesen Bezug ist derzeit kein offener Mangel erfasst.
              </p>
            )}

            <div className="space-y-2">
              {newRows.map((row) => (
                <div key={row.key} className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[12rem] flex-1 space-y-1">
                    <Label className="text-xs">Neuer Vorbehalt</Label>
                    <Input
                      value={row.title}
                      onChange={(e) =>
                        setNewRows((prev) =>
                          prev.map((r) =>
                            r.key === row.key ? { ...r, title: e.target.value } : r
                          )
                        )
                      }
                      placeholder="Kurzbeschreibung"
                      maxLength={200}
                    />
                  </div>
                  <div className="w-40 space-y-1">
                    <Label className="text-xs">Gewerk</Label>
                    <Select
                      value={row.tradeId}
                      onValueChange={(v) =>
                        setNewRows((prev) =>
                          prev.map((r) => (r.key === row.key ? { ...r, tradeId: v } : r))
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="wählen …" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeTrades.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.trade?.label ?? "Gewerk"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-36 space-y-1">
                    <Label className="text-xs">Schweregrad</Label>
                    <Select
                      value={row.severity}
                      onValueChange={(v) =>
                        setNewRows((prev) =>
                          prev.map((r) =>
                            r.key === row.key
                              ? { ...r, severity: v as NewReservationRow["severity"] }
                              : r
                          )
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gering">Gering</SelectItem>
                        <SelectItem value="erheblich">Erheblich</SelectItem>
                        <SelectItem value="gravierend">Gravierend</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setNewRows((prev) => prev.filter((r) => r.key !== row.key))
                    }
                    aria-label="Vorbehalt entfernen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setNewRows((prev) => [
                    ...prev,
                    {
                      key: `n${prev.length}-${Date.now()}`,
                      title: "",
                      tradeId: "",
                      severity: "gering",
                    },
                  ])
                }
                disabled={activeTrades.length === 0}
              >
                <Plus className="mr-2 h-4 w-4" />
                Neuen Vorbehalt erfassen
              </Button>
              <p className="text-xs text-muted-foreground">
                Neue Vorbehalte werden zu echten Mängeln im Mängelregister — mit
                Nummer, Zuständigkeit und Verlauf. Keine zweite Liste.
              </p>
            </div>

            {needsDespite && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
                <Checkbox
                  id="rec-despite"
                  checked={despite}
                  onCheckedChange={(v) => setDespite(v === true)}
                />
                <Label htmlFor="rec-despite" className="font-normal leading-tight">
                  Ich nehme trotz {untickedOpen} nicht als Vorbehalt erklärter
                  offener Mängel vorbehaltlos ab.
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Nicht erklärte Vorbehalte verfallen mit der Abnahme.
                  </span>
                </Label>
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Teilnehmer</Label>
              <Button type="button" variant="outline" size="sm" onClick={addParticipant}>
                <Plus className="mr-2 h-4 w-4" />
                Teilnehmer
              </Button>
            </div>
            {participants.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Noch niemand erfasst. Das Protokoll braucht mindestens einen
                Anwesenden, sonst ist die Unterschriftenzeile eine leere
                Behauptung.
              </p>
            )}
            {participants.map((p) => (
              <div key={p.key} className="flex flex-wrap items-end gap-2">
                <div className="w-36 space-y-1">
                  <Label className="text-xs">Quelle</Label>
                  <Select
                    value={p.source}
                    onValueChange={(v) =>
                      patchParticipant(p.key, {
                        source: v as ParticipantRow["source"],
                        stakeholderId: "",
                        vendorId: "",
                        name: "",
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stakeholder">Stakeholder</SelectItem>
                      <SelectItem value="vendor">Nachunternehmer</SelectItem>
                      <SelectItem value="name">Freitext</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-[12rem] flex-1 space-y-1">
                  <Label className="text-xs">Person</Label>
                  {p.source === "stakeholder" ? (
                    <Select
                      value={p.stakeholderId}
                      onValueChange={(v) => patchParticipant(p.key, { stakeholderId: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="wählen …" />
                      </SelectTrigger>
                      <SelectContent>
                        {stakeholders.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : p.source === "vendor" ? (
                    <Select
                      value={p.vendorId}
                      onValueChange={(v) => patchParticipant(p.key, { vendorId: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="wählen …" />
                      </SelectTrigger>
                      <SelectContent>
                        {vendors.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={p.name}
                      onChange={(e) => patchParticipant(p.key, { name: e.target.value })}
                      placeholder="Name"
                      maxLength={160}
                    />
                  )}
                </div>
                <div className="w-40 space-y-1">
                  <Label className="text-xs">Rolle</Label>
                  <Select
                    value={p.role}
                    onValueChange={(v) =>
                      patchParticipant(p.key, {
                        role: v as ConstructionAcceptanceParticipantRole,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONSTRUCTION_ACCEPTANCE_PARTICIPANT_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {CONSTRUCTION_ACCEPTANCE_PARTICIPANT_ROLE_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <Checkbox
                    id={`pres-${p.key}`}
                    checked={p.present}
                    onCheckedChange={(v) => patchParticipant(p.key, { present: v === true })}
                  />
                  <Label htmlFor={`pres-${p.key}`} className="text-xs font-normal">
                    anwesend
                  </Label>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setParticipants((prev) => prev.filter((x) => x.key !== p.key))
                  }
                  aria-label="Teilnehmer entfernen"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Der Name wird mitgeschrieben, wie er heute gilt — das Protokoll
              hält fest, wer an diesem Tag anwesend war.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Abbrechen
          </Button>
          <Button onClick={submit} disabled={busy || !result}>
            Protokollieren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
