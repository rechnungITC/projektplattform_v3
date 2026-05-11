"use client"

import { Loader2, Plus, ShieldCheck } from "lucide-react"
import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
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
import { Textarea } from "@/components/ui/textarea"
import {
  CONTEXT_SOURCE_KIND_LABELS,
  CONTEXT_SOURCE_KINDS,
  type ContextSource,
  type ContextSourceKind,
} from "@/types/context-source"

/**
 * PROJ-44-ε — Context-sources master-data page.
 *
 * Minimal MVP UI on top of the PROJ-44-β data layer:
 *  - List of registered sources in the active tenant (current
 *    classification + processing_status visible).
 *  - Inline form to register a new source (kind / title / excerpt).
 *
 * The proposal-review drawer that consumes
 * `invokeProposalFromContext` (PROJ-44-δ) is a future enhancement;
 * this surface currently focuses on getting context into the
 * pipeline.
 */
export function ContextSourcesPageClient() {
  const [items, setItems] = React.useState<ContextSource[] | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [reloadTick, setReloadTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    fetch("/api/context-sources", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          let msg = `HTTP ${res.status}`
          try {
            const body = (await res.json()) as { error?: { message?: string } }
            msg = body.error?.message ?? msg
          } catch {
            // ignore
          }
          throw new Error(msg)
        }
        return (await res.json()) as { context_sources: ContextSource[] }
      })
      .then((body) => {
        if (!cancelled) setItems(body.context_sources)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadTick])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Context Sources
        </h1>
        <p className="text-sm text-muted-foreground">
          Dokumente, E-Mails und Meeting-Notizen als strukturierte Eingaben
          für die KI-Vorschlags-Pipeline. Privacy-Klassifizierung erfolgt
          automatisch beim Speichern.
        </p>
      </div>

      <CreateForm onCreated={() => setReloadTick((t) => t + 1)} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registrierte Quellen</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Lädt …
            </p>
          )}
          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              Liste konnte nicht geladen werden: {error}
            </p>
          )}
          {items && items.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Noch keine Quellen erfasst.
            </p>
          )}
          {items && items.length > 0 && (
            <ul className="space-y-2">
              {items.map((item) => (
                <ContextSourceRow key={item.id} source={item} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ContextSourceRow({ source }: { source: ContextSource }) {
  return (
    <li className="rounded-md border bg-card p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Badge variant="outline" className="h-5 text-[10px] capitalize">
          {CONTEXT_SOURCE_KIND_LABELS[source.kind]}
        </Badge>
        <p className="text-sm font-medium text-foreground">{source.title}</p>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <ShieldCheck className="h-3 w-3" aria-hidden />
          Class {source.privacy_class}
        </span>
        <Badge variant="secondary" className="h-5 text-[10px]">
          {source.processing_status}
        </Badge>
      </div>
      {source.content_excerpt && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {source.content_excerpt}
        </p>
      )}
      <p className="mt-1 text-[10px] text-muted-foreground">
        Erfasst am {new Date(source.created_at).toLocaleString("de-DE")}
      </p>
    </li>
  )
}

interface CreateFormProps {
  onCreated: () => void
}

function CreateForm({ onCreated }: CreateFormProps) {
  const [kind, setKind] = React.useState<ContextSourceKind>("document")
  const [title, setTitle] = React.useState("")
  const [excerpt, setExcerpt] = React.useState("")
  const [language, setLanguage] = React.useState<"de" | "en">("de")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const reset = () => {
    setKind("document")
    setTitle("")
    setExcerpt("")
    setLanguage("de")
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError("Titel ist erforderlich.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/context-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          title: title.trim(),
          content_excerpt: excerpt.trim() || undefined,
          language,
        }),
      })
      if (!res.ok) {
        let msg = `HTTP ${res.status}`
        try {
          const body = (await res.json()) as { error?: { message?: string } }
          msg = body.error?.message ?? msg
        } catch {
          // ignore
        }
        throw new Error(msg)
      }
      reset()
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Plus className="h-4 w-4 text-muted-foreground" aria-hidden />
          Neue Quelle erfassen
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="context-kind" className="text-xs">
                Art
              </Label>
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as ContextSourceKind)}
              >
                <SelectTrigger id="context-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTEXT_SOURCE_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {CONTEXT_SOURCE_KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="context-title" className="text-xs">
                Titel
              </Label>
              <Input
                id="context-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={500}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="context-excerpt" className="text-xs">
              Auszug
            </Label>
            <Textarea
              id="context-excerpt"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              maxLength={8000}
              rows={4}
              placeholder="Wesentlichen Inhalt einfügen — die Privacy-Klasse wird daraus abgeleitet (E-Mail / Telefonnummer / IBAN → Class 3)."
            />
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="context-language" className="text-xs">
                Sprache
              </Label>
              <Select
                value={language}
                onValueChange={(v) => setLanguage(v as "de" | "en")}
              >
                <SelectTrigger id="context-language" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="de">Deutsch</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              Quelle anlegen
            </Button>
          </div>
          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              {error}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
