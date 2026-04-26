import type { Metadata } from "next"

import { SettingsTabs } from "./settings-tabs"

export const metadata: Metadata = {
  title: "Settings · Projektplattform",
}

export default function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage your profile, workspace, and team.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <aside className="md:sticky md:top-20 md:self-start">
          <SettingsTabs />
        </aside>
        <section>{children}</section>
      </div>
    </div>
  )
}
