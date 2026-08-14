"use client"

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  buildSectionTree,
  flattenSectionTree,
  forbiddenParentIds,
} from "@/hooks/use-construction"
import {
  createConstructionSection,
  updateConstructionSection,
} from "@/lib/construction/api"
import type { ConstructionSection } from "@/types/construction"

const ROOT_VALUE = "__root__"

interface Props {
  projectId: string
  open: boolean
  /** null = create, otherwise edit. */
  section: ConstructionSection | null
  defaultParentId: string | null
  allSections: readonly ConstructionSection[]
  onOpenChange: (open: boolean) => void
  onSaved: () => void | Promise<void>
}

export function ConstructionSectionDialog({
  projectId,
  open,
  section,
  defaultParentId,
  allSections,
  onOpenChange,
  onSaved,
}: Props) {
  const isEdit = section !== null
  const [label, setLabel] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [parentId, setParentId] = React.useState<string | null>(null)
  const [sortOrder, setSortOrder] = React.useState("0")
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot seed when the dialog opens
    setLabel(section?.label ?? "")
    setDescription(section?.description ?? "")
    setParentId(isEdit ? (section?.parent_id ?? null) : defaultParentId)
    setSortOrder(String(section?.sort_order ?? 0))
  }, [open, section, defaultParentId, isEdit])

  // A node may not become its own descendant. The database rejects it anyway;
  // filtering here means the picker never offers a choice that can only fail.
  const blocked = React.useMemo(
    () => (section ? forbiddenParentIds(allSections, section.id) : new Set<string>()),
    [allSections, section]
  )
  const parentOptions = React.useMemo(
    () =>
      flattenSectionTree(buildSectionTree(allSections)).filter(
        (node) => !blocked.has(node.id)
      ),
    [allSections, blocked]
  )

  const canSave = label.trim().length > 0 && !saving

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSave) return
    setSaving(true)
    try {
      const parsed = Number.parseInt(sortOrder, 10)
      const payload = {
        label: label.trim(),
        description: description.trim().length > 0 ? description.trim() : null,
        parent_id: parentId,
        sort_order: Number.isFinite(parsed) ? parsed : 0,
      }
      if (isEdit) {
        await updateConstructionSection(projectId, section.id, payload)
        toast.success("Abschnitt gespeichert")
      } else {
        await createConstructionSection(projectId, payload)
        toast.success("Abschnitt angelegt")
      }
      await onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error("Speichern fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? "Bauabschnitt bearbeiten" : "Bauabschnitt anlegen"}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Ein Wechsel des übergeordneten Abschnitts verschiebt den gesamten Teilbaum mit."
                : "Ohne übergeordneten Abschnitt entsteht ein Eintrag auf oberster Ebene."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="section-label">Bezeichnung</Label>
              <Input
                id="section-label"
                value={label}
                maxLength={160}
                autoFocus
                placeholder="z. B. Haus A oder 2. OG"
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="section-parent">Übergeordneter Abschnitt</Label>
              <Select
                value={parentId ?? ROOT_VALUE}
                onValueChange={(value) =>
                  setParentId(value === ROOT_VALUE ? null : value)
                }
              >
                <SelectTrigger id="section-parent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ROOT_VALUE}>— oberste Ebene —</SelectItem>
                  {parentOptions.map((node) => (
                    <SelectItem key={node.id} value={node.id}>
                      {" ".repeat(node.depth * 3)}
                      {node.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isEdit ? (
                <p className="text-xs text-muted-foreground">
                  Der Abschnitt selbst und alles darunter stehen hier nicht zur
                  Auswahl — das ergäbe einen Zyklus.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="section-description">Beschreibung</Label>
              <Textarea
                id="section-description"
                value={description}
                rows={2}
                maxLength={4000}
                placeholder="Optional"
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="section-sort">Reihenfolge</Label>
              <Input
                id="section-sort"
                type="number"
                min={0}
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={!canSave}>
              {saving ? "Speichern …" : "Speichern"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
