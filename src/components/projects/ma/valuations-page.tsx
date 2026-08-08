"use client"

import { Coins, Link2, Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { useProjectAccess } from "@/hooks/use-project-access"
import { useValuations } from "@/hooks/use-valuations"
import { listFindings, type DdFinding } from "@/lib/ma-project/dd-findings-api"
import {
  addValuationLink,
  createValuationVersion,
  listValuationLinks,
  removeValuationLink,
} from "@/lib/ma-project/valuations-api"
import {
  MA_CONFIDENTIALITY_LEVELS,
  MA_CONFIDENTIALITY_LEVEL_LABELS,
  type MaConfidentialityLevel,
} from "@/types/confidentiality"
import { SUPPORTED_CURRENCIES } from "@/types/tenant-settings"
import {
  VALUATION_METHOD_LABELS,
  VALUATION_METHODS,
  type Valuation,
  type ValuationLink,
  type ValuationMethod,
} from "@/types/valuation"

import { ExternalLinksSection } from "./external-links-section"

// PROJ-120 — Bewertungs-Register je Deal.
//
// Eine Bewertungsversion ist UNVERÄNDERLICH: eine Korrektur ist immer eine neue,
// kommentierte Version, die die bisherige ablöst (AC2). Genau eine Version trägt
// `is_current` — sie ist die "Aktuelle Bewertungssicht" (AC4). Die Plattform
// rechnet nichts; das eigentliche Modell liegt im Fachwerkzeug und wird nur
// verlinkt (F2 — ein Upload wäre heute nicht auf "Inner Circle" einschränkbar).

function fmtMoney(value: number | null, currency: string): string {
  if (value === null) return "—"
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

function band(v: Valuation): string {
  if (v.value_low === null && v.value_high === null) return "—"
  if (v.value_low !== null && v.value_high !== null) {
    return v.value_low === v.value_high
      ? fmtMoney(v.value_low, v.currency)
      : `${fmtMoney(v.value_low, v.currency)} – ${fmtMoney(v.value_high, v.currency)}`
  }
  return fmtMoney(v.value_low ?? v.value_high, v.currency)
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE")
}

/** Karte "Aktuelle Bewertungssicht" (AC4). */
function CurrentValuationCard({ valuation }: { valuation: Valuation }) {
  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Coins className="h-4 w-4" aria-hidden />
            Aktuelle Bewertungssicht
          </div>
          <div className="mt-1 text-3xl font-semibold tabular-nums">
            {band(valuation)}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {valuation.title} · Stand {fmtDate(valuation.valuation_date)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">v{valuation.version_no}</Badge>
          <Badge variant="outline">
            {VALUATION_METHOD_LABELS[valuation.method]}
          </Badge>
          {valuation.confidentiality_level !== "standard" && (
            <Badge variant="outline" className="gap-1">
              <ShieldCheck className="h-3 w-3" aria-hidden />
              {MA_CONFIDENTIALITY_LEVEL_LABELS[valuation.confidentiality_level]}
            </Badge>
          )}
        </div>
      </div>
      {valuation.assumptions && (
        <div className="mt-4">
          <div className="text-xs font-medium text-muted-foreground">Annahmen</div>
          <p className="mt-1 whitespace-pre-wrap text-sm">{valuation.assumptions}</p>
        </div>
      )}
    </section>
  )
}

/** Versions-Timeline (AC2) — ältere Stände bleiben sichtbar und unveränderlich. */
function VersionTimeline({ valuations }: { valuations: Valuation[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Versionshistorie</h2>
      <ol className="space-y-2">
        {valuations.map((v) => (
          <li
            key={v.id}
            className={`rounded-md border p-4 ${
              v.is_current ? "bg-card" : "border-dashed bg-muted/30"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium tabular-nums">v{v.version_no}</span>
                <span className={v.is_current ? "" : "text-muted-foreground"}>
                  {v.title}
                </span>
                {v.is_current ? (
                  <Badge variant="secondary">aktuell</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    abgelöst
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="tabular-nums">{band(v)}</span>
                <span className="text-muted-foreground">
                  {VALUATION_METHOD_LABELS[v.method]}
                </span>
                <span className="text-muted-foreground">{fmtDate(v.valuation_date)}</span>
              </div>
            </div>
            {v.version_comment && (
              <p className="mt-2 text-sm text-muted-foreground">
                &bdquo;{v.version_comment}&ldquo;
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Verknüpfte DD-Findings der gültigen Version (AC3). */
function LinkedFindingsSection({
  projectId,
  valuation,
  canEdit,
}: {
  projectId: string
  valuation: Valuation
  canEdit: boolean
}) {
  const [links, setLinks] = React.useState<ValuationLink[]>([])
  const [findings, setFindings] = React.useState<DdFinding[]>([])
  const [loading, setLoading] = React.useState(true)
  const [picked, setPicked] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const reload = React.useCallback(async () => {
    try {
      const [l, f] = await Promise.all([
        listValuationLinks(projectId, valuation.id),
        listFindings(projectId),
      ])
      setLinks(l)
      setFindings(f)
    } catch {
      setLinks([])
      setFindings([])
    } finally {
      setLoading(false)
    }
  }, [projectId, valuation.id])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [l, f] = await Promise.all([
          listValuationLinks(projectId, valuation.id),
          listFindings(projectId),
        ])
        if (!cancelled) {
          setLinks(l)
          setFindings(f)
        }
      } catch {
        if (!cancelled) {
          setLinks([])
          setFindings([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, valuation.id])

  const linkedIds = new Set(links.map((l) => l.linked_id))
  const selectable = findings.filter((f) => !linkedIds.has(f.id))
  const titleOf = (id: string) =>
    findings.find((f) => f.id === id)?.title ?? "Nicht sichtbares Finding"

  async function add() {
    if (!picked) return
    setBusy(true)
    try {
      await addValuationLink(projectId, valuation.id, {
        linked_kind: "dd_finding",
        linked_id: picked,
      })
      setPicked("")
      await reload()
      toast.success("Finding verknüpft.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verknüpfen fehlgeschlagen.")
    } finally {
      setBusy(false)
    }
  }

  async function remove(linkId: string) {
    setBusy(true)
    try {
      await removeValuationLink(projectId, valuation.id, linkId)
      await reload()
      toast.success("Verknüpfung entfernt.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Entfernen fehlgeschlagen.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Verknüpfte DD-Findings</h2>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Wird geladen …
        </div>
      ) : (
        <>
          {links.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Findings verknüpft.
            </p>
          ) : (
            <ul className="space-y-2">
              {links.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center justify-between gap-3 rounded-md border p-3"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <Link2 className="h-4 w-4 text-muted-foreground" aria-hidden />
                    {titleOf(l.linked_id)}
                  </span>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => void remove(l.id)}
                      aria-label="Verknüpfung entfernen"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canEdit && selectable.length > 0 && (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor="finding-picker">Finding verknüpfen</Label>
                <Select value={picked} onValueChange={setPicked}>
                  <SelectTrigger id="finding-picker" className="mt-1">
                    <SelectValue placeholder="Finding wählen …" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectable.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => void add()} disabled={!picked || busy}>
                Verknüpfen
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/** Dialog "Neue Version" — löst die bisherige gültige Version ab (AC1/AC2). */
function NewVersionDialog({
  projectId,
  current,
  open,
  onOpenChange,
  onDone,
}: {
  projectId: string
  current: Valuation | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onDone: () => void
}) {
  const [title, setTitle] = React.useState("")
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [method, setMethod] = React.useState<ValuationMethod>("multiple")
  const [low, setLow] = React.useState("")
  const [high, setHigh] = React.useState("")
  const [currency, setCurrency] = React.useState("EUR")
  const [assumptions, setAssumptions] = React.useState("")
  const [comment, setComment] = React.useState("")
  const [level, setLevel] = React.useState<MaConfidentialityLevel>("confidential")
  const [busy, setBusy] = React.useState(false)

  async function submit() {
    if (!title.trim()) {
      toast.error("Titel ist erforderlich.")
      return
    }
    setBusy(true)
    try {
      await createValuationVersion(projectId, {
        title: title.trim(),
        valuation_date: date,
        method,
        value_low: low === "" ? null : Number(low),
        value_high: high === "" ? null : Number(high),
        currency,
        assumptions: assumptions.trim() || null,
        version_comment: comment.trim() || null,
        confidentiality_level: level,
        supersedes_valuation_id: current?.id ?? null,
      })
      toast.success(current ? "Neue Version angelegt." : "Bewertung angelegt.")
      onOpenChange(false)
      setTitle("")
      setComment("")
      setAssumptions("")
      setLow("")
      setHigh("")
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Anlegen fehlgeschlagen.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {current ? "Neue Bewertungsversion" : "Bewertung anlegen"}
          </DialogTitle>
          <DialogDescription>
            {current
              ? `Löst v${current.version_no} ab. Frühere Versionen bleiben unverändert erhalten.`
              : "Erste Bewertungsversion für diesen Deal."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="v-title">Titel</Label>
            <Input
              id="v-title"
              className="mt-1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z. B. Bewertung nach Financial DD"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="v-date">Stand-Datum</Label>
              <Input
                id="v-date"
                type="date"
                className="mt-1"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="v-method">Methode</Label>
              <Select
                value={method}
                onValueChange={(v) => setMethod(v as ValuationMethod)}
              >
                <SelectTrigger id="v-method" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VALUATION_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {VALUATION_METHOD_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="v-low">Bandbreite von</Label>
              <Input
                id="v-low"
                type="number"
                inputMode="decimal"
                className="mt-1"
                value={low}
                onChange={(e) => setLow(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="v-high">bis</Label>
              <Input
                id="v-high"
                type="number"
                inputMode="decimal"
                className="mt-1"
                value={high}
                onChange={(e) => setHigh(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="v-currency">Währung</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="v-currency" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="v-assumptions">Annahmen</Label>
            <Textarea
              id="v-assumptions"
              className="mt-1"
              rows={3}
              value={assumptions}
              onChange={(e) => setAssumptions(e.target.value)}
              placeholder="z. B. WACC 9,2 %; Peer-Multiples 8–10x EBITDA"
            />
          </div>

          <div>
            <Label htmlFor="v-comment">Grund des Versionswechsels</Label>
            <Input
              id="v-comment"
              className="mt-1"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="z. B. nach Integration der Financial-DD-Findings"
            />
          </div>

          <div>
            <Label htmlFor="v-level">Vertraulichkeit</Label>
            <Select
              value={level}
              onValueChange={(v) => setLevel(v as MaConfidentialityLevel)}
            >
              <SelectTrigger id="v-level" className="mt-1">
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Abbrechen
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ValuationsPage({ projectId }: { projectId: string }) {
  const { valuations, current, loading, error, refresh } = useValuations(projectId)
  const canEdit = useProjectAccess(projectId, "edit_master")
  const [dialogOpen, setDialogOpen] = React.useState(false)

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Bewertung</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Bewertungsversionen, Kaufpreisbandbreite und die Verknüpfung zu
            DD-Findings. Das Bewertungsmodell selbst bleibt im Fachwerkzeug und
            wird hier nur referenziert.
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            {current ? "Neue Version" : "Bewertung anlegen"}
          </Button>
        )}
      </header>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Wird geladen …
        </div>
      )}

      {error && !loading && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </p>
      )}

      {!loading && !error && valuations.length === 0 && (
        <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          Für diesen Deal ist noch keine Bewertung hinterlegt.
        </p>
      )}

      {!loading && !error && current && (
        <>
          <CurrentValuationCard valuation={current} />
          <LinkedFindingsSection
            projectId={projectId}
            valuation={current}
            canEdit={canEdit}
          />
          <section className="space-y-3">
            <h2 className="text-base font-semibold">Bewertungs-Artefakte</h2>
            <p className="text-sm text-muted-foreground">
              Excel-/PDF-Modell oder Datenraum-Dokument der aktuellen Version —
              als Verweis. Die Plattform speichert die Datei bewusst nicht.
            </p>
            <ExternalLinksSection
              projectId={projectId}
              entityType="ma_valuation"
              entityId={current.id}
              canEdit={canEdit}
            />
          </section>
        </>
      )}

      {!loading && !error && valuations.length > 0 && (
        <VersionTimeline valuations={valuations} />
      )}

      <NewVersionDialog
        projectId={projectId}
        current={current}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onDone={() => void refresh()}
      />
    </div>
  )
}
