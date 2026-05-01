"use client"

import * as React from "react"

import {
  createVendorInvoice,
  deleteVendorInvoice,
  listVendorInvoices,
  type VendorInvoiceInput,
} from "@/lib/budget/api"
import type { VendorInvoice, VendorInvoiceWithBookings } from "@/types/budget"

interface UseVendorInvoicesResult {
  invoices: VendorInvoiceWithBookings[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  create: (input: VendorInvoiceInput) => Promise<VendorInvoice>
  remove: (id: string) => Promise<void>
}

export function useVendorInvoices(vendorId: string): UseVendorInvoicesResult {
  const [invoices, setInvoices] = React.useState<VendorInvoiceWithBookings[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await listVendorInvoices(vendorId)
        if (cancelled) return
        setInvoices(list)
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

  const create = React.useCallback(
    async (input: VendorInvoiceInput) => {
      const created = await createVendorInvoice(vendorId, input)
      await refresh()
      return created
    },
    [vendorId, refresh]
  )

  const remove = React.useCallback(
    async (id: string) => {
      await deleteVendorInvoice(vendorId, id)
      await refresh()
    },
    [vendorId, refresh]
  )

  return { invoices, loading, error, refresh, create, remove }
}
