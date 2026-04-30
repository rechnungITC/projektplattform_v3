"use client"

import { Plus, Star, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useVendorEvaluations } from "@/hooks/use-vendor-evaluations"
import { cn } from "@/lib/utils"

interface VendorEvaluationsTabProps {
  vendorId: string
}

const DATE_FMT = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" })

function ScoreBadge({ score }: { score: number }) {
  const className = cn(
    "gap-1",
    score >= 4
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : score === 3
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
        : "bg-destructive/15 text-destructive"
  )
  return (
    <Badge variant="outline" className={className}>
      <Star className="h-3 w-3" aria-hidden />
      {score} / 5
    </Badge>
  )
}

export function VendorEvaluationsTab({ vendorId }: VendorEvaluationsTabProps) {
  const { evaluations, loading, error, add, remove } = useVendorEvaluations(vendorId)

  const [criterion, setCriterion] = React.useState("")
  const [score, setScore] = React.useState("3")
  const [comment, setComment] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  const avg = React.useMemo(() => {
    if (evaluations.length === 0) return null
    const sum = evaluations.reduce((acc, e) => acc + e.score, 0)
    return Number((sum / evaluations.length).toFixed(2))
  }, [evaluations])

  async function onAdd() {
    const parsed = Number.parseInt(score, 10)
    if (!criterion.trim()) {
      toast.error("Kriterium ist erforderlich.")
      return
    }
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 5) {
      toast.error("Score muss zwischen 1 und 5 liegen.")
      return
    }
    setSubmitting(true)
    try {
      await add({
        criterion: criterion.trim(),
        score: parsed,
        comment: comment.trim() || null,
      })
      toast.success("Bewertung angelegt")
      setCriterion("")
      setScore("3")
      setComment("")
    } catch (err) {
      toast.error("Anlegen fehlgeschlagen", {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function onRemove(id: string) {
    if (!window.confirm("Bewertung wirklich löschen?")) return
    try {
      await remove(id)
      toast.success("Bewertung gelöscht")
    } catch (err) {
      toast.error("Löschen fehlgeschlagen", {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  return (
    <div className="space-y-4">
      {avg !== null ? (
        <div className="flex items-center gap-2 rounded-md border p-3 text-sm">
          <span className="font-medium">Durchschnittsscore:</span>
          <ScoreBadge score={Math.round(avg)} />
          <span className="text-muted-foreground">
            ({avg} aus {evaluations.length} Bewertung{evaluations.length === 1 ? "" : "en"})
          </span>
        </div>
      ) : null}

      <div className="rounded-md border p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Neue Bewertung
        </p>
        <div className="grid gap-2 sm:grid-cols-[1fr_80px]">
          <div>
            <Label htmlFor="ve_criterion">Kriterium</Label>
            <Input
              id="ve_criterion"
              value={criterion}
              onChange={(e) => setCriterion(e.target.value)}
              maxLength={200}
              placeholder="z. B. Liefertreue, Preis, Qualität"
            />
          </div>
          <div>
            <Label htmlFor="ve_score">Score (1-5)</Label>
            <Input
              id="ve_score"
              type="number"
              min={1}
              max={5}
              value={score}
              onChange={(e) => setScore(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-2">
          <Label htmlFor="ve_comment">Kommentar (optional)</Label>
          <Textarea
            id="ve_comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={2000}
            rows={2}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={() => void onAdd()}
            disabled={submitting}
          >
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
            Bewertung hinzufügen
          </Button>
        </div>
      </div>

      {loading && evaluations.length === 0 ? (
        <p className="text-sm text-muted-foreground">Lade Bewertungen …</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : evaluations.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine Bewertungen.
        </p>
      ) : (
        <ul className="space-y-2">
          {evaluations.map((e) => (
            <li
              key={e.id}
              className="rounded-md border bg-card p-3 text-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{e.criterion}</p>
                    <ScoreBadge score={e.score} />
                  </div>
                  {e.comment ? (
                    <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                      {e.comment}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {DATE_FMT.format(new Date(e.created_at))}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void onRemove(e.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
