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

      <div className="grid gap-6 md:grid-cols-2">
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
            <ol className="space-y-2 text-sm">
              {bundle.events.map((e) => (
                <li key={e.id} className="flex items-center justify-between">
                  <span>
                    <span className="font-medium">
                      {e.profile_kind === "skill"
                        ? "Skill"
                        : "Persönlichkeit"}
                    </span>
                    {" — "}
                    {translateEventType(e.event_type)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleString("de-DE")} ·{" "}
                    {e.actor_kind === "user" ? "PM" : "Stakeholder"}
                  </span>
                </li>
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
