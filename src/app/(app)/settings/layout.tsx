import type { Metadata } from "next"

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
      <section>{children}</section>
    </div>
  )
}
