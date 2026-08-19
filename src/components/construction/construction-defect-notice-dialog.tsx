"use client"

import { Printer } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useConstructionDefects } from "@/hooks/use-construction-defects"
import { NOTICE_STATUSES, defectNoticeHref } from "@/lib/construction/defect-notice"
import {
  CONSTRUCTION_DEFECT_SEVERITY_LABELS,
  CONSTRUCTION_DEFECT_STATUS_LABELS,
} from "@/lib/construction/defects"
import type { ProjectConstructionTrade } from "@/types/construction"
import type { VendorWithStats } from "@/types/vendor"

const NONE = "__none__"

interface Props {
  projectId: string
  open: boolean
  trades: readonly ProjectConstructionTrade[]
  vendors: readonly VendorWithStats[]
  onOpenChange: (open: boolean) => void
}

/**
 * PROJ-45-β — Mängelanzeige erzeugen (AC-45β.13).
 *
 * Die Anzeige selbst ist eine chrome-lose Druckseite; der Browser druckt nach
 * PDF (L11, PROJ-21-Muster). Hier wird nur die Achse gewählt — **ein** Gewerk
 * **oder ein** Nachunternehmer, nicht beides, weil die Anzeige an genau einen
 * Adressaten geht.
 *
 * Der Zähler ist bewusst sichtbar: die Anzeige lässt geprüfte und verworfene
 * Mängel weg (dort ist nichts mehr zu fordern), und niemand soll erst im
 * gedruckten Blatt merken, dass es leer ist.
 *
 * Er zählt über eine EIGENE, ungefilterte Abfrage. Die Liste der Fläche darf es
 * nicht sein: steht dort ein Filter, wäre die angekündigte Zahl kleiner als das
 * gedruckte Blatt — eine Zusage, die die Druckseite bricht. Die Abfrage läuft
 * nur, solange der Dialog gemountet ist (die Fläche mountet ihn beim Öffnen).
 */
export function ConstructionDefectNoticeDialog({
  projectId,
  open,
  trades,
  vendors,
  onOpenChange,
}: Props) {
  const { defects, loading } = useConstructionDefects(projectId, {})
  const [axis, setAxis] = React.useState<"trade" | "vendor">("trade")
  const [tradeId, setTradeId] = React.useState("")
  const [vendorId, setVendorId] = React.useState("")

  const selected = axis === "trade" ? tradeId : vendorId
  const matching = React.useMemo(() => {
    if (selected.length === 0) return 0
    return defects.filter(
      (d) =>
        (NOTICE_STATUSES as readonly string[]).includes(d.status) &&
        (axis === "trade" ? d.trade_id === tradeId : d.vendor_id === vendorId)
    ).length
  }, [defects, axis, tradeId, vendorId, selected])

  const href =
    selected.length > 0
      ? defectNoticeHref(projectId, axis === "trade" ? { tradeId } : { vendorId })
      : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mängelanzeige erzeugen</DialogTitle>
          <DialogDescription>
            Eine Anzeige geht an genau einen Adressaten. Sie öffnet sich als
            Druckseite; das PDF erzeugt der Browser.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="notice-axis">Adressat bestimmen über</Label>
            <Select
              value={axis}
              onValueChange={(value) => setAxis(value as "trade" | "vendor")}
            >
              <SelectTrigger id="notice-axis">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trade">Gewerk</SelectItem>
                <SelectItem value="vendor">Nachunternehmer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {axis === "trade" ? (
            <div className="space-y-2">
              <Label htmlFor="notice-trade">Gewerk</Label>
              <Select
                value={tradeId.length > 0 ? tradeId : NONE}
                onValueChange={(value) => setTradeId(value === NONE ? "" : value)}
              >
                <SelectTrigger id="notice-trade">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— bitte wählen —</SelectItem>
                  {trades.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.trade?.label ?? "Unbekanntes Gewerk"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="notice-vendor">Nachunternehmer</Label>
              <Select
                value={vendorId.length > 0 ? vendorId : NONE}
                onValueChange={(value) => setVendorId(value === NONE ? "" : value)}
              >
                <SelectTrigger id="notice-vendor">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— bitte wählen —</SelectItem>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {vendors.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Es sind keine Lieferanten-Stammdaten verfügbar. Über das Gewerk
                  funktioniert die Anzeige unabhängig davon.
                </p>
              ) : null}
            </div>
          )}

          {selected.length > 0 && !loading ? (
            <p className="text-xs text-muted-foreground">
              {matching === 0
                ? "Für diese Auswahl ist derzeit kein offener Mangel erfasst — die Anzeige bliebe leer."
                : `${matching} ${matching === 1 ? "Mangel wird" : "Mängel werden"} aufgeführt.`}{" "}
              Berücksichtigt sind{" "}
              {NOTICE_STATUSES.map((s) => CONSTRUCTION_DEFECT_STATUS_LABELS[s]).join(
                ", "
              )}{" "}
              — {CONSTRUCTION_DEFECT_STATUS_LABELS.geprueft} und{" "}
              {CONSTRUCTION_DEFECT_STATUS_LABELS.verworfen} nicht, dort ist nichts
              mehr zu fordern. Der Schweregrad (
              {CONSTRUCTION_DEFECT_SEVERITY_LABELS.gravierend} bis{" "}
              {CONSTRUCTION_DEFECT_SEVERITY_LABELS.gering}) steht je Mangel dabei.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button asChild disabled={href === null}>
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                <Printer className="mr-2 h-4 w-4" />
                Anzeige öffnen
              </a>
            ) : (
              <span>
                <Printer className="mr-2 h-4 w-4" />
                Anzeige öffnen
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
