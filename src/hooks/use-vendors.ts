"use client"

import * as React from "react"

import {
  createVendor,
  deleteVendor,
  listVendors,
  updateVendor,
  type VendorInput,
  type VendorListOptions,
} from "@/lib/vendors/api"
import type { Vendor, VendorWithStats } from "@/types/vendor"

interface UseVendorsResult {
  vendors: VendorWithStats[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  create: (input: VendorInput) => Promise<Vendor>
  update: (id: string, input: Partial<VendorInput>) => Promise<Vendor>
  remove: (id: string) => Promise<void>
}

export function useVendors(
  options: VendorListOptions = {}
): UseVendorsResult {
  const [vendors, setVendors] = React.useState<VendorWithStats[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    try {
      setLoading(true)
      const list = await listVendors(options)
      setVendors(list)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [options.status, options.search])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const create = React.useCallback(
    async (input: VendorInput) => {
      const created = await createVendor(input)
      await refresh()
      return created
    },
    [refresh]
  )

  const update = React.useCallback(
    async (id: string, input: Partial<VendorInput>) => {
      const updated = await updateVendor(id, input)
      await refresh()
      return updated
    },
    [refresh]
  )

  const remove = React.useCallback(
    async (id: string) => {
      await deleteVendor(id)
      await refresh()
    },
    [refresh]
  )

  return { vendors, loading, error, refresh, create, update, remove }
}
