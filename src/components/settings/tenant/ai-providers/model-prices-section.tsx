"use client"

import { Coins, Loader2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { listModelPrices, upsertModelPrice, type ChatModelPrice } from "@/lib/ai-chat/api"

/**
 * PROJ-Y-151d — Pflegefläche für die Modellpreise.
 *
 * Sie stand hier bisher NICHT, und das war mehr als eine Lücke im Komfort: die
 * Route existierte, aber kein Aufrufer — Preise waren nur mit einem
 * API-Aufruf von Hand einzutragen. Damit war die gesamte Kostenfunktion
 * (AC-151.21–.23) im Produkt unerreichbar, obwohl das Kriterium „pflegbar"
 * wörtlich erfüllt schien. Genau die Art Haken ohne Wirkung, die der
 * QA-Durchgang am 2026-08-28 zweimal gefunden hat.
 *
 * Der Platz neben dem Kostendeckel ist Absicht: dort waren Kosten bisher
 * *begrenzbar*, aber nicht *ausdrückbar*.
 */
export function ModelPricesSection() {
  const [prices, setPrices] = React.useState<ChatModelPrice[] | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [form, setForm] = React.useState({
    provider: "",
    model: "",
    input_per_1m: "",
    output_per_1m: "",
    currency: "EUR",
  })

  const load = React.useCallback(async () => {
    try {
      setPrices(await listModelPrices())
    } catch (err) {
      // Laut scheitern statt eine leere Tabelle zu zeigen — eine leere Liste
      // wäre von "noch keine Preise" nicht zu unterscheiden.
      toast.error(err instanceof Error ? err.message : "Preise nicht abrufbar")
      setPrices([])
    }
  }, [])

  React.useEffect(() => {
    // Derselbe Pfad wie nach dem Speichern: ein fehlgeschlagenes Laden wird
    // gemeldet, nicht verschluckt. Zwei verschiedene Fehlerbehandlungen fuer
    // dieselbe Abfrage waeren genau die Inkonsistenz, aus der spaeter eine
    // stille Leerliste wird.
    let cancelled = false
    void (async () => {
      try {
        const data = await listModelPrices()
        if (!cancelled) setPrices(data)
      } catch (err) {
        if (cancelled) return
        toast.error(err instanceof Error ? err.message : "Preise nicht abrufbar")
        setPrices([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const canSave =
    form.provider.trim().length > 0 &&
    form.model.trim().length > 0 &&
    form.input_per_1m.trim().length > 0 &&
    form.output_per_1m.trim().length > 0 &&
    form.currency.trim().length === 3

  async function handleSave() {
    setSaving(true)
    try {
      await upsertModelPrice({
        provider: form.provider.trim(),
        model: form.model.trim(),
        input_per_1m: Number(form.input_per_1m),
        output_per_1m: Number(form.output_per_1m),
        currency: form.currency.trim().toUpperCase(),
      })
      toast.success("Preis gespeichert")
      setForm((f) => ({ ...f, model: "", input_per_1m: "", output_per_1m: "" }))
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card data-testid="model-prices">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="size-4" aria-hidden />
          Modellpreise
        </CardTitle>
        <CardDescription>
          Preis je Million Token. Ohne hinterlegten Preis sagt der Chat, dass die
          Kosten nicht bezifferbar sind — er behauptet keine 0 €.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {prices === null ? (
          <p className="text-sm text-muted-foreground">Preise werden geladen …</p>
        ) : prices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Preise hinterlegt.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Anbieter</TableHead>
                <TableHead>Modell</TableHead>
                <TableHead className="text-right">Eingabe / 1 Mio.</TableHead>
                <TableHead className="text-right">Ausgabe / 1 Mio.</TableHead>
                <TableHead>Währung</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prices.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.provider}</TableCell>
                  <TableCell className="font-mono text-xs">{p.model}</TableCell>
                  <TableCell className="text-right">{Number(p.input_per_1m)}</TableCell>
                  <TableCell className="text-right">{Number(p.output_per_1m)}</TableCell>
                  <TableCell>{p.currency}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="grid gap-3 sm:grid-cols-5">
          <div className="space-y-1">
            <Label htmlFor="mp-provider">Anbieter</Label>
            <Input
              id="mp-provider"
              value={form.provider}
              placeholder="openai"
              onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mp-model">Modell</Label>
            <Input
              id="mp-model"
              value={form.model}
              placeholder="gpt-4o"
              onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mp-in">Eingabe / 1 Mio.</Label>
            <Input
              id="mp-in"
              inputMode="decimal"
              value={form.input_per_1m}
              onChange={(e) => setForm((f) => ({ ...f, input_per_1m: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mp-out">Ausgabe / 1 Mio.</Label>
            <Input
              id="mp-out"
              inputMode="decimal"
              value={form.output_per_1m}
              onChange={(e) => setForm((f) => ({ ...f, output_per_1m: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mp-cur">Währung</Label>
            <Input
              id="mp-cur"
              maxLength={3}
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
            />
          </div>
        </div>

        <Button onClick={() => void handleSave()} disabled={!canSave || saving}>
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Preis speichern
        </Button>
      </CardContent>
    </Card>
  )
}
