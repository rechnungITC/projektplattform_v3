"use client"

import { Pencil } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import {
  ProfileRadarChart,
  type RadarPoint,
} from "@/components/stakeholders/profile/profile-radar-chart"
import { ProfileEditSheet } from "@/components/stakeholders/profile/profile-edit-sheet"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { getStakeholderProfile } from "@/lib/stakeholder-profiles/api"
import {
  PERSONALITY_DIMENSIONS,
  PERSONALITY_DIMENSION_LABELS,
  SKILL_DIMENSIONS,
  SKILL_DIMENSION_LABELS,
  type StakeholderProfileBundle,
} from "@/types/stakeholder-profile"

/**
 * PROJ-33 Phase 33-γ — Profile-Tab orchestrator.
 *
 * Lädt das Profile-Bundle (Skill + Big5 + Audit-Events), rendert 2 Radar-
 * Charts mit Self-vs-Fremd-Overlay (wenn Self vorhanden) und eine
 * Differenz-Liste sortiert nach |Self - Fremd|.
 */

interface ProfileTabProps {
  projectId: string
  stakeholderId: string
  stakeholderName: string
}

export function ProfileTab({
  projectId,
  stakeholderId,
  stakeholderName,
}: ProfileTabProps) {
  const [bundle, setBundle] = React.useState<StakeholderProfileBundle | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [editOpen, setEditOpen] = React.useState(false)

  const reload = React.useCallback(async () => {
    setLoading(true)
    try {
      const b = await getStakeholderProfile(projectId, stakeholderId)
      setBundle(b)
    } catch (err) {
      toast.error("Profil konnte nicht geladen werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setLoading(false)
    }
  }, [projectId, stakeholderId])

  React.useEffect(() => {
    void reload()
  }, [reload])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  const skillData: RadarPoint[] = SKILL_DIMENSIONS.map((dim) => ({
    dimension: SKILL_DIMENSION_LABELS[dim],
    fremd: bundle?.skill?.[`${dim}_fremd`] ?? null,
    self: bundle?.skill?.[`${dim}_self`] ?? null,
  }))

  const personalityData: RadarPoint[] = PERSONALITY_DIMENSIONS.map((dim) => ({
    dimension: PERSONALITY_DIMENSION_LABELS[dim],
    fremd: bundle?.personality?.[`${dim}_fremd`] ?? null,
    self: bundle?.personality?.[`${dim}_self`] ?? null,
  }))

  const allData = [...skillData, ...personalityData]
  const diffs = allData
    .filter((p) => p.fremd !== null && p.self !== null)
    .map((p) => ({
      dimension: p.dimension,
      delta: (p.self as number) - (p.fremd as number),
      fremd: p.fremd as number,
      self: p.self as number,
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  const hasFremd = bundle?.skill?.fremd_assessed_at != null || bundle?.personality?.fremd_assessed_at != null
  const hasSelf = bundle?.skill?.self_assessed_at != null || bundle?.personality?.self_assessed_at != null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {hasFremd ? (
            <>
              Fremd-Bewertung zuletzt aktualisiert{" "}
              {new Date(
                bundle?.skill?.fremd_assessed_at ??
                  bundle?.personality?.fremd_assessed_at ??
                  "",
              ).toLocaleDateString("de-DE")}
            </>
          ) : (
            <>Noch keine Bewertung vorhanden.</>
          )}
          {hasSelf && (
            <>
              {" · "}
              Self-Assessment vorhanden
            </>
          )}
        </div>
        <Button onClick={() => setEditOpen(true)}>
          <Pencil className="mr-2 h-4 w-4" aria-hidden />
          Profil bearbeiten
        </Button>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Skill-Profil</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileRadarChart data={skillData} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Persönlichkeitsprofil (Big5/OCEAN)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileRadarChart data={personalityData} />
          </CardContent>
        </Card>
      </div>

      {diffs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Wahrnehmungs-Differenzen (Self vs Fremd)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {diffs.map((d) => (
                <li
                  key={d.dimension}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span>{d.dimension}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      Fremd {d.fremd} · Self {d.self}
                    </span>
                    <span
                      className={
                        Math.abs(d.delta) >= 30
                          ? "rounded-full bg-amber-100 px-2 py-0.5 font-mono text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
                          : "font-mono text-xs text-muted-foreground tabular-nums"
                      }
                    >
                      {d.delta > 0 ? "+" : ""}
                      {d.delta}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            {diffs.some((d) => Math.abs(d.delta) >= 30) && (
              <p className="mt-3 text-xs text-muted-foreground">
                Differenzen über 30 % deuten auf Wahrnehmungslücke — Gesprächs-
                oder Trainingsbedarf prüfen.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {bundle && bundle.events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Audit-Trail (letzte 50)</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {bundle.events.map((e) => (
                <AuditEventRow key={e.id} event={e} />
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <ProfileEditSheet
        projectId={projectId}
        stakeholderId={stakeholderId}
        stakeholderName={stakeholderName}
        open={editOpen}
        onOpenChange={setEditOpen}
        initialSkill={bundle?.skill ?? null}
        initialPersonality={bundle?.personality ?? null}
        onSaved={() => void reload()}
      />
    </div>
  )
}

function translateEventType(t: string): string {
  switch (t) {
    case "fremd_updated":
      return "Fremd-Bewertung aktualisiert"
    case "self_updated":
      return "Self-Assessment aktualisiert"
    case "self_assessed_via_token":
      return "Self-Assessment via Magic-Link eingereicht"
    case "reset":
      return "Profil zurückgesetzt"
    default:
      return t
  }
}

const SKILL_LABEL_MAP: Record<string, string> = {
  domain_knowledge_fremd: "Domänenwissen",
  method_competence_fremd: "Methodenkompetenz",
  it_affinity_fremd: "IT-Affinität",
  negotiation_skill_fremd: "Verhandlungsgeschick",
  decision_power_fremd: "Entscheidungskraft",
}

const PERSONALITY_LABEL_MAP: Record<string, string> = {
  openness_fremd: "Offenheit",
  conscientiousness_fremd: "Gewissenhaftigkeit",
  extraversion_fremd: "Extraversion",
  agreeableness_fremd: "Verträglichkeit",
  emotional_stability_fremd: "Emotionale Stabilität",
}

function AuditEventRow({
  event,
}: {
  event: {
    id: string
    profile_kind: "skill" | "personality"
    event_type: string
    actor_kind: string
    created_at: string
    payload: Record<string, unknown> | null
  }
}) {
  const [open, setOpen] = React.useState(false)

  const labelMap =
    event.profile_kind === "skill" ? SKILL_LABEL_MAP : PERSONALITY_LABEL_MAP

  // Compute per-dimension diff from payload
  const before = (event.payload?.before ?? {}) as Record<string, unknown> | null
  const after = (event.payload?.after ?? {}) as Record<string, unknown> | null
  const diffs: Array<{ key: string; label: string; before: number | null; after: number | null }> = []
  for (const fieldKey of Object.keys(labelMap)) {
    const b = (before as Record<string, unknown> | null)?.[fieldKey]
    const a = (after as Record<string, unknown> | null)?.[fieldKey]
    const beforeVal = typeof b === "number" ? b : null
    const afterVal = typeof a === "number" ? a : null
    if (beforeVal === afterVal && afterVal === null) continue
    diffs.push({
      key: fieldKey,
      label: labelMap[fieldKey] ?? fieldKey,
      before: beforeVal,
      after: afterVal,
    })
  }

  const changed = diffs.filter((d) => d.before !== d.after)
  const unchanged = diffs.filter((d) => d.before === d.after)
  const hasDiff = changed.length > 0

  return (
    <li className="rounded-md border bg-card">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
      >
        <span className="flex items-center gap-2">
          <span className="font-medium">
            {event.profile_kind === "skill" ? "Skill" : "Persönlichkeit"}
          </span>
          <span className="text-muted-foreground">—</span>
          <span>{translateEventType(event.event_type)}</span>
          {hasDiff && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
              {changed.length} Feld{changed.length === 1 ? "" : "er"}
            </span>
          )}
        </span>
        <span className="text-xs text-muted-foreground">
          {new Date(event.created_at).toLocaleString("de-DE")} ·{" "}
          {event.actor_kind === "user" ? "PM" : "Stakeholder"}
        </span>
      </button>
      {open && hasDiff && (
        <div className="border-t bg-muted/30 px-3 py-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-1">Dimension</th>
                <th className="pb-1 w-20 text-right">Vorher</th>
                <th className="pb-1 w-6 text-center">→</th>
                <th className="pb-1 w-20 text-right">Nachher</th>
                <th className="pb-1 w-16 text-right">Δ</th>
              </tr>
            </thead>
            <tbody>
              {changed.map((d) => {
                const delta =
                  d.before !== null && d.after !== null
                    ? d.after - d.before
                    : null
                return (
                  <tr key={d.key} className="border-t border-muted">
                    <td className="py-1">{d.label}</td>
                    <td className="py-1 text-right tabular-nums text-muted-foreground">
                      {d.before ?? "—"}
                    </td>
                    <td className="py-1 text-center text-muted-foreground">→</td>
                    <td className="py-1 text-right tabular-nums font-medium">
                      {d.after ?? "—"}
                    </td>
                    <td
                      className={
                        delta === null
                          ? "py-1 text-right tabular-nums text-muted-foreground"
                          : delta > 0
                            ? "py-1 text-right tabular-nums text-emerald-600"
                            : delta < 0
                              ? "py-1 text-right tabular-nums text-amber-700"
                              : "py-1 text-right tabular-nums text-muted-foreground"
                      }
                    >
                      {delta === null ? "—" : delta > 0 ? `+${delta}` : delta}
                    </td>
                  </tr>
                )
              })}
              {unchanged.length > 0 && (
                <tr className="border-t border-muted">
                  <td
                    colSpan={5}
                    className="py-1 text-xs italic text-muted-foreground"
                  >
                    {unchanged.length} weitere Dimension
                    {unchanged.length === 1 ? "" : "en"} unverändert
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </li>
  )
}
