"use client"

import { Check, Loader2, Pencil, X } from "lucide-react"
import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import type {
  AssistantDialogState,
  ProjectDialogSlot,
  ProjectDialogState,
} from "@/lib/assistant/dialog-state"
import { PROJECT_METHOD_LABELS, PROJECT_METHODS } from "@/types/project-method"
import { PROJECT_TYPE_LABELS, PROJECT_TYPES } from "@/types/project"

interface ProjectChoice {
  id: string
  name: string
  lifecycle_status: string
}

interface AssistantDialogControlsProps {
  dialogState: AssistantDialogState
  projectChoices: ProjectChoice[]
  busy: boolean
  onProjectChoice: (projectId: string) => void
  onApproveProject: () => void
  onCorrectProjectField: (field: ProjectDialogSlot, value: string) => void
  onCancel: () => void
}

const SLOT_LABELS: Record<ProjectDialogSlot, string> = {
  name: "Name",
  project_type: "Projekttyp",
  project_method: "Methode",
  description: "Kurzbeschreibung",
}

export function AssistantDialogControls({
  dialogState,
  projectChoices,
  busy,
  onProjectChoice,
  onApproveProject,
  onCorrectProjectField,
  onCancel,
}: AssistantDialogControlsProps) {
  if (
    dialogState.pending_intent === "work_item_create_draft" &&
    dialogState.phase === "choosing_project"
  ) {
    return (
      <div className="mt-3 space-y-2" aria-label="Projekt auswählen">
        {projectChoices.map((choice) => (
          <Button
            key={choice.id}
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-start"
            disabled={busy}
            onClick={() => onProjectChoice(choice.id)}
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            {choice.name}
          </Button>
        ))}
        <CancelButton busy={busy} onCancel={onCancel} />
      </div>
    )
  }

  if (
    dialogState.pending_intent === "project_create_draft" &&
    dialogState.phase === "reviewing"
  ) {
    return (
      <ProjectSummaryCard
        state={dialogState}
        busy={busy}
        onApprove={onApproveProject}
        onCorrect={onCorrectProjectField}
        onCancel={onCancel}
      />
    )
  }

  return (
    <div className="mt-3">
      <CancelButton busy={busy} onCancel={onCancel} />
    </div>
  )
}

function ProjectSummaryCard({
  state,
  busy,
  onApprove,
  onCorrect,
  onCancel,
}: {
  state: ProjectDialogState
  busy: boolean
  onApprove: () => void
  onCorrect: (field: ProjectDialogSlot, value: string) => void
  onCancel: () => void
}) {
  const [editing, setEditing] = React.useState<ProjectDialogSlot | null>(null)
  const [value, setValue] = React.useState("")

  const rows: Array<{ field: ProjectDialogSlot; value: string }> = [
    { field: "name", value: state.slots.name ?? "Nicht angegeben" },
    {
      field: "project_type",
      value: state.slots.project_type
        ? PROJECT_TYPE_LABELS[state.slots.project_type]
        : "Noch offen",
    },
    {
      field: "project_method",
      value: state.slots.project_method
        ? PROJECT_METHOD_LABELS[state.slots.project_method]
        : "Noch offen",
    },
    {
      field: "description",
      value: state.slots.description || "Noch offen",
    },
  ]

  function beginEdit(field: ProjectDialogSlot) {
    setEditing(field)
    if (field === "name") setValue(state.slots.name ?? "")
    if (field === "project_type") setValue(state.slots.project_type ?? "")
    if (field === "project_method") setValue(state.slots.project_method ?? "")
    if (field === "description") setValue(state.slots.description ?? "")
  }

  function saveEdit() {
    if (!editing) return
    const correctedValue = value || (editing === "name" ? "" : "überspringen")
    onCorrect(editing, correctedValue)
    setEditing(null)
  }

  return (
    <Card
      role="region"
      className="mt-3 bg-muted/20"
      aria-label="Projektentwurf prüfen"
    >
      <CardHeader className="space-y-2 p-3 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm">Projektentwurf prüfen</CardTitle>
          <Badge variant="secondary">Noch nicht angelegt</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Erst deine Freigabe erstellt einen Wizard-Entwurf. Das Projekt selbst
          wird weiterhin im Wizard angelegt.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 p-3 pt-1">
        <dl className="space-y-2">
          {rows.map((row) => (
            <div key={row.field} className="rounded-md border bg-background p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <dt className="text-xs font-medium text-muted-foreground">
                    {SLOT_LABELS[row.field]}
                  </dt>
                  <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm">
                    {row.value}
                  </dd>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 px-2"
                  disabled={busy}
                  onClick={() => beginEdit(row.field)}
                  aria-label={`${SLOT_LABELS[row.field]} ändern`}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
              {editing === row.field ? (
                <div className="mt-2 space-y-2 border-t pt-2">
                  <CorrectionField field={row.field} value={value} onChange={setValue} />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy || (row.field === "name" && value.trim().length === 0)}
                      onClick={saveEdit}
                    >
                      <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      Übernehmen
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setEditing(null)}
                    >
                      Schließen
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={onApprove}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Check className="mr-2 h-4 w-4" aria-hidden />
            )}
            Wizard-Entwurf vorbereiten
          </Button>
          <CancelButton busy={busy} onCancel={onCancel} />
        </div>
      </CardContent>
    </Card>
  )
}

function CorrectionField({
  field,
  value,
  onChange,
}: {
  field: ProjectDialogSlot
  value: string
  onChange: (value: string) => void
}) {
  const label = `${SLOT_LABELS[field]} korrigieren`
  if (field === "project_type") {
    return (
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <Select value={value || "skip"} onValueChange={(next) => onChange(next === "skip" ? "" : next)}>
          <SelectTrigger aria-label={label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="skip">Noch offen</SelectItem>
            {PROJECT_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {PROJECT_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }
  if (field === "project_method") {
    return (
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <Select value={value || "skip"} onValueChange={(next) => onChange(next === "skip" ? "" : next)}>
          <SelectTrigger aria-label={label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="skip">Noch offen</SelectItem>
            {PROJECT_METHODS.map((method) => (
              <SelectItem key={method} value={method}>
                {PROJECT_METHOD_LABELS[method]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }
  if (field === "description") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor="assistant-project-description">{label}</Label>
        <Textarea
          id="assistant-project-description"
          value={value}
          rows={3}
          maxLength={5000}
          className="resize-none"
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor="assistant-project-name">{label}</Label>
      <Input
        id="assistant-project-name"
        value={value}
        maxLength={255}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function CancelButton({ busy, onCancel }: { busy: boolean; onCancel: () => void }) {
  return (
    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
      <X className="mr-2 h-4 w-4" aria-hidden />
      Auftrag abbrechen
    </Button>
  )
}
