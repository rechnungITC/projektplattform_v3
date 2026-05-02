import { CheckCircle2, CircleSlash } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface Props {
  reason: "expired" | "revoked" | "completed" | "inactive"
  tenantName: string
  submittedAt?: string | null
}

export function ExpiredOrInvalidView({ reason, tenantName, submittedAt }: Props) {
  let heading: string
  let body: string
  const Icon = reason === "completed" ? CheckCircle2 : CircleSlash
  const iconClass =
    reason === "completed"
      ? "text-emerald-600"
      : "text-muted-foreground"

  switch (reason) {
    case "expired":
      heading = "Link abgelaufen"
      body =
        "Dieser Self-Assessment-Link ist nicht mehr gültig (14-Tage-Ablauf). " +
        "Bitte kontaktieren Sie den Projektmanager für einen neuen Link."
      break
    case "revoked":
      heading = "Einladung zurückgezogen"
      body =
        "Der Projektmanager hat diese Einladung zurückgezogen. Es ist keine " +
        "Aktion mehr nötig."
      break
    case "completed":
      heading = "Bereits abgegeben"
      body = submittedAt
        ? `Ihre Self-Assessment-Antwort wurde am ${new Date(submittedAt).toLocaleDateString(
            "de-DE",
          )} gespeichert. Vielen Dank.`
        : "Ihre Self-Assessment-Antwort wurde gespeichert. Vielen Dank."
      break
    case "inactive":
      heading = "Stakeholder nicht mehr im Projekt"
      body =
        "Der zugehörige Stakeholder wurde aus dem Projekt entfernt. " +
        "Es ist keine Aktion mehr nötig."
      break
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-4 p-4 sm:p-8">
      <Card className="w-full">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Icon className={`h-5 w-5 ${iconClass}`} aria-hidden />
          </div>
          <CardTitle>{heading}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {tenantName}
          </p>
          <p className="text-muted-foreground">{body}</p>
        </CardContent>
      </Card>
    </main>
  )
}
