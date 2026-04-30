"use client"

import { Plus, ShieldCheck, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useComplianceTags } from "@/hooks/use-compliance-tags"
import { useWorkItemDocuments } from "@/hooks/use-work-item-documents"
import { useWorkItemTags } from "@/hooks/use-work-item-tags"

interface WorkItemComplianceSectionProps {
  projectId: string
  workItemId: string
  canEdit: boolean
  /** Called after attaching a tag — parent should refresh child lists since
   *  the trigger may have created child work-items. */
  onTagsChanged?: () => void | Promise<void>
}

export function WorkItemComplianceSection({
  projectId,
  workItemId,
  canEdit,
  onTagsChanged,
}: WorkItemComplianceSectionProps) {
  const { tags: allTags, loading: catalogLoading } = useComplianceTags()
  const { rows, loading, attach, detach, refresh } = useWorkItemTags(
    projectId,
    workItemId
  )
  const { documents, refresh: refreshDocs } = useWorkItemDocuments(
    projectId,
    workItemId
  )
  const [pickedTagId, setPickedTagId] = React.useState<string>("")
  const [busy, setBusy] = React.useState(false)

  const attachedIds = new Set(rows.map((r) => r.tag.id))
  const availableTags = allTags.filter(
    (t) => t.is_active && !attachedIds.has(t.id)
  )

  async function handleAttach() {
    if (!pickedTagId) return
    try {
      setBusy(true)
      const result = await attach(pickedTagId)
      setPickedTagId("")
      if (result.childWorkItemIds.length > 0) {
        toast.success(
          `Tag verknüpft. ${result.childWorkItemIds.length} Compliance-Schritt(e) erzeugt.`
        )
      } else {
        toast.success("Tag verknüpft.")
      }
      await refreshDocs()
      if (onTagsChanged) await onTagsChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Verknüpfen.")
    } finally {
      setBusy(false)
    }
  }

  async function handleDetach(linkId: string, displayName: string) {
    try {
      setBusy(true)
      await detach(linkId)
      toast.success(`Tag „${displayName}" entfernt.`)
      if (onTagsChanged) await onTagsChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Entfernen.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck
          className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
          aria-hidden
        />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Compliance
        </h3>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Lädt …</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Keine Compliance-Tags zugeordnet.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {rows.map((row) => (
            <li key={row.link.id}>
              <Badge variant="secondary" className="inline-flex items-center gap-1">
                <span>{row.tag.display_name}</span>
                {canEdit ? (
                  <button
                    type="button"
                    aria-label={`Tag ${row.tag.display_name} entfernen`}
                    className="ml-1 rounded-sm p-0.5 hover:bg-foreground/10 disabled:opacity-50"
                    disabled={busy}
                    onClick={() => handleDetach(row.link.id, row.tag.display_name)}
                  >
                    <Trash2 className="h-3 w-3" aria-hidden />
                  </button>
                ) : null}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={pickedTagId}
            onValueChange={setPickedTagId}
            disabled={catalogLoading || busy || availableTags.length === 0}
          >
            <SelectTrigger className="w-[240px]">
              <SelectValue
                placeholder={
                  catalogLoading
                    ? "Lädt …"
                    : availableTags.length === 0
                      ? "Alle Tags zugeordnet"
                      : "Tag auswählen"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {availableTags.map((tag) => (
                <SelectItem key={tag.id} value={tag.id}>
                  {tag.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAttach}
            disabled={!pickedTagId || busy}
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            Anhängen
          </Button>
        </div>
      ) : null}

      {documents.length > 0 ? (
        <div className="rounded-md border bg-muted/30 p-3">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Compliance-Formulare
          </h4>
          <ul className="space-y-2">
            {documents.map((doc) => (
              <ComplianceDocumentItem key={doc.id} doc={doc} />
            ))}
          </ul>
        </div>
      ) : null}

      <div className="text-[11px] text-muted-foreground">
        Neue Tags lösen automatisch Compliance-Schritte aus (z.B. Prüf-Tasks,
        Formulare). Vorhandene Schritte bleiben beim Entfernen erhalten.
      </div>

      {/* Hidden refresh button — keeps types happy when children change. */}
      <button type="button" onClick={refresh} className="sr-only">
        Aktualisieren
      </button>
    </section>
  )
}

function ComplianceDocumentItem({
  doc,
}: {
  doc: import("@/lib/compliance/types").WorkItemDocument
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <li className="rounded-sm bg-background p-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left text-sm"
        aria-expanded={open}
      >
        <span className="font-medium">{doc.title}</span>
        <span className="text-xs text-muted-foreground">
          {doc.checklist.length} Punkt(e)
        </span>
      </button>
      {open ? (
        <div className="mt-2 space-y-2">
          <p className="whitespace-pre-wrap text-xs text-muted-foreground">
            {doc.body}
          </p>
          {doc.checklist.length > 0 ? (
            <ul className="space-y-1 text-xs">
              {doc.checklist.map((item) => (
                <li key={item.key} className="flex gap-2">
                  <span className="select-none text-muted-foreground">▢</span>
                  <div>
                    <p>{item.label}</p>
                    {item.hint ? (
                      <p className="text-[11px] text-muted-foreground">
                        {item.hint}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}
