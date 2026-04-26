import Link from "next/link"

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4 sm:p-6">
      <Link
        href="/"
        className="mb-6 text-lg font-semibold tracking-tight"
        aria-label="Projektplattform home"
      >
        Projektplattform
      </Link>
      <main className="w-full max-w-md">{children}</main>
    </div>
  )
}
