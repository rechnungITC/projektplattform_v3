"use client"

import { Loader2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useAuth } from "@/hooks/use-auth"
import { ASSISTANT_SETTINGS_DEFAULTS } from "@/lib/assistant/settings"
import { updateTenantSettings } from "@/lib/tenant-settings/api"
import {
  MODULE_LABELS,
  RESERVED_MODULES,
  TOGGLEABLE_MODULES,
  type AssistantSettings,
  type ModuleKey,
} from "@/types/tenant-settings"

export function ModulesSection() {
  const { currentTenant, tenantSettings, refresh } = useAuth()
  const [pending, setPending] = React.useState<
    ModuleKey | "assistant_settings" | null
  >(null)

  if (!currentTenant || !tenantSettings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Module</CardTitle>
          <CardDescription>
            Lade Workspace-Einstellungen …
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const isActive = (key: ModuleKey) =>
    tenantSettings.active_modules.includes(key)
  const assistantSettings =
    tenantSettings.assistant_settings ?? ASSISTANT_SETTINGS_DEFAULTS

  const onToggle = async (key: ModuleKey, next: boolean) => {
    setPending(key)
    const updated = next
      ? Array.from(new Set([...tenantSettings.active_modules, key]))
      : tenantSettings.active_modules.filter((m) => m !== key)
    try {
      await updateTenantSettings(currentTenant.id, {
        active_modules: updated,
      })
      toast.success(
        `${MODULE_LABELS[key]} ${next ? "aktiviert" : "deaktiviert"}`
      )
      await refresh()
    } catch (err) {
      toast.error("Modul-Toggle fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setPending(null)
    }
  }

  const onAssistantSettingsPatch = async (
    patch: Partial<AssistantSettings>
  ) => {
    setPending("assistant_settings")
    try {
      await updateTenantSettings(currentTenant.id, {
        assistant_settings: {
          ...assistantSettings,
          ...patch,
        },
      })
      toast.success("Assistant-Governance aktualisiert")
      await refresh()
    } catch (err) {
      toast.error("Assistant-Governance fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setPending(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Module</CardTitle>
        <CardDescription>
          Schalte optionale Funktionsbereiche für diesen Workspace ein oder
          aus. Daten gehen nicht verloren — deaktivierte Module werden nur in
          der Navigation und im API ausgeblendet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium">Verfügbar</p>
          <ul className="divide-y rounded-md border">
            {TOGGLEABLE_MODULES.map((key) => (
              <li
                key={key}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <span className="text-sm">{MODULE_LABELS[key]}</span>
                <div className="flex items-center gap-2">
                  {pending === key ? (
                    <Loader2
                      className="h-4 w-4 animate-spin text-muted-foreground"
                      aria-hidden
                    />
                  ) : null}
                  <Switch
                    checked={isActive(key)}
                    disabled={pending !== null}
                    onCheckedChange={(checked) => void onToggle(key, checked)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3 border-t pt-4">
          <p className="text-sm font-medium">Assistant-Governance</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="assistant-retention-mode">
                Transcript-Persistenz
              </Label>
              <Select
                value={assistantSettings.transcript_retention_mode}
                disabled={pending !== null}
                onValueChange={(value) =>
                  void onAssistantSettingsPatch({
                    transcript_retention_mode:
                      value as AssistantSettings["transcript_retention_mode"],
                  })
                }
              >
                <SelectTrigger id="assistant-retention-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no_persist">Keine Transkripte</SelectItem>
                  <SelectItem value="persist_metadata_only">
                    Nur Metadaten
                  </SelectItem>
                  <SelectItem value="persist_redacted_transcript">
                    Redigiertes Transkript
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assistant-retention-days">Retention-Tage</Label>
              <Input
                id="assistant-retention-days"
                type="number"
                min={1}
                max={3650}
                value={assistantSettings.retention_days}
                disabled={pending !== null}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  if (Number.isInteger(next) && next >= 1 && next <= 3650) {
                    void onAssistantSettingsPatch({ retention_days: next })
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="assistant-stt-provider">STT-Provider</Label>
              <Select
                value={assistantSettings.stt_provider}
                disabled={pending !== null}
                onValueChange={(value) =>
                  void onAssistantSettingsPatch({
                    stt_provider: value as AssistantSettings["stt_provider"],
                  })
                }
              >
                <SelectTrigger id="assistant-stt-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="browser">Browser</SelectItem>
                  <SelectItem value="external">Extern</SelectItem>
                  <SelectItem value="none">Aus</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assistant-tts-provider">TTS-Provider</Label>
              <Select
                value={assistantSettings.tts_provider}
                disabled={pending !== null}
                onValueChange={(value) =>
                  void onAssistantSettingsPatch({
                    tts_provider: value as AssistantSettings["tts_provider"],
                  })
                }
              >
                <SelectTrigger id="assistant-tts-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="browser">Browser</SelectItem>
                  <SelectItem value="external">Extern</SelectItem>
                  <SelectItem value="none">Aus</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-md border px-4 py-3">
            <Label htmlFor="assistant-wake-word" className="text-sm">
              Wake-Word
            </Label>
            <Switch
              id="assistant-wake-word"
              checked={assistantSettings.wake_word_enabled}
              disabled={pending !== null}
              onCheckedChange={(checked) =>
                void onAssistantSettingsPatch({ wake_word_enabled: checked })
              }
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Demnächst</p>
          <ul className="divide-y rounded-md border bg-muted/20">
            {RESERVED_MODULES.map((key) => (
              <li
                key={key}
                className="flex items-center justify-between gap-4 px-4 py-3 opacity-70"
              >
                <span className="text-sm">{MODULE_LABELS[key]}</span>
                <Badge variant="outline">Demnächst</Badge>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
