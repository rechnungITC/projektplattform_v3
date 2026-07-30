"use client"

/**
 * PROJ-77-γ — admin-only section to link a skill to PROJ-79 DMS document nodes
 * ("Wissensquellen"). Skills are tenant-level; DMS nodes are project-scoped, so
 * the add-link picker first picks a project (tenant's project list) and then a
 * node from that project's document tree. The knowledge-links endpoint 403s
 * non-admins, so callers pass `canEdit={isAdmin}` and we render nothing when it
 * is false.
 *
 * Reused PROJ-79 surface:
 *   - `useProjects` (src/hooks/use-projects.ts) — tenant project list.
 *   - `fetchDocumentTree` (src/lib/dms/api.ts) — flat node list per project.
 * Existing links only store `document_node_id` (no project_id), so we resolve
 * their name + owning project via a direct RLS-scoped `document_tree_nodes`
 * read (graceful fallback to the raw id when RLS hides the node).
 */

import { FileText, Folder, Link2, Loader2, Plus, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useAuth } from "@/hooks/use-auth"
import { useProjects } from "@/hooks/use-projects"
import { fetchDocumentTree } from "@/lib/dms/api"
import {
  createSkillKnowledgeLink,
  deleteSkillKnowledgeLink,
  listSkillKnowledgeLinks,
  updateSkillKnowledgeLink,
} from "@/lib/skills/api"
import { createClient } from "@/lib/supabase/client"
import type { TreeNodeWithDocument } from "@/types/dms"
import type { SkillKnowledgeLink, SkillLinkMode } from "@/types/skill"

const LINK_MODE_LABELS: Record<SkillLinkMode, string> = {
  reference: "Referenz",
  required: "Erforderlich",
}
const LINK_MODE_VARIANT: Record<SkillLinkMode, "default" | "secondary"> = {
  reference: "secondary",
  required: "default",
}
const LINK_MODES: readonly SkillLinkMode[] = ["reference", "required"] as const

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "Unbekannter Fehler"
}

/**
 * Map the API error message to a friendly toast. The api wrapper surfaces the
 * server message but not the HTTP status; 409/422 carry distinctive fragments.
 */
function friendlyCreateError(err: unknown): string {
  const raw = errMsg(err).toLowerCase()
  if (raw.includes("bereits") || raw.includes("already") || raw.includes("duplicate")) {
    return "Dokument ist bereits verknüpft."
  }
  if (
    raw.includes("tenant") ||
    raw.includes("mandant") ||
    raw.includes("not found") ||
    raw.includes("nicht gefunden") ||
    raw.includes("invalid")
  ) {
    return "Der Knoten muss zum selben Mandanten gehören."
  }
  return errMsg(err)
}

/** Metadata resolved for an existing link's node (name + owning project). */
interface ResolvedNode {
  name: string
  node_type: string
  project_id: string
}

interface Props {
  skillId: string
  canEdit: boolean
}

export function SkillKnowledgeLinksSection({ skillId, canEdit }: Props) {
  const { currentTenant } = useAuth()
  const tenantId = currentTenant?.id ?? null
  const { projects } = useProjects({ tenantId })

  const [links, setLinks] = React.useState<SkillKnowledgeLink[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [reloadTick, setReloadTick] = React.useState(0)

  // Resolved node metadata for the currently listed links, keyed by node id.
  const [resolved, setResolved] = React.useState<Record<string, ResolvedNode>>(
    {}
  )

  // per-link busy id (inline toggle / mode change)
  const [rowBusyId, setRowBusyId] = React.useState<string | null>(null)

  // add dialog state
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [pickProjectId, setPickProjectId] = React.useState<string>("")
  const [pickNodeId, setPickNodeId] = React.useState<string>("")
  const [pickSubtree, setPickSubtree] = React.useState(false)
  const [pickMode, setPickMode] = React.useState<SkillLinkMode>("reference")
  const [treeNodes, setTreeNodes] = React.useState<TreeNodeWithDocument[]>([])
  const [treeLoading, setTreeLoading] = React.useState(false)
  const [treeError, setTreeError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  // delete confirm state
  const [deleteTarget, setDeleteTarget] =
    React.useState<SkillKnowledgeLink | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  // --- load links ---------------------------------------------------------
  React.useEffect(() => {
    if (!canEdit) return
    let cancelled = false
    listSkillKnowledgeLinks(skillId)
      .then((rows) => {
        if (cancelled) return
        setError(null)
        setLinks(rows)
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
  }, [skillId, canEdit, reloadTick])

  // --- resolve node names for the listed links (RLS-scoped direct read) ---
  React.useEffect(() => {
    if (!canEdit) return
    const ids = links.map((l) => l.document_node_id)
    let cancelled = false
    // Empty set resolves to {} via a resolved promise so we never call setState
    // synchronously in the effect body (react-hooks/set-state-in-effect).
    const query =
      ids.length === 0
        ? Promise.resolve({
            data: [] as Array<{
              id: string
              name: string
              node_type: string
              project_id: string
            }>,
            error: null,
          })
        : createClient()
            .from("document_tree_nodes")
            .select("id, name, node_type, project_id")
            .in("id", ids)
    Promise.resolve(query)
      .then(({ data, error: qErr }) => {
        if (cancelled) return
        if (qErr) {
          // Non-fatal: the list still renders with raw ids as fallback.
          setResolved({})
          return
        }
        const next: Record<string, ResolvedNode> = {}
        for (const row of (data ?? []) as Array<{
          id: string
          name: string
          node_type: string
          project_id: string
        }>) {
          next[row.id] = {
            name: row.name,
            node_type: row.node_type,
            project_id: row.project_id,
          }
        }
        setResolved(next)
      })
      .catch(() => {
        if (!cancelled) setResolved({})
      })
    return () => {
      cancelled = true
    }
  }, [links, canEdit])

  const projectNameById = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const p of projects) m.set(p.id, p.name)
    return m
  }, [projects])

  const refresh = React.useCallback(() => {
    setLoading(true)
    setReloadTick((t) => t + 1)
  }, [])

  // --- add dialog: load a project's document tree -------------------------
  const openAdd = React.useCallback(() => {
    setPickProjectId("")
    setPickNodeId("")
    setPickSubtree(false)
    setPickMode("reference")
    setTreeNodes([])
    setTreeError(null)
    setDialogOpen(true)
  }, [])

  // Selecting a project resets node state + flips loading eagerly (in the
  // handler, not the effect — avoids synchronous setState in an effect body).
  const handleProjectChange = React.useCallback((id: string) => {
    setPickProjectId(id)
    setPickNodeId("")
    setTreeNodes([])
    setTreeError(null)
    setTreeLoading(true)
  }, [])

  React.useEffect(() => {
    if (!dialogOpen || !pickProjectId) return
    let cancelled = false
    fetchDocumentTree(pickProjectId)
      .then((nodes) => {
        if (cancelled) return
        setTreeError(null)
        setTreeNodes(nodes)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setTreeError(errMsg(err))
      })
      .finally(() => {
        if (!cancelled) setTreeLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [dialogOpen, pickProjectId])

  // Build "Folder / Sub / node" path labels from the flat tree.
  const nodeOptions = React.useMemo(() => {
    const byId = new Map<string, TreeNodeWithDocument>()
    for (const n of treeNodes) byId.set(n.id, n)
    const pathOf = (n: TreeNodeWithDocument): string => {
      const parts: string[] = []
      let cur: TreeNodeWithDocument | undefined = n
      const guard = new Set<string>()
      while (cur && !guard.has(cur.id)) {
        guard.add(cur.id)
        parts.unshift(cur.name)
        cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
      }
      return parts.join(" / ")
    }
    return treeNodes
      .map((n) => ({
        id: n.id,
        label: pathOf(n),
        isFolder: n.node_type === "folder",
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [treeNodes])

  const handleCreate = async () => {
    if (!pickNodeId) {
      toast.error("Bitte einen Knoten auswählen.")
      return
    }
    setSaving(true)
    try {
      await createSkillKnowledgeLink(skillId, {
        document_node_id: pickNodeId,
        include_subtree: pickSubtree,
        link_mode: pickMode,
      })
      toast.success("Wissensquelle verknüpft")
      setDialogOpen(false)
      refresh()
    } catch (err) {
      toast.error("Verknüpfen fehlgeschlagen", {
        description: friendlyCreateError(err),
      })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleSubtree = async (
    link: SkillKnowledgeLink,
    next: boolean
  ) => {
    setRowBusyId(link.id)
    try {
      const updated = await updateSkillKnowledgeLink(skillId, link.id, {
        include_subtree: next,
      })
      setLinks((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
    } catch (err) {
      toast.error("Aktualisieren fehlgeschlagen", { description: errMsg(err) })
    } finally {
      setRowBusyId(null)
    }
  }

  const handleChangeMode = async (
    link: SkillKnowledgeLink,
    next: SkillLinkMode
  ) => {
    if (next === link.link_mode) return
    setRowBusyId(link.id)
    try {
      const updated = await updateSkillKnowledgeLink(skillId, link.id, {
        link_mode: next,
      })
      setLinks((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
    } catch (err) {
      toast.error("Aktualisieren fehlgeschlagen", { description: errMsg(err) })
    } finally {
      setRowBusyId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteSkillKnowledgeLink(skillId, deleteTarget.id)
      toast.success("Verknüpfung entfernt")
      setDeleteTarget(null)
      refresh()
    } catch (err) {
      toast.error("Entfernen fehlgeschlagen", { description: errMsg(err) })
    } finally {
      setDeleting(false)
    }
  }

  // Admin-only surface; render nothing for non-admins.
  if (!canEdit) return null

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <CardTitle className="text-base">Wissensquellen</CardTitle>
          <p className="text-xs text-muted-foreground">
            Mit Dokumenten oder Ordnern aus dem Dokumentenmanagement verknüpfen.
            Nur für Administratoren sichtbar.
          </p>
        </div>
        <Button type="button" size="sm" onClick={openAdd}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          Wissensquelle verknüpfen
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 py-8 text-center text-sm text-destructive">
            <p>{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={refresh}
            >
              Erneut versuchen
            </Button>
          </div>
        ) : links.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Noch keine Wissensquellen verknüpft.
          </p>
        ) : (
          <ul className="space-y-3">
            {links.map((link) => {
              const node = resolved[link.document_node_id]
              const projectName = node
                ? projectNameById.get(node.project_id) ?? null
                : null
              const busy = rowBusyId === link.id
              const isFolder = node?.node_type === "folder"
              return (
                <li
                  key={link.id}
                  className="rounded-md border border-border p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {node ? (
                          isFolder ? (
                            <Folder
                              className="h-4 w-4 shrink-0 text-muted-foreground"
                              aria-hidden
                            />
                          ) : (
                            <FileText
                              className="h-4 w-4 shrink-0 text-muted-foreground"
                              aria-hidden
                            />
                          )
                        ) : (
                          <Link2
                            className="h-4 w-4 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                        )}
                        <span className="font-medium break-words">
                          {node?.name ?? "Unbekannter Knoten"}
                        </span>
                        <Badge variant={LINK_MODE_VARIANT[link.link_mode]}>
                          {LINK_MODE_LABELS[link.link_mode]}
                        </Badge>
                        {link.include_subtree && (
                          <Badge variant="outline">inkl. Unterordner</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {projectName
                          ? `Projekt: ${projectName}`
                          : node
                            ? "Projekt: unbekannt"
                            : `Knoten-ID: ${link.document_node_id.slice(0, 8)}…`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {busy && (
                        <Loader2
                          className="mr-1 h-4 w-4 animate-spin text-muted-foreground"
                          aria-hidden
                        />
                      )}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        aria-label={`Verknüpfung „${node?.name ?? "Knoten"}“ entfernen`}
                        onClick={() => setDeleteTarget(link)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`subtree-${link.id}`}
                        checked={link.include_subtree}
                        disabled={busy}
                        onCheckedChange={(checked) =>
                          void handleToggleSubtree(link, checked)
                        }
                      />
                      <Label
                        htmlFor={`subtree-${link.id}`}
                        className="text-xs font-normal text-muted-foreground"
                      >
                        Unterordner einbeziehen
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor={`mode-${link.id}`}
                        className="text-xs font-normal text-muted-foreground"
                      >
                        Modus
                      </Label>
                      <Select
                        value={link.link_mode}
                        disabled={busy}
                        onValueChange={(v) =>
                          void handleChangeMode(link, v as SkillLinkMode)
                        }
                      >
                        <SelectTrigger id={`mode-${link.id}`} className="h-8 w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LINK_MODES.map((m) => (
                            <SelectItem key={m} value={m}>
                              {LINK_MODE_LABELS[m]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>

      {/* Add-link node picker */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Wissensquelle verknüpfen</DialogTitle>
            <DialogDescription>
              Wähle ein Projekt und darin ein Dokument oder einen Ordner aus dem
              Dokumentenmanagement.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pick-project">Projekt</Label>
              <Select
                value={pickProjectId}
                onValueChange={handleProjectChange}
                disabled={saving}
              >
                <SelectTrigger id="pick-project">
                  <SelectValue placeholder="Projekt auswählen …" />
                </SelectTrigger>
                <SelectContent>
                  {projects.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      Keine Projekte vorhanden.
                    </div>
                  ) : (
                    projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pick-node">Knoten</Label>
              {treeError ? (
                <p className="text-sm text-destructive">{treeError}</p>
              ) : null}
              <Select
                value={pickNodeId}
                onValueChange={setPickNodeId}
                disabled={
                  saving ||
                  !pickProjectId ||
                  treeLoading ||
                  nodeOptions.length === 0
                }
              >
                <SelectTrigger id="pick-node">
                  <SelectValue
                    placeholder={
                      !pickProjectId
                        ? "Zuerst ein Projekt wählen"
                        : treeLoading
                          ? "Dokumente werden geladen …"
                          : nodeOptions.length === 0
                            ? "Keine Dokumente vorhanden"
                            : "Knoten auswählen …"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {nodeOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      <span className="inline-flex items-center gap-1.5">
                        {opt.isFolder ? (
                          <Folder className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <FileText className="h-3.5 w-3.5" aria-hidden />
                        )}
                        {opt.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="pick-subtree" className="text-sm">
                  Unterordner einbeziehen
                </Label>
                <p className="text-xs text-muted-foreground">
                  Bezieht den Knoten und alle darunterliegenden Dokumente ein.
                </p>
              </div>
              <Switch
                id="pick-subtree"
                checked={pickSubtree}
                disabled={saving}
                onCheckedChange={setPickSubtree}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pick-mode">Modus</Label>
              <Select
                value={pickMode}
                onValueChange={(v) => setPickMode(v as SkillLinkMode)}
                disabled={saving}
              >
                <SelectTrigger id="pick-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LINK_MODES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {LINK_MODE_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                „Erforderlich“ = muss im Abrufkontext enthalten sein; „Referenz“
                = optionale Gewichtung.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setDialogOpen(false)}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              disabled={saving || !pickNodeId}
              onClick={() => void handleCreate()}
            >
              {saving && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              Verknüpfen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Verknüpfung entfernen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Wissensquelle wird von diesem Skill getrennt. Das Dokument
              selbst bleibt erhalten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
            >
              {deleting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              Entfernen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
