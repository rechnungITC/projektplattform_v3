"use client"

import { RotateCcw } from "lucide-react"
import * as React from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { OrganizationImport } from "@/types/organization-import"

interface ImportHistoryListProps {
  imports: OrganizationImport[]
  loading: boolean
  onOpenPreview: (id: string) => void
  onRollback: (id: string) => Promise<void>
}

export function ImportHistoryList({
  imports,
  loading,
  onOpenPreview,
  onRollback,
}: ImportHistoryListProps) {
  const [rollingBackId, setRollingBackId] = React.useState<string | null>(null)

  async function handleRollback(id: string) {
    setRollingBackId(id)
    try {
      await onRollback(id)
    } finally {
      setRollingBackId(null)
    }
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Datei</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Layout</TableHead>
            <TableHead className="hidden lg:table-cell">Zeilen</TableHead>
            <TableHead className="w-[180px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-sm">
                Lädt…
              </TableCell>
            </TableRow>
          ) : imports.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={5}
                className="py-8 text-center text-sm text-muted-foreground"
              >
                Keine Imports.
              </TableCell>
            </TableRow>
          ) : (
            imports.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{item.original_filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.uploaded_at).toLocaleString("de-DE")}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={item.status} />
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs">
                  {item.layout}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-xs">
                  {item.row_count_imported}/{item.row_count_total}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenPreview(item.id)}
                    >
                      Vorschau
                    </Button>
                    {item.status === "committed" ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={rollingBackId === item.id}
                          >
                            <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
                            Zurück
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Import zurücksetzen?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Importierte Org-Knoten und Standorte dieses
                              Imports werden gelöscht.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => void handleRollback(item.id)}
                            >
                              Zurücksetzen
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

function StatusBadge({ status }: { status: OrganizationImport["status"] }) {
  const className =
    status === "committed"
      ? "border-emerald-300 text-emerald-700"
      : status === "failed"
        ? "border-destructive text-destructive"
        : "border-muted-foreground/40 text-muted-foreground"
  return (
    <Badge variant="outline" className={className}>
      {status}
    </Badge>
  )
}
