"use client"

import { ArrowDown, ArrowUp, Eye, Mail } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type {
  PerceptionGapAggregate,
  PerceptionGapDimension,
} from "@/lib/risk-score/perception-gap"

interface PerceptionGapSectionProps {
  skillGap: PerceptionGapAggregate<string>
  big5Gap: PerceptionGapAggregate<string>
  /** Triggered when the user clicks "Self-Assessment versenden" because no
   *  self-values exist yet. */
  onInviteSelfAssessment?: () => void
  /** Whether a Self-Assessment invite is currently pending — disables the
   *  CTA. */
  invitePending?: boolean
}

export function PerceptionGapSection({
  skillGap,
  big5Gap,
  onInviteSelfAssessment,
  invitePending,
}: PerceptionGapSectionProps) {
  const bothNoSelf =
    skillGap.status === "no_self" && big5Gap.status === "no_self"

  if (bothNoSelf) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="h-4 w-4 text-muted-foreground" aria-hidden />
            Wahrnehmungslücke
          </CardTitle>
          <CardDescription>
            Vergleich der PM-Fremdbewertung mit der Stakeholder-Selbst-
            Einschätzung. Self-Assessment noch ausstehend.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Mail className="h-4 w-4" aria-hidden />
            <AlertTitle>Self-Assessment noch ausstehend</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                Sobald der Stakeholder das Self-Assessment ausgefüllt hat,
                wird hier die Wahrnehmungslücke pro Dimension angezeigt.
              </p>
              {onInviteSelfAssessment && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onInviteSelfAssessment}
                  disabled={invitePending}
                >
                  {invitePending
                    ? "Invite bereits ausstehend"
                    : "Self-Assessment versenden"}
                </Button>
              )}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Eye className="h-4 w-4 text-muted-foreground" aria-hidden />
          Wahrnehmungslücke (Self vs Fremd)
        </CardTitle>
        <CardDescription>
          Differenz zwischen PM-Bewertung und Stakeholder-Selbst-Einschätzung.
          Aggregate werden ab 60 % Coverage pro Achse berechnet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <GapBlock title="Skill-Profil" gap={skillGap} />
        <GapBlock title="Big5/OCEAN-Profil" gap={big5Gap} />
      </CardContent>
    </Card>
  )
}

function GapBlock({
  title,
  gap,
}: {
  title: string
  gap: PerceptionGapAggregate<string>
}) {
  if (gap.status === "no_self") {
    return (
      <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        <p className="font-medium">{title}</p>
        <p className="text-xs">Self-Werte noch nicht erfasst.</p>
      </div>
    )
  }
  if (gap.status === "low_coverage") {
    return (
      <div className="rounded-md border border-dashed p-3 text-sm">
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">
          Self-Coverage zu niedrig ({Math.round(gap.coverage * 100)} %; ≥ 60 %
          nötig). Aggregate noch nicht aussagekräftig.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{title}</p>
        <div className="flex items-center gap-2">
          <Badge
            variant={gap.flagged ? "destructive" : "secondary"}
            className="font-mono"
          >
            max ±{gap.max_delta}
          </Badge>
          {gap.flagged && (
            <span className="text-xs text-destructive">
              relevante Lücke
            </span>
          )}
        </div>
      </div>
      <ul className="space-y-1">
        {gap.dimensions.slice(0, 5).map((d) => (
          <DimensionRow key={d.dimension} dim={d} />
        ))}
      </ul>
    </div>
  )
}

function DimensionRow({ dim }: { dim: PerceptionGapDimension<string> }) {
  const isPositive = dim.delta > 0
  const ArrowIcon = isPositive ? ArrowUp : ArrowDown
  return (
    <li className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{dim.label}</span>
      <span className="flex items-center gap-2 font-mono tabular-nums">
        <span className="text-xs text-muted-foreground">
          F {dim.fremd} · S {dim.self}
        </span>
        <span
          className={`inline-flex items-center gap-0.5 rounded px-1 ${Math.abs(dim.delta) >= 30 ? "text-destructive" : ""}`}
        >
          <ArrowIcon className="h-3 w-3" aria-hidden />
          {Math.abs(dim.delta)}
        </span>
      </span>
    </li>
  )
}
