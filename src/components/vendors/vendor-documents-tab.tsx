"use client"

import { ExternalLink, Plus, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { useVendorDocuments } from "@/hooks/use-vendor-documents"
import {
  type VendorDocumentKind,
  VENDOR_DOCUMENT_KIND_LABELS,
  VENDOR_DOCUMENT_KINDS,
} from "@/types/vendor"

interface VendorDocumentsTabProps {
  vendorId: string
}

const DATE_FMT = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" })

export function VendorDocumentsTab({ vendorId }: VendorDocumentsTabProps) {
  const { documents, loading, error, add, remove } = useVendorDocuments(vendorId)

  const [kind, setKind] = React.useState<VendorDocumentKind>("offer")
  const [title, setTitle] = React.useState("")
  const [url, setUrl] = React.useState("")
  const [docDate, setDocDate] = React.useState("")
  const [note, setNote] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  async function onAdd() {
    if (!title.trim()) {
      toast.error("Titel ist erforderlich.")
      return
    }
    if (!url.trim().startsWith("https://")) {
      toast.error("URL muss mit https:// beginnen.")
      return
    }
    setSubmitting(true)
    try {
      await add({
        kind,
        title: title.trim(),
        external_url: url.trim(),
        document_date: docDate || null,
        note: note.trim() || null,
      })
      toast.success("Dokument verlinkt")
      setTitle("")
      setUrl("")
      setDocDate("")
      setNote("")
    } catch (err) {
      toast.error("Anlegen fehlgeschlagen", {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function onRemove(id: string) {
    if (!window.confirm("Dokument-Eintrag wirklich löschen?")) return
    try {
      await remove(id)
      toast.success("Dokument-Eintrag entfernt")
    } catch (err) {
      toast.error("Löschen fehlgeschlagen", {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Nur Metadaten + externe URL — kein Upload, kein Antivirus, keine
        Vorschau. Speicherung im Tenant-eigenen Ablagesystem.
      </p>

      <div className="rounded-md border p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Neues Dokument
        </p>
        <div className="grid gap-2 sm:grid-cols-[150px_1fr]">
          <div>
            <Label htmlFor="vd_kind">Art</Label>
            <Select
              value={kind}
              onValueChange={(v) => setKind(v as VendorDocumentKind)}
            >
              <SelectTrigger id="vd_kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VENDOR_DOCUMENT_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {VENDOR_DOCUMENT_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="vd_title">Titel</Label>
            <Input
              id="vd_title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </div>
        </div>
        <div className="mt-2">
          <Label htmlFor="vd_url">URL (https)</Label>
          <Input
            id="vd_url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            maxLength={2000}
            placeholder="https://drive.example.com/…"
          />
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-[180px_1fr]">
          <div>
            <Label htmlFor="vd_date">Datum (optional)</Label>
            <Input
              id="vd_date"
              type="date"
              value={docDate}
              onChange={(e) => setDocDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="vd_note">Notiz (optional)</Label>
            <Textarea
              id="vd_note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              rows={2}
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={() => void onAdd()}
            disabled={submitting}
          >
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
            Dokument verlinken
          </Button>
        </div>
      </div>

      {loading && documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">Lade Dokumente …</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Dokumente.</p>
      ) : (
        <ul className="space-y-2">
          {documents.map((d) => (
            <li
              key={d.id}
              className="rounded-md border bg-card p-3 text-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {VENDOR_DOCUMENT_KIND_LABELS[d.kind]}
                    </Badge>
                    <p className="font-medium">{d.title}</p>
                  </div>
                  <a
                    href={d.external_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" aria-hidden />
                    Öffnen
                  </a>
                  {d.note ? (
                    <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                      {d.note}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {d.document_date
                      ? DATE_FMT.format(new Date(d.document_date))
                      : "kein Datum"}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void onRemove(d.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
