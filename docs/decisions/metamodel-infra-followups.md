> **Inherited from V2** — Decision still applies to V3. Stack-specific references (FastAPI, Redis, etc.) are historical; Supabase/Next.js V3 implementations follow the same principle.

# Decision Record — Metamodell- und Infra-Follow-ups

**EP-05-ST-03, EP-07-ST-01, F13.7, EP-10-ST-01 Follow-up** · Stand: 2026-04-24

---

## Kontext

Nach dem MVP-Abschluss der Hauptstories standen in den Decision Records vier offene Punkte:

1. **Sprint-Entity** für Scrum/SAFe (EP-05-ST-03 Nicht-AK im ersten Abwurf).
2. **SAFe Portfolio-Ebene** als eigene Kinds (work-item-metamodel.md Offene Punkte).
3. **Per-Tenant-Retention-Overrides** (F13.7 Offene Punkte).
4. **Ollama-Local-Provider** als reale Alternative zum Local-Stub (deployment-modes Offene Punkte).

Dieser Record bündelt die Umsetzung aller vier.

## Entscheidungen

### Sprint-Entity

Neue Tabelle `sprints` (tenant-scoped + project-scoped). Felder: `name`, `start_date`, `end_date`, `is_active`. `work_items` bekommt optionale FK `sprint_id` (ON DELETE SET NULL). UI-Pflege kommt mit einer späteren Scrum-Sprint-Planning-Story — für jetzt reicht das Datenmodell und die Feld-Exposure in PATCH + Audit.

### SAFe Portfolio-Kinds

`WorkItemKind` um `portfolio_epic` und `capability` erweitert. Hierarchie:

- `portfolio_epic` → top-level
- `capability` → Parent: `portfolio_epic`
- `epic` → Parents erweitert um `portfolio_epic`, `capability`
- `feature` → Parent zusätzlich `capability`

`WORK_ITEM_METHOD_VISIBILITY` für Portfolio-Kinds auf SAFe beschränkt. Bestehende Tests aktualisiert; neue Tests pinnen „portfolio_epic blockiert in Scrum" + „capability unter portfolio_epic".

### Tenant-Retention-Overrides

Neue Tabelle `tenant_settings` mit Primärschlüssel auf `tenant_id` und zwei JSONB-Feldern: `retention_overrides` und `feature_flags`. `apply_retention()` ruft jetzt eine Helper-Funktion `_effective_retention_days()`, die die Plattform-Default durch den Tenant-Override überschreibt. Pro-Tenant-Schlüssel sind identisch zu `RETENTION_DAYS` (z. B. `audit_log_entries`).

### Ollama Local Provider

Neue `OllamaLocalProvider`-Klasse (httpx gegen `/api/chat`). Wird durch `get_model_router()` automatisch gewählt, wenn `PPV2_OLLAMA_BASE_URL` gesetzt ist; sonst bleibt `StubLocalProvider`. Damit ist F10.2 „Datenschutzbasierte Modellauswahl" auch lokal mit echtem Modell abgedeckt — class-3-Payloads landen dann wirklich auf dem On-Prem-Modell und nicht mehr beim Stub.

### Feature-Flags

`tenant_settings.feature_flags` ist als JSONB angelegt, damit spätere Flags hierhin können — ohne zusätzliche Lib. Eine dedizierte Abstraktion (`flagsmith`-Style) wird erst eingezogen, wenn >5 Flags existieren.

## Was bewusst **nicht** passiert

- **Keine Sprint-CRUD-UI** — Pflege heute nur über direkte SQL-Insert (Tests belegen Round-Trip). Eine echte Sprint-Planning-UI (Burndown etc.) ist eigenes Ticket.
- **Keine automatische Tenant-Settings-Erstellung** bei Tenant-Anlage — Zeile entsteht, sobald der erste Override gesetzt wird. Die Default-Pfad-Query honoriert das Fehlen einer Row.
- **Kein Admin-UI für Retention-Overrides / Flags** — Betreiber setzen die JSONB-Spalte heute direkt in der DB. Ein Settings-Tab kann nachgezogen werden.
- **Kein Observability-Stack** — die Logger `projektplattform.*` sind strukturiert ausreichend; Aggregation (Grafana, Loki, OTEL) ist Ops-Territorium.

## Konsequenzen

- Die ursprünglich als Folge-Story vertagte Liste ist abgearbeitet. `planning/decisions/work-item-metamodel.md`, `retention-and-export.md` und `backlog-board-view.md` werden entsprechend aktualisiert.
- `RETENTION_DAYS` bleibt die Platform-Default; `TenantSettings` überlagert. Retention-Export (`GET /audit/export`) gibt weiterhin die Plattform-Default zurück — eine Tenant-aware Variante kann später nachgezogen werden.

## Offene Punkte nach diesem Chunk

- Sprint-Planning-UI + Burndown/Velocity (eigene Story wenn Kundenwunsch).
- Admin-UI für `tenant_settings`.
- Observability-Stack.
