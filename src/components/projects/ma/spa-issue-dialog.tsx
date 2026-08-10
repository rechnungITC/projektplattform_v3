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
import { ExternalLinksSection } from "@/components/projects/ma/external-links-section"
import {
  SPA_CONFIDENTIALITY_LABEL,
  SPA_ISSUE_CATEGORY_LABEL,
  SPA_ISSUE_IMPORTANCE_LABEL,
  SPA_ISSUE_STATUS_LABEL,
  spaIssueRef,
} from "@/components/projects/ma/spa-issue-labels"
import {
  createSpaIssue,
  updateSpaIssue,
  type SpaConfidentialityLevel,
  type SpaIssue,
  type SpaIssueCategory,
  type SpaIssueImportance,
} from "@/lib/ma-project/spa-issues-api"

const CATEGORIES: SpaIssueCategory[] = [
  "warranty",
  "indemnity",
  "purchase_price",
  "liability",
  "condition",
  "other",
]
const IMPORTANCES: SpaIssueImportance[] = [
  "niedrig",
  "mittel",
  "hoch",
  "kritisch",
]
const LEVELS: SpaConfidentialityLevel[] = ["standard", "confidential", "strict"]

interface SpaIssueDialogProps {
  projectId: string
  /** null = create mode */
  issue: SpaIssue | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

// PROJ-122 — create/edit a contract negotiation point.
//
// New issues are preselected as "Vertraulich" (AC-122-H5): SPA positions are
// inner-circle material by default, while the DB default stays 'standard' so a
// user without clearance never writes a row they cannot read back.
export function SpaIssueDialog({
  projectId,
  issue,
  open,
  onOpenChange,
  onSaved,
}: SpaIssueDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {/* Keyed remount instead of a reset-effect: opening the dialog for a
            different issue produces a fresh form with fresh initial state,
            which is both simpler and free of setState-in-effect. */}
        {open && (
          <SpaIssueForm
            key={issue?.id ?? "new"}
            projectId={projectId}
            issue={issue}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function SpaIssueForm({
  projectId,
  issue,
  onOpenChange,
  onSaved,
}: Omit<SpaIssueDialogProps, "open">) {
  const isEdit = issue !== null

  const [title, setTitle] = React.useState(issue?.title ?? "")
  const [clause, setClause] = React.useState(issue?.clause_reference ?? "")
  const [category, setCategory] = React.useState<SpaIssueCategory>(
    issue?.category ?? "other"
  )
  const [ownPos, setOwnPos] = React.useState(issue?.own_position ?? "")
  const [counterPos, setCounterPos] = React.useState(
    issue?.counterparty_position ?? ""
  )
  const [solution, setSolution] = React.useState(
    issue?.recommended_solution ?? ""
  )
  const [riskText, setRiskText] = React.useState(
    issue?.risk_if_no_agreement ?? ""
  )
  const [importance, setImportance] = React.useState<SpaIssueImportance>(
    issue?.importance ?? "mittel"
  )
  const [dueDate, setDueDate] = React.useState(issue?.due_date ?? "")
  // New issues default to "Vertraulich" (AC-122-H5).
  const [level, setLevel] = React.useState<SpaConfidentialityLevel>(
    issue?.confidentiality_level ?? "confidential"
  )
  const [busy, setBusy] = React.useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (title.trim().length === 0) {
      toast.error("Bitte einen Titel angeben.")
      return
    }
    setBusy(true)
    try {
      if (isEdit && issue) {
        await updateSpaIssue(projectId, issue.id, {
          title: title.trim(),
          // '' = explicit clear, undefined/absent = keep (see
          // 20260807111000_proj122_spa_issue_clear_semantics.sql).
          clause_reference: clause.trim(),
          category,
          own_position: ownPos.trim(),
          counterparty_position: counterPos.trim(),
          recommended_solution: solution.trim(),
          risk_if_no_agreement: riskText.trim(),
          importance,
          due_date: dueDate || null,
          confidentiality_level: level,
        })
        toast.success("Verhandlungspunkt aktualisiert.")
      } else {
        await createSpaIssue(projectId, {
          title: title.trim(),
          clause_reference: clause.trim() || null,
          category,
          own_position: ownPos.trim() || null,
          counterparty_position: counterPos.trim() || null,
          recommended_solution: solution.trim() || null,
          risk_if_no_agreement: riskText.trim() || null,
          importance,
          due_date: dueDate || null,
          confidentiality_level: level,
        })
        toast.success("Verhandlungspunkt angelegt.")
      }
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Speichern fehlgeschlagen."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
        <DialogHeader>
          <DialogTitle>
            {isEdit && issue
              ? `${spaIssueRef(issue)} bearbeiten`
              : "Verhandlungspunkt anlegen"}
          </DialogTitle>
          <DialogDescription>
            Positionen beider Seiten, Verhandlungsstand und empfohlene Lösung.
            Der Vertragstext selbst wird außerhalb der Plattform redigiert.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="spa-title">Titel</Label>
              <Input
                id="spa-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="z. B. Garantiekatalog / Verjährung"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="spa-clause">Klauselbezug</Label>
              <Input
                id="spa-clause"
                value={clause}
                onChange={(e) => setClause(e.target.value)}
                maxLength={200}
                placeholder="z. B. § 8.2 Garantien"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="spa-category">Kategorie</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as SpaIssueCategory)}
              >
                <SelectTrigger id="spa-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {SPA_ISSUE_CATEGORY_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="spa-own">Eigene Position</Label>
              <Textarea
                id="spa-own"
                value={ownPos}
                onChange={(e) => setOwnPos(e.target.value)}
                rows={3}
                placeholder="Unsere Position …"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="spa-counter">Gegenposition</Label>
              <Textarea
                id="spa-counter"
                value={counterPos}
                onChange={(e) => setCounterPos(e.target.value)}
                rows={3}
                placeholder="Position der Gegenseite …"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="spa-solution">Empfohlene Lösung</Label>
              <Textarea
                id="spa-solution"
                value={solution}
                onChange={(e) => setSolution(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="spa-risk">Risiko bei Nichteinigung</Label>
              <Textarea
                id="spa-risk"
                value={riskText}
                onChange={(e) => setRiskText(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="spa-importance">Wichtigkeit</Label>
              <Select
                value={importance}
                onValueChange={(v) => setImportance(v as SpaIssueImportance)}
              >
                <SelectTrigger id="spa-importance">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMPORTANCES.map((i) => (
                    <SelectItem key={i} value={i}>
                      {SPA_ISSUE_IMPORTANCE_LABEL[i]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="spa-due">Frist</Label>
              <Input
                id="spa-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="spa-level">Vertraulichkeit</Label>
              <Select
                value={level}
                onValueChange={(v) => setLevel(v as SpaConfidentialityLevel)}
              >
                <SelectTrigger id="spa-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEVELS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {SPA_CONFIDENTIALITY_LABEL[l]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Nur Personen mit passender Freigabe sehen den Punkt. Eine Stufe
                über der eigenen Freigabe kann nicht gesetzt werden.
              </p>
            </div>
          </div>

          {isEdit && issue && (
            <div className="space-y-1.5 border-t pt-4">
              <Label>Status</Label>
              <p className="text-xs text-muted-foreground">
                Aktuell:{" "}
                <span className="font-medium">
                  {SPA_ISSUE_STATUS_LABEL[issue.status]}
                </span>{" "}
                — Statuswechsel erfolgt über die Liste, damit jeder Wechsel
                einzeln protokolliert wird.
              </p>
            </div>
          )}

          {isEdit && issue && (
            <div className="border-t pt-4">
              <ExternalLinksSection
                projectId={projectId}
                entityType="spa_issue"
                entityId={issue.id}
                canEdit
                compact
              />
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Speichert …" : isEdit ? "Speichern" : "Anlegen"}
            </Button>
          </DialogFooter>
        </form>
    </>
  )
}
