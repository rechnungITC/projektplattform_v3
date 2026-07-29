"use client"

import { ExternalLink, Loader2, Plus, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  addExternalLink,
  deleteExternalLink,
  listExternalLinks,
} from "@/lib/ma-project/external-links-api"
import { validateExternalUrl } from "@/lib/ma-project/external-link-validation"
import type {
  ExternalDocumentLink,
  ExternalLinkEntityType,
} from "@/types/external-link"

// PROJ-115 — reusable external (VDR) link section, dropped into each DD object
// surface (dd_question / dd_finding / work_item / deliverable). Links are
// need-to-know-scoped server-side; URLs are validated client-side (mirror of the
// server SSRF-safe check) before POST, and never fetched by the platform.
export function ExternalLinksSection({
  projectId,
  entityType,
  entityId,
  canEdit,
  compact = false,
}: {
  projectId: string
  entityType: ExternalLinkEntityType
  entityId: string
  canEdit: boolean
  compact?: boolean
}) {
  const [links, setLinks] = React.useState<ExternalDocumentLink[]>([])
  const [loading, setLoading] = React.useState(true)
  const [url, setUrl] = React.useState("")
  const [label, setLabel] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot loading flag
    setLoading(true)
    listExternalLinks(projectId, entityType, entityId)
      .then((rows) => {
        if (!cancelled) setLinks(rows)
      })
      .catch(() => {
        if (!cancelled) setLinks([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, entityType, entityId])

  async function add() {
    const trimmed = url.trim()
    if (trimmed.length === 0) return
    const check = validateExternalUrl(trimmed)
    if (!check.ok) {
      toast.error(check.error ?? "Ungültige URL.")
      return
    }
    setBusy(true)
    try {
      const created = await addExternalLink(projectId, {
        entity_type: entityType,
        entity_id: entityId,
        url: trimmed,
        label: label.trim() || null,
      })
      setLinks((l) => [...l, created])
      setUrl("")
      setLabel("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Link konnte nicht hinzugefügt werden.")
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    try {
      await deleteExternalLink(projectId, id)
      setLinks((l) => l.filter((x) => x.id !== id))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Link konnte nicht entfernt werden.")
    }
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <Label className="flex items-center gap-1.5 text-xs font-semibold">
        <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Datenraum-Links
      </Label>
      {loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Lade Links …
        </div>
      ) : links.length === 0 ? (
        <p className="text-xs text-muted-foreground">Keine externen Links.</p>
      ) : (
        <ul className="space-y-1">
          {links.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-0 items-center gap-1 truncate text-primary underline"
              >
                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{l.label?.trim() || l.url}</span>
              </a>
              {canEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-destructive"
                  onClick={() => remove(l.id)}
                  aria-label="Link entfernen"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className={compact ? "flex flex-col gap-2" : "flex flex-wrap gap-2"}>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://datenraum…"
            className="h-8 flex-1"
            inputMode="url"
          />
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Bezeichnung (optional)"
            className="h-8 flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={add}
            disabled={busy || url.trim().length === 0}
            aria-label="Link hinzufügen"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>
      )}
    </div>
  )
}
