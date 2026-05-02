import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound } from "next/navigation"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ApprovalTokenPayload } from "@/types/decision-approval"

import { ApproveForm } from "./approve-form"
import { ExpiredOrInvalidView } from "./expired-or-invalid-view"

export const metadata: Metadata = {
  title: "Genehmigung · Projektplattform",
  robots: { index: false, follow: false },
}

interface PageProps {
  params: Promise<{ token: string }>
}

async function resolveBaseURL(): Promise<string> {
  // Prefer the explicit env var (set in Vercel for production).
  const explicit = process.env.NEXT_PUBLIC_BASE_URL
  if (explicit) return explicit.replace(/\/$/, "")
  // Vercel auto-injects VERCEL_URL on every deployment (no scheme).
  const vercel = process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`
  // Fall back to the request's own host header (covers the local dev
  // server and any other deploy target).
  const h = await headers()
  const host = h.get("host")
  const proto = h.get("x-forwarded-proto") ?? "http"
  if (host) return `${proto}://${host}`
  return "http://localhost:3000"
}

async function fetchPayload(
  token: string,
): Promise<ApprovalTokenPayload | null> {
  const baseURL = await resolveBaseURL()
  const response = await fetch(
    `${baseURL}/api/approve/${encodeURIComponent(token)}`,
    { method: "GET", cache: "no-store" },
  )
  if (response.status === 404 || response.status === 410) return null
  if (!response.ok) return null
  const body = (await response.json()) as { payload: ApprovalTokenPayload }
  return body.payload
}

export default async function PublicApprovePage({ params }: PageProps) {
  const { token } = await params
  const payload = await fetchPayload(token)

  if (!payload) {
    notFound()
  }

  if (payload.expired) {
    return (
      <ExpiredOrInvalidView
        reason="expired"
        decisionTitle={payload.decision.title}
      />
    )
  }

  if (
    payload.state.status === "withdrawn" ||
    payload.state.status === "approved" ||
    payload.state.status === "rejected"
  ) {
    return (
      <ExpiredOrInvalidView
        reason={payload.state.status}
        decisionTitle={payload.decision.title}
      />
    )
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-4 sm:p-8">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Genehmigungs-Anfrage
        </p>
        <h1 className="text-2xl font-semibold">{payload.decision.title}</h1>
        <p className="text-sm text-muted-foreground">
          Sie wurden als Approver für diese Entscheidung nominiert. Bitte
          stimmen Sie zu oder lehnen Sie ab. Sie müssen sich nicht einloggen.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entscheidung</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="whitespace-pre-wrap">{payload.decision.decision_text}</p>
          {payload.decision.rationale && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Begründung
              </p>
              <p className="whitespace-pre-wrap">{payload.decision.rationale}</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Entschieden am{" "}
            {new Date(payload.decision.decided_at).toLocaleDateString("de-DE")}
            {" · "}
            Quorum: {payload.state.quorum_required} Zustimmungen erforderlich
            {" · "}
            Bisher: {payload.state.quorum_received_approvals} zugestimmt,{" "}
            {payload.state.quorum_received_rejections} abgelehnt
          </p>
        </CardContent>
      </Card>

      <ApproveForm
        token={token}
        approverName={payload.approver.stakeholder_name}
        alreadyResponded={payload.alreadyResponded}
      />
    </main>
  )
}
