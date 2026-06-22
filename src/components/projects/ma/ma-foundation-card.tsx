"use client"

import { Handshake, Pencil, ShieldAlert } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { HistoryTab } from "@/components/audit/history-tab"
import { ResponsibleUserPicker } from "@/components/projects/responsible-user-picker"
import { Badge } from "@/components/ui/badge"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/hooks/use-auth"
import { useMaProfile } from "@/hooks/use-ma-profile"
import { useProjectAccess } from "@/hooks/use-project-access"
import { useTenantMembers } from "@/hooks/use-tenant-members"
import { transitionMandate, updateMaProfile } from "@/lib/ma-project/api"
import {
  MA_CONFIDENTIALITY_LEVELS,
  MA_CONFIDENTIALITY_LEVEL_LABELS,
} from "@/types/confidentiality"
import {
  ALLOWED_MANDATE_TRANSITIONS,
  DEAL_SIDES,
  DEAL_SIDE_LABELS,
  MANDATE_STATUS_LABELS,
  type DealSide,
  type MandateStatus,
  type MaProjectProfile,
} from "@/types/ma-project"

interface MaFoundationCardProps {
  projectId: string
}

const MANDATE_ACTION_LABELS: Record<MandateStatus, string> = {
  draft: "Zurück zu Entwurf",
  submitted: "Zur Freigabe einreichen",
  approved: "Mandat freigeben",
}

const MANDATE_BADGE_VARIANT: Record<
  MandateStatus,
  "secondary" | "outline" | "default"
> = {
  draft: "outline",
  submitted: "secondary",
  approved: "default",
}

function formatAmount(profile: MaProjectProfile): string | null {
  if (profile.investment_frame_amount == null) return null
  const amount = new Intl.NumberFormat("de-DE").format(
    profile.investment_frame_amount
  )
  const parts = [amount, profile.investment_frame_currency ?? ""].filter(Boolean)
  const head = parts.join(" ")
  return profile.investment_frame_note
    ? `${head} — ${profile.investment_frame_note}`
    : head
}

export function MaFoundationCard({ projectId }: MaFoundationCardProps) {
  const { profile, isLoading, error, notFound, refresh } =
    useMaProfile(projectId)
  const canEdit = useProjectAccess(projectId, "edit_master")
  const { currentTenant } = useAuth()
  const { members } = useTenantMembers(currentTenant?.id ?? null)

  const memberName = React.useCallback(
    (userId: string | null | undefined) => {
      if (!userId) return "—"
      const m = members.find((x) => x.user_id === userId)
      return m?.display_name ?? m?.email ?? userId
    },
    [members]
  )

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Handshake className="h-5 w-5" aria-hidden />
            Strategische Grundlage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    )
  }

  if (notFound || !profile) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Handshake className="h-5 w-5" aria-hidden />
            Strategische Grundlage
          </CardTitle>
          <CardDescription>
            Für dieses Projekt ist keine M&A-Grundlage hinterlegt. Sie wird beim
            Anlegen eines M&A-Projekts erfasst.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Handshake className="h-5 w-5" aria-hidden />
            Strategische Grundlage
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={MANDATE_BADGE_VARIANT[profile.mandate_status]}>
              {MANDATE_STATUS_LABELS[profile.mandate_status]}
            </Badge>
            {profile.confidentiality_level !== "standard" ? (
              <Badge
                variant="outline"
                className="gap-1 border-amber-500/50 text-amber-600 dark:text-amber-400"
              >
                <ShieldAlert className="h-3 w-3" aria-hidden />
                {MA_CONFIDENTIALITY_LEVEL_LABELS[profile.confidentiality_level]}
              </Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="grundlage">
          <TabsList>
            <TabsTrigger value="grundlage">Grundlage</TabsTrigger>
            <TabsTrigger value="historie">Historie</TabsTrigger>
          </TabsList>

          <TabsContent value="grundlage" className="space-y-4 pt-2">
            <MandateActions
              projectId={projectId}
              profile={profile}
              canEdit={canEdit}
              onChanged={refresh}
            />
            <Separator />
            <FoundationBody
              projectId={projectId}
              profile={profile}
              canEdit={canEdit}
              tenantId={currentTenant?.id ?? null}
              memberName={memberName}
              onChanged={refresh}
            />
          </TabsContent>

          <TabsContent value="historie" className="pt-2">
            <HistoryTab
              entityType="ma_project_profiles"
              entityId={profile.id}
              formatValue={(fieldName, value) => {
                if (fieldName === "sponsor_user_id") {
                  return memberName(value == null ? null : String(value))
                }
                if (fieldName === "deal_side" && value) {
                  return DEAL_SIDE_LABELS[value as DealSide] ?? String(value)
                }
                if (fieldName === "mandate_status" && value) {
                  return (
                    MANDATE_STATUS_LABELS[value as MandateStatus] ??
                    String(value)
                  )
                }
                return undefined
              }}
              onMutated={refresh}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Mandate state-machine actions (AC-4)
// ---------------------------------------------------------------------------
function MandateActions({
  projectId,
  profile,
  canEdit,
  onChanged,
}: {
  projectId: string
  profile: MaProjectProfile
  canEdit: boolean
  onChanged: () => void
}) {
  const [busy, setBusy] = React.useState<MandateStatus | null>(null)
  const targets = ALLOWED_MANDATE_TRANSITIONS[profile.mandate_status]

  async function go(to: MandateStatus) {
    setBusy(to)
    try {
      await transitionMandate(projectId, to)
      toast.success(`Mandatsstand: ${MANDATE_STATUS_LABELS[to]}`)
      onChanged()
    } catch (err) {
      toast.error("Mandatswechsel fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">
        Mandatsstand: {MANDATE_STATUS_LABELS[profile.mandate_status]}
      </span>
      {canEdit && targets.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {targets.map((to) => (
            <Button
              key={to}
              size="sm"
              variant={to === "approved" ? "default" : "outline"}
              disabled={busy !== null}
              onClick={() => void go(to)}
            >
              {MANDATE_ACTION_LABELS[to]}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Foundation fields — view + inline edit
// ---------------------------------------------------------------------------
function FoundationBody({
  projectId,
  profile,
  canEdit,
  tenantId,
  memberName,
  onChanged,
}: {
  projectId: string
  profile: MaProjectProfile
  canEdit: boolean
  tenantId: string | null
  memberName: (userId: string | null | undefined) => string
  onChanged: () => void
}) {
  const [editing, setEditing] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [draft, setDraft] = React.useState(() => toDraft(profile))

  // Seed the draft from the current profile the moment editing begins — no
  // sync effect needed (avoids set-state-in-effect / cascading renders).
  function startEditing() {
    setDraft(toDraft(profile))
    setEditing(true)
  }

  async function save() {
    setSaving(true)
    try {
      await updateMaProfile(projectId, {
        deal_side: draft.deal_side,
        sponsor_user_id: draft.sponsor_user_id || undefined,
        deal_rationale: draft.deal_rationale.trim() || null,
        search_profile: draft.search_profile.trim() || null,
        exclusion_criteria: draft.exclusion_criteria.trim() || null,
        investment_frame_amount:
          draft.investment_frame_amount.trim() === ""
            ? null
            : Number(draft.investment_frame_amount),
        investment_frame_currency:
          draft.investment_frame_currency.trim() || null,
        investment_frame_note: draft.investment_frame_note.trim() || null,
        strategic_document_link: draft.strategic_document_link.trim() || null,
        confidentiality_level: draft.confidentiality_level,
      })
      toast.success("Strategische Grundlage gespeichert")
      setEditing(false)
      onChanged()
    } catch (err) {
      toast.error("Speichern fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    const amount = formatAmount(profile)
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sponsor" value={memberName(profile.sponsor_user_id)} />
          <Field
            label="Deal-Variante"
            value={
              profile.deal_side ? DEAL_SIDE_LABELS[profile.deal_side] : "—"
            }
          />
        </div>
        <Field label="Deal-Rationale" value={profile.deal_rationale} block />
        <Field label="Suchprofil" value={profile.search_profile} block />
        <Field
          label="Ausschlusskriterien"
          value={profile.exclusion_criteria}
          block
        />
        <Field label="Investitionsrahmen" value={amount} />
        {profile.strategic_document_link ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Strategie-Dokument
            </p>
            <a
              href={profile.strategic_document_link}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-sm text-primary underline-offset-2 hover:underline"
            >
              {profile.strategic_document_link}
            </a>
          </div>
        ) : null}

        {canEdit ? (
          <Button
            variant="outline"
            size="sm"
            onClick={startEditing}
            className="gap-1.5"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Bearbeiten
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Sponsor</Label>
          <ResponsibleUserPicker
            tenantId={tenantId ?? ""}
            value={draft.sponsor_user_id}
            onChange={(v) => setDraft((d) => ({ ...d, sponsor_user_id: v }))}
            disabled={saving}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Deal-Variante</Label>
          <Select
            value={draft.deal_side ?? undefined}
            onValueChange={(v) =>
              setDraft((d) => ({ ...d, deal_side: v as DealSide }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Variante wählen" />
            </SelectTrigger>
            <SelectContent>
              {DEAL_SIDES.map((s) => (
                <SelectItem key={s} value={s}>
                  {DEAL_SIDE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <EditTextarea
        label="Deal-Rationale"
        value={draft.deal_rationale}
        onChange={(v) => setDraft((d) => ({ ...d, deal_rationale: v }))}
      />
      <EditTextarea
        label="Suchprofil"
        value={draft.search_profile}
        onChange={(v) => setDraft((d) => ({ ...d, search_profile: v }))}
      />
      <EditTextarea
        label="Ausschlusskriterien"
        value={draft.exclusion_criteria}
        onChange={(v) => setDraft((d) => ({ ...d, exclusion_criteria: v }))}
        rows={2}
      />

      <div className="space-y-1.5">
        <Label>Investitionsrahmen</Label>
        <div className="grid gap-2 sm:grid-cols-[1fr_6rem]">
          <Input
            type="number"
            min={0}
            inputMode="decimal"
            placeholder="Betrag"
            value={draft.investment_frame_amount}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                investment_frame_amount: e.target.value,
              }))
            }
          />
          <Input
            maxLength={3}
            placeholder="EUR"
            value={draft.investment_frame_currency}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                investment_frame_currency: e.target.value.toUpperCase(),
              }))
            }
          />
        </div>
        <Input
          placeholder="Notiz (z. B. EK-finanziert)"
          value={draft.investment_frame_note}
          onChange={(e) =>
            setDraft((d) => ({ ...d, investment_frame_note: e.target.value }))
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label>Strategie-Dokument (Link)</Label>
        <Input
          type="url"
          placeholder="https://…"
          value={draft.strategic_document_link}
          onChange={(e) =>
            setDraft((d) => ({ ...d, strategic_document_link: e.target.value }))
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5">
          <ShieldAlert className="h-3.5 w-3.5 text-amber-500" aria-hidden />
          Vertraulichkeit
        </Label>
        <Select
          value={draft.confidentiality_level}
          onValueChange={(v) =>
            setDraft((d) => ({
              ...d,
              confidentiality_level:
                v as MaProjectProfile["confidentiality_level"],
            }))
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MA_CONFIDENTIALITY_LEVELS.map((l) => (
              <SelectItem key={l} value={l}>
                {MA_CONFIDENTIALITY_LEVEL_LABELS[l]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <Button size="sm" disabled={saving} onClick={() => void save()}>
          {saving ? "Speichert …" : "Speichern"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={saving}
          onClick={() => setEditing(false)}
        >
          Abbrechen
        </Button>
      </div>
    </div>
  )
}

function toDraft(p: MaProjectProfile) {
  return {
    deal_side: p.deal_side,
    sponsor_user_id: p.sponsor_user_id,
    deal_rationale: p.deal_rationale ?? "",
    search_profile: p.search_profile ?? "",
    exclusion_criteria: p.exclusion_criteria ?? "",
    investment_frame_amount:
      p.investment_frame_amount == null ? "" : String(p.investment_frame_amount),
    investment_frame_currency: p.investment_frame_currency ?? "",
    investment_frame_note: p.investment_frame_note ?? "",
    strategic_document_link: p.strategic_document_link ?? "",
    confidentiality_level: p.confidentiality_level,
  }
}

function Field({
  label,
  value,
  block,
}: {
  label: string
  value: string | null
  block?: boolean
}) {
  return (
    <div className={block ? "space-y-0.5" : "space-y-0.5"}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={block ? "whitespace-pre-wrap text-sm" : "text-sm"}>
        {value && value.trim() ? value : "—"}
      </p>
    </div>
  )
}

function EditTextarea({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  rows?: number
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
