"use client"

import { ArrowLeft, Loader2 } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { SkillExamplesSection } from "@/components/master-data/skill-examples-section"
import { SkillKnowledgeLinksSection } from "@/components/master-data/skill-knowledge-links-section"
import { SkillRollbackDiffDialog } from "@/components/master-data/skill-rollback-diff-dialog"
import { SkillTagPicker } from "@/components/master-data/skill-tag-picker"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/hooks/use-auth"
import {
  activateSkillVersion,
  createSkillVersion,
  getSkill,
  listSkillVersions,
  patchSkillVersion,
  rollbackSkillVersion,
  updateSkillMetadata,
} from "@/lib/skills/api"
import {
  SKILL_ALLOWED_ACTIONS,
  type SkillAllowedAction,
} from "@/lib/skills/allowed-actions"
import { serializeSkillMarkdown } from "@/lib/skills/serialize"
import { PROJECT_TYPE_LABELS, PROJECT_TYPES } from "@/types/project"
import {
  PROJECT_METHOD_LABELS,
  PROJECT_METHODS,
} from "@/types/project-method"
import {
  SKILL_CATEGORIES,
  SKILL_CATEGORY_LABELS,
  type Skill,
  type SkillCategory,
  type SkillFrontmatter,
  type SkillVersion,
  type SkillVersionStatus,
} from "@/types/skill"

const METHOD_OPTIONS = PROJECT_METHODS.map((m) => ({
  value: m,
  label: PROJECT_METHOD_LABELS[m],
}))
const TYPE_OPTIONS = PROJECT_TYPES.map((t) => ({
  value: t,
  label: PROJECT_TYPE_LABELS[t],
}))

const ACTION_LABELS: Record<SkillAllowedAction, string> = {
  propose_work_item: "Work-Item vorschlagen",
  propose_risk: "Risiko vorschlagen",
  propose_budget_item: "Budgetposten vorschlagen",
  propose_phase: "Phase vorschlagen",
  propose_milestone: "Meilenstein vorschlagen",
  generate_document: "Dokument erzeugen",
  summarize_document: "Dokument zusammenfassen",
  read_only: "Nur lesen",
}
const ACTION_OPTIONS = SKILL_ALLOWED_ACTIONS.map((a) => ({
  value: a,
  label: ACTION_LABELS[a],
}))

const VERSION_STATUS_LABEL: Record<SkillVersionStatus, string> = {
  draft: "Entwurf",
  active: "Aktiv",
  archived: "Archiviert",
}
const VERSION_STATUS_VARIANT: Record<
  SkillVersionStatus,
  "default" | "secondary" | "outline"
> = {
  draft: "secondary",
  active: "default",
  archived: "outline",
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "Unbekannter Fehler"
}

/**
 * The API wrapper (`src/lib/skills/api.ts`, off-limits here) surfaces the
 * server's error *message* but not the HTTP status. Conflicts (409) carry a
 * distinctive message, so we detect them by their known fragments to drive the
 * "reload underneath you" UX. Any non-conflict failure falls through to a
 * generic error toast.
 */
function isConflictError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const m = err.message.toLowerCase()
  return (
    m.includes("changed since you loaded") ||
    m.includes("open draft") ||
    m.includes("only draft versions") ||
    m.includes("concurrent")
  )
}

/** Parse `key=value` lines into a record; empty result = no overrides. */
function parseModelOverrides(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of raw.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    const k = trimmed.slice(0, eq).trim()
    const v = trimmed.slice(eq + 1).trim()
    if (k && v) out[k] = v
  }
  return out
}

function overridesToText(o: Record<string, string> | null | undefined): string {
  if (!o) return ""
  return Object.entries(o)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n")
}

interface Props {
  skillId: string
}

export function SkillDetailClient({ skillId }: Props) {
  const { currentRole } = useAuth()
  const isAdmin = currentRole === "admin"

  const [skill, setSkill] = React.useState<Skill | null>(null)
  const [activeVersion, setActiveVersion] = React.useState<SkillVersion | null>(
    null
  )
  const [versions, setVersions] = React.useState<SkillVersion[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [reloadTick, setReloadTick] = React.useState(0)

  // metadata form
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [category, setCategory] = React.useState<SkillCategory>("cross_cutting")
  const [methodTags, setMethodTags] = React.useState<string[]>([])
  const [typeTags, setTypeTags] = React.useState<string[]>([])
  const [savingMeta, setSavingMeta] = React.useState(false)

  // draft edit form (bound to the open draft, if any)
  const [body, setBody] = React.useState("")
  const [temperature, setTemperature] = React.useState("")
  const [tone, setTone] = React.useState("")
  const [allowedKinds, setAllowedKinds] = React.useState("")
  const [allowedActions, setAllowedActions] = React.useState<string[]>([])
  const [modelOverrides, setModelOverrides] = React.useState("")
  const [changeSummary, setChangeSummary] = React.useState("")
  const [savingDraft, setSavingDraft] = React.useState(false)
  const [creatingDraft, setCreatingDraft] = React.useState(false)
  const [publishing, setPublishing] = React.useState(false)
  const [publishOpen, setPublishOpen] = React.useState(false)

  // rollback confirm dialog
  const [rollbackTarget, setRollbackTarget] =
    React.useState<SkillVersion | null>(null)
  const [rollingBack, setRollingBack] = React.useState(false)

  // per-version action busy id (timeline)
  const [versionBusyId, setVersionBusyId] = React.useState<string | null>(null)

  const openDraft = React.useMemo(
    () => versions.find((v) => v.status === "draft") ?? null,
    [versions]
  )

  React.useEffect(() => {
    let cancelled = false
    Promise.all([getSkill(skillId), listSkillVersions(skillId)])
      .then(([{ skill: s, version }, vs]) => {
        if (cancelled) return
        setError(null)
        setVersionBusyId(null)
        setSkill(s)
        setActiveVersion(version)
        setVersions(vs)
        // hydrate metadata form
        setName(s.name)
        setDescription(s.description)
        setCategory(s.category)
        setMethodTags(s.method_tags)
        setTypeTags(s.project_type_tags)
        // hydrate the draft edit form from the open draft if there is one,
        // otherwise from the active version (used for the preview + as the
        // visual base when there is no draft).
        const draft = vs.find((v) => v.status === "draft") ?? null
        const seed = draft ?? version
        setBody(seed?.markdown_content ?? "")
        const fm: SkillFrontmatter = seed?.frontmatter ?? {}
        setTemperature(fm.temperature != null ? String(fm.temperature) : "")
        setTone(fm.tone ?? "")
        setAllowedKinds((fm.allowed_kinds ?? []).join(", "))
        setAllowedActions(fm.allowed_actions ?? [])
        setModelOverrides(overridesToText(fm.model_overrides))
        setChangeSummary(draft?.change_summary ?? "")
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(errMsg(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [skillId, reloadTick])

  const refresh = React.useCallback(() => {
    setLoading(true)
    setReloadTick((t) => t + 1)
  }, [])

  const buildFrontmatter = React.useCallback((): SkillFrontmatter => {
    const fm: SkillFrontmatter = {}
    const temp = temperature.trim()
    if (temp !== "") {
      const n = Number(temp)
      if (!Number.isNaN(n)) fm.temperature = n
    }
    if (tone.trim() !== "") fm.tone = tone.trim()
    const kinds = allowedKinds
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean)
    if (kinds.length > 0) fm.allowed_kinds = kinds
    if (allowedActions.length > 0) fm.allowed_actions = allowedActions
    const overrides = parseModelOverrides(modelOverrides)
    if (Object.keys(overrides).length > 0) fm.model_overrides = overrides
    return fm
  }, [temperature, tone, allowedKinds, allowedActions, modelOverrides])

  const handleSaveMetadata = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error("Name ist erforderlich.")
      return
    }
    setSavingMeta(true)
    try {
      const updated = await updateSkillMetadata(skillId, {
        name: name.trim(),
        description: description.trim(),
        category,
        method_tags: methodTags,
        project_type_tags: typeTags,
      })
      setSkill(updated)
      toast.success("Metadaten gespeichert")
    } catch (err) {
      toast.error("Speichern fehlgeschlagen", { description: errMsg(err) })
    } finally {
      setSavingMeta(false)
    }
  }

  // "Neuer Entwurf" — create a fresh draft seeded from the active version.
  const handleCreateDraft = async () => {
    setCreatingDraft(true)
    try {
      await createSkillVersion(skillId, {
        markdown_body: activeVersion?.markdown_content ?? "",
        frontmatter: activeVersion?.frontmatter ?? {},
        change_summary: null,
      })
      toast.success("Neuer Entwurf erstellt")
      refresh()
    } catch (err) {
      if (isConflictError(err)) {
        toast.info("Es existiert bereits ein offener Entwurf — neu laden.")
        refresh()
      } else {
        toast.error("Entwurf konnte nicht erstellt werden", {
          description: errMsg(err),
        })
      }
    } finally {
      setCreatingDraft(false)
    }
  }

  // Save the open draft in place (If-Match optimistic concurrency).
  const handleSaveDraft = async () => {
    if (!openDraft) return
    setSavingDraft(true)
    try {
      const updated = await patchSkillVersion(
        skillId,
        openDraft.id,
        {
          markdown_body: body,
          frontmatter: buildFrontmatter(),
          change_summary: changeSummary.trim() || null,
        },
        openDraft.updated_at
      )
      // Soft update: keep the admin editing (no skeleton flash); the returned
      // version carries a fresh `updated_at` for the next If-Match save.
      setVersions((prev) =>
        prev.map((v) => (v.id === updated.id ? updated : v))
      )
      toast.success("Entwurf gespeichert")
    } catch (err) {
      if (isConflictError(err)) {
        toast.error("Entwurf wurde zwischenzeitlich geändert — neu laden")
        refresh()
      } else {
        toast.error("Entwurf konnte nicht gespeichert werden", {
          description: errMsg(err),
        })
      }
    } finally {
      setSavingDraft(false)
    }
  }

  // Publish = activate the open draft (previous active → archived).
  const handlePublish = async () => {
    if (!openDraft) return
    setPublishing(true)
    setVersionBusyId(openDraft.id)
    try {
      await activateSkillVersion(skillId, openDraft.id)
      toast.success(`Version v${openDraft.version_number} veröffentlicht`)
      setPublishOpen(false)
      refresh()
    } catch (err) {
      if (isConflictError(err)) {
        toast.error("Entwurf wurde zwischenzeitlich geändert — neu laden")
        setPublishOpen(false)
        refresh()
      } else {
        toast.error("Veröffentlichen fehlgeschlagen", {
          description: errMsg(err),
        })
      }
      setVersionBusyId(null)
      setPublishing(false)
    }
  }

  const handleRollbackConfirm = async () => {
    if (!rollbackTarget) return
    setRollingBack(true)
    setVersionBusyId(rollbackTarget.id)
    try {
      await rollbackSkillVersion(skillId, rollbackTarget.id)
      toast.success(
        `Zurückgerollt auf Inhalt von v${rollbackTarget.version_number} (neue aktive Version)`
      )
      setRollbackTarget(null)
      refresh()
    } catch (err) {
      toast.error("Zurückrollen fehlgeschlagen", { description: errMsg(err) })
      setVersionBusyId(null)
    } finally {
      setRollingBack(false)
    }
  }

  const previewMarkdown = React.useMemo(
    () =>
      serializeSkillMarkdown(
        { name: name || skill?.name || "", description },
        { frontmatter: buildFrontmatter(), markdown_content: body }
      ),
    [name, description, body, buildFrontmatter, skill?.name]
  )

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-1" />
          <Skeleton className="h-96 lg:col-span-2" />
        </div>
      </div>
    )
  }

  if (error || !skill) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-md border border-destructive/40 bg-destructive/5 py-10 text-center text-sm text-destructive">
          <p>{error ?? "Skill nicht gefunden."}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={refresh}
          >
            Erneut versuchen
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <BackLink />
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {skill.name}
          </h1>
          <Badge variant="secondary">
            {SKILL_CATEGORY_LABELS[skill.category]}
          </Badge>
          <Badge variant={skill.is_active ? "outline" : "secondary"}>
            {skill.is_active ? "Aktiv" : "Inaktiv"}
          </Badge>
        </div>
        <p className="font-mono text-xs text-muted-foreground">{skill.slug}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: version timeline */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Versionen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Noch keine Versionen.
              </p>
            ) : (
              versions
                .slice()
                .sort((a, b) => b.version_number - a.version_number)
                .map((v) => {
                  const isActive = v.status === "active"
                  const isDraft = v.status === "draft"
                  const isArchived = v.status === "archived"
                  const busy = versionBusyId === v.id
                  return (
                    <div
                      key={v.id}
                      className={`rounded-md border p-3 ${
                        isActive
                          ? "border-primary bg-primary/5"
                          : "border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          v{v.version_number}
                        </span>
                        <Badge variant={VERSION_STATUS_VARIANT[v.status]}>
                          {VERSION_STATUS_LABEL[v.status]}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {fmtDateTime(v.created_at)}
                      </p>
                      {v.change_summary && (
                        <p className="mt-1 text-sm">{v.change_summary}</p>
                      )}
                      {isAdmin && isDraft && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy || publishing}
                            onClick={() => setPublishOpen(true)}
                          >
                            {busy && publishing && (
                              <Loader2
                                className="mr-1.5 h-3.5 w-3.5 animate-spin"
                                aria-hidden
                              />
                            )}
                            Veröffentlichen
                          </Button>
                        </div>
                      )}
                      {isAdmin && isArchived && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => setRollbackTarget(v)}
                          >
                            Zurückrollen
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })
            )}
          </CardContent>
        </Card>

        {/* Right: edit / preview tabs */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="edit">
            <TabsList>
              <TabsTrigger value="edit">Bearbeiten</TabsTrigger>
              <TabsTrigger value="preview">Vorschau (Rohtext)</TabsTrigger>
            </TabsList>

            <TabsContent value="edit" className="space-y-6">
              {/* Metadata form */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Metadaten</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSaveMetadata} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="meta-name">Name</Label>
                      <Input
                        id="meta-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={160}
                        disabled={!isAdmin}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="meta-slug">Slug</Label>
                      <Input
                        id="meta-slug"
                        value={skill.slug}
                        readOnly
                        disabled
                        className="font-mono"
                      />
                      <p className="text-xs text-muted-foreground">
                        Der Slug ist nach dem Anlegen unveränderlich.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="meta-description">Beschreibung</Label>
                      <Textarea
                        id="meta-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        maxLength={2000}
                        rows={3}
                        disabled={!isAdmin}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="meta-category">Kategorie</Label>
                      <Select
                        value={category}
                        onValueChange={(v) => setCategory(v as SkillCategory)}
                        disabled={!isAdmin}
                      >
                        <SelectTrigger id="meta-category">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SKILL_CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {SKILL_CATEGORY_LABELS[c]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <SkillTagPicker
                      id="meta-method-tags"
                      label="Methoden"
                      options={METHOD_OPTIONS}
                      value={methodTags}
                      onChange={setMethodTags}
                      disabled={!isAdmin || savingMeta}
                    />
                    <SkillTagPicker
                      id="meta-type-tags"
                      label="Projekttypen"
                      options={TYPE_OPTIONS}
                      value={typeTags}
                      onChange={setTypeTags}
                      disabled={!isAdmin || savingMeta}
                    />

                    {isAdmin && (
                      <Button type="submit" disabled={savingMeta}>
                        {savingMeta && (
                          <Loader2
                            className="mr-2 h-4 w-4 animate-spin"
                            aria-hidden
                          />
                        )}
                        Metadaten speichern
                      </Button>
                    )}
                  </form>
                </CardContent>
              </Card>

              {/* Draft workflow */}
              {isAdmin &&
                (openDraft ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        Entwurf bearbeiten (v{openDraft.version_number})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-xs text-muted-foreground">
                        Dieser Entwurf ist noch nicht veröffentlicht und für
                        andere Nutzer unsichtbar. Speichere beliebig oft und
                        veröffentliche ihn, wenn er fertig ist.
                      </p>

                      <div className="space-y-2">
                        <Label htmlFor="ver-body">Markdown-Inhalt</Label>
                        <Textarea
                          id="ver-body"
                          value={body}
                          onChange={(e) => setBody(e.target.value)}
                          maxLength={50000}
                          rows={12}
                          className="font-mono text-xs"
                          placeholder="Freier Markdown-Body des Skills …"
                        />
                        <p className="text-xs text-muted-foreground">
                          {body.length.toLocaleString("de-DE")} / 50.000 Zeichen
                        </p>
                      </div>

                      <Separator />

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="ver-temp">Temperatur</Label>
                          <Input
                            id="ver-temp"
                            type="number"
                            min={0}
                            max={2}
                            step={0.1}
                            value={temperature}
                            onChange={(e) => setTemperature(e.target.value)}
                            placeholder="z. B. 0.7"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="ver-tone">Tonalität</Label>
                          <Input
                            id="ver-tone"
                            value={tone}
                            onChange={(e) => setTone(e.target.value)}
                            maxLength={200}
                            placeholder="z. B. sachlich, knapp"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="ver-kinds">Erlaubte Kinds</Label>
                        <Input
                          id="ver-kinds"
                          value={allowedKinds}
                          onChange={(e) => setAllowedKinds(e.target.value)}
                          placeholder="Komma-getrennt, z. B. story, task, bug"
                        />
                      </div>

                      <SkillTagPicker
                        id="ver-allowed-actions"
                        label="Erlaubte Aktionen"
                        options={ACTION_OPTIONS}
                        value={allowedActions}
                        onChange={setAllowedActions}
                        disabled={savingDraft}
                      />
                      <p className="-mt-1 text-xs text-muted-foreground">
                        Leer = keine mutierende Aktion erlaubt (fail-closed).
                        Durchgesetzt in späteren KI-Funktionen.
                      </p>

                      <div className="space-y-2">
                        <Label htmlFor="ver-overrides">
                          Modell-Overrides (optional)
                        </Label>
                        <Textarea
                          id="ver-overrides"
                          value={modelOverrides}
                          onChange={(e) => setModelOverrides(e.target.value)}
                          rows={2}
                          className="font-mono text-xs"
                          placeholder={"Eine Zuordnung pro Zeile, z. B.\ndefault=claude-sonnet"}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="ver-summary">Änderungsnotiz</Label>
                        <Input
                          id="ver-summary"
                          value={changeSummary}
                          onChange={(e) => setChangeSummary(e.target.value)}
                          maxLength={500}
                          placeholder="Was ändert sich in dieser Version?"
                        />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={savingDraft || publishing}
                          onClick={() => void handleSaveDraft()}
                        >
                          {savingDraft && (
                            <Loader2
                              className="mr-2 h-4 w-4 animate-spin"
                              aria-hidden
                            />
                          )}
                          Entwurf speichern
                        </Button>
                        <Button
                          type="button"
                          disabled={savingDraft || publishing}
                          onClick={() => setPublishOpen(true)}
                        >
                          {publishing && (
                            <Loader2
                              className="mr-2 h-4 w-4 animate-spin"
                              aria-hidden
                            />
                          )}
                          Veröffentlichen
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Neuer Entwurf</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Es gibt derzeit keinen offenen Entwurf. Lege einen neuen
                        Entwurf an, um den Inhalt zu bearbeiten – er wird auf
                        Basis der aktiven Version vorbefüllt und erst mit
                        „Veröffentlichen“ live.
                      </p>
                      <Button
                        type="button"
                        disabled={creatingDraft}
                        onClick={() => void handleCreateDraft()}
                      >
                        {creatingDraft && (
                          <Loader2
                            className="mr-2 h-4 w-4 animate-spin"
                            aria-hidden
                          />
                        )}
                        Neuer Entwurf
                      </Button>
                    </CardContent>
                  </Card>
                ))}
            </TabsContent>

            <TabsContent value="preview">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Rohtext-Vorschau (.md)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Exakt der Markdown-Text, der beim Speichern abgelegt und von
                    nachgelagerten KI-Purposes konsumiert wird. Spiegelt die
                    aktuellen Formularinhalte.
                  </p>
                  <pre className="max-h-[32rem] overflow-x-auto overflow-y-auto rounded-md border bg-muted/40 p-4 font-mono text-xs">
                    {previewMarkdown}
                  </pre>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {activeVersion == null && (
        <p className="text-sm text-muted-foreground">
          Dieser Skill hat noch keine aktive Version. Erstelle einen Entwurf und
          veröffentliche ihn in der Zeitleiste.
        </p>
      )}

      {/* PROJ-77-β — admin-only reusable example pairs (additive) */}
      <SkillExamplesSection skillId={skillId} canEdit={isAdmin} />

      {/* PROJ-77-γ — admin-only DMS knowledge-source links (additive) */}
      <SkillKnowledgeLinksSection skillId={skillId} canEdit={isAdmin} />

      {/* Publish confirmation */}
      <AlertDialog open={publishOpen} onOpenChange={setPublishOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {openDraft
                ? `Version v${openDraft.version_number} veröffentlichen?`
                : "Veröffentlichen?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Der Entwurf wird zur neuen aktiven Version und ist damit für alle
              Nutzer sichtbar. Die bisher aktive Version wird archiviert und der
              Inhalt eingefroren. Diese Aktion kann nur per Zurückrollen
              rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishing}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={publishing}
              onClick={(e) => {
                e.preventDefault()
                void handlePublish()
              }}
            >
              {publishing && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              Veröffentlichen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rollback diff confirmation */}
      <SkillRollbackDiffDialog
        open={rollbackTarget != null}
        onOpenChange={(open) => {
          if (!open) setRollbackTarget(null)
        }}
        targetVersionNumber={rollbackTarget?.version_number ?? null}
        activeContent={activeVersion?.markdown_content ?? ""}
        targetContent={rollbackTarget?.markdown_content ?? ""}
        onConfirm={() => void handleRollbackConfirm()}
        busy={rollingBack}
      />
    </div>
  )
}

function BackLink() {
  return (
    <Link
      href="/stammdaten/skills"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden /> Zurück zur Skill-Liste
    </Link>
  )
}
