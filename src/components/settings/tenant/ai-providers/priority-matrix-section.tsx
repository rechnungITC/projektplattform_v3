"use client"

import { ArrowDown, ArrowUp, Loader2, X } from "lucide-react"
import * as React from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

// ---------------------------------------------------------------------------
// Types — must align with API route + DB CHECK
// ---------------------------------------------------------------------------

const PURPOSES = [
  "risks",
  "decisions",
  "work_items",
  "open_items",
  "narrative",
] as const
type Purpose = (typeof PURPOSES)[number]

type DataClass = 1 | 2 | 3
type ProviderName = "anthropic" | "ollama"

const PURPOSE_LABELS: Record<Purpose, string> = {
  risks: "Risiken",
  decisions: "Entscheidungen",
  work_items: "Work-Items",
  open_items: "Open Items",
  narrative: "Narrative / Status-Reports",
}

const PROVIDER_LABELS: Record<ProviderName, string> = {
  anthropic: "Anthropic",
  ollama: "Ollama (lokal)",
}

const LOCAL_PROVIDERS: ProviderName[] = ["ollama"]

interface PriorityRule {
  purpose: Purpose
  data_class: DataClass
  provider_order: ProviderName[]
}

// ---------------------------------------------------------------------------
// Presets — locked CIA Fork F.2
// ---------------------------------------------------------------------------

type PresetKey =
  | "class3_local_class12_anthropic"
  | "anthropic_only"
  | "ollama_only"
  | "custom"

const PRESETS: Record<
  Exclude<PresetKey, "custom">,
  { label: string; description: string; build: (avail: AvailMap) => PriorityRule[] }
> = {
  class3_local_class12_anthropic: {
    label: "Class-3 nur Ollama, Class-1/2 Anthropic preferred",
    description:
      "Standard für SaaS-Tenants mit eigenem Ollama. Class-3 strikt lokal, Class-1/2 nutzen Anthropic-Cloud zuerst, Ollama als Fallback.",
    build: (avail) => {
      const rules: PriorityRule[] = []
      for (const purpose of PURPOSES) {
        if (avail.ollama)
          rules.push({ purpose, data_class: 3, provider_order: ["ollama"] })
        const order: ProviderName[] = []
        if (avail.anthropic) order.push("anthropic")
        if (avail.ollama) order.push("ollama")
        for (const dc of [1, 2] as DataClass[]) {
          if (order.length > 0)
            rules.push({ purpose, data_class: dc, provider_order: order })
        }
      }
      return rules
    },
  },
  anthropic_only: {
    label: "Anthropic für alles (außer Class-3)",
    description:
      "Cloud-only für Class-1/2. Class-3 wird blockiert (kein Ollama-Pfad).",
    build: (avail) => {
      const rules: PriorityRule[] = []
      for (const purpose of PURPOSES) {
        for (const dc of [1, 2] as DataClass[]) {
          if (avail.anthropic)
            rules.push({
              purpose,
              data_class: dc,
              provider_order: ["anthropic"],
            })
        }
        // No Class-3 rules — falls back to default which blocks if no Ollama.
      }
      return rules
    },
  },
  ollama_only: {
    label: "Ollama für alles (volles On-Prem)",
    description:
      "Alle Anfragen über lokalen Ollama-Endpoint. Anthropic wird auch dann nicht genutzt wenn ein Tenant-Key gesetzt ist.",
    build: (avail) => {
      if (!avail.ollama) return []
      const rules: PriorityRule[] = []
      for (const purpose of PURPOSES) {
        for (const dc of [1, 2, 3] as DataClass[]) {
          rules.push({ purpose, data_class: dc, provider_order: ["ollama"] })
        }
      }
      return rules
    },
  },
}

interface AvailMap {
  anthropic: boolean
  ollama: boolean
}

// ---------------------------------------------------------------------------
// Loading + serialization
// ---------------------------------------------------------------------------

interface ServerRule {
  purpose: string
  data_class: number
  provider_order: string[]
}

function rulesEqual(a: PriorityRule[], b: PriorityRule[]): boolean {
  if (a.length !== b.length) return false
  const key = (r: PriorityRule) => `${r.purpose}:${r.data_class}`
  const sort = (rs: PriorityRule[]) =>
    [...rs].sort((x, y) => key(x).localeCompare(key(y)))
  const sa = sort(a)
  const sb = sort(b)
  for (let i = 0; i < sa.length; i++) {
    if (
      sa[i].purpose !== sb[i].purpose ||
      sa[i].data_class !== sb[i].data_class ||
      sa[i].provider_order.length !== sb[i].provider_order.length ||
      !sa[i].provider_order.every((v, j) => v === sb[i].provider_order[j])
    ) {
      return false
    }
  }
  return true
}

function detectPreset(rules: PriorityRule[], avail: AvailMap): PresetKey {
  for (const key of Object.keys(PRESETS) as Array<keyof typeof PRESETS>) {
    const preset = PRESETS[key].build(avail)
    if (rulesEqual(rules, preset)) return key
  }
  return "custom"
}

// ---------------------------------------------------------------------------
// Main section
// ---------------------------------------------------------------------------

export function PriorityMatrixSection({
  tenantId,
  anthropicAvailable,
  ollamaAvailable,
}: {
  tenantId: string
  anthropicAvailable: boolean
  ollamaAvailable: boolean
}) {
  const avail = React.useMemo<AvailMap>(
    () => ({ anthropic: anthropicAvailable, ollama: ollamaAvailable }),
    [anthropicAvailable, ollamaAvailable],
  )

  const [loading, setLoading] = React.useState(true)
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)
  const [persistedRules, setPersistedRules] = React.useState<PriorityRule[]>([])
  const [draftRules, setDraftRules] = React.useState<PriorityRule[]>([])
  const [submitting, setSubmitting] = React.useState(false)
  const [reloadCounter, setReloadCounter] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    fetch(`/api/tenants/${tenantId}/ai-priority`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          throw new Error(body?.error?.message ?? `HTTP ${r.status}`)
        }
        const body = (await r.json()) as { rules: ServerRule[] }
        return body.rules
      })
      .then((server) => {
        if (cancelled) return
        const normalized: PriorityRule[] = server
          .filter(
            (r): r is ServerRule =>
              (PURPOSES as readonly string[]).includes(r.purpose) &&
              [1, 2, 3].includes(r.data_class) &&
              Array.isArray(r.provider_order),
          )
          .map((r) => ({
            purpose: r.purpose as Purpose,
            data_class: r.data_class as DataClass,
            provider_order: r.provider_order.filter(
              (p): p is ProviderName => p === "anthropic" || p === "ollama",
            ),
          }))
        setPersistedRules(normalized)
        setDraftRules(normalized)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setErrorMsg(err instanceof Error ? err.message : "Unbekannter Fehler")
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tenantId, reloadCounter])

  const currentPreset = React.useMemo(
    () => detectPreset(draftRules, avail),
    [draftRules, avail],
  )

  function applyPreset(key: PresetKey) {
    if (key === "custom") return
    const built = PRESETS[key].build(avail)
    setDraftRules(built)
  }

  async function handleSave() {
    setSubmitting(true)
    try {
      const r = await fetch(`/api/tenants/${tenantId}/ai-priority`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rules: draftRules }),
      })
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        throw new Error(body?.error?.message ?? `HTTP ${r.status}`)
      }
      toast.success("Provider-Priority gespeichert.")
      setReloadCounter((n) => n + 1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen")
    } finally {
      setSubmitting(false)
    }
  }

  function handleReset() {
    setDraftRules(persistedRules)
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Lade
          Priority-Matrix …
        </CardContent>
      </Card>
    )
  }

  if (errorMsg) {
    return (
      <Card>
        <CardContent className="py-4">
          <Alert variant="destructive">
            <AlertTitle>Priority-Matrix konnte nicht geladen werden</AlertTitle>
            <AlertDescription>{errorMsg}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  const noProvider = !avail.anthropic && !avail.ollama
  const dirty = !rulesEqual(draftRules, persistedRules)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Provider-Priority</CardTitle>
        <CardDescription>
          Bestimmt pro AI-Purpose (Risiken, Narrative, …) und pro Data-Class
          welche Provider in welcher Reihenfolge probiert werden. Class-3
          akzeptiert nur lokale Provider.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {noProvider && (
          <Alert>
            <AlertTitle>Kein Provider konfiguriert</AlertTitle>
            <AlertDescription>
              Bitte oben mindestens einen Provider hinterlegen, bevor du eine
              Priority-Matrix definierst.
            </AlertDescription>
          </Alert>
        )}

        <PresetSelector
          current={currentPreset}
          avail={avail}
          onPick={applyPreset}
        />

        {currentPreset === "custom" && (
          <CustomMatrixEditor
            rules={draftRules}
            avail={avail}
            onChange={setDraftRules}
          />
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            onClick={handleSave}
            disabled={submitting || !dirty || noProvider}
          >
            {submitting && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            )}
            Speichern
          </Button>
          {dirty && (
            <Button variant="ghost" onClick={handleReset} disabled={submitting}>
              Zurücksetzen
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Preset selector
// ---------------------------------------------------------------------------

function PresetSelector({
  current,
  avail,
  onPick,
}: {
  current: PresetKey
  avail: AvailMap
  onPick: (k: PresetKey) => void
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Voreinstellung</Label>
      <RadioGroup
        value={current}
        onValueChange={(v) => onPick(v as PresetKey)}
        className="space-y-2"
      >
        {(
          Object.entries(PRESETS) as Array<
            [keyof typeof PRESETS, (typeof PRESETS)[keyof typeof PRESETS]]
          >
        ).map(([key, preset]) => {
          // Disable presets that require providers the tenant hasn't set.
          let disabled = false
          if (key === "ollama_only" && !avail.ollama) disabled = true
          if (key === "anthropic_only" && !avail.anthropic) disabled = true
          if (
            key === "class3_local_class12_anthropic" &&
            !avail.anthropic &&
            !avail.ollama
          )
            disabled = true

          return (
            <Label
              key={key}
              htmlFor={`preset-${key}`}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                disabled ? "opacity-50" : "hover:bg-muted/50"
              }`}
            >
              <RadioGroupItem
                id={`preset-${key}`}
                value={key}
                disabled={disabled}
                className="mt-1"
              />
              <div className="space-y-1">
                <div className="text-sm font-medium">{preset.label}</div>
                <div className="text-xs text-muted-foreground">
                  {preset.description}
                </div>
              </div>
            </Label>
          )
        })}

        <Label
          htmlFor="preset-custom"
          className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/50"
        >
          <RadioGroupItem id="preset-custom" value="custom" className="mt-1" />
          <div className="space-y-1">
            <div className="text-sm font-medium">Custom</div>
            <div className="text-xs text-muted-foreground">
              Pro Purpose × Class einzeln festlegen welche Provider in welcher
              Reihenfolge probiert werden.
            </div>
          </div>
        </Label>
      </RadioGroup>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Custom matrix editor — 5 purposes × 3 classes = 15 cells
// ---------------------------------------------------------------------------

function CustomMatrixEditor({
  rules,
  avail,
  onChange,
}: {
  rules: PriorityRule[]
  avail: AvailMap
  onChange: (next: PriorityRule[]) => void
}) {
  function getCell(purpose: Purpose, dc: DataClass): ProviderName[] {
    return (
      rules.find((r) => r.purpose === purpose && r.data_class === dc)
        ?.provider_order ?? []
    )
  }

  function setCell(purpose: Purpose, dc: DataClass, order: ProviderName[]) {
    const filtered = rules.filter(
      (r) => !(r.purpose === purpose && r.data_class === dc),
    )
    if (order.length > 0) {
      filtered.push({ purpose, data_class: dc, provider_order: order })
    }
    onChange(filtered)
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="text-sm font-medium">Custom-Matrix</div>
      <div className="grid grid-cols-1 gap-3">
        {PURPOSES.map((purpose) => (
          <div key={purpose} className="rounded border p-3">
            <div className="mb-2 font-medium">{PURPOSE_LABELS[purpose]}</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {([1, 2, 3] as DataClass[]).map((dc) => (
                <CellEditor
                  key={dc}
                  purpose={purpose}
                  dataClass={dc}
                  current={getCell(purpose, dc)}
                  avail={avail}
                  onChange={(order) => setCell(purpose, dc, order)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CellEditor({
  purpose: _purpose,
  dataClass,
  current,
  avail,
  onChange,
}: {
  purpose: Purpose
  dataClass: DataClass
  current: ProviderName[]
  avail: AvailMap
  onChange: (next: ProviderName[]) => void
}) {
  // Class-3 only allows local providers — surface as a hint at the cell level.
  const isClass3 = dataClass === 3
  const candidatePool: ProviderName[] = isClass3
    ? LOCAL_PROVIDERS
    : (["anthropic", "ollama"] as ProviderName[])

  function addProvider(p: ProviderName) {
    if (current.includes(p)) return
    onChange([...current, p])
  }
  function removeAt(i: number) {
    onChange(current.filter((_, j) => j !== i))
  }
  function moveUp(i: number) {
    if (i === 0) return
    const next = [...current]
    ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
    onChange(next)
  }
  function moveDown(i: number) {
    if (i === current.length - 1) return
    const next = [...current]
    ;[next[i + 1], next[i]] = [next[i], next[i + 1]]
    onChange(next)
  }

  const remaining = candidatePool.filter(
    (p) => !current.includes(p) && avail[p],
  )

  return (
    <div className="space-y-1 rounded border bg-background p-2">
      <div className="text-xs font-medium uppercase text-muted-foreground">
        Class-{dataClass}
        {isClass3 && (
          <Badge variant="outline" className="ml-2 text-[10px]">
            nur lokal
          </Badge>
        )}
      </div>
      <div className="space-y-1">
        {current.length === 0 && (
          <div className="text-xs italic text-muted-foreground">
            Default (siehe oben) — keine Override.
          </div>
        )}
        {current.map((p, i) => (
          <div
            key={`${p}-${i}`}
            className="flex items-center justify-between gap-1 rounded border bg-muted/30 px-2 py-1 text-xs"
          >
            <div>
              <span className="text-muted-foreground">{i + 1}.</span>{" "}
              {PROVIDER_LABELS[p]}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Nach oben"
                onClick={() => moveUp(i)}
                disabled={i === 0}
                className="rounded p-1 hover:bg-muted disabled:opacity-30"
              >
                <ArrowUp className="h-3 w-3" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Nach unten"
                onClick={() => moveDown(i)}
                disabled={i === current.length - 1}
                className="rounded p-1 hover:bg-muted disabled:opacity-30"
              >
                <ArrowDown className="h-3 w-3" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Entfernen"
                onClick={() => removeAt(i)}
                className="rounded p-1 hover:bg-destructive/20"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </div>
          </div>
        ))}
      </div>
      {remaining.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {remaining.map((p) => (
            <Button
              key={p}
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => addProvider(p)}
            >
              + {PROVIDER_LABELS[p]}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
