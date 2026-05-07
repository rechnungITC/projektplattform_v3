"use client"

import { Activity, AlertCircle, Loader2 } from "lucide-react"
import * as React from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"

interface CapState {
  monthly_input_token_cap: number | null
  monthly_output_token_cap: number | null
  cap_action: "block" | "warn_only"
  configured: boolean
}

interface UsageRow {
  provider: string
  input_tokens: number
  output_tokens: number
  call_count: number
}

interface DashboardData {
  cap: CapState | null
  current: {
    per_provider: UsageRow[]
    total_input: number
    total_output: number
    total_calls: number
  }
  trend: Array<{
    year: number
    month: number
    input_tokens: number
    output_tokens: number
    call_count: number
  }>
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  ollama: "Ollama (lokal)",
  stub: "Stub / blocked",
  unknown: "Unbekannt",
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
]

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function pctOf(used: number, cap: number | null): number | null {
  if (cap === null || cap === 0) return null
  return Math.min(100, Math.round((used / cap) * 100))
}

export function CostCapSection({ tenantId }: { tenantId: string }) {
  const [data, setData] = React.useState<DashboardData | null>(null)
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [reloadCounter, setReloadCounter] = React.useState(0)

  // Form state mirrors the cap config
  const [inputCap, setInputCap] = React.useState<string>("")
  const [outputCap, setOutputCap] = React.useState<string>("")
  const [capAction, setCapAction] = React.useState<"block" | "warn_only">(
    "block",
  )
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    fetch(`/api/tenants/${tenantId}/ai-cost-dashboard`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          throw new Error(body?.error?.message ?? `HTTP ${r.status}`)
        }
        return (await r.json()) as DashboardData
      })
      .then((d) => {
        if (cancelled) return
        setData(d)
        setInputCap(
          d.cap?.monthly_input_token_cap !== null &&
            d.cap?.monthly_input_token_cap !== undefined
            ? String(d.cap.monthly_input_token_cap)
            : "",
        )
        setOutputCap(
          d.cap?.monthly_output_token_cap !== null &&
            d.cap?.monthly_output_token_cap !== undefined
            ? String(d.cap.monthly_output_token_cap)
            : "",
        )
        setCapAction(d.cap?.cap_action ?? "block")
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setErrorMsg(err instanceof Error ? err.message : "Unbekannter Fehler")
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tenantId, reloadCounter])

  function parseCap(s: string): number | null {
    const t = s.trim()
    if (t === "") return null
    const n = Number(t)
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return NaN
    return n
  }

  async function handleSave() {
    const inputVal = parseCap(inputCap)
    const outputVal = parseCap(outputCap)
    if (Number.isNaN(inputVal) || Number.isNaN(outputVal)) {
      toast.error(
        "Caps müssen ganzzahlige Token-Counts (≥ 0) oder leer sein für unlimited.",
      )
      return
    }
    setSubmitting(true)
    try {
      const r = await fetch(`/api/tenants/${tenantId}/ai-cost-cap`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          monthly_input_token_cap: inputVal,
          monthly_output_token_cap: outputVal,
          cap_action: capAction,
        }),
      })
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        throw new Error(body?.error?.message ?? `HTTP ${r.status}`)
      }
      toast.success("Cost-Cap-Konfiguration gespeichert.")
      setReloadCounter((n) => n + 1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Lade
          Cost-Dashboard …
        </CardContent>
      </Card>
    )
  }

  if (errorMsg || !data) {
    return (
      <Card>
        <CardContent className="py-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" aria-hidden />
            <AlertTitle>Cost-Dashboard konnte nicht geladen werden</AlertTitle>
            <AlertDescription>
              {errorMsg ?? "Unbekannter Fehler"}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  const inputCapNum = data.cap?.monthly_input_token_cap ?? null
  const outputCapNum = data.cap?.monthly_output_token_cap ?? null
  const inputPct = pctOf(data.current.total_input, inputCapNum)
  const outputPct = pctOf(data.current.total_output, outputCapNum)
  const inputOver = inputCapNum !== null && data.current.total_input >= inputCapNum
  const outputOver =
    outputCapNum !== null && data.current.total_output >= outputCapNum

  const trendChartData = data.trend.map((t) => ({
    label: `${MONTH_LABELS[t.month - 1]} ${String(t.year).slice(2)}`,
    input: t.input_tokens,
    output: t.output_tokens,
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" aria-hidden />
          Cost-Cap & Token-Usage
        </CardTitle>
        <CardDescription>
          Monatliches Token-Budget pro Tenant. Aktueller Monat + 6-Monats-Trend
          werden aus der ki_runs-Telemetrie aggregiert. Cap_action &quot;block&quot;
          stoppt AI-Calls sobald Cap erreicht; &quot;warn_only&quot; nur Anzeige.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current-month usage per provider */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Aktueller Monat</h3>
          <div className="space-y-2">
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Input-Tokens: {formatTokens(data.current.total_input)} ·{" "}
                  Cap:{" "}
                  {inputCapNum === null
                    ? "unlimited"
                    : formatTokens(inputCapNum)}
                </span>
                {inputPct !== null && (
                  <span className={inputOver ? "text-destructive font-medium" : ""}>
                    {inputPct}%
                  </span>
                )}
              </div>
              {inputPct !== null && <Progress value={inputPct} className="h-2 mt-1" />}
            </div>
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Output-Tokens: {formatTokens(data.current.total_output)} ·{" "}
                  Cap:{" "}
                  {outputCapNum === null
                    ? "unlimited"
                    : formatTokens(outputCapNum)}
                </span>
                {outputPct !== null && (
                  <span className={outputOver ? "text-destructive font-medium" : ""}>
                    {outputPct}%
                  </span>
                )}
              </div>
              {outputPct !== null && <Progress value={outputPct} className="h-2 mt-1" />}
            </div>
            <p className="text-xs text-muted-foreground">
              Insgesamt {data.current.total_calls} AI-Calls diesen Monat.
            </p>
          </div>

          {data.current.per_provider.length > 0 && (
            <div className="rounded border">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Provider</th>
                    <th className="px-3 py-2 text-right font-medium">Calls</th>
                    <th className="px-3 py-2 text-right font-medium">Input</th>
                    <th className="px-3 py-2 text-right font-medium">Output</th>
                  </tr>
                </thead>
                <tbody>
                  {data.current.per_provider.map((row) => (
                    <tr key={row.provider} className="border-t">
                      <td className="px-3 py-2">
                        {PROVIDER_LABELS[row.provider] ?? row.provider}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {row.call_count}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {formatTokens(row.input_tokens)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {formatTokens(row.output_tokens)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 6-month trend */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium">6-Monats-Trend</h3>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={formatTokens} tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(v: number) => formatTokens(Number(v))}
                  contentStyle={{ fontSize: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="input"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Input"
                />
                <Line
                  type="monotone"
                  dataKey="output"
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Output"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cap configuration form */}
        <div className="space-y-3 rounded-lg border p-4">
          <h3 className="text-sm font-medium">Cap-Konfiguration</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="cost-cap-input">
                Monthly Input Token Cap
              </Label>
              <Input
                id="cost-cap-input"
                type="number"
                min={0}
                step={1}
                placeholder="leer = unlimited"
                value={inputCap}
                onChange={(e) => setInputCap(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cost-cap-output">
                Monthly Output Token Cap
              </Label>
              <Input
                id="cost-cap-output"
                type="number"
                min={0}
                step={1}
                placeholder="leer = unlimited"
                value={outputCap}
                onChange={(e) => setOutputCap(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cost-cap-action">Verhalten bei Cap-Überschreitung</Label>
            <Select
              value={capAction}
              onValueChange={(v) => setCapAction(v as "block" | "warn_only")}
              disabled={submitting}
            >
              <SelectTrigger id="cost-cap-action">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="block">
                  Block — AI-Calls werden gestoppt
                </SelectItem>
                <SelectItem value="warn_only">
                  Warn-only — nur Anzeige, keine Blockierung
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSave} disabled={submitting}>
              {submitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              Cap speichern
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Caps werden zum 1. des Monats automatisch zurückgesetzt (Aggregation
            nach calendar month, UTC).
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
