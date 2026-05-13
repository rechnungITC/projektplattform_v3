"use client"

import { Loader2, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

interface ImportCommitModalProps {
  disabled: boolean
  importing: boolean
  rowCount: number
  onConfirm: () => Promise<void>
}

export function ImportCommitModal({
  disabled,
  importing,
  rowCount,
  onConfirm,
}: ImportCommitModalProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          {importing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Upload className="mr-2 h-4 w-4" aria-hidden />
          )}
          Importieren
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import bestätigen</DialogTitle>
          <DialogDescription>
            {rowCount} Zeilen werden in die Organisationsdaten geschrieben.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => void onConfirm()} disabled={importing}>
            {importing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            Fortfahren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
