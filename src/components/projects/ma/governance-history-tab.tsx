"use client"

import * as React from "react"
import { toast } from "sonner"

import { HistoryTab } from "@/components/audit/history-tab"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  type AdvisorProfile,
  listAdvisors,
  listNdas,
  type Nda,
} from "@/lib/ma-project/advisor-nda-api"
import type { AuditEntityType } from "@/types/audit"

import {
  ADVISOR_TYPE_LABEL,
  fmtDate,
  LEVEL_LABEL,
  MANDATE_STATUS_LABEL,
  NDA_SCOPE_LABEL,
  NDA_STATUS_LABEL,
} from "./governance-labels"

// PROJ-99/128/129 D-FE-1 (QA followup): the Historie tab the tech design asked
// for. Surfaces the PROJ-10 field-level audit trail for advisor profiles and
// NDAs — now that can_read_audit_entry maps ma_advisor_profiles / ma_ndas to
// is_project_member (migration 20260624095758). Pick an entity kind + a specific
// row; HistoryTab renders that entity's change history.

type Kind = "advisors" | "ndas"

const ENTITY_TYPE_BY_KIND: Record<Kind, AuditEntityType> = {
  advisors: "ma_advisor_profiles",
  ndas: "ma_ndas",
}

// Shared value formatter for both entity kinds — prettifies the enums/dates the
// audit trail stores as raw strings.
function makeFormatValue(nameFor: (userId: string) => string) {
  return (fieldName: string, value: unknown): React.ReactNode => {
    if (value === null || value === undefined) return "—"
    const s = String(value)
    switch (fieldName) {
      case "mandate_status":
        return MANDATE_STATUS_LABEL[s as keyof typeof MANDATE_STATUS_LABEL] ?? s
      case "advisor_type":
        return ADVISOR_TYPE_LABEL[s as keyof typeof ADVISOR_TYPE_LABEL] ?? s
      case "status":
        return NDA_STATUS_LABEL[s as keyof typeof NDA_STATUS_LABEL] ?? s
      case "covered_level":
        return LEVEL_LABEL[s as keyof typeof LEVEL_LABEL] ?? s
      case "scope_kind":
        return NDA_SCOPE_LABEL[s as keyof typeof NDA_SCOPE_LABEL] ?? s
      case "responsible_user_id":
      case "user_id":
        return nameFor(s)
      case "mandate_start":
      case "mandate_end":
      case "signed_date":
      case "valid_from":
      case "valid_until":
      case "reminder_date":
        return fmtDate(s)
      default:
        return s
    }
  }
}

export function GovernanceHistoryTab({
  projectId,
  nameFor,
}: {
  projectId: string
  nameFor: (userId: string) => string
}) {
  const [kind, setKind] = React.useState<Kind>("advisors")
  const [advisors, setAdvisors] = React.useState<AdvisorProfile[]>([])
  const [ndas, setNdas] = React.useState<Nda[]>([])
  const [selectedId, setSelectedId] = React.useState<string>("")
  const [loading, setLoading] = React.useState(true)

  // Load both lists once so switching kind is instant; guarded against unmount.
  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const [adv, nda] = await Promise.all([
          listAdvisors(projectId),
          listNdas(projectId),
        ])
        if (!cancelled) {
          setAdvisors(adv)
          setNdas(nda)
        }
      } catch (err) {
        if (!cancelled)
          toast.error("Governance-Objekte konnten nicht geladen werden", {
            description:
              err instanceof Error ? err.message : "Unbekannter Fehler",
          })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  const changeKind = (next: Kind) => {
    setKind(next)
    setSelectedId("")
  }

  const formatValue = React.useMemo(() => makeFormatValue(nameFor), [nameFor])
  const options =
    kind === "advisors"
      ? advisors.map((a) => ({
          id: a.id,
          label: `${a.organization} · ${ADVISOR_TYPE_LABEL[a.advisor_type]} (${nameFor(a.user_id)})`,
        }))
      : ndas.map((n) => ({
          id: n.id,
          label: `${n.counterparty} · ${NDA_STATUS_LABEL[n.status]}`,
        }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Historie</CardTitle>
        <CardDescription>
          Feldgenaue Änderungshistorie (PROJ-10) für Berater-Profile und NDAs.
          Wähle ein Objekt, um seinen Audit-Trail zu sehen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-44 space-y-1">
            <span className="text-xs text-muted-foreground">Objekt-Typ</span>
            <Select value={kind} onValueChange={(v) => changeKind(v as Kind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="advisors">Berater</SelectItem>
                <SelectItem value="ndas">NDA</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[220px] flex-1 space-y-1">
            <span className="text-xs text-muted-foreground">
              {kind === "advisors" ? "Berater" : "NDA"}
            </span>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    kind === "advisors" ? "Berater wählen" : "NDA wählen"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {options.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    {kind === "advisors"
                      ? "Keine Berater erfasst"
                      : "Keine NDAs erfasst"}
                  </SelectItem>
                ) : (
                  options.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : !selectedId ? (
          <p className="text-sm text-muted-foreground">
            Wähle ein Objekt, um die Änderungshistorie zu sehen. Neue Objekte
            ohne Änderungen haben noch keinen Audit-Eintrag.
          </p>
        ) : (
          <HistoryTab
            entityType={ENTITY_TYPE_BY_KIND[kind]}
            entityId={selectedId}
            formatValue={formatValue}
          />
        )}
      </CardContent>
    </Card>
  )
}
