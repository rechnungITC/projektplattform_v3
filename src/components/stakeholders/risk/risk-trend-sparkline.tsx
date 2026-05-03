"use client"

import { Loader2 } from "lucide-react"
import * as React from "react"
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import {
  fetchRiskTrend,
  type RiskTrendResponse,
} from "@/lib/risk-score/health-api"

interface Props {
  projectId: string
  stakeholderId: string
}

const RANGES: Array<30 | 90 | 365> = [30, 90, 365]

const BUCKET_COLOR: Record<RiskTrendResponse["points"][number]["bucket"], string> = {
  green: "#10b981",
  yellow: "#f59e0b",
  orange: "#f97316",
  red: "#ef4444",
}

export function RiskTrendSparkline({ projectId, stakeholderId }: Props) {
  const [days, setDays] = React.useState<30 | 90 | 365>(90)
  const [data, setData] = React.useState<RiskTrendResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    fetchRiskTrend(projectId, stakeholderId, days)
      .then((d) => {
        if (cancelled) return
        setData(d)
        setError(null)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : "Unbekannter Fehler")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, stakeholderId, days])

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">Risiko-Trend</CardTitle>
            <CardDescription>
              Retroaktive Score-Berechnung an Audit-Event-Zeitpunkten.
            </CardDescription>
          </div>
          <ToggleGroup
            type="single"
            value={String(days)}
            onValueChange={(v) => {
              if (v) setDays(Number(v) as 30 | 90 | 365)
            }}
            size="sm"
          >
            {RANGES.map((d) => (
              <ToggleGroupItem key={d} value={String(d)}>
                {d}d
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            Lade Trend …
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !data || data.points.length < 2 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Keine Veränderungen im Zeitraum.
          </p>
        ) : (
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data.points.map((p) => ({
                  ...p,
                  date: new Date(p.at).toLocaleDateString("de-DE", {
                    month: "2-digit",
                    day: "2-digit",
                  }),
                }))}
                margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="risk-trend-fill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  fontSize={10}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 10]}
                  fontSize={10}
                  axisLine={false}
                  tickLine={false}
                  width={20}
                />
                <ReferenceLine
                  y={1}
                  stroke={BUCKET_COLOR.yellow}
                  strokeDasharray="2 2"
                  strokeOpacity={0.4}
                />
                <ReferenceLine
                  y={3}
                  stroke={BUCKET_COLOR.orange}
                  strokeDasharray="2 2"
                  strokeOpacity={0.4}
                />
                <ReferenceLine
                  y={6}
                  stroke={BUCKET_COLOR.red}
                  strokeDasharray="2 2"
                  strokeOpacity={0.4}
                />
                <Tooltip
                  formatter={(v: unknown) => [String(v), "Score"]}
                  labelFormatter={(l) => `Datum: ${l}`}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 6,
                    border: "1px solid hsl(var(--border))",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke="#3b82f6"
                  fill="url(#risk-trend-fill)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
