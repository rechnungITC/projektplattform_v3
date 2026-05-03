"use client"

import { Loader2, AlertTriangle, ArrowDownAZ } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { computeRiskScore } from "@/lib/risk-score/compute"
import type {
  Attitude,
  ConflictPotential,
  DecisionAuthority,
  Impact,
  Influence,
  RiskBucket,
} from "@/lib/risk-score/defaults"
import {
  detectEscalationPatterns,
  ESCALATION_PATTERN_META,
} from "@/lib/risk-score/escalation-patterns"
import {
  fetchStakeholderHealth,
  type StakeholderHealthResponse,
  type StakeholderHealthRow,
} from "@/lib/risk-score/health-api"
import { mergeRiskScoreConfig } from "@/lib/risk-score/merge-overrides"

interface Props {
  projectId: string
}

const BUCKET_LABEL: Record<RiskBucket, string> = {
  green: "Grün",
  yellow: "Gelb",
  orange: "Orange",
  red: "Rot",
}

const BUCKET_CLASSES: Record<RiskBucket, string> = {
  green: "bg-emerald-100 text-emerald-800 border-emerald-300",
  yellow: "bg-amber-100 text-amber-900 border-amber-300",
  orange: "bg-orange-100 text-orange-900 border-orange-300",
  red: "bg-red-100 text-red-900 border-red-300",
}

const BUCKET_ORDER: RiskBucket[] = ["red", "orange", "yellow", "green"]

interface DerivedRow {
  raw: StakeholderHealthRow
  score: number
  bucket: RiskBucket
  patterns: ReturnType<typeof detectEscalationPatterns>
  topPatternLabel: string | null
}

export function StakeholderHealthPageClient({ projectId }: Props) {
  const [data, setData] = React.useState<StakeholderHealthResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [bucketFilter, setBucketFilter] = React.useState<RiskBucket | "all">(
    "all",
  )
  const [withPatternsOnly, setWithPatternsOnly] = React.useState(false)
  const [criticalOnly, setCriticalOnly] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    fetchStakeholderHealth(projectId)
      .then((d) => {
        if (!cancelled) setData(d)
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
  }, [projectId])

  const config = React.useMemo(
    () => mergeRiskScoreConfig(data?.risk_score_overrides ?? {}),
    [data?.risk_score_overrides],
  )

  const derived: DerivedRow[] = React.useMemo(() => {
    if (!data) return []
    return data.stakeholders
      .map<DerivedRow>((s) => {
        const r = computeRiskScore(
          {
            influence: s.influence as Influence | null,
            impact: s.impact as Impact | null,
            attitude: s.attitude as Attitude | null,
            conflict_potential: s.conflict_potential as ConflictPotential | null,
            decision_authority: s.decision_authority as DecisionAuthority | null,
            agreeableness_fremd: s.agreeableness_fremd,
          },
          config,
        )
        const patterns = detectEscalationPatterns({
          attitude: s.attitude as Attitude | null,
          conflict_potential: s.conflict_potential as ConflictPotential | null,
          decision_authority: s.decision_authority as DecisionAuthority | null,
          influence: s.influence as Influence | null,
          agreeableness_fremd: s.agreeableness_fremd,
          emotional_stability_fremd: s.emotional_stability_fremd,
        })
        const topPattern = [...patterns]
          .map((k) => ESCALATION_PATTERN_META[k])
          .sort((a, b) => b.severity - a.severity)[0]
        return {
          raw: s,
          score: r.score,
          bucket: r.bucket,
          patterns,
          topPatternLabel: topPattern?.label ?? null,
        }
      })
      .sort((a, b) => {
        // EC-5: Risk-Score DESC primär, Influence DESC sekundär, Name ASC tertiär
        if (b.score !== a.score) return b.score - a.score
        const infOrder: Record<string, number> = {
          critical: 4,
          high: 3,
          medium: 2,
          low: 1,
        }
        const aInf = infOrder[a.raw.influence ?? ""] ?? 0
        const bInf = infOrder[b.raw.influence ?? ""] ?? 0
        if (bInf !== aInf) return bInf - aInf
        return a.raw.name.localeCompare(b.raw.name)
      })
  }, [data, config])

  const filtered = React.useMemo(() => {
    return derived.filter((d) => {
      if (bucketFilter !== "all" && d.bucket !== bucketFilter) return false
      if (withPatternsOnly && d.patterns.length === 0) return false
      if (criticalOnly && !d.raw.on_critical_path) return false
      return true
    })
  }, [derived, bucketFilter, withPatternsOnly, criticalOnly])

  const bucketCounts: Record<RiskBucket, number> = React.useMemo(() => {
    const counts: Record<RiskBucket, number> = {
      red: 0,
      orange: 0,
      yellow: 0,
      green: 0,
    }
    for (const d of derived) counts[d.bucket]++
    return counts
  }, [derived])

  const maxScore = derived[0]?.score ?? 0

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Lade
        Stakeholder-Health …
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Konnte Stakeholder-Health nicht laden</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (!data || derived.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Noch keine Stakeholder im Projekt</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTitle>Empty</AlertTitle>
            <AlertDescription>
              Bitte zuerst Stakeholder anlegen, dann erscheint hier die
              Risiko-Übersicht.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Stakeholder-Health
        </h1>
        <p className="text-sm text-muted-foreground">
          Risiko-Übersicht aller aktiven Stakeholders dieses Projekts.
          Sortiert nach Risk-Score (DESC) → Influence (DESC) → Name (ASC).
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {BUCKET_ORDER.map((bucket) => (
          <Card key={bucket}>
            <CardContent className="pt-6">
              <div
                className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${BUCKET_CLASSES[bucket]}`}
              >
                {BUCKET_LABEL[bucket]}
              </div>
              <p className="mt-2 text-3xl font-semibold tabular-nums">
                {bucketCounts[bucket]}
              </p>
              <p className="text-xs text-muted-foreground">Stakeholders</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Höchster Score:</span>
        <span className="font-mono tabular-nums">{maxScore}</span>
        <span className="ml-auto flex items-center gap-3">
          <span className="text-muted-foreground">Filter:</span>
          <select
            value={bucketFilter}
            onChange={(e) =>
              setBucketFilter(e.target.value as RiskBucket | "all")
            }
            className="rounded-md border bg-background px-2 py-1 text-sm"
          >
            <option value="all">Alle Buckets</option>
            <option value="red">Nur rot</option>
            <option value="orange">Nur orange</option>
            <option value="yellow">Nur gelb</option>
            <option value="green">Nur grün</option>
          </select>
          <label className="inline-flex items-center gap-1.5">
            <Switch
              checked={withPatternsOnly}
              onCheckedChange={setWithPatternsOnly}
              aria-label="Nur mit Eskalations-Patterns"
            />
            <span className="text-xs">mit Pattern</span>
          </label>
          <label className="inline-flex items-center gap-1.5">
            <Switch
              checked={criticalOnly}
              onCheckedChange={setCriticalOnly}
              aria-label="Nur Critical-Path"
            />
            <span className="text-xs">Critical-Path</span>
          </label>
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Stakeholder</TableHead>
                <TableHead>
                  <span className="inline-flex items-center gap-1">
                    <ArrowDownAZ className="h-3.5 w-3.5" aria-hidden /> Score
                  </span>
                </TableHead>
                <TableHead>Bucket</TableHead>
                <TableHead>Pattern</TableHead>
                <TableHead>Critical-Path</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    Kein Stakeholder mit aktiven Filtern.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((d) => (
                  <TableRow key={d.raw.id}>
                    <TableCell>
                      <Button
                        asChild
                        variant="link"
                        className="h-auto p-0 font-normal"
                      >
                        <Link
                          href={`/projects/${encodeURIComponent(projectId)}/stakeholders?sid=${d.raw.id}`}
                        >
                          {d.raw.name}
                        </Link>
                      </Button>
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {d.score}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={BUCKET_CLASSES[d.bucket]}
                      >
                        {BUCKET_LABEL[d.bucket]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {d.topPatternLabel ? (
                        <span className="inline-flex items-center gap-1 text-xs">
                          <AlertTriangle
                            className="h-3.5 w-3.5 text-orange-600"
                            aria-hidden
                          />
                          {d.topPatternLabel}
                          {d.patterns.length > 1 && (
                            <span className="text-muted-foreground">
                              {" "}
                              +{d.patterns.length - 1}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {d.raw.on_critical_path ? (
                        <Badge variant="destructive">Auf kritischem Pfad</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
