"use client"

import { Loader2 } from "lucide-react"
import * as React from "react"

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
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  type ClearanceProfile,
  createClearanceProfile,
  type GrantableLevel,
  updateClearanceProfile,
} from "@/lib/ma-project/clearance-profiles-api"

interface Props {
  open: boolean
  mode: "create" | "edit"
  initial: ClearanceProfile | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function ClearanceProfileFormDialog({
  open,
  mode,
  initial,
  onOpenChange,
  onSaved,
}: Props) {
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [level, setLevel] = React.useState<GrantableLevel>("confidential")
  const [isActive, setIsActive] = React.useState(true)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot form reset when the dialog opens
    setError(null)
    if (mode === "edit" && initial) {
      setName(initial.name)
      setDescription(initial.description ?? "")
      setLevel(initial.granted_level)
      setIsActive(initial.is_active)
    } else {
      setName("")
      setDescription("")
      setLevel("confidential")
      setIsActive(true)
    }
  }, [open, mode, initial])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError("Name ist erforderlich.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      if (mode === "edit" && initial) {
        await updateClearanceProfile(initial.id, {
          name: name.trim(),
          description: description.trim() || null,
          granted_level: level,
          is_active: isActive,
        })
      } else {
        await createClearanceProfile({
          name: name.trim(),
          description: description.trim() || null,
          granted_level: level,
        })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {mode === "edit" ? "Profil bearbeiten" : "Neues Berechtigungsprofil"}
            </DialogTitle>
            <DialogDescription>
              Profile vergeben beim Anwenden die gewählte Vertraulichkeitsstufe
              an einen Nutzer im Projekt.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="profile-name">Name</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z. B. DD-Stream Legal voll"
                maxLength={120}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-description">Beschreibung (optional)</Label>
              <Textarea
                id="profile-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Wofür ist dieses Profil gedacht?"
                maxLength={2000}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-level">Vertraulichkeitsstufe</Label>
              <Select
                value={level}
                onValueChange={(v) => setLevel(v as GrantableLevel)}
              >
                <SelectTrigger id="profile-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="confidential">Vertraulich</SelectItem>
                  <SelectItem value="strict">Streng vertraulich</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                „Standard“ wird nie über ein Profil vergeben — es ist die offene
                Grundstufe.
              </p>
            </div>

            {mode === "edit" && (
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label htmlFor="profile-active">Aktiv</Label>
                  <p className="text-xs text-muted-foreground">
                    Inaktive Profile können nicht mehr angewendet werden.
                  </p>
                </div>
                <Switch
                  id="profile-active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              {mode === "edit" ? "Speichern" : "Anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
