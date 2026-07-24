"use client"

import { Loader2, Plus, Sparkles } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

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
  createTemplate,
  listTemplates,
  seedTemplates,
  type CommunicationTemplate,
} from "@/lib/ma-project/communication-api"

interface Props {
  projectId: string
  canManage: boolean
  onClose: () => void
  /** Called after a change so the parent can refresh its template list. */
  onChanged: () => Promise<void> | void
}

// PROJ-118 — communication template catalogue. Seeding the 4 standard templates
// (Mitarbeiter, Kunden, Presse, Banken …) is tenant-admin only server-side; the
// UI mirrors the committee-templates-dialog gating (canManage).
export function CommunicationTemplatesDialog({
  projectId,
  canManage,
  onClose,
  onChanged,
}: Props) {
  const [templates, setTemplates] = React.useState<CommunicationTemplate[]>([])
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [showCustom, setShowCustom] = React.useState(false)
  const [ck, setCk] = React.useState("")
  const [cn, setCn] = React.useState("")

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setTemplates(await listTemplates(projectId))
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Vorlagen konnten nicht geladen werden."
      )
    } finally {
      setLoading(false)
    }
  }, [projectId])

  // Initial load: await-first IIFE (no synchronous setState in the effect).
  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const rows = await listTemplates(projectId)
        if (!cancelled) setTemplates(rows)
      } catch (err) {
        if (!cancelled)
          toast.error(
            err instanceof Error
              ? err.message
              : "Vorlagen konnten nicht geladen werden."
          )
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  async function seed() {
    setBusy("seed")
    try {
      const n = await seedTemplates(projectId)
      toast.success(
        n > 0 ? `${n} Standard-Vorlagen angelegt.` : "Vorlagen bereits vorhanden."
      )
      await load()
      await onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Seeding fehlgeschlagen.")
    } finally {
      setBusy(null)
    }
  }

  async function createCustom() {
    if (!ck.trim() || !cn.trim()) return
    setBusy("custom")
    try {
      await createTemplate(projectId, {
        template_key: ck.trim(),
        name: cn.trim(),
      })
      setCk("")
      setCn("")
      setShowCustom(false)
      await load()
      await onChanged()
      toast.success("Vorlage angelegt.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Vorlage fehlgeschlagen.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Kommunikations-Vorlagen</DialogTitle>
          <DialogDescription>
            Standard-Kommunikationsvorlagen (Zielgruppe, Kanal, Vertraulichkeit,
            Textgerüst). Beim Anlegen eines Eintrags als Vorlage anwendbar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Lädt…
            </p>
          ) : templates.length === 0 ? (
            <div className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
              <p>Noch keine Vorlagen.</p>
              {canManage && (
                <Button
                  className="mt-3"
                  size="sm"
                  onClick={seed}
                  disabled={busy === "seed"}
                >
                  {busy === "seed" && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  <Sparkles className="mr-1 h-4 w-4" aria-hidden /> Standard-Vorlagen
                  anlegen
                </Button>
              )}
            </div>
          ) : (
            templates.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  {t.default_channel && (
                    <p className="text-xs text-muted-foreground">
                      Kanal: {t.default_channel}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}

          {canManage && templates.length > 0 && !showCustom && (
            <Button size="sm" variant="ghost" onClick={() => setShowCustom(true)}>
              <Plus className="mr-1 h-4 w-4" aria-hidden /> Eigene Vorlage
            </Button>
          )}
          {showCustom && (
            <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
              <div className="space-y-1">
                <Label className="text-xs">Schlüssel</Label>
                <Input
                  value={ck}
                  onChange={(e) => setCk(e.target.value)}
                  placeholder="mitarbeiter"
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Name</Label>
                <Input
                  value={cn}
                  onChange={(e) => setCn(e.target.value)}
                  placeholder="Mitarbeiter-Info"
                />
              </div>
              <Button
                size="sm"
                onClick={createCustom}
                disabled={busy === "custom" || !ck.trim() || !cn.trim()}
              >
                {busy === "custom" && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}{" "}
                Speichern
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Schließen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
