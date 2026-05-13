"use client"

import { Download, Loader2, Upload } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type {
  OrganizationImportDedupStrategy,
  OrganizationImportLayout,
} from "@/types/organization-import"

interface ImportUploadStepProps {
  uploading: boolean
  onUpload: (formData: FormData) => Promise<void>
}

export function ImportUploadStep({
  uploading,
  onUpload,
}: ImportUploadStepProps) {
  const [layout, setLayout] =
    React.useState<OrganizationImportLayout>("orgchart_hierarchy")
  const [dedupStrategy, setDedupStrategy] =
    React.useState<OrganizationImportDedupStrategy>("skip")
  const [includeLocations, setIncludeLocations] = React.useState(false)
  const [file, setFile] = React.useState<File | null>(null)
  const [locationsFile, setLocationsFile] = React.useState<File | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) return

    const formData = new FormData()
    formData.set("layout", layout)
    formData.set("dedup_strategy", dedupStrategy)
    formData.set("file", file)
    if (layout === "orgchart_hierarchy") {
      formData.set("include_locations", String(includeLocations))
      if (includeLocations && locationsFile) {
        formData.set("locations_csv", locationsFile)
      }
    }
    await onUpload(formData)
  }

  const submitDisabled =
    uploading || !file || (includeLocations && !locationsFile)

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3">
          <Label>Layout</Label>
          <RadioGroup
            value={layout}
            onValueChange={(value) =>
              setLayout(value as OrganizationImportLayout)
            }
            className="grid gap-2 sm:grid-cols-2"
          >
            <label className="flex min-h-20 cursor-pointer items-start gap-3 rounded-md border p-3 text-sm">
              <RadioGroupItem value="orgchart_hierarchy" />
              <span>
                <span className="block font-medium">Hierarchie</span>
                <span className="block text-xs text-muted-foreground">
                  Org-Einheiten mit Codes und Parent-Codes.
                </span>
              </span>
            </label>
            <label className="flex min-h-20 cursor-pointer items-start gap-3 rounded-md border p-3 text-sm">
              <RadioGroupItem value="person_assignment" />
              <span>
                <span className="block font-medium">Personen-Zuordnung</span>
                <span className="block text-xs text-muted-foreground">
                  E-Mail zu Organisationseinheit.
                </span>
              </span>
            </label>
          </RadioGroup>
        </div>

        <div className="space-y-3">
          <Label>Duplikate</Label>
          <Select
            value={dedupStrategy}
            onValueChange={(value) =>
              setDedupStrategy(value as OrganizationImportDedupStrategy)
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="skip">Überspringen</SelectItem>
              <SelectItem value="update">Aktualisieren</SelectItem>
              <SelectItem value="fail">Abbrechen</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="organization-import-file">CSV</Label>
          <Input
            id="organization-import-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <Button variant="ghost" size="sm" asChild>
            <a href="/templates/orgchart_hierarchy.csv">
              <Download className="mr-2 h-4 w-4" aria-hidden />
              Hierarchie-Template
            </a>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href="/templates/person_assignment.csv">
              <Download className="mr-2 h-4 w-4" aria-hidden />
              Personen-Template
            </a>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href="/templates/locations.csv">
              <Download className="mr-2 h-4 w-4" aria-hidden />
              Locations-Template
            </a>
          </Button>
        </div>

        {layout === "orgchart_hierarchy" ? (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={includeLocations}
                onCheckedChange={(checked) =>
                  setIncludeLocations(checked === true)
                }
              />
              Standorte mit importieren
            </label>
            {includeLocations ? (
              <div className="space-y-2">
                <Label htmlFor="organization-import-locations-file">
                  Locations CSV
                </Label>
                <Input
                  id="organization-import-locations-file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) =>
                    setLocationsFile(event.target.files?.[0] ?? null)
                  }
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={submitDisabled}>
          {uploading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Upload className="mr-2 h-4 w-4" aria-hidden />
          )}
          Vorschau erzeugen
        </Button>
      </div>
    </form>
  )
}
