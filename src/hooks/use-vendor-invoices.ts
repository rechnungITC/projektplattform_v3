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

  const refresh = React.useCallback(async () => {
    try {
      setLoading(true)
      const list = await listVendorInvoices(vendorId)
      setInvoices(list)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [vendorId])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

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
