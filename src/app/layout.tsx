import type { Metadata } from "next"
import "./globals.css"

import { ReducedMotionProvider } from "@/components/motion/reduced-motion-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"

export const metadata: Metadata = {
  title: "Projektplattform",
  description: "Modular, AI-supported project orchestration platform",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          themes={["light", "dark", "system", "dark-teal"]}
        >
          <ReducedMotionProvider>
            {children}
            <Toaster />
          </ReducedMotionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
