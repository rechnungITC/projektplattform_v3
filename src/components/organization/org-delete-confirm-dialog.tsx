"use client"

import { Loader2, Trash2, TriangleAlert } from "lucide-react"
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
import type {
  OrganizationDependencyBlocker,
  OrganizationUnit,
} from "@/types/organization"

interface OrgDeleteConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  unit: OrganizationUnit | null
  onConfirm: (id: string) => Promise<void>
}

const BLOCKER_LABELS: Record<OrganizationDependencyBlocker["kind"], string> = {
  children: "Untereinheiten",
  stakeholders: "Stakeholder",
  resources: "Ressourcen",
  tenant_members: "Tenant-Mitglieder",
  locations: "Standort-Verweise",
}

export function OrgDeleteConfirmDialog({
  open,
  onOpenChange,
  unit,
  onConfirm,
}: OrgDeleteConfirmDialogProps) {
  const [submitting, setSubmitting] = React.useState(false)
  const [blockers, setBlockers] = React.useState<
    OrganizationDependencyBlocker[]
  >([])

  React.useEffect(() => {
    if (!open) {
      setBlockers([])
      setSubmitting(false)
    }
  }, [open])

  if (!unit) return null

  async function handle() {
    if (!unit) return
    setSubmitting(true)
    try {
      await onConfirm(unit.id)
      toast.success(`"${unit.name}" gelöscht.`)
      onOpenChange(false)
    } catch (err) {
      const e = err as Error & {
        code?: string
        blockers?: OrganizationDependencyBlocker[]
      }
      if (e.code === "has_dependencies" && e.blockers) {
        setBlockers(e.blockers)
      } else {
        toast.error(e.message ?? "Löschen fehlgeschlagen.")
        onOpenChange(false)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Organisationseinheit löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium">{unit.name}</span> wird endgültig
            entfernt. Diese Aktion ist nicht umkehrbar.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {blockers.length > 0 ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium text-destructive">
              <TriangleAlert className="h-4 w-4" aria-hidden />
              Löschen blockiert
            </div>
            <p className="mt-1 text-muted-foreground">
              Diese Einheit hat Verknüpfungen, die zuerst entfernt oder
              verschoben werden müssen:
            </p>
            <ul className="mt-2 space-y-1.5">
              {blockers.map((b) => (
                <li key={b.kind}>
                  <span className="font-medium">{b.count}</span>{" "}
                  {BLOCKER_LABELS[b.kind]}
                  {b.sample.length > 0 ? (
                    <span className="text-xs text-muted-foreground">
                      {" "}
                      — z.B. {b.sample.slice(0, 3).join(", ")}
                      {b.sample.length > 3 ? " …" : ""}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              void handle()
            }}
            disabled={submitting || blockers.length > 0}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" aria-hidden />
            )}
            Löschen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
