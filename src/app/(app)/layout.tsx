import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { AppShell } from "@/components/app/app-shell"
import { AuthProvider } from "@/hooks/use-auth"
import { loadServerAuth } from "@/lib/auth-helpers"
import { normalizeHexColor, readableForeground } from "@/lib/brand-colors"
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

  // PROJ-17/51: expose tenant accent color as CSS variables so themed UI can
  // pick it up without a client-side flash. `--color-brand-600` stays for
  // backwards compatibility with earlier branded components.
  const accentColor = normalizeHexColor(
    snapshot.tenantConfig?.branding.accent_color
  )
  const brandStyle =
    accentColor
      ? ({
          ["--color-brand-600" as string]: accentColor,
          ["--brand-primary" as string]: accentColor,
          ["--brand-primary-foreground" as string]:
            readableForeground(accentColor),
          ["--brand-focus" as string]: accentColor,
        } as React.CSSProperties)
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
