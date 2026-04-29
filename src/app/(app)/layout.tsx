import { redirect } from "next/navigation"

import { TopNav } from "@/components/app/top-nav"
import { AuthProvider } from "@/hooks/use-auth"
import { loadServerAuth } from "@/lib/auth-helpers"
import { getOperationMode } from "@/lib/operation-mode"

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const snapshot = await loadServerAuth()

  if (!snapshot) {
    redirect("/login")
  }

  // No memberships yet → run through onboarding first.
  if (snapshot.memberships.length === 0) {
    redirect("/onboarding")
  }

  const operationMode = getOperationMode()

  // PROJ-17: expose tenant accent color as a CSS variable so future themed
  // UI can pick it up via `var(--color-brand-600)`. Server-rendered to
  // avoid the FOUC of a client-side update.
  const accentColor = snapshot.tenantConfig?.branding.accent_color ?? null
  const brandStyle =
    accentColor && /^#[0-9A-Fa-f]{6}$/.test(accentColor)
      ? ({ ["--color-brand-600" as string]: accentColor } as React.CSSProperties)
      : undefined

  return (
    <AuthProvider
      user={snapshot.user}
      initialProfile={snapshot.profile}
      initialMemberships={snapshot.memberships}
      initialTenantId={snapshot.initialTenantId}
      initialTenantConfig={snapshot.tenantConfig}
    >
      <div className="flex min-h-screen flex-col" style={brandStyle}>
        <TopNav operationMode={operationMode} />
        <main className="flex-1 bg-muted/20">{children}</main>
      </div>
    </AuthProvider>
  )
}
