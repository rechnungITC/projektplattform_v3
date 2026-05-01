"use client"

import * as React from "react"

import {
  createDocument,
  deleteDocument,
  listDocuments,
  type DocumentInput,
} from "@/lib/vendors/api"
import type { VendorDocument } from "@/types/vendor"

interface UseVendorDocumentsResult {
  documents: VendorDocument[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  add: (input: DocumentInput) => Promise<VendorDocument>
  remove: (id: string) => Promise<void>
}

export function useVendorDocuments(
  vendorId: string | null
): UseVendorDocumentsResult {
  const [documents, setDocuments] = React.useState<VendorDocument[]>([])
  const [loading, setLoading] = React.useState<boolean>(Boolean(vendorId))
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!vendorId) {
        if (!cancelled) {
          setDocuments([])
          setLoading(false)
        }
        return
      }
      try {
        const list = await listDocuments(vendorId)
        if (cancelled) return
        setDocuments(list)
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Unbekannter Fehler")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [vendorId, tick])

  const refresh = React.useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  const add = React.useCallback(
    async (input: DocumentInput) => {
      if (!vendorId) throw new Error("vendorId required")
      const created = await createDocument(vendorId, input)
      await refresh()
      return created
    },
    [vendorId, refresh]
  )

  const remove = React.useCallback(
    async (id: string) => {
      if (!vendorId) return
      await deleteDocument(vendorId, id)
      await refresh()
    },
    [vendorId, refresh]
  )

  return { documents, loading, error, refresh, add, remove }
}
