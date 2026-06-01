"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export interface JiraCredentialPayload {
  base_url: string
  email: string
  api_token: string
  default_project_key: string
}

interface JiraCredentialFormProps {
  alreadyConfigured: boolean
  submitting: boolean
  onSave: (payload: JiraCredentialPayload) => Promise<void> | void
  onDelete?: () => Promise<void> | void
}

export function JiraCredentialForm({
  alreadyConfigured,
  submitting,
  onSave,
  onDelete,
}: JiraCredentialFormProps) {
  const [baseUrl, setBaseUrl] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [apiToken, setApiToken] = React.useState("")
  const [projectKey, setProjectKey] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!/^https:\/\/[^\s/]+/.test(baseUrl.trim())) {
      setError("Jira Base-URL muss mit https:// beginnen.")
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Jira Login-E-Mail ist ungueltig.")
      return
    }
    if (apiToken.trim().length < 10) {
      setError("API-Token fehlt oder ist zu kurz.")
      return
    }
    if (projectKey.trim().length < 1) {
      setError("Default Project-Key fehlt.")
      return
    }
    setError(null)
    await onSave({
      base_url: baseUrl.trim().replace(/\/+$/, ""),
      email: email.trim(),
      api_token: apiToken.trim(),
      default_project_key: projectKey.trim().toUpperCase(),
    })
    setApiToken("")
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="jira_base_url">Jira Base-URL</Label>
        <Input
          id="jira_base_url"
          type="url"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://example.atlassian.net"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="jira_email">Login-E-Mail</Label>
        <Input
          id="jira_email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jira-admin@example.com"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="jira_api_token">
          API-Token{" "}
          {alreadyConfigured ? (
            <span className="text-xs font-normal text-muted-foreground">
              (neuer Wert ersetzt den alten)
            </span>
          ) : null}
        </Label>
        <Input
          id="jira_api_token"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={apiToken}
          onChange={(e) => setApiToken(e.target.value)}
          placeholder={alreadyConfigured ? "••••••••" : "ATATT3x..."}
        />
        <p className="text-xs text-muted-foreground">
          Server-only. Wird verschluesselt in <code>tenant_secrets</code>{" "}
          abgelegt und nie im Client angezeigt.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="jira_project_key">Default Project-Key</Label>
        <Input
          id="jira_project_key"
          value={projectKey}
          onChange={(e) => setProjectKey(e.target.value)}
          placeholder="ABC"
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {alreadyConfigured && onDelete ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void onDelete()}
            disabled={submitting}
          >
            Credentials loeschen
          </Button>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {submitting
            ? "Speichere ..."
            : alreadyConfigured
              ? "Aktualisieren"
              : "Speichern"}
        </Button>
      </div>
    </form>
  )
}
