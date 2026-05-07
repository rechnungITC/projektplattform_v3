import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { AppShell } from "@/components/app/app-shell"
import { AuthProvider } from "@/hooks/use-auth"
import { loadServerAuth } from "@/lib/auth-helpers"
import {
  hexToHslTriplet,
  pickBrandForeground,
} from "@/lib/branding/contrast"
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

  // PROJ-17: expose tenant accent color as `--color-brand-600` (legacy slot
  // consumed by `profile-radar-chart.tsx`).
  // PROJ-51-β.3: also expose the new Brand-Layer triplets so the Dark-Teal
  // theme can re-tone the gezielte Brand-Slots (`bg-brand-accent`,
  // `text-brand-accent-foreground`, `border-brand-nav-active`). Server-
  // rendered (no FOUC). Auto-foreground via WCAG-1.4 contrast picker.
  const accentColor = snapshot.tenantConfig?.branding.accent_color ?? null
  const accentTriplet = hexToHslTriplet(accentColor)
  const brandStyle: React.CSSProperties | undefined = accentTriplet
    ? ({
        ["--color-brand-600" as string]: accentColor!,
        ["--brand-accent" as string]: accentTriplet,
        ["--brand-accent-foreground" as string]:
          pickBrandForeground(accentColor) === "white" ? "0 0% 100%" : "0 0% 0%",
        ["--brand-nav-active" as string]: accentTriplet,
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
