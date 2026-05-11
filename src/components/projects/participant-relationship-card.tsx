"use client"

import {
  AlertCircle,
  AtSign,
  CheckCircle2,
  Loader2,
  Users,
} from "lucide-react"
import * as React from "react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type {
  ParticipantLink,
  ParticipantRateSource,
  ProjectParticipantLinksSnapshot,
} from "@/lib/participant-links/types"

interface ParticipantRelationshipCardProps {
  projectId: string
}

/**
 * PROJ-57-β-UI — Relationship Summary widget.
 *
 * Shows every person involved in the project with the four-role
 * map (Tenant Member / Project Member / Stakeholder / Resource)
 * and the rate-source classification (none / role_rate / override
 * / unresolved). Drives the project-lead's mental model of "who
 * is this person and is everything linked up correctly?".
 *
 * Loads `/api/projects/[id]/participant-links` once per project.
 */
export function ParticipantRelationshipCard({
  projectId,
}: ParticipantRelationshipCardProps) {
  const [snapshot, setSnapshot] =
    React.useState<ProjectParticipantLinksSnapshot | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    fetch(
      `/api/projects/${encodeURIComponent(projectId)}/participant-links`,
      { cache: "no-store" },
    )
      .then(async (res) => {
        if (!res.ok) {
          let msg = `HTTP ${res.status}`
          try {
            const body = (await res.json()) as { error?: { message?: string } }
            msg = body.error?.message ?? msg
          } catch {
            // ignore
          }
          throw new Error(msg)
        }
        return (await res.json()) as {
          participant_links: ProjectParticipantLinksSnapshot
        }
      })
      .then((body) => {
        if (!cancelled) setSnapshot(body.participant_links)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
          Beteiligte & Verknüpfungen
        </CardTitle>
        {snapshot && (
          <Badge variant="secondary" className="text-xs">
            {snapshot.counts.total}{" "}
            {snapshot.counts.total === 1 ? "Person" : "Personen"}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            Beteiligten-Übersicht fehlgeschlagen: {error}
          </p>
        )}
        {snapshot && snapshot.participants.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Noch keine Beteiligten erfasst — Projektmitglieder oder Stakeholder
            anlegen, um die Übersicht zu füllen.
          </p>
        )}
        {snapshot && snapshot.participants.length > 0 && (
          <>
            <CountsRow counts={snapshot.counts} />
            <ul className="space-y-1.5">
              {snapshot.participants.map((p) => (
                <ParticipantRow key={p.identity_key} participant={p} />
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function CountsRow({
  counts,
}: {
  counts: ProjectParticipantLinksSnapshot["counts"]
}) {
  return (
    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
      <CountPill label="Mitglieder" value={counts.members} />
      <CountPill label="Stakeholder" value={counts.stakeholders} />
      <CountPill label="Ressourcen" value={counts.resources} />
      <CountPill
        label="Warnungen"
        value={counts.with_warnings}
        tone={counts.with_warnings > 0 ? "warning" : "neutral"}
      />
    </div>
  )
}

function CountPill({
  label,
  value,
  tone = "neutral",
}: {
  label: string
  value: number
  tone?: "neutral" | "warning"
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-md border bg-card px-2 py-1.5",
        tone === "warning" && "border-amber-500/40",
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tabular-nums font-medium",
          tone === "warning" && value > 0 && "text-amber-700 dark:text-amber-400",
        )}
      >
        {value}
      </span>
    </div>
  )
}

function ParticipantRow({ participant }: { participant: ParticipantLink }) {
  return (
    <li className="rounded-md border bg-card p-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-medium text-foreground">
          {participant.display_name}
        </span>
        {participant.email && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <AtSign className="h-3 w-3" aria-hidden />
            {participant.email}
          </span>
        )}
        {participant.project_role && (
          <Badge variant="secondary" className="h-5 text-[10px] capitalize">
            {participant.project_role}
          </Badge>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
        <RoleChip active={participant.is_tenant_member} label="Tenant" />
        <RoleChip active={participant.is_project_member} label="Projekt" />
        <RoleChip active={participant.is_stakeholder} label="Stakeholder" />
        <RoleChip active={participant.is_resource} label="Resource" />
        <RateSourceBadge rate={participant.rate_source} />
      </div>
      {participant.link_warnings.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {participant.link_warnings.map((w, i) => (
            <li
              key={i}
              className="flex items-start gap-1 text-[11px] text-amber-700 dark:text-amber-400"
            >
              <AlertCircle
                className="mt-0.5 h-3 w-3 shrink-0"
                aria-hidden
              />
              {w}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function RoleChip({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5",
        active
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "border-muted bg-muted/40 text-muted-foreground line-through",
      )}
    >
      {active && <CheckCircle2 className="h-2.5 w-2.5" aria-hidden />}
      {label}
    </span>
  )
}

/**
 * PROJ-57-β-UI — RateSourceBadge. Compact summary of how a
 * resource's daily rate is computed. Class-3 (concrete amount)
 * masking is the deferred PROJ-57-δ slice; for now we show the
 * amount inline.
 */
export function RateSourceBadge({ rate }: { rate: ParticipantRateSource }) {
  if (rate.kind === "none") return null
  if (rate.kind === "role_rate") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-sky-700 dark:text-sky-400">
        Rolle: {rate.role_key}
      </span>
    )
  }
  if (rate.kind === "override") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-violet-700 dark:text-violet-400">
        Override · {rate.amount.toLocaleString("de-DE")} {rate.currency}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-400">
      <Loader2 className="h-2.5 w-2.5" aria-hidden />
      Tagessatz offen
    </span>
  )
}
