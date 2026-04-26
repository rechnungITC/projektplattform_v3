> **Inherited from V2** — Decision still applies to V3. Stack-specific references (FastAPI, Redis, etc.) are historical; Supabase/Next.js V3 implementations follow the same principle.

# Decision Record — Kommunikations-Framework (Outbox + Channels)

**EP-11** · Stand: 2026-04-23

---

## Kontext

Das Epic EP-11 bündelt vier Stories (Kommunikationscenter, E-Mail, Slack/Teams, interner Chat). Bevor irgendein Kanal fachlich umgesetzt wird, braucht die Plattform ein gemeinsames Grundgerüst:

- Nachrichten müssen persistent werden, bevor sie zugestellt werden (Retries, Audit, DSGVO).
- Die Business-Logik darf nicht wissen, ob ein Kanal E-Mail, Slack oder intern ist.
- Kanal-spezifische Provider wechseln — die API-Schicht bleibt stabil.

Wir liefern in dieser Runde den **Framework-Stub**. Reale Kanal-Integrationen folgen pro eigener Story.

## Entscheidung

### Outbox-Pattern

`communication_outbox` hält jede Nachricht mit:

- `channel` (`internal` / `email` / `slack` / `teams`)
- `recipient`, `subject`, `body`, `metadata` (JSONB)
- `status` (`queued` / `sent` / `failed` / `suppressed`)
- `error_detail`, `sent_at`
- Provenienz: `created_by`, `tenant_id`, `project_id`

Die Schreibseite fügt immer zuerst einen `queued`-Eintrag ein, ruft dann den Channel-Adapter auf und aktualisiert den Status atomar. Bei Absturz zwischen Insert und Delivery bleibt eine `queued`-Row, die ein späterer Retry-Worker nachholen kann.

### Channel-Adapter

Protocol in `services/communication/outbox.py`:

```python
class ChannelAdapter(Protocol):
    channel: Channel

    async def deliver(
        self, entry: CommunicationOutboxEntry
    ) -> tuple[str, str | None]:
        """(new_status, error_detail). MUST NOT raise."""
```

- **InternalChannel**: echte Implementierung — Nachricht wird sofort als `sent` markiert. Deckt AK EP-11-ST-04 „Interner Chat/Notification" auf einfachster Stufe ab.
- **StubExternalChannel** (E-Mail, Slack, Teams): platzhalter-Adapter, der die Row auf `queued` belässt und `error_detail="no-adapter-yet:<channel>"` setzt. Sobald ein echter Provider landet, wird der Stub durch einen echten Adapter ersetzt — die API + Datenstruktur bleiben.

### REST-Schicht

`POST /api/v1/projects/{id}/communication` legt eine Nachricht an und gibt den vollständigen Outbox-Eintrag zurück. RBAC: Editor+ darf senden, Viewer darf nur lesen.

### Datenschutz

`communication_outbox.body` und `recipient` sind `class_3` (oft Personenbezug). Export + Retention-Pfade (F13.7) honorieren das automatisch.

### Was EP-11 in diesem Commit bewusst **nicht** liefert

- **Keine echten E-Mail-/Slack-/Teams-Integrationen** — kommen in eigenen Stories mit konkretem Provider (SMTP, Slack-App, Microsoft Graph).
- **Keine Empfänger-Resolution** (Plattform-User vs. Stakeholder-Email vs. Channel-ID) — Caller übergibt heute Raw-String.
- **Kein Retry-Worker** — Ops-Story.
- **Kein Kommunikationscenter-UI** — folgt, sobald echte Kanäle existieren.

## Konsequenzen

- Jede andere Story, die eine Benachrichtigung erzeugen will (z. B. "Responsible-User-Change benachrichtigt" aus EP-03-ST-05), ruft einfach `OutboxService.enqueue(...)` und kümmert sich nicht um den Kanal.
- Replacing a stub adapter is a one-file change: `_DEFAULT_ADAPTERS` Registrierung tauschen, Rest bleibt gleich.
- `projektplattform.communication`-Logger macht Delivery-Attempts beobachtbar.

## Offene Punkte

- Retry-Policy (Exponential-Backoff? WIP?) wird mit dem ersten echten Adapter definiert.
- Empfänger-Auflösung (User-ID → kanalabhängige Adresse) braucht einen Mapping-Service — folgt mit Stakeholder-/User-Kontaktfeldern.
