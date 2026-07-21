"use client"

/**
 * PROJ-79-α — "Dokumente" tab (core, all project types).
 *
 * Left: react-arborist document tree (folders + documents, DnD move,
 * per-row rename/delete/new-folder/download). Right: detail of the selected
 * node (folder → child count + quick actions; document → metadata + download).
 * Header: quota bar + New-folder + Upload. All writes are edit-gated
 * (useProjectAccess); the API + RLS re-enforce the role server-side.
 */

import { FolderPlus, Loader2, Upload } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useProjectAccess } from "@/hooks/use-project-access"
import { useDocumentTree } from "@/hooks/use-document-tree"
import { useStorageQuota } from "@/hooks/use-storage-quota"
import {
  createFolder,
  deleteNode,
  getDownloadUrl,
  moveNode,
  renameNode,
  uploadDocument,
} from "@/lib/dms/api"
import { formatBytes } from "@/lib/dms/format"
import type { TreeForestNode } from "@/types/dms"

import { DmsQuotaBar } from "./dms-quota-bar"
import { DmsTree } from "./dms-tree"

function findNode(
  forest: TreeForestNode[],
  id: string | null,
): TreeForestNode | null {
  if (!id) return null
  for (const n of forest) {
    if (n.id === id) return n
    if (n.children) {
      const hit = findNode(n.children, id)
      if (hit) return hit
    }
  }
  return null
}

export function DmsPage({ projectId }: { projectId: string }) {
  const canEdit = useProjectAccess(projectId, "edit_master")
  const { forest, loading, error, refresh } = useDocumentTree(projectId)
  const { quota, refresh: refreshQuota } = useStorageQuota(projectId)

  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const selected = findNode(forest, selectedId)

  // Target folder for header actions: the selected folder, or the selected
  // document's parent, or root.
  const targetFolderId = selected
    ? selected.node_type === "folder"
      ? selected.id
      : selected.parent_id
    : null

  // --- Folder create / rename dialog --------------------------------------
  const [folderDialog, setFolderDialog] = React.useState<
    | { mode: "create"; parentId: string | null }
    | { mode: "rename"; node: TreeForestNode }
    | null
  >(null)
  const [folderName, setFolderName] = React.useState("")
  const [folderBusy, setFolderBusy] = React.useState(false)

  const openCreate = (parentId: string | null) => {
    setFolderName("")
    setFolderDialog({ mode: "create", parentId })
  }
  const openRename = (node: TreeForestNode) => {
    setFolderName(node.name)
    setFolderDialog({ mode: "rename", node })
  }

  const submitFolder = async () => {
    if (!folderDialog || folderName.trim() === "") return
    setFolderBusy(true)
    try {
      if (folderDialog.mode === "create") {
        await createFolder(projectId, {
          name: folderName.trim(),
          parent_id: folderDialog.parentId,
        })
        toast.success("Ordner angelegt.")
      } else {
        await renameNode(projectId, folderDialog.node.id, folderName.trim())
        toast.success("Umbenannt.")
      }
      setFolderDialog(null)
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Aktion fehlgeschlagen.")
    } finally {
      setFolderBusy(false)
    }
  }

  // --- Delete confirm -----------------------------------------------------
  const [deleteTarget, setDeleteTarget] = React.useState<TreeForestNode | null>(
    null,
  )
  const [deleteBusy, setDeleteBusy] = React.useState(false)
  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleteBusy(true)
    try {
      const count = await deleteNode(projectId, deleteTarget.id)
      toast.success(`${count} Element(e) gelöscht.`)
      if (selectedId === deleteTarget.id) setSelectedId(null)
      setDeleteTarget(null)
      await Promise.all([refresh(), refreshQuota()])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Löschen fehlgeschlagen.")
    } finally {
      setDeleteBusy(false)
    }
  }

  // --- Upload dialog ------------------------------------------------------
  const [uploadOpen, setUploadOpen] = React.useState(false)
  const [uploadFile, setUploadFile] = React.useState<File | null>(null)
  const [uploadBusy, setUploadBusy] = React.useState(false)
  const [uploadError, setUploadError] = React.useState<string | null>(null)

  const openUpload = () => {
    setUploadFile(null)
    setUploadError(null)
    setUploadOpen(true)
  }
  const submitUpload = async () => {
    if (!uploadFile) return
    setUploadBusy(true)
    setUploadError(null)
    try {
      await uploadDocument(projectId, uploadFile, { parentId: targetFolderId })
      toast.success("Datei hochgeladen.")
      setUploadOpen(false)
      await Promise.all([refresh(), refreshQuota()])
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Upload fehlgeschlagen.",
      )
    } finally {
      setUploadBusy(false)
    }
  }

  // --- Download -----------------------------------------------------------
  const handleDownload = async (node: TreeForestNode) => {
    if (!node.document) return
    try {
      const url = await getDownloadUrl(projectId, node.document.id)
      window.open(url, "_blank", "noopener,noreferrer")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download fehlgeschlagen.")
    }
  }

  const handleMove = async (nodeId: string, newParentId: string | null) => {
    try {
      await moveNode(projectId, nodeId, newParentId)
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verschieben fehlgeschlagen.")
      await refresh()
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Dokumente</h1>
          <p className="text-sm text-muted-foreground">
            Projekt-Dokumentenbaum: hochladen, ordnen, herunterladen.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DmsQuotaBar quota={quota} />
          {canEdit ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => openCreate(targetFolderId)}>
                <FolderPlus className="mr-2 h-4 w-4" aria-hidden /> Ordner
              </Button>
              <Button onClick={openUpload}>
                <Upload className="mr-2 h-4 w-4" aria-hidden /> Hochladen
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardContent className="p-2">
            <DmsTree
              forest={forest}
              loading={loading}
              canEdit={canEdit}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onCreateChild={(parentId) => openCreate(parentId)}
              onRename={openRename}
              onDelete={setDeleteTarget}
              onDownload={handleDownload}
              onMove={handleMove}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {selected ? selected.name : "Kein Element gewählt"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {!selected ? (
              <p className="text-muted-foreground">
                Wähle links einen Ordner oder ein Dokument.
              </p>
            ) : selected.node_type === "folder" ? (
              <>
                <p className="text-muted-foreground">
                  Ordner · {selected.children?.length ?? 0} direkte Element(e)
                </p>
                {canEdit ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => openCreate(selected.id)}>
                      <FolderPlus className="mr-2 h-4 w-4" aria-hidden /> Unterordner
                    </Button>
                    <Button size="sm" onClick={openUpload}>
                      <Upload className="mr-2 h-4 w-4" aria-hidden /> Hierhin laden
                    </Button>
                  </div>
                ) : null}
              </>
            ) : (
              <dl className="space-y-1.5">
                <MetaRow label="Dateiname" value={selected.document?.original_filename ?? selected.name} />
                <MetaRow label="Typ" value={selected.document?.mime_type ?? "—"} />
                <MetaRow
                  label="Größe"
                  value={selected.document ? formatBytes(selected.document.size_bytes) : "—"}
                />
                <MetaRow
                  label="Angelegt"
                  value={new Date(selected.created_at).toLocaleString("de-DE")}
                />
                <div className="pt-2">
                  <Button size="sm" onClick={() => handleDownload(selected)}>
                    Herunterladen
                  </Button>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Folder create / rename dialog */}
      <Dialog
        open={folderDialog != null}
        onOpenChange={(o) => !o && setFolderDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {folderDialog?.mode === "rename" ? "Umbenennen" : "Neuer Ordner"}
            </DialogTitle>
            <DialogDescription>
              {folderDialog?.mode === "rename"
                ? "Neuen Namen eingeben."
                : "Ordnername eingeben. Doppelte Namen werden automatisch nummeriert."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="dms-folder-name">Name</Label>
            <Input
              id="dms-folder-name"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              maxLength={200}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitFolder()
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialog(null)}>
              Abbrechen
            </Button>
            <Button onClick={submitFolder} disabled={folderBusy || folderName.trim() === ""}>
              {folderBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={(o) => !o && setUploadOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Datei hochladen</DialogTitle>
            <DialogDescription>
              PDF, DOCX, XLSX, PPTX, TXT, MD, CSV, PNG, JPG — max. 50 MB. Ziel:{" "}
              {targetFolderId ? "gewählter Ordner" : "Projekt-Wurzel"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              type="file"
              accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg"
              onChange={(e) => {
                setUploadFile(e.target.files?.[0] ?? null)
                setUploadError(null)
              }}
            />
            {uploadFile ? (
              <p className="text-xs text-muted-foreground">
                {uploadFile.name} · {formatBytes(uploadFile.size)}
              </p>
            ) : null}
            {uploadError ? (
              <p className="text-xs text-red-600 dark:text-red-400">{uploadError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={submitUpload} disabled={uploadBusy || !uploadFile}>
              {uploadBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
              Hochladen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              „{deleteTarget?.name}“ löschen?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.node_type === "folder"
                ? "Der Ordner und alle enthaltenen Unterordner und Dokumente werden gelöscht."
                : "Das Dokument wird gelöscht."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
              disabled={deleteBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right">{value}</dd>
    </div>
  )
}
