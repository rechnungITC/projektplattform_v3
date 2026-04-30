"use client"

import { Plus, Trash2 } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PROJECT_TYPE_CATALOG } from "@/lib/project-types/catalog"
import type { ProjectTypeOverrideFields } from "@/types/master-data"
import type { ProjectType } from "@/types/project"

interface RoleEntry {
  key: string
  label_de: string
}

interface InfoEntry {
  key: string
  label_de: string
  description?: string
}

interface ProjectTypeOverrideFormProps {
  typeKey: ProjectType
  initial: ProjectTypeOverrideFields | null
  submitting: boolean
  onSave: (overrides: ProjectTypeOverrideFields) => Promise<void> | void
  onResetField: (field: "standard_roles" | "required_info") => Promise<void> | void
}

export function ProjectTypeOverrideForm({
  typeKey,
  initial,
  submitting,
  onSave,
  onResetField,
}: ProjectTypeOverrideFormProps) {
  const base = React.useMemo(
    () => PROJECT_TYPE_CATALOG.find((p) => p.key === typeKey),
    [typeKey]
  )

  // Override-or-inherited per field
  const rolesOverridden = initial?.standard_roles !== undefined
  const infoOverridden = initial?.required_info !== undefined

  const [roles, setRoles] = React.useState<RoleEntry[]>(
    initial?.standard_roles
      ? initial.standard_roles.map((r) => ({ ...r }))
      : (base?.standard_roles ?? []).map((r) => ({ ...r }))
  )
  const [editRoles, setEditRoles] = React.useState(rolesOverridden)

  const [info, setInfo] = React.useState<InfoEntry[]>(
    initial?.required_info
      ? initial.required_info.map((r) => ({ ...r }))
      : (base?.required_info ?? []).map((r) => ({ ...r }))
  )
  const [editInfo, setEditInfo] = React.useState(infoOverridden)

  const [error, setError] = React.useState<string | null>(null)

  function validateAndPayload(): ProjectTypeOverrideFields | null {
    const out: ProjectTypeOverrideFields = {}
    if (editRoles) {
      for (const r of roles) {
        if (!r.key.trim() || !r.label_de.trim()) {
          setError("Alle Rollen brauchen Key + Bezeichnung.")
          return null
        }
      }
      out.standard_roles = roles.map((r) => ({
        key: r.key.trim(),
        label_de: r.label_de.trim(),
      }))
    }
    if (editInfo) {
      for (const r of info) {
        if (!r.key.trim() || !r.label_de.trim()) {
          setError("Alle Pflicht-Infos brauchen Key + Bezeichnung.")
          return null
        }
      }
      out.required_info = info.map((r) => ({
        key: r.key.trim(),
        label_de: r.label_de.trim(),
        ...(r.description?.trim() ? { description: r.description.trim() } : {}),
      }))
    }
    return out
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const payload = validateAndPayload()
    if (!payload) return
    if (Object.keys(payload).length === 0) {
      setError("Aktiviere mindestens ein Override-Feld oder schließe den Drawer.")
      return
    }
    await onSave(payload)
  }

  if (!base) {
    return (
      <p className="text-sm text-destructive">
        Unbekannter Projekttyp „{typeKey}".
      </p>
    )
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      {/* Standard-Rollen */}
      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Standard-Rollen</p>
              <p className="text-xs text-muted-foreground">
                {editRoles
                  ? "Override aktiv — diese Liste ersetzt die Default-Rollen."
                  : `Geerbt von der Code-Vorlage (${base.standard_roles.length} Rollen).`}
              </p>
            </div>
            <div className="flex gap-2">
              {editRoles ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditRoles(false)
                    setRoles(base.standard_roles.map((r) => ({ ...r })))
                    void onResetField("standard_roles")
                  }}
                >
                  Reset
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditRoles(true)}
                >
                  Override
                </Button>
              )}
            </div>
          </div>

          {editRoles ? (
            <div className="space-y-2">
              {roles.map((r, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Input
                    placeholder="key"
                    value={r.key}
                    onChange={(e) =>
                      setRoles((rs) =>
                        rs.map((x, i) => (i === idx ? { ...x, key: e.target.value } : x))
                      )
                    }
                    maxLength={64}
                  />
                  <Input
                    placeholder="Bezeichnung"
                    value={r.label_de}
                    onChange={(e) =>
                      setRoles((rs) =>
                        rs.map((x, i) =>
                          i === idx ? { ...x, label_de: e.target.value } : x
                        )
                      )
                    }
                    maxLength={120}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setRoles((rs) => rs.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setRoles((rs) => [...rs, { key: "", label_de: "" }])}
              >
                <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
                Rolle
              </Button>
            </div>
          ) : (
            <ul className="text-sm text-muted-foreground">
              {base.standard_roles.map((r) => (
                <li key={r.key}>
                  <code className="text-xs">{r.key}</code> — {r.label_de}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Pflicht-Infos */}
      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Pflicht-Infos</p>
              <p className="text-xs text-muted-foreground">
                {editInfo
                  ? "Override aktiv — diese Liste ersetzt die Default-Infos."
                  : `Geerbt von der Code-Vorlage (${base.required_info.length} Einträge).`}
              </p>
            </div>
            <div className="flex gap-2">
              {editInfo ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditInfo(false)
                    setInfo(base.required_info.map((r) => ({ ...r })))
                    void onResetField("required_info")
                  }}
                >
                  Reset
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditInfo(true)}
                >
                  Override
                </Button>
              )}
            </div>
          </div>

          {editInfo ? (
            <div className="space-y-2">
              {info.map((r, idx) => (
                <div key={idx} className="space-y-1 rounded-md border p-2">
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <Input
                      placeholder="key"
                      value={r.key}
                      onChange={(e) =>
                        setInfo((rs) =>
                          rs.map((x, i) =>
                            i === idx ? { ...x, key: e.target.value } : x
                          )
                        )
                      }
                      maxLength={64}
                    />
                    <Input
                      placeholder="Bezeichnung"
                      value={r.label_de}
                      onChange={(e) =>
                        setInfo((rs) =>
                          rs.map((x, i) =>
                            i === idx ? { ...x, label_de: e.target.value } : x
                          )
                        )
                      }
                      maxLength={120}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setInfo((rs) => rs.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </div>
                  <Input
                    placeholder="Beschreibung (optional)"
                    value={r.description ?? ""}
                    onChange={(e) =>
                      setInfo((rs) =>
                        rs.map((x, i) =>
                          i === idx ? { ...x, description: e.target.value } : x
                        )
                      )
                    }
                    maxLength={500}
                  />
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setInfo((rs) => [...rs, { key: "", label_de: "" }])
                }
              >
                <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
                Pflicht-Info
              </Button>
            </div>
          ) : (
            <ul className="text-sm text-muted-foreground">
              {base.required_info.length === 0 ? (
                <li>(keine)</li>
              ) : (
                base.required_info.map((r) => (
                  <li key={r.key}>
                    <code className="text-xs">{r.key}</code> — {r.label_de}
                  </li>
                ))
              )}
            </ul>
          )}
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={submitting || (!editRoles && !editInfo)}>
          {submitting ? "Speichere …" : "Override speichern"}
        </Button>
      </div>
    </form>
  )
}
