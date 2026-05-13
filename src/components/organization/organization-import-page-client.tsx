"use client"

import { ArrowLeft, FileUp } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useOrganizationImports } from "@/hooks/use-organization-imports"
import type { OrganizationImport } from "@/types/organization-import"

import { ImportHistoryList } from "./import-history-list"
import { ImportPreviewStep } from "./import-preview-step"
import { ImportUploadStep } from "./import-upload-step"

export function OrganizationImportPageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const {
    imports,
    loading,
    error,
    refresh,
    upload,
    preview,
    commit,
    rollback,
  } = useOrganizationImports()
  const [activeTab, setActiveTab] = React.useState("upload")
  const [activeImport, setActiveImport] = React.useState<OrganizationImport | null>(
    null,
  )
  const [uploading, setUploading] = React.useState(false)
  const [committing, setCommitting] = React.useState(false)
  const [loadingPreview, setLoadingPreview] = React.useState(false)

  const loadPreview = React.useCallback(async (id: string) => {
    setLoadingPreview(true)
    try {
      const item = await preview(id)
      setActiveImport(item)
      setActiveTab("upload")
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Vorschau konnte nicht laden.",
      )
    } finally {
      setLoadingPreview(false)
    }
  }, [preview])

  const importIdFromUrl = searchParams.get("import_id")
  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!importIdFromUrl) return
      if (activeImport?.id === importIdFromUrl) return
      if (!cancelled) await loadPreview(importIdFromUrl)
    })()
    return () => {
      cancelled = true
    }
  }, [activeImport?.id, importIdFromUrl, loadPreview])

  async function handleUpload(formData: FormData) {
    setUploading(true)
    try {
      const result = await upload(formData)
      await refresh()
      await loadPreview(result.import_id)
      router.replace(
        `/stammdaten/organisation/import?import_id=${result.import_id}`,
      )
      toast.success("Vorschau erstellt.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload fehlgeschlagen.")
    } finally {
      setUploading(false)
    }
  }

  async function handleCommit() {
    if (!activeImport) return
    setCommitting(true)
    try {
      await commit(activeImport.id, activeImport.dedup_strategy)
      toast.success("Import abgeschlossen.")
      router.push("/stammdaten/organisation")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import fehlgeschlagen.")
    } finally {
      setCommitting(false)
    }
  }

  async function handleRollback(id: string) {
    try {
      await rollback(id)
      toast.success("Import zurückgesetzt.")
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Rollback fehlgeschlagen.",
      )
    }
  }

  function clearPreview() {
    setActiveImport(null)
    router.replace("/stammdaten/organisation/import")
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
            <Link href="/stammdaten/organisation">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
              Organisation
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            Organization CSV Import
          </h1>
          <p className="text-sm text-muted-foreground">
            Upload, Vorschau, Commit und Rollback für Organisationsdaten.
          </p>
        </div>
        <FileUp className="hidden h-8 w-8 text-muted-foreground sm:block" />
      </header>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loadingPreview ? (
        <div className="rounded-md border p-6 text-sm text-muted-foreground">
          Vorschau wird geladen…
        </div>
      ) : activeImport ? (
        <ImportPreviewStep
          importRow={activeImport}
          committing={committing}
          onBack={clearPreview}
          onCommit={handleCommit}
        />
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="upload">Upload</TabsTrigger>
            <TabsTrigger value="history">Historie</TabsTrigger>
          </TabsList>
          <TabsContent value="upload">
            <ImportUploadStep uploading={uploading} onUpload={handleUpload} />
          </TabsContent>
          <TabsContent value="history">
            <ImportHistoryList
              imports={imports}
              loading={loading}
              onOpenPreview={(id) => {
                router.replace(`/stammdaten/organisation/import?import_id=${id}`)
                void loadPreview(id)
              }}
              onRollback={handleRollback}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
