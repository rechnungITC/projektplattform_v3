"use client"

/**
 * PROJ-51-δ — Global motion-config provider.
 *
 * Wraps the app in a Framer Motion `<MotionConfig>` with
 * `reducedMotion="user"` so every framer-motion-driven animation
 * automatically respects the user's `prefers-reduced-motion` setting.
 *
 * Tailwind-only animations (`transition-*`, `animate-*`) already use the
 * `motion-reduce:transition-none` / `motion-reduce:transform-none`
 * pattern in the affected components (Button γ.3, Card γ.3) — this
 * provider is the equivalent guarantee for any subsequent Framer-Motion
 * usage (Drawer/Sheet/Toast presence-animations in follow-up slices).
 *
 * Why a separate provider component instead of putting MotionConfig
 * directly into the root layout: `MotionConfig` is a Client Component
 * (uses React Context); the root layout stays a Server Component.
 */

import { MotionConfig } from "framer-motion"
import type * as React from "react"

interface ReducedMotionProviderProps {
  children: React.ReactNode
}

export function ReducedMotionProvider({
  children,
}: ReducedMotionProviderProps) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
