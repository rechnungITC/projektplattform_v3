"use client"

import { useCallback, useEffect, useState } from "react"

import { fetchMaProfile } from "@/lib/ma-project/api"
import type { MaProjectProfile } from "@/types/ma-project"

interface UseMaProfileResult {
  profile: MaProjectProfile | null
  isLoading: boolean
  error: string | null
  /** True when the project has no M&A profile (e.g. non-M&A project). */
  notFound: boolean
  refresh: () => void
}

/**
 * PROJ-94 — loads the M&A strategic-foundation profile for a project.
 * Mirrors the use-project hook shape; `notFound` is true for non-M&A
 * projects (no profile row) or when need-to-know hides it.
 */
export function useMaProfile(
  projectId: string | null | undefined
): UseMaProfileResult {
  const [profile, setProfile] = useState<MaProjectProfile | null>(null)
  const [isLoading, setIsLoading] = useState(Boolean(projectId))
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!projectId) {
        setProfile(null)
        setIsLoading(false)
        setNotFound(false)
        setError(null)
        return
      }
      setIsLoading(true)
      setError(null)
      setNotFound(false)
      try {
        const result = await fetchMaProfile(projectId)
        if (cancelled) return
        if (!result) {
          setNotFound(true)
          setProfile(null)
        } else {
          setProfile(result)
        }
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Unbekannter Fehler")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, tick])

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  return { profile, isLoading, error, notFound, refresh }
}
