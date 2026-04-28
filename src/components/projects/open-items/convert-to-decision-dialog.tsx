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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ConvertToDecisionInput } from "@/lib/open-items/api"
import type { OpenItem } from "@/types/open-item"

interface ConvertToDecisionDialogProps {
  openItem: OpenItem | null
  submitting: boolean
  onConfirm: (input: ConvertToDecisionInput) => Promise<void>
  onCancel: () => void
}

export function ConvertToDecisionDialog({
  openItem,
  submitting,
  onConfirm,
  onCancel,
}: ConvertToDecisionDialogProps) {
  const [decisionText, setDecisionText] = React.useState("")
  const [rationale, setRationale] = React.useState("")

  React.useEffect(() => {
    if (openItem) {
      setDecisionText("")
      setRationale("")
    }
  }, [openItem])

  return (
    <Dialog
      open={openItem !== null}
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>In Entscheidung umwandeln</DialogTitle>
          <DialogDescription>
            {openItem ? (
              <>
                Aus dem Offenen Punkt „{openItem.title}“ wird eine
                Entscheidung. Der Punkt wird auf <em>umgewandelt</em> gesetzt
                und kann nicht mehr verändert werden.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="convert-decision-text">Entscheidung</Label>
            <Textarea
              id="convert-decision-text"
              rows={4}
              value={decisionText}
              onChange={(e) => setDecisionText(e.target.value)}
              placeholder="Was wurde entschieden?"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="convert-rationale">Begründung (optional)</Label>
            <Textarea
              id="convert-rationale"
              rows={3}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Warum so?"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={submitting}
          >
            Abbrechen
          </Button>
          <Button
            type="button"
            onClick={() =>
              void onConfirm({
                decision_text: decisionText.trim(),
                rationale: rationale.trim() || null,
              })
            }
            disabled={submitting || decisionText.trim().length === 0}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Umwandeln …
              </>
            ) : (
              "Umwandeln"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
