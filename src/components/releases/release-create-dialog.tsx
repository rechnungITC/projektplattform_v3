"use client"

import { Loader2, Plus } from "lucide-react"
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
import { Textarea } from "@/components/ui/textarea"
import type { ProjectRelease, ReleaseWritePayload } from "@/types/release"

interface ReleaseCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (payload: ReleaseWritePayload) => Promise<ProjectRelease>
  onCreated: (release: ProjectRelease) => void
}

const INITIAL_FORM = {
  name: "",
  description: "",
  start_date: "",
  end_date: "",
}

export function ReleaseCreateDialog({
  open,
  onOpenChange,
  onCreate,
  onCreated,
}: ReleaseCreateDialogProps) {
  const [form, setForm] = React.useState(INITIAL_FORM)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  function reset() {
    setForm(INITIAL_FORM)
    setError(null)
    setSubmitting(false)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) reset()
    onOpenChange(nextOpen)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const release = await onCreate({
        name: form.name,
        description: form.description.trim() || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        status: "planned",
      })
      onCreated(release)
      reset()
      onOpenChange(false)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Release konnte nicht angelegt werden."
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neuer Release</DialogTitle>
          <DialogDescription>
            Lege einen Release-Container mit Zielzeitraum an.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="release-name">Name</Label>
            <Input
              id="release-name"
              value={form.name}
              maxLength={160}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              required
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="release-start">Start</Label>
              <Input
                id="release-start"
                type="date"
                value={form.start_date}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    start_date: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="release-end">Ende</Label>
              <Input
                id="release-end"
                type="date"
                value={form.end_date}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    end_date: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="release-description">Beschreibung</Label>
            <Textarea
              id="release-description"
              value={form.description}
              maxLength={5000}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={submitting || !form.name.trim()}>
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="mr-2 h-4 w-4" aria-hidden />
              )}
              Anlegen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
