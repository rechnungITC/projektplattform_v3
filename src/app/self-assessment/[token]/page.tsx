import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound } from "next/navigation"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import { ExpiredOrInvalidView } from "./expired-or-invalid-view"
import { SelfAssessmentForm } from "./self-assessment-form"

export const metadata: Metadata = {
  title: "Self-Assessment · Projektplattform",
  robots: { index: false, follow: false },
}

interface PageProps {
  params: Promise<{ token: string }>
}

interface InvitePayload {
  invite: {
    id: string
    status: "pending" | "completed" | "revoked" | "expired"
    expires_at: string | null
    submitted_at: string | null
  }
  stakeholder: {
    first_name: string
    is_active: boolean
  }
  tenant: {
    name: string
  }
}

async function resolveBaseURL(): Promise<string> {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL
  if (explicit) return explicit.replace(/\/$/, "")
  const vercel = process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`
  const h = await headers()
  const host = h.get("host")
  const proto = h.get("x-forwarded-proto") ?? "http"
  if (host) return `${proto}://${host}`
  return "http://localhost:3000"
}

async function fetchPayload(
  token: string,
): Promise<
  | { kind: "ok"; data: InvitePayload }
  | { kind: "not_found" }
  | { kind: "expired" }
> {
  const baseURL = await resolveBaseURL()
  const response = await fetch(
    `${baseURL}/api/self-assessment/${encodeURIComponent(token)}`,
    { method: "GET", cache: "no-store" },
  )
  if (response.status === 410) return { kind: "expired" }
  if (response.status === 404) return { kind: "not_found" }
  if (!response.ok) return { kind: "not_found" }
  const body = (await response.json()) as { payload: InvitePayload }
  return { kind: "ok", data: body.payload }
}

export default async function PublicSelfAssessmentPage({ params }: PageProps) {
  const { token } = await params
  const result = await fetchPayload(token)

  if (result.kind === "not_found") {
    notFound()
  }

  if (result.kind === "expired") {
    return <ExpiredOrInvalidView reason="expired" tenantName="Projektplattform" />
  }

  const { invite, stakeholder, tenant } = result.data

  if (!stakeholder.is_active) {
    return <ExpiredOrInvalidView reason="inactive" tenantName={tenant.name} />
  }
  if (invite.status === "revoked") {
    return <ExpiredOrInvalidView reason="revoked" tenantName={tenant.name} />
  }
  if (invite.status === "expired") {
    return <ExpiredOrInvalidView reason="expired" tenantName={tenant.name} />
  }
  if (invite.status === "completed") {
    return (
      <ExpiredOrInvalidView
        reason="completed"
        tenantName={tenant.name}
        submittedAt={invite.submitted_at}
      />
    )
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-4 sm:p-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {tenant.name} · Self-Assessment
        </p>
        <h1 className="text-2xl font-semibold">
          Hallo {stakeholder.first_name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Bitte schätzen Sie sich selbst auf zehn Dimensionen ein. Die
          Erhebung dient ausschließlich der Projektzusammenarbeit.
          Sie müssen sich nicht einloggen — dieser Link ist für Sie reserviert
          und 14 Tage gültig.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">So funktioniert die Skala</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Jede Dimension hat einen Schieberegler von 0 (sehr gering ausgeprägt)
            bis 100 (sehr stark ausgeprägt). Wenn Sie sich nicht einschätzen
            können, lassen Sie den Wert leer — das ist ausdrücklich erlaubt.
          </p>
          <p>
            Sobald Sie speichern, ist Ihre Antwort endgültig. Mehrfaches Klicken
            hat keine zusätzliche Wirkung.
          </p>
        </CardContent>
      </Card>

      <SelfAssessmentForm token={token} firstName={stakeholder.first_name} />
    </main>
  )
}
