"use client"

import { Building2, Plus, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useProjectVendorAssignments } from "@/hooks/use-project-vendor-assignments"
import { useVendors } from "@/hooks/use-vendors"
import {
  type VendorRole,
  VENDOR_ROLE_LABELS,
  VENDOR_ROLES,
} from "@/types/vendor"

const DATE_FMT = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" })

interface ProjectVendorTabClientProps {
  projectId: string
}

export function ProjectVendorTabClient({
  projectId,
}: ProjectVendorTabClientProps) {
  const { vendors, loading: vendorsLoading } = useVendors({
    status: "active",
  })
  const { assignments, loading, error, add, update, remove } =
    useProjectVendorAssignments(projectId)

  const [pickedVendor, setPickedVendor] = React.useState<string>("")
  const [pickedRole, setPickedRole] = React.useState<VendorRole>("lieferant")
  const [scopeNote, setScopeNote] = React.useState("")
  const [validFrom, setValidFrom] = React.useState("")
  const [validUntil, setValidUntil] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  // Vendors that aren't already assigned with the picked role.
  const usedKeys = React.useMemo(
    () => new Set(assignments.map((a) => `${a.vendor_id}:${a.role}`)),
    [assignments]
  )
  const pickable = React.useMemo(
    () =>
      vendors.filter((v) => !usedKeys.has(`${v.id}:${pickedRole}`)),
    [vendors, usedKeys, pickedRole]
  )

  async function onAdd() {
    if (!pickedVendor) {
      toast.error("Bitte einen Lieferanten wählen.")
      return
    }
    if (validFrom && validUntil && validFrom > validUntil) {
      toast.error("Gültig-ab muss vor Gültig-bis liegen.")
      return
    }
    setSubmitting(true)
    try {
      await add({
        vendor_id: pickedVendor,
        role: pickedRole,
        scope_note: scopeNote.trim() || null,
        valid_from: validFrom || null,
        valid_until: validUntil || null,
      })
      toast.success("Vendor zugeordnet")
      setPickedVendor("")
      setScopeNote("")
      setValidFrom("")
      setValidUntil("")
    } catch (err) {
      toast.error("Zuordnung fehlgeschlagen", {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function onRemove(id: string, vendorName: string) {
    if (!window.confirm(`Zuordnung von „${vendorName}" entfernen?`)) return
    try {
      await remove(id)
      toast.success("Zuordnung entfernt")
    } catch (err) {
      toast.error("Entfernen fehlgeschlagen", {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  async function onScopeBlur(id: string, current: string, next: string) {
    if (current === next) return
    try {
      await update(id, { scope_note: next.trim() || null })
    } catch (err) {
      toast.error("Speichern fehlgeschlagen", {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Building2 className="h-6 w-6" aria-hidden />
          Lieferanten
        </h1>
        <p className="text-sm text-muted-foreground">
          Vendor-Zuordnungen mit Rolle und Zeitraum. Stammdaten + Bewertungen
          werden im Lieferanten-Bereich der Stammdaten gepflegt.
        </p>
      </header>

      <div className="rounded-md border p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Vendor zuordnen
        </p>
        <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
          <div>
            <Label htmlFor="pick_vendor">Lieferant</Label>
            <Select value={pickedVendor} onValueChange={setPickedVendor}>
              <SelectTrigger id="pick_vendor">
                <SelectValue
                  placeholder={
                    vendorsLoading ? "Lade …" : "Auswählen …"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {pickable.length === 0 ? (
                  <SelectItem value="__none__" disabled>
                    Keine verfügbaren Lieferanten
                  </SelectItem>
                ) : (
                  pickable.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="pick_role">Rolle</Label>
            <Select
              value={pickedRole}
              onValueChange={(v) => setPickedRole(v as VendorRole)}
            >
              <SelectTrigger id="pick_role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VENDOR_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {VENDOR_ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div>
            <Label htmlFor="valid_from">Gültig ab (optional)</Label>
            <Input
              id="valid_from"
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="valid_until">Gültig bis (optional)</Label>
            <Input
              id="valid_until"
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-2">
          <Label htmlFor="scope_note">Scope-Notiz (optional)</Label>
          <Textarea
            id="scope_note"
            value={scopeNote}
            onChange={(e) => setScopeNote(e.target.value)}
            maxLength={2000}
            rows={2}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={() => void onAdd()}
            disabled={submitting || !pickedVendor}
          >
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
            Zuordnen
          </Button>
        </div>
      </div>

      {loading && assignments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Lade Zuordnungen …</p>
      ) : error ? (
        <Card>
          <CardContent className="py-4 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      ) : assignments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine Vendor-Zuordnungen für dieses Projekt.
        </p>
      ) : (
        <ul className="space-y-2">
          {assignments.map((a) => (
            <AssignmentRow
              key={a.id}
              assignment={a}
              onScopeBlur={onScopeBlur}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

interface AssignmentRowProps {
  assignment: ReturnType<
    typeof useProjectVendorAssignments
  >["assignments"][number]
  onScopeBlur: (id: string, current: string, next: string) => void
  onRemove: (id: string, vendorName: string) => void
}

function AssignmentRow({
  assignment,
  onScopeBlur,
  onRemove,
}: AssignmentRowProps) {
  const [draft, setDraft] = React.useState(assignment.scope_note ?? "")
  React.useEffect(() => {
    setDraft(assignment.scope_note ?? "")
  }, [assignment.scope_note])

  return (
    <li className="rounded-md border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{assignment.vendor_name}</p>
            <Badge variant="outline">
              {VENDOR_ROLE_LABELS[assignment.role as VendorRole]}
            </Badge>
            {assignment.valid_from || assignment.valid_until ? (
              <Badge variant="secondary">
                {assignment.valid_from
                  ? DATE_FMT.format(new Date(assignment.valid_from))
                  : "—"}
                {" – "}
                {assignment.valid_until
                  ? DATE_FMT.format(new Date(assignment.valid_until))
                  : "—"}
              </Badge>
            ) : null}
          </div>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() =>
              onScopeBlur(assignment.id, assignment.scope_note ?? "", draft)
            }
            placeholder="Scope-Notiz (Enter speichert beim Verlassen) …"
            maxLength={2000}
            rows={2}
            className="resize-y"
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onRemove(assignment.id, assignment.vendor_name)}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </li>
  )
}
