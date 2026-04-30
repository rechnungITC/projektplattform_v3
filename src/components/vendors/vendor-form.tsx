"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { VendorInput } from "@/lib/vendors/api"
import {
  type Vendor,
  type VendorStatus,
  VENDOR_STATUS_LABELS,
  VENDOR_STATUSES,
} from "@/types/vendor"

interface VendorFormProps {
  initial?: Vendor
  submitting: boolean
  onSubmit: (input: VendorInput) => Promise<void> | void
}

export function VendorForm({
  initial,
  submitting,
  onSubmit,
}: VendorFormProps) {
  const [name, setName] = React.useState(initial?.name ?? "")
  const [category, setCategory] = React.useState(initial?.category ?? "")
  const [email, setEmail] = React.useState(initial?.primary_contact_email ?? "")
  const [website, setWebsite] = React.useState(initial?.website ?? "")
  const [status, setStatus] = React.useState<VendorStatus>(
    initial?.status ?? "active"
  )
  const [error, setError] = React.useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError("Name ist erforderlich.")
      return
    }
    if (website.trim() && !website.trim().startsWith("https://")) {
      setError("Website muss mit https:// beginnen.")
      return
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("E-Mail-Adresse ist nicht gültig.")
      return
    }
    setError(null)
    await onSubmit({
      name: name.trim(),
      category: category.trim() || null,
      primary_contact_email: email.trim() || null,
      website: website.trim() || null,
      status,
    })
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="vendor_name">Name</Label>
        <Input
          id="vendor_name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={255}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="vendor_category">Kategorie (optional)</Label>
        <Input
          id="vendor_category"
          value={category ?? ""}
          onChange={(e) => setCategory(e.target.value)}
          maxLength={120}
          placeholder="z. B. ERP-Implementierungspartner, Bauleitung, …"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="vendor_email">
          Primärkontakt E-Mail (optional){" "}
          <span className="text-xs font-normal text-muted-foreground">
            — Klasse-3, wird redaktiert beim Export
          </span>
        </Label>
        <Input
          id="vendor_email"
          type="email"
          value={email ?? ""}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={320}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="vendor_website">
          Website (optional, HTTPS)
        </Label>
        <Input
          id="vendor_website"
          type="url"
          value={website ?? ""}
          onChange={(e) => setWebsite(e.target.value)}
          maxLength={2000}
          placeholder="https://example.com"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="vendor_status">Status</Label>
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as VendorStatus)}
        >
          <SelectTrigger id="vendor_status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VENDOR_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {VENDOR_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Speichere …" : initial ? "Speichern" : "Anlegen"}
        </Button>
      </div>
    </form>
  )
}
