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

  return (
    <AuthProvider
      user={snapshot.user}
      initialProfile={snapshot.profile}
      initialMemberships={snapshot.memberships}
      initialTenantId={snapshot.initialTenantId}
      initialTenantConfig={snapshot.tenantConfig}
    >
      <div className="flex min-h-screen flex-col">
        <TopNav operationMode={operationMode} />
        <main className="flex-1 bg-muted/20">{children}</main>
      </div>
    </AuthProvider>
  )
}
