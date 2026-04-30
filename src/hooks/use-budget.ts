"use client"

import * as React from "react"

import {
  createBudgetCategory,
  createBudgetItem,
  createBudgetPosting,
  deleteBudgetCategory,
  getBudgetSummary,
  listBudgetCategories,
  listBudgetItems,
  listBudgetPostings,
  reverseBudgetPosting,
  softDeleteBudgetItem,
  updateBudgetCategory,
  updateBudgetItem,
  type BudgetCategoryInput,
  type BudgetItemInput,
  type BudgetPostingInput,
} from "@/lib/budget/api"
import type {
  BudgetCategory,
  BudgetItem,
  BudgetItemWithTotals,
  BudgetPosting,
  BudgetSummary,
} from "@/types/budget"
import type { SupportedCurrency } from "@/types/tenant-settings"

interface UseBudgetCategoriesResult {
  categories: BudgetCategory[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  create: (input: BudgetCategoryInput) => Promise<BudgetCategory>
  update: (id: string, patch: Partial<BudgetCategoryInput>) => Promise<BudgetCategory>
  remove: (id: string) => Promise<void>
}

export function useBudgetCategories(projectId: string): UseBudgetCategoriesResult {
  const [categories, setCategories] = React.useState<BudgetCategory[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    try {
      setLoading(true)
      const list = await listBudgetCategories(projectId)
      setCategories(list)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [projectId])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const create = React.useCallback(
    async (input: BudgetCategoryInput) => {
      const created = await createBudgetCategory(projectId, input)
      await refresh()
      return created
    },
    [projectId, refresh]
  )

  const update = React.useCallback(
    async (id: string, patch: Partial<BudgetCategoryInput>) => {
      const updated = await updateBudgetCategory(projectId, id, patch)
      await refresh()
      return updated
    },
    [projectId, refresh]
  )

  const remove = React.useCallback(
    async (id: string) => {
      await deleteBudgetCategory(projectId, id)
      await refresh()
    },
    [projectId, refresh]
  )

  return { categories, loading, error, refresh, create, update, remove }
}

interface UseBudgetItemsResult {
  items: BudgetItemWithTotals[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  create: (input: BudgetItemInput) => Promise<BudgetItem>
  update: (id: string, patch: Partial<BudgetItemInput>) => Promise<BudgetItem>
  softDelete: (id: string) => Promise<BudgetItem>
}

export function useBudgetItems(projectId: string): UseBudgetItemsResult {
  const [items, setItems] = React.useState<BudgetItemWithTotals[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    try {
      setLoading(true)
      const list = await listBudgetItems(projectId)
      setItems(list)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [projectId])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const create = React.useCallback(
    async (input: BudgetItemInput) => {
      const created = await createBudgetItem(projectId, input)
      await refresh()
      return created
    },
    [projectId, refresh]
  )

  const update = React.useCallback(
    async (id: string, patch: Partial<BudgetItemInput>) => {
      const updated = await updateBudgetItem(projectId, id, patch)
      await refresh()
      return updated
    },
    [projectId, refresh]
  )

  const softDelete = React.useCallback(
    async (id: string) => {
      const updated = await softDeleteBudgetItem(projectId, id)
      await refresh()
      return updated
    },
    [projectId, refresh]
  )

  return { items, loading, error, refresh, create, update, softDelete }
}

interface UseBudgetPostingsResult {
  postings: BudgetPosting[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  create: (input: BudgetPostingInput) => Promise<BudgetPosting>
  reverse: (postingId: string) => Promise<BudgetPosting>
}

export function useBudgetPostings(
  projectId: string,
  itemId: string | null
): UseBudgetPostingsResult {
  const [postings, setPostings] = React.useState<BudgetPosting[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    if (!itemId) {
      setPostings([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const list = await listBudgetPostings(projectId, { itemId })
      setPostings(list)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [projectId, itemId])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const create = React.useCallback(
    async (input: BudgetPostingInput) => {
      const created = await createBudgetPosting(projectId, input)
      await refresh()
      return created
    },
    [projectId, refresh]
  )

  const reverse = React.useCallback(
    async (postingId: string) => {
      const reversal = await reverseBudgetPosting(projectId, postingId)
      await refresh()
      return reversal
    },
    [projectId, refresh]
  )

  return { postings, loading, error, refresh, create, reverse }
}

interface UseBudgetSummaryResult {
  summary: BudgetSummary | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useBudgetSummary(
  projectId: string,
  inCurrency: SupportedCurrency
): UseBudgetSummaryResult {
  const [summary, setSummary] = React.useState<BudgetSummary | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    try {
      setLoading(true)
      const data = await getBudgetSummary(projectId, inCurrency)
      setSummary(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [projectId, inCurrency])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  return { summary, loading, error, refresh }
}
