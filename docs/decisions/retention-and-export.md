> **Inherited from V2** — Decision still applies to V3. Stack-specific references (FastAPI, Redis, etc.) are historical; Supabase/Next.js V3 implementations follow the same principle.

# Decision Record — Retention, DSGVO-Löschung und Export der Versionshistorie

**F13.7 / PP-47** · Stand: 2026-04-23

Verweise: [data-privacy-classification.md](data-privacy-classification.md).

---

## Kontext

F13.7 fordert Governance-Regeln für die Versionshistorie:

- Aufbewahrungsfristen je Datentyp konfigurierbar
- DSGVO-konformes Löschkonzept für Personendaten
- Automatische Archivierung konfigurierbar
- Historie exportierbar (JSON, CSV)
- Protokollierung, wer Historie eingesehen oder exportiert hat

## Entscheidung

### Retention als Code-Policy, nicht DB-Config

`services/retention.py::RETENTION_DAYS` hält die Haltefristen als Dict. Heute eine Plattform-weite Policy; per-Tenant-Overrides kommen mit einer späteren `tenant_settings`-Tabelle. Begründung:

- Policy-Änderungen sollen reviewbar sein (Code-Commit), nicht ad-hoc pro Tenant.
- Deletion ist destruktiv — Änderungen brauchen den Blick einer zweiten Person.
- Tenant-Overrides werden dann überlagert, ohne die Default zu ersetzen.

Initialwerte: `audit_log_entries: 730` (2 Jahre). Werte für andere Datentypen folgen, wenn ein konkretes Aufbewahrungs-Regulativ (z. B. HGB-Projektdaten) eingezogen wird.

### Export als Admin-Operation

`GET /api/v1/audit/export` liefert das gesamte Audit-Log des Tenants als JSON — aber **mit Klasse-3-Redaktion**:

- Personenbezogene Felder (Email, Namen, IDs mit Personenbezug) werden durch den Literal `[redacted:class-3]` ersetzt.
- Klasse-1/2-Felder (Titel, Beschreibungen, IDs, Status) passieren unverändert.
- Nur Plattformrolle `admin` darf aufrufen (403 sonst).
- Jeder Export erzeugt einen Eintrag im Logger `projektplattform.retention` (Event `retention.export`) mit Tenant-ID, Actor, Umfang und Format — AK „Protokollierung, wer eingesehen oder exportiert hat".

CSV ist nicht in diesem Commit — JSON deckt die AK, CSV kann per späterer Option nachgezogen werden, sobald jemand sie einfordert.

### Automatische Archivierung

`apply_retention(session, tenant_id)` löscht Audit-Rows älter als die Policy und loggt die Zahl. Heute manuell aufrufbar; ein Cron-Job wird in einer eigenen Runtime-Story eingerichtet.

### DSGVO-Löschung

Zwei komplementäre Wege:

1. **Export mit Redaktion** (bereits umgesetzt) — das Export-Artefakt ist selbst schon DSGVO-konform: personenbezogene Inhalte fehlen.
2. **Scheduled Purge** — Alter Einträge werden per `apply_retention` entfernt. Keine Möglichkeit, vergangene Einträge teilweise zu anonymisieren; DSGVO „Recht auf Löschung" geht heute zuerst über das Depersonalisieren des **Originalobjekts** (z. B. Stakeholder-Name leeren); die zugehörigen Audit-Rows altern dann natürlich aus.

### Was F13.7 bewusst nicht auflöst

- **Keine rechtliche Bewertung durch die Plattform** (Nicht-AK).
- **Kein Compliance-Reporting** (Nicht-AK).
- **Keine Fristablauf-Benachrichtigungen** (Nicht-AK). Eine Betriebs-UI mit Hinweis „Retention-Cron nicht aktiv" kommt in der Ops-Story.

## Konsequenzen

- Jeder Admin-Export hinterlässt seine Spuren im `retention.export`-Log — Audit der Audit-Einsicht.
- Neue Datentypen mit Personendatenbezug müssen in `data_privacy.py` klassifiziert werden; andernfalls werden sie konservativ als Klasse 3 behandelt und im Export redigiert.
- Der Scheduler-Task, der `apply_retention` aufruft, ist noch nicht konfiguriert — offene Ops-Arbeit.

## Offene Punkte

- Per-Tenant-Overrides der Retention-Policy (benötigt `tenant_settings`-Tabelle).
- CSV-Export-Variante (Feld-für-Feld-Flat-Liste) — kann schnell nachgezogen werden, sobald ein Kunde sie explizit verlangt.
- Runtime-Scheduling: k8s-cronjob, Redis-queue, oder eigener Worker. Entscheidung im Ops-Epic.
