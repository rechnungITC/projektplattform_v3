import { CircleSlash } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { APPROVAL_STATUS_LABELS } from "@/types/decision-approval"

interface Props {
  reason: "expired" | "withdrawn" | "approved" | "rejected"
  decisionTitle: string
}

export function ExpiredOrInvalidView({ reason, decisionTitle }: Props) {
  let heading: string
  let body: string

  switch (reason) {
    case "expired":
      heading = "Link abgelaufen"
      body =
        "Dieser Genehmigungs-Link ist nicht mehr gültig (7-Tage-Ablauf). " +
        "Bitte kontaktieren Sie den Projektmanager für einen neuen Link."
      break
    case "withdrawn":
      heading = "Entscheidung zurückgezogen"
      body =
        "Der Projektmanager hat diese Entscheidung zurückgezogen. " +
        "Es ist keine Aktion mehr nötig."
      break
    case "approved":
    case "rejected":
      heading = `Bereits ${APPROVAL_STATUS_LABELS[reason].toLowerCase()}`
      body =
        "Das Quorum wurde bereits erreicht — Ihre Antwort wird nicht mehr " +
        "benötigt. Vielen Dank für Ihre Mühe."
      break
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-4 p-4 sm:p-8">
      <Card className="w-full">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <CircleSlash className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <CardTitle>{heading}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            <strong>Entscheidung:</strong> {decisionTitle}
          </p>
          <p className="text-muted-foreground">{body}</p>
        </CardContent>
      </Card>
    </main>
  )
}
