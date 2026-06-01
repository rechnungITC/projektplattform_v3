"use client"

import { RefreshCw, Send } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  getJiraExportJob,
  getJiraMapping,
  previewJiraExport,
  saveJiraMapping,
  startJiraExport,
  type JiraExportJobDetail,
  type JiraExportPreview,
} from "@/lib/jira/api"
import type { JiraFieldMapping } from "@/lib/jira/mapping"
import type { WorkItemWithProfile } from "@/types/work-item"

interface JiraExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  items: WorkItemWithProfile[]
  onExported?: () => void | Promise<void>
}

interface MappingDraft {
  jiraProjectKey: string
  issueTypeMap: string
  statusMap: string
  priorityMap: string
  labels: string
  assigneeMode: "none" | "responsible_user_email"
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function draftFromMapping(mapping: JiraFieldMapping): MappingDraft {
  return {
    jiraProjectKey: mapping.jira_project_key,
    issueTypeMap: prettyJson(mapping.issue_type_map),
    statusMap: prettyJson(mapping.status_map),
    priorityMap: prettyJson(mapping.priority_map),
    labels: mapping.labels.join(", "),
    assigneeMode: mapping.assignee_mode,
  }
}

function parseMap(value: string, label: string): Record<string, string> {
  const parsed = JSON.parse(value) as unknown
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} muss ein JSON-Objekt sein.`)
  }
  const result: Record<string, string> = {}
  for (const [key, mapValue] of Object.entries(parsed)) {
    if (typeof mapValue !== "string" || mapValue.trim() === "") {
      throw new Error(`${label}: Wert fuer ${key} muss Text sein.`)
    }
    result[key] = mapValue.trim()
  }
  return result
}

function mappingFromDraft(draft: MappingDraft): JiraFieldMapping {
  return {
    jira_project_key: draft.jiraProjectKey.trim().toUpperCase(),
    issue_type_map: parseMap(draft.issueTypeMap, "Issue-Type-Mapping"),
    status_map: parseMap(draft.statusMap, "Status-Mapping"),
    priority_map: parseMap(draft.priorityMap, "Priority-Mapping"),
    labels: draft.labels
      .split(",")
      .map((label) => label.trim())
      .filter(Boolean),
    assignee_mode: draft.assigneeMode,
  }
}

function actionLabel(action: "create" | "update" | "skip"): string {
  if (action === "create") return "Create"
  if (action === "update") return "Update"
  return "Skip"
}

export function JiraExportDialog({
  open,
  onOpenChange,
  projectId,
  items,
  onExported,
}: JiraExportDialogProps) {
  const [draft, setDraft] = React.useState<MappingDraft | null>(null)
  const [preview, setPreview] = React.useState<JiraExportPreview | null>(null)
  const [job, setJob] = React.useState<JiraExportJobDetail | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [exporting, setExporting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const itemIds = React.useMemo(() => items.map((item) => item.id), [items])
  const actionableCount =
    preview?.items.filter((item) => item.action !== "skip").length ?? 0

  const load = React.useCallback(async () => {
    if (!open || itemIds.length === 0) return
    setLoading(true)
    setError(null)
    setJob(null)
    try {
      const mapping = await getJiraMapping(projectId)
      setDraft(draftFromMapping(mapping))
      const nextPreview = await previewJiraExport(projectId, itemIds)
      setPreview(nextPreview)
    } catch (err) {
      setPreview(null)
      setError(err instanceof Error ? err.message : "Jira Export konnte nicht geladen werden.")
    } finally {
      setLoading(false)
    }
  }, [open, itemIds, projectId])

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function handleSaveMapping() {
    if (!draft) return
    setSaving(true)
    setError(null)
    try {
      const mapping = mappingFromDraft(draft)
      const saved = await saveJiraMapping(projectId, mapping)
      setDraft(draftFromMapping(saved))
      const nextPreview = await previewJiraExport(projectId, itemIds)
      setPreview(nextPreview)
      toast.success("Jira-Mapping gespeichert")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mapping konnte nicht gespeichert werden.")
    } finally {
      setSaving(false)
    }
  }

  async function handleExport() {
    if (itemIds.length === 0) return
    setExporting(true)
    setError(null)
    try {
      const result = await startJiraExport(projectId, itemIds)
      const detail = await getJiraExportJob(projectId, result.job_id)
      setJob(detail)
      toast.success("Jira-Export abgeschlossen", {
        description: `Status: ${result.status}`,
      })
      await onExported?.()
      const nextPreview = await previewJiraExport(projectId, itemIds)
      setPreview(nextPreview)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Jira Export fehlgeschlagen.")
    } finally {
      setExporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Nach Jira exportieren</DialogTitle>
          <DialogDescription>
            {items.length} ausgewählte Work Items werden validiert und als Jira
            Issues erstellt oder aktualisiert.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {draft ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <section className="space-y-3 rounded-md border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="jira-project-key">Jira Project-Key</Label>
                  <Input
                    id="jira-project-key"
                    value={draft.jiraProjectKey}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev
                          ? { ...prev, jiraProjectKey: event.target.value }
                          : prev
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jira-labels">Labels</Label>
                  <Input
                    id="jira-labels"
                    value={draft.labels}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev ? { ...prev, labels: event.target.value } : prev
                      )
                    }
                    placeholder="v3-export, pilot"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="jira-issue-type-map">Issue-Type-Mapping</Label>
                <Textarea
                  id="jira-issue-type-map"
                  className="min-h-[120px] font-mono text-xs"
                  value={draft.issueTypeMap}
                  onChange={(event) =>
                    setDraft((prev) =>
                      prev ? { ...prev, issueTypeMap: event.target.value } : prev
                    )
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="jira-priority-map">Priority-Mapping</Label>
                <Textarea
                  id="jira-priority-map"
                  className="min-h-[100px] font-mono text-xs"
                  value={draft.priorityMap}
                  onChange={(event) =>
                    setDraft((prev) =>
                      prev ? { ...prev, priorityMap: event.target.value } : prev
                    )
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="jira-status-map">Status-Mapping</Label>
                <Textarea
                  id="jira-status-map"
                  className="min-h-[100px] font-mono text-xs"
                  value={draft.statusMap}
                  onChange={(event) =>
                    setDraft((prev) =>
                      prev ? { ...prev, statusMap: event.target.value } : prev
                    )
                  }
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleSaveMapping()}
                  disabled={saving || loading}
                >
                  {saving ? "Speichere ..." : "Mapping speichern"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void load()}
                  disabled={loading}
                >
                  <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
                  Preview aktualisieren
                </Button>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{actionableCount} exportierbar</Badge>
                {preview ? (
                  <Badge variant="outline">
                    {preview.items.length - actionableCount} skip
                  </Badge>
                ) : null}
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Aktion</TableHead>
                      <TableHead>Work Item</TableHead>
                      <TableHead>Jira</TableHead>
                      <TableHead>Hinweise</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={4}>Lade Preview ...</TableCell>
                      </TableRow>
                    ) : preview?.items.length ? (
                      preview.items.map((item) => (
                        <TableRow key={item.work_item_id}>
                          <TableCell>
                            <Badge
                              variant={
                                item.action === "skip" ? "outline" : "default"
                              }
                            >
                              {actionLabel(item.action)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-[260px]">
                              <p className="truncate font-medium">{item.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {item.kind}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {item.jira_issue_key ?? "-"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {item.warnings.length
                              ? item.warnings.join("; ")
                              : "-"}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4}>Keine Preview-Daten.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {job ? (
                <div className="rounded-md border bg-muted/30 p-3 text-sm">
                  <p className="font-medium">Letzter Export</p>
                  <p className="text-muted-foreground">
                    Status: {String(job.job.status)} · Created:{" "}
                    {String(job.job.created_count ?? 0)} · Updated:{" "}
                    {String(job.job.updated_count ?? 0)} · Failed:{" "}
                    {String(job.job.failed_count ?? 0)}
                  </p>
                </div>
              ) : null}
            </section>
          </div>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Lade Jira-Konfiguration ...</p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Schliessen
          </Button>
          <Button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting || loading || actionableCount === 0}
          >
            <Send className="mr-2 h-4 w-4" aria-hidden />
            {exporting ? "Exportiere ..." : "Export starten"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
