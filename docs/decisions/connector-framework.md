> **Inherited from V2** — Decision still applies to V3. Stack-specific references (FastAPI, Redis, etc.) are historical; Supabase/Next.js V3 implementations follow the same principle.

# Decision Record — Connector-Framework (Stub)

**EP-12 / PP-109ff** · Stand: 2026-04-23

---

## Kontext

Epic EP-12 bündelt mehrere Stories: Connector-Framework (ST-01), Jira-Integration (ST-02), Stand-alone-Deployment-Aspekte (ST-03). Wir liefern in dieser Runde den **Framework-Stub** — das Grundgerüst, das ab jetzt jede echte Connector-Story konsumiert. Reale Adapter (Jira, SMTP, Slack, MCP) bekommen eigene Tickets mit Credentials + OAuth + Webhooks.

## Entscheidung

### Registry-Pattern mit Descriptor

`services/connectors/registry.py` hält:

- `ConnectorDescriptor` — Metadaten (Key, Label, Summary, Capability-Tags). Platform-weit bekannt; wird versioniert im Code gepflegt.
- `Connector` Protocol mit `health() -> ConnectorHealth`.
- `UnconfiguredConnector` — Default-Adapter für jeden bekannten Key, liefert `status=unconfigured`. Der Connector-Listview ist dadurch sofort nutzbar, bevor irgendein echter Adapter steht.
- `register(connector)` überschreibt den Stub, sobald ein Adapter-Commit landet.

Bekannte Connectors heute: **Jira**, **SMTP (E-Mail)**, **Slack**, **MCP**. Teams kommt später, wenn der E-Mail/Slack-Pfad stabil läuft.

### API-Schicht

`GET /api/v1/connectors` liefert die Liste mit aktueller Health. `GET /api/v1/connectors/{key}` einzeln. Admin-only, weil Connector-Status Metadaten der Betriebsinfrastruktur sind. Non-Admins bekommen 403.

### Was EP-12 in diesem Commit bewusst **nicht** liefert

- **Keine Credentials-Speicherung** — kommt in einer Security-Story (Secret-Store, Vault-Anbindung).
- **Kein Config-UI** im Einstellungen-Tab — die Auflistung ist admin-only via `/konnektoren`-Seite, die in einer Folge-Story konsumiert wird.
- **Keine Webhooks / Inbound-Events** — Out-of-scope bis Jira-Story konkret wird.
- **Kein OAuth-Flow** — pro Connector separat.
- **Keine Policy-Gates** (z. B. „external connector verboten wenn class-3 Daten") — das ist EP-10-ST-02 für KI-Provider und wird pro Connector-Typ separat angewandt.

## Konsequenzen

- Folge-Story „Jira-Integration" tauscht nur `register(JiraConnector(...))` und implementiert `health()` + Sync-Logik. Kein Refactoring am Registry selbst.
- Das UI (`/konnektoren`-Seite, aktuell Placeholder aus EP-02-ST-01) kann jetzt auf echte Daten zeigen, sobald ein Frontend-Binding nachgezogen wird.
- Communication-Channel-Adapter aus EP-11 und Connectors teilen sich konzeptuell denselben Adapter-Gedanken, bleiben aber getrennt: Connectors sind bidirektional mit Konfiguration, Channels sind primär Outbound mit fix hinterlegtem Adresstyp.

## Offene Punkte

- Credential-Storage-Design (Secret-Store vs. Tenant-Settings-Encrypted-Column) — eigene Story mit Security-Review.
- Health-Polling (kontinuierlich vs. on-demand) — für MVP on-demand ausreichend.
- MCP-Adapter ist architektonisch besonders, weil „Tools zum LLM bereitstellen" kein klassischer Outbound-Call ist. Eigene Story wenn ein Use-Case konkret wird.
