import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { AppShell } from "@/components/app/app-shell"
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

  // PROJ-17: expose tenant accent color as a CSS variable so themed UI can
  // pick it up via `var(--color-brand-600)`. Server-rendered to avoid the
  // FOUC of a client-side update.
  const accentColor = snapshot.tenantConfig?.branding.accent_color ?? null
  const brandStyle =
    accentColor && /^#[0-9A-Fa-f]{6}$/.test(accentColor)
      ? ({ ["--color-brand-600" as string]: accentColor } as React.CSSProperties)
      : undefined

  // PROJ-23: read sidebar persistence cookies server-side so the initial
  // render doesn't flash a wrong-state sidebar.
  const cookieStore = await cookies()
  const globalSidebarCookie = cookieStore.get("sidebar_state")?.value
  // shadcn-Sidebar uses 'true' / 'false' for the cookie value. Default = expanded.
  const globalSidebarOpen = globalSidebarCookie !== "false"
  const projectSidebarMode =
    cookieStore.get("sidebar.project.mode")?.value === "collapsed"
      ? "collapsed"
      : "expanded"

  return (
    <AuthProvider
      user={snapshot.user}
      initialProfile={snapshot.profile}
      initialMemberships={snapshot.memberships}
      initialTenantId={snapshot.initialTenantId}
      initialTenantConfig={snapshot.tenantConfig}
    >
      <div style={brandStyle}>
        <AppShell
          globalSidebarOpen={globalSidebarOpen}
          projectSidebarMode={projectSidebarMode}
          operationMode={operationMode}
        >
          {children}
        </AppShell>
      </div>
    </AuthProvider>
  )
}
