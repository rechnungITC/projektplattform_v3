"use client"

import { ExternalLink, FileText, Link2, Printer, Trash2, X } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useConstructionAcceptanceDetail } from "@/hooks/use-construction-acceptances"
import { fetchDocumentTree } from "@/lib/dms/api"
import { nodePathOptions } from "@/lib/dms/tree"
import type { TreeNodeWithDocument } from "@/types/dms"
import {
  cancelConstructionAcceptance,
  setConstructionAcceptanceDocument,
} from "@/lib/construction/api"
import { CONSTRUCTION_DEFECT_SEVERITY_LABELS } from "@/lib/construction/defects"
import {
  CONSTRUCTION_ACCEPTANCE_EVENT_LABELS,
  CONSTRUCTION_ACCEPTANCE_PARTICIPANT_ROLE_LABELS,
  CONSTRUCTION_ACCEPTANCE_STATUS_LABELS,
  isAcceptanceOpen,
} from "@/types/construction-acceptance"

/**
 * Sentinel für „noch nichts gewählt". Ein `undefined`-Wert an einem Radix-Select
 * würde die Komponente unkontrolliert starten und bei der ersten Auswahl
 * umkippen — genau der Defekt aus PROJ-Y-45d, der im Mangel-Dialog behoben
 * wurde. Hier von Anfang an in der Hausform.
 */
const NO_NODE = "__none__"

interface Props {
  projectId: string
  acceptanceId: string | null
  onOpenChange: (open: boolean) => void
  canManage: boolean
  onChanged: () => void
}

function fmt(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-DE")
}

function fmtStamp(value: string): string {
  const d = new Date(value)
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })
}

/**
 * PROJ-45-γ — Detailansicht einer Abnahme.
 *
 * Zwei Dinge, die hier bewusst anders sind als beim Mangel:
 *
 *  1. **Nach dem Ergebnis ist alles gesperrt — bis auf den Beleg.** Das
 *     unterschriebene Protokoll kommt naturgemäss NACH der Abnahme zurück, und
 *     genau dieser eine Schreibvorgang bleibt darum offen. Das wird gesagt, nicht
 *     nur durch fehlende Knöpfe angedeutet.
 *  2. **Der Verlauf ist unveränderlich.** Er kommt aus einer eigenen
 *     Ereignis-Tabelle, nicht aus einer Rekonstruktion — angesetzt, verschoben,
 *     abgesagt, protokolliert, jeweils mit Zeitpunkt.
 */
export function ConstructionAcceptanceDetailSheet({
  projectId,
  acceptanceId,
  onOpenChange,
  canManage,
  onChanged,
}: Props) {
  const { detail, loading, refresh } = useConstructionAcceptanceDetail(
    projectId,
    acceptanceId
  )
  const [cancelReason, setCancelReason] = React.useState("")
  const [docLabel, setDocLabel] = React.useState("")
  const [docUrl, setDocUrl] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  /**
   * PROJ-Y-45g — AC-45γ.24 verlangt „entweder eine externe Adresse **oder** ein
   * vorhandener Dokumentknoten aus dem DMS". Die Datenbank, die Route und der
   * Client trugen den zweiten Weg von Anfang an (der Einzel-Beleg-CHECK schliesst
   * beides-zugleich aus, Rot-Team-Vektor S weist einen **fremden** Knoten mit
   * 23514 ab) — es fehlte allein diese Auswahl, das Kriterium war damit
   * serverseitig erfüllt und für den Nutzer halb.
   *
   * Die Quelle ist eine **benannte Wahl**, keine Ableitung aus „welches Feld ist
   * gefüllt": dieselbe Entscheidung wie bei γs drittem Bezug („Das ganze
   * Projekt" statt „nichts ausgewählt"). Sonst wäre unklar, was passiert, wenn
   * beide Felder etwas enthalten — und genau das lehnt der CHECK ab.
   */
  const [docSource, setDocSource] = React.useState<"url" | "node">("url")
  const [docNodeId, setDocNodeId] = React.useState("")
  const [treeNodes, setTreeNodes] = React.useState<TreeNodeWithDocument[]>([])
  const [treeError, setTreeError] = React.useState<string | null>(null)
  /**
   * Bewusst „geladen" statt „lädt": ein `setLoading(true)` **synchron** im
   * Effektkörper ist im Haus verboten (`react-hooks/set-state-in-effect`, seit
   * PROJ-67/AC-4). Der Zustand wird deshalb erst NACH dem `await` gesetzt und
   * der Ladezustand daraus abgeleitet — dasselbe Muster wie `use-tenant-members`
   * (PROJ-130-γ2b). Nebeneffekt: die Liste behauptet nie „keine Datei
   * vorhanden", solange noch nichts geladen wurde.
   */
  const [treeLoaded, setTreeLoaded] = React.useState(false)

  const a = detail?.acceptance ?? null
  const open = a !== null && isAcceptanceOpen(a.status)

  async function doCancel() {
    if (!a) return
    if (!cancelReason.trim()) {
      toast.error("Eine Absage braucht eine Begründung.")
      return
    }
    setBusy(true)
    try {
      await cancelConstructionAcceptance(projectId, a.id, cancelReason.trim())
      toast.success("Abnahmetermin abgesagt.")
      setCancelReason("")
      await refresh()
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Absage fehlgeschlagen.")
    } finally {
      setBusy(false)
    }
  }

  /**
   * Der Baum wird erst geladen, wenn der Nutzer die Dokument-Quelle wählt — die
   * Fläche öffnet sich sonst für jede Abnahme mit einem Abruf, den fast niemand
   * braucht. `cancelled`-Wächter nach Hausmuster.
   */
  React.useEffect(() => {
    if (docSource !== "node" || !canManage) return
    let cancelled = false
    fetchDocumentTree(projectId)
      .then((nodes) => {
        if (cancelled) return
        setTreeError(null)
        setTreeNodes(nodes)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setTreeError(err instanceof Error ? err.message : "Unbekannter Fehler")
      })
      .finally(() => {
        if (!cancelled) setTreeLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [docSource, canManage, projectId])

  const treeLoading = docSource === "node" && !treeLoaded && treeError === null

  /**
   * Nur Dateien, keine Ordner: ein Beleg ist **ein** unterschriebenes Protokoll.
   * Einen Ordner anzuhängen wäre keine Aussage darüber, was unterschrieben wurde.
   */
  const documentOptions = React.useMemo(
    () => nodePathOptions(treeNodes).filter((n) => !n.isFolder),
    [treeNodes]
  )

  async function attach() {
    if (!a) return
    if (docSource === "url" && !docUrl.trim()) {
      toast.error("Bitte eine Adresse angeben.")
      return
    }
    if (docSource === "node" && !docNodeId) {
      toast.error("Bitte ein Dokument auswählen.")
      return
    }
    setBusy(true)
    try {
      // Genau EIN Feld geht raus — der Einzel-Beleg-CHECK weist beides
      // gleichzeitig ab, und die Zod-Prüfung der Route tut es schon davor.
      await setConstructionAcceptanceDocument(
        projectId,
        a.id,
        docSource === "node"
          ? { label: docLabel.trim() || null, document_node_id: docNodeId }
          : { label: docLabel.trim() || null, url: docUrl.trim() }
      )
      toast.success("Beleg angehängt.")
      setDocLabel("")
      setDocUrl("")
      setDocNodeId("")
      await refresh()
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Anhängen fehlgeschlagen.")
    } finally {
      setBusy(false)
    }
  }

  async function detach() {
    if (!a) return
    setBusy(true)
    try {
      await setConstructionAcceptanceDocument(projectId, a.id, { clear: true })
      toast.success("Beleg entfernt.")
      await refresh()
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Entfernen fehlgeschlagen.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={acceptanceId !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {/* PROJ-Y-45i: der Kopf steht AUSSERHALB der Ladeverzweigung. Vorher war
            er im `else`-Zweig, das Sheet hatte im Ladezustand also gar keinen
            `SheetTitle` — für einen Screenreader ist der Kontext dieses Fensters
            damit verloren, solange geladen wird (QA-Befund F-γ2). Die
            Geschwister-Fläche `construction-defect-detail-sheet` rendert ihren
            Kopf seit β unbedingt und ihr Skeleton nur INNEN; γ ist damit jetzt
            strukturell gleich. Ein bloss versteckter Titel wäre schlechter: der
            sichtbare Text sagt auch sehenden Nutzern, worauf sie warten. */}
        {loading || !detail ? (
          <>
            <SheetHeader>
              <SheetTitle>Abnahme wird geladen …</SheetTitle>
              <SheetDescription>
                Die Abnahmedaten werden abgerufen.
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-3 p-6">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-24 w-full" />
            </div>
          </>
        ) : (
          ((acc) => (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                Abnahme Nr. {acc.acceptance_number}
                <Badge variant="secondary">
                  {CONSTRUCTION_ACCEPTANCE_STATUS_LABELS[acc.status]}
                </Badge>
              </SheetTitle>
              <SheetDescription>
                {acc.title ?? "Ohne Titel"}
                {acc.supersedes_acceptance_id ? " · Nachabnahme" : ""}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-8">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Bezug</dt>
                  <dd>
                    {acc.trade?.trade?.label
                      ? `Gewerk ${acc.trade.trade.label}`
                      : acc.section?.label
                        ? `Abschnitt ${acc.section.label}`
                        : "Gesamtes Projekt"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Angesetzt</dt>
                  <dd>{fmt(acc.scheduled_for)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Abgenommen am</dt>
                  <dd>{fmt(acc.accepted_on)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Gewährleistung bis
                  </dt>
                  <dd>
                    {acc.warranty_end_date ? (
                      <>
                        {fmt(acc.warranty_end_date)}
                        {acc.warranty_months ? (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({acc.warranty_months} Monate)
                          </span>
                        ) : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
              </dl>

              {acc.reason && (
                <div className="rounded-md border bg-muted/40 p-3 text-sm">
                  <p className="text-xs text-muted-foreground">Begründung</p>
                  <p>{acc.reason}</p>
                </div>
              )}
              {acc.notes && (
                <div className="text-sm">
                  <p className="text-xs text-muted-foreground">Bemerkung</p>
                  <p className="whitespace-pre-wrap">{acc.notes}</p>
                </div>
              )}

              <Separator />

              <section className="space-y-2">
                <h3 className="text-sm font-medium">
                  Teilnehmer ({detail.participants.length})
                </h3>
                {detail.participants.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Keine Teilnehmer erfasst.
                  </p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {detail.participants.map((p) => (
                      <li key={p.id} className="flex items-center gap-2">
                        <span>{p.display_name}</span>
                        <Badge variant="outline" className="text-xs">
                          {
                            CONSTRUCTION_ACCEPTANCE_PARTICIPANT_ROLE_LABELS[
                              p.role_in_acceptance
                            ]
                          }
                        </Badge>
                        {p.attendance === "abwesend" && (
                          <span className="text-xs text-muted-foreground">
                            abwesend
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-medium">
                  Vorbehalte ({detail.reservations.length})
                </h3>
                {detail.reservations.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Keine Vorbehalte erklärt.
                  </p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {detail.reservations.map((r) => (
                      <li key={r.defect_id} className="flex flex-wrap items-center gap-2">
                        <Link2 className="h-3 w-3 text-muted-foreground" />
                        <span>
                          #{r.defect?.defect_number} {r.defect?.title}
                        </span>
                        {r.defect?.severity && (
                          <Badge variant="outline" className="text-xs">
                            {
                              CONSTRUCTION_DEFECT_SEVERITY_LABELS[
                                r.defect
                                  .severity as keyof typeof CONSTRUCTION_DEFECT_SEVERITY_LABELS
                              ]
                            }
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          aktuell: {r.defect?.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-muted-foreground">
                  Vorbehalte sind Verweise auf Mängel im Mängelregister — das
                  Protokoll hält den Stand zum Abnahmezeitpunkt fest, die Liste
                  hier zeigt den heutigen.
                </p>
              </section>

              <Separator />

              <section className="space-y-2">
                <h3 className="text-sm font-medium">Beleg</h3>
                {acc.document_url || acc.document_node_id ? (
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    {acc.document_url ? (
                      <a
                        href={acc.document_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 underline"
                      >
                        {acc.document_label ?? "Unterschriebenes Protokoll"}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span>{acc.document_label ?? "Dokument im Dokumentenbaum"}</span>
                    )}
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={detach}
                        disabled={busy}
                        aria-label="Beleg entfernen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ) : canManage ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Das unterschriebene Protokoll kommt nach der Abnahme
                      zurück — es lässt sich deshalb auch dann noch anhängen,
                      wenn alles andere schon festgeschrieben ist.
                    </p>
                    <div className="space-y-1">
                      <Label htmlFor="doc-label" className="text-xs">
                        Bezeichnung
                      </Label>
                      <Input
                        id="doc-label"
                        value={docLabel}
                        onChange={(e) => setDocLabel(e.target.value)}
                        placeholder="Unterschriebenes Protokoll"
                        maxLength={200}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="doc-source" className="text-xs">
                        Woher kommt der Beleg?
                      </Label>
                      <Select
                        value={docSource}
                        onValueChange={(v) => setDocSource(v as "url" | "node")}
                      >
                        <SelectTrigger id="doc-source">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="url">Externe Adresse</SelectItem>
                          <SelectItem value="node">
                            Dokument aus dem Dokumentenbaum
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {docSource === "url" ? (
                      <div className="space-y-1">
                        <Label htmlFor="doc-url" className="text-xs">
                          Adresse (https)
                        </Label>
                        <Input
                          id="doc-url"
                          value={docUrl}
                          onChange={(e) => setDocUrl(e.target.value)}
                          placeholder="https://…"
                        />
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Label htmlFor="doc-node" className="text-xs">
                          Dokument
                        </Label>
                        {treeLoading ? (
                          <Skeleton className="h-9 w-full" />
                        ) : treeError ? (
                          <p className="text-xs text-destructive">
                            Dokumentenbaum konnte nicht geladen werden:{" "}
                            {treeError}
                          </p>
                        ) : documentOptions.length === 0 ? (
                          /* Ehrlicher Leerzustand statt einer leeren Liste: das
                             DMS-Modul kann aus sein oder der Baum leer. */
                          <p className="text-xs text-muted-foreground">
                            Im Dokumentenbaum dieses Projekts liegt noch keine
                            Datei. Laden Sie das Protokoll zuerst unter
                            „Dokumente“ hoch.
                          </p>
                        ) : (
                          <Select
                            value={docNodeId.length > 0 ? docNodeId : NO_NODE}
                            onValueChange={(v) =>
                              setDocNodeId(v === NO_NODE ? "" : v)
                            }
                          >
                            <SelectTrigger id="doc-node">
                              <SelectValue placeholder="Dokument wählen …" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_NODE}>
                                — bitte wählen —
                              </SelectItem>
                              {documentOptions.map((n) => (
                                <SelectItem key={n.id} value={n.id}>
                                  {n.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )}
                    <Button size="sm" onClick={attach} disabled={busy}>
                      Beleg anhängen
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Kein Beleg angehängt.
                  </p>
                )}
              </section>

              <Separator />

              <section className="space-y-2">
                <h3 className="text-sm font-medium">Verlauf</h3>
                <ol className="space-y-2 text-sm">
                  {detail.events.map((e) => (
                    <li key={e.id} className="flex flex-col">
                      <span className="font-medium">
                        {CONSTRUCTION_ACCEPTANCE_EVENT_LABELS[e.event_type]}
                        {e.status_after !== e.status_before && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            → {CONSTRUCTION_ACCEPTANCE_STATUS_LABELS[e.status_after]}
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {fmtStamp(e.created_at)}
                      </span>
                      {e.reason && <span className="text-xs">{e.reason}</span>}
                    </li>
                  ))}
                </ol>
                <p className="text-xs text-muted-foreground">
                  Diese Einträge sind unveränderlich.
                </p>
              </section>

              <Separator />

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={`/projects/${projectId}/abnahmeprotokoll/print?abnahme=${acc.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Printer className="mr-2 h-4 w-4" />
                    Protokoll drucken
                  </a>
                </Button>
              </div>

              {open && canManage && (
                <>
                  <Separator />
                  <section className="space-y-2">
                    <h3 className="text-sm font-medium">Termin absagen</h3>
                    <Textarea
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      rows={2}
                      maxLength={2000}
                      placeholder="Begründung (Pflicht)"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={doCancel}
                      disabled={busy}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Absagen
                    </Button>
                  </section>
                </>
              )}

              {!open && (
                <p className="text-xs text-muted-foreground">
                  Diese Abnahme ist abgeschlossen. Ergebnis, Termin, Teilnehmer
                  und Vorbehalte sind festgeschrieben; nur der Beleg lässt sich
                  noch nachtragen.
                </p>
              )}
            </div>
          </>
          ))(detail.acceptance)
        )}
      </SheetContent>
    </Sheet>
  )
}
