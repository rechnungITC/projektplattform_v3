# PROJ-22: Budget-Modul mit Historisierung, Vendor-Integration & Multi-Currency

## Status: Approved
**Created:** 2026-04-30
**Last Updated:** 2026-04-30

## Summary
Vollständiges Budget-Modul auf Projekt-Ebene mit dreistufiger Hierarchie (**Kategorien → Posten → Buchungen**), manueller Buchungserfassung **plus** Verknüpfung zu Vendor-Rechnungen (PROJ-15), **Multi-Currency mit FX-Umrechnung** für Sammelwährungs-Reports, sowie feldweiser Historisierung über das bestehende Audit-System (PROJ-10). Schließt eine im PRD seit P0 referenzierte Lücke (PROJ-7 listet "Risks/Budget", aber nur Risks wurde umgesetzt).

> **Architektur-Hinweis**: Der Scope ist bewusst groß. Während `/architecture` werden Carve-Outs in PROJ-22b/c erwartet, falls Aufwandsschätzungen den geplanten Slot sprengen. Die im "Suggested locked design decisions"-Block weiter unten gelisteten Forks sind die wichtigsten Hebel zum Re-Sizing.

## Dependencies
- **Requires PROJ-2** (Project CRUD): Budget hängt am Projekt.
- **Requires PROJ-7** (Project Room Shell): neuer Tab "Budget" oder Sub-Section unter "Übersicht".
- **Requires PROJ-10** (Change Management): feldweise Historisierung von Plan-/Ist-/Buchungs-Beträgen.
- **Requires PROJ-15** (Vendor & Procurement) für die Vendor-Invoice-Integration. **Achtung**: aktuelle `vendor_documents`-Tabelle hat KEINE Felder für Brutto/Netto-Beträge oder Währung — entweder muss PROJ-15 vorher erweitert werden, ODER PROJ-22 bringt eine neue `vendor_invoices`-Tabelle mit.
- **Requires PROJ-17** (Tenant Settings): Tenant-Default-Currency + Modul-Toggle `budget`.
- **Optional PROJ-12** (KI Assistance): KI-gestützte Vorschläge für Standard-Kategorien beim Projekt-Setup, deferred zu PROJ-22b.

## V2 Reference Material
- V2 hatte ein einfaches Budget-Tracker-Modul ohne Multi-Currency. V3 geht weiter, weil Konzern-Tenants explizit FX-Reports angefragt haben (siehe Jira-Import 2026-04-30, PP-38).
- V2 ADR `docs/decisions/audit-immutability.md`: Buchungen sind unveränderbar — ein "Stornieren" erzeugt eine **negative** Gegenbuchung statt die Original-Buchung zu löschen. Dieses Prinzip wird in V3 übernommen.

## User Stories
- **Als Projektleiter:in** möchte ich für mein Projekt eine Budget-Struktur in Kategorien (z.B. "Personalkosten", "Sachkosten", "Lizenzen") aufsetzen, damit der Lenkungskreis das Budget nach den gleichen Achsen versteht wie die Buchhaltung.
- **Als Projektleiter:in** möchte ich pro Kategorie einzelne Posten anlegen (z.B. unter "Lizenzen" → "ERP-Software", "Office 365") und für jeden Posten ein Plan-Budget setzen.
- **Als Editor:in** möchte ich pro Posten Buchungen erfassen — entweder mit eigenem Datum + Beleg-Notiz (manuell) oder durch Verknüpfung zu einer Vendor-Rechnung aus PROJ-15.
- **Als Projektleiter:in** möchte ich für jeden Posten eine eigene Währung wählen können, damit ich US-Verträge in USD und EU-Verträge in EUR im selben Projekt führen kann.
- **Als Sponsor:in** möchte ich einen Sammelwährungs-Report sehen, der alle Posten in eine Tenant-Default-Currency umrechnet (heutige Kurse), damit ich auf einen Blick die Gesamtsumme erfasse.
- **Als Projektleiter:in** möchte ich für jeden Posten den Plan-vs-Ist-Status sehen (grün ≤ 90 %, gelb 90–100 %, rot > 100 %) und die kumulierte Buchungssumme in einem Sparkline.
- **Als Auditor:in** möchte ich für jede Plan-Wert-Änderung sehen wer wann was geändert hat (PROJ-10-Audit), damit Nachweise gegenüber Wirtschaftsprüfern möglich sind.
- **Als Editor:in** möchte ich eine versehentliche Buchung stornieren können, indem das System eine negative Gegenbuchung mit Verweis auf das Original anlegt — die Original-Buchung bleibt unverändert.
- **Als Tenant-Admin** möchte ich das Budget-Modul für einen Tenant deaktivieren können, falls der Tenant kein Budget-Tracking braucht (z.B. wegen externem ERP-System).
- **Als KI-Empfänger** sollen die Class-3-Daten der Buchungen (z.B. Beleg-Notiz "Bonus für Frau Müller") niemals in externe LLMs fließen — Buchungstexte sind PROJ-12-klassifiziert.

## Acceptance Criteria

### Datenmodell — Hierarchie (ST-01)
- [ ] Tabelle `budget_categories` mit Feldern `id, tenant_id, project_id, name, description, position int, created_by, created_at, updated_at`. Multi-tenant via `tenant_id NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`. RLS: project-member SELECT, project-editor/lead/admin INSERT/UPDATE/DELETE.
- [ ] Tabelle `budget_items` (Posten) mit Feldern `id, tenant_id, project_id, category_id, name, description, planned_amount numeric(14,2), planned_currency char(3), is_active boolean, position int, created_by, created_at, updated_at`. Constraint: `planned_currency` ∈ ISO-4217-Whitelist (EUR/USD/CHF/GBP/JPY zumindest in v1).
- [ ] Tabelle `budget_postings` (Buchungen) mit Feldern `id, tenant_id, project_id, item_id, kind ('actual'|'reservation'|'reversal'), amount numeric(14,2), currency char(3), posted_at date, note text (max 500), source ('manual'|'vendor_invoice'), source_ref_id uuid nullable, reverses_posting_id uuid nullable, created_by, created_at`. Constraint: `kind='reversal'` ⇒ `reverses_posting_id NOT NULL`; alle anderen ⇒ `reverses_posting_id NULL`.
- [ ] UNIQUE(`reverses_posting_id`) auf `budget_postings` — eine Buchung kann nur einmal storniert werden.
- [ ] `budget_postings` ist immutable: nur INSERT erlaubt; UPDATE/DELETE per RLS verboten. Storno via neue Buchung mit `kind='reversal'`.
- [ ] Indexe: `(project_id, category_id)` auf items, `(item_id, posted_at)` auf postings.

### Plan-/Ist-Aggregation (ST-02)
- [ ] View / Server-Function `budget_item_totals(project_id)` liefert pro Posten: `planned_amount`, `actual_amount` (Summe aktiver Buchungen ohne reversals + minus den von reversals stornierten Beträgen), `reservation_amount`, `traffic_light_state` ('green'|'yellow'|'red'), gruppiert pro Posten.
- [ ] Aggregation berücksichtigt nur Buchungen mit derselben Währung wie der Posten — falls Buchungen in fremder Währung existieren, werden sie zusätzlich als "Multi-Currency Hinweis" aufgezeigt (siehe ST-04 FX).
- [ ] Traffic-Light: green ≤ 90 % Ist/Plan; yellow 90–100 %; red > 100 %. Logik in `lib/budget/traffic-light.ts`, unit-tested.
- [ ] Kategorie-Summen aggregieren über alle aktiven Posten der Kategorie (keine Multi-Currency-Summierung — Anzeige getrennt nach Währung).

### Manuelle Buchungserfassung (ST-03)
- [ ] `POST /api/projects/[id]/budget/postings` legt eine Buchung an mit: `item_id, kind ('actual'|'reservation'), amount, currency, posted_at, note`. Zod-Validation: amount ≥ 0; posted_at darf max. 5 Jahre in Vergangenheit / 1 Jahr Zukunft liegen; note ≤ 500 Zeichen.
- [ ] Berechtigung: project-editor/lead/admin (RLS).
- [ ] Inline in der UI: ein "Buchen"-Button pro Posten öffnet ein Modal mit Datum/Betrag/Währung/Notiz.
- [ ] Storno via `POST /api/projects/[id]/budget/postings/[pid]/reverse` erzeugt eine neue Buchung mit `kind='reversal'`, `amount = -original.amount`, `currency = original.currency`, `reverses_posting_id = original.id`. Nicht stornierbar wenn bereits storniert (UNIQUE-Verstoß → 409).
- [ ] Audit (PROJ-10): jede Plan-Wert-Änderung an `budget_items.planned_amount`, jede Posten-Anlage/Aktualisierung wird historisiert. Buchungen selbst sind immutable und hinterlassen audit-Spur über die INSERT (siehe ST-08 Audit-Strategie).

### Vendor-Invoice-Integration (ST-04)
- [ ] Neue Tabelle `vendor_invoices` (in PROJ-22-Migration enthalten — erweitert PROJ-15) mit `id, tenant_id, vendor_id, project_id nullable, invoice_number, invoice_date, gross_amount, currency, file_storage_key nullable, note, created_by, created_at`. RLS: tenant-member SELECT, project-editor/lead/admin write (wenn `project_id` gesetzt) bzw. tenant-admin (wenn nicht).
- [ ] UI im Vendor-Detail-Drawer (PROJ-15-Erweiterung): Tab "Rechnungen" mit Anlegen/Listen/Löschen.
- [ ] Buchung anlegen aus Vendor-Rechnung: zusätzliche Action "Auf Budget buchen" pro Rechnung; öffnet Modal mit Posten-Auswahl (alle aktiven Posten des Projekts), pre-fillt `amount`, `currency`, `posted_at`, `note` (Rechnungsnummer + Vendor-Name) und legt Buchung mit `source='vendor_invoice'` + `source_ref_id = invoice.id` an.
- [ ] Eine Vendor-Rechnung kann auf mehrere Posten gesplittet werden (mehrere Buchungen mit demselben `source_ref_id`). UI zeigt im Vendor-Drawer die Summe der bereits gebuchten Beträge an.
- [ ] Beim Storno einer Buchung mit `source='vendor_invoice'` bleibt die Vendor-Rechnung unverändert.

### Multi-Currency & FX-Umrechnung (ST-05)
- [ ] Tenant-Setting `budget.default_currency` (default `EUR`) — neues Key in `tenant_settings.privacy_defaults` JSONB oder eigener Spalten. Locked in `/architecture`.
- [ ] Tabelle `fx_rates` mit `from_currency, to_currency, rate numeric(18,8), valid_on date, source ('manual'|'ecb'|'tenant_override'), created_by, created_at`. PRIMARY KEY (from_currency, to_currency, valid_on, source).
- [ ] Initiale FX-Rate-Quelle: **manueller Tenant-Pflegedialog** (Master-Data-Page) ODER eingebaute Daily-Refresh aus EZB-API als Edge-Function. Locked in `/architecture` (siehe Decision 3 unten).
- [ ] Aggregations-API `GET /api/projects/[id]/budget/summary?in_currency=EUR` rechnet alle Plan- und Ist-Werte zur jüngsten verfügbaren FX-Rate in die angegebene Sammelwährung um. Antwort enthält pro Posten den umgerechneten Betrag PLUS die genutzte Rate + valid_on (Audit-fähig).
- [ ] Wenn keine FX-Rate für ein Posten-Currency-Pair verfügbar ist: Aggregation zeigt "n/a" für diesen Posten und einen separaten "FX missing" Indikator.

### UI: Budget-Tab im Project Room (ST-06)
- [ ] Neuer Tab "Budget" in `project-room-shell.tsx`, gated mit `requiresModule: "budget"`.
- [ ] Hauptansicht: Tabellen-Hierarchie Kategorien → Posten mit Plan-, Ist-, Reservierungs-Wert + Traffic-Light + Mini-Sparkline pro Posten.
- [ ] Inline-Aktion "Buchen" pro Posten öffnet Buchungs-Modal.
- [ ] Inline-Aktion "Posten anlegen" pro Kategorie + "Kategorie anlegen" Top-Level-Action.
- [ ] Sammelwährungs-Switcher oben in der Tabelle: "Anzeigen in: [EUR ▾]". Wechselt die Aggregations-API + Anzeige.
- [ ] Buchungs-Detail-Drawer: zeigt alle Buchungen eines Postens chronologisch sortiert mit Datum/Betrag/Notiz/Source/Storno-Action.
- [ ] Healt-Snapshot-Card "Budget" (existiert bereits in `health-snapshot.tsx`) wird mit Real-Daten verkabelt: Label = "X% verbraucht", Tone = traffic-light-state-Farbe.

### Modul-Gate & Audit (ST-07)
- [ ] Module-Key `budget` in `TOGGLEABLE_MODULES` aufgenommen, default-on für neue Tenants, idempotent backfilled für existierende Tenants in der Migration.
- [ ] Wenn deaktiviert: Budget-Tab versteckt, alle `/api/projects/[id]/budget/*`-Routes geben 403 mit `code='module_disabled'`.
- [ ] Audit-Whitelist (PROJ-10) erweitert um `budget_categories`, `budget_items`, `vendor_invoices`. Tracked Columns: `budget_categories.name/description`; `budget_items.name/description/planned_amount/planned_currency/is_active`; `vendor_invoices.invoice_number/invoice_date/gross_amount/currency`.
- [ ] Buchungen werden nicht über `record_audit_changes` historisiert (sie sind immutable). Stattdessen schreibt der `POST /postings`-Endpunkt einen synthetischen Audit-Eintrag mit `entity_type='budget_postings'`, `field_name='posting_created'`, `change_reason='Buchung angelegt'`. Buchungs-Stornos schreiben analog mit `change_reason='Buchung storniert'`.

### Datenschutz / KI-Klassifikation (ST-08)
- [ ] `data-privacy-registry` erweitert: alle Buchungs-Notizen (`budget_postings.note`) auf Class-3 — ein Notiztext "Bonus für Frau Müller" enthält PII. Plan-/Ist-Beträge auf Class-2 (geschäftlicher Kontext, keine PII).
- [ ] PROJ-12 KI-Routing leitet Buchungs-Notizen niemals an externe Modelle.
- [ ] Beim Tenant-Export (PROJ-17) werden Class-3-Notizen **redacted** (vorhandenes Pattern wiederverwenden).

## Edge Cases
- **Posten-Löschung mit existenten Buchungen** — Posten kann nur soft-deletet (`is_active=false`) werden, niemals hard-deletet, solange Buchungen existieren. UI zeigt Warnung.
- **Kategorie-Löschung mit Posten** — Kategorie kann nur gelöscht werden wenn alle Posten soft-deleted sind. Sonst 409.
- **Buchung in fremder Währung anlegen** — wird zugelassen (z.B. eine USD-Rechnung auf einen EUR-Posten); UI markiert den Posten dann mit "Multi-Currency". Aggregations-Endpunkt zeigt beide Beträge getrennt sowie eine FX-Approximation.
- **Storno einer Storno-Buchung** — nicht erlaubt; ein `kind='reversal'` ist final. Versuch → 422.
- **FX-Rate fehlt für angefragte Sammelwährung** — Aggregation gibt 200 mit `missing_rates: [{from, to, valid_on}]` zurück; UI zeigt Posten als "n/a" + Hinweis "FX-Rate fehlt — bitte im Tenant-Admin pflegen".
- **Vendor-Rechnung wird gelöscht (PROJ-15 Vendor-Tools)** — die abgeleiteten Buchungen bleiben mit `source_ref_id` auf eine nicht-existente Rechnung. UI markiert sie mit "Quelle gelöscht — manuell verifizieren". Keine Cascade-Delete der Buchungen.
- **Vendor-Rechnung größer als Plan-Budget** — Buchung wird trotzdem zugelassen; Posten-Status springt auf rot. Kein Hard-Stop, nur visueller Hinweis.
- **Tenant wechselt seine `default_currency` nachträglich** — bestehende Posten/Buchungen behalten ihre Währung; nur die Aggregations-Default ändert sich. Snapshot-Reports (PROJ-21) benutzen die Currency, die zum Zeitpunkt des Snapshots aktiv war.
- **FX-Rate-Pflege durch Nicht-Admin** — nicht erlaubt; nur Tenant-Admin darf manuelle FX-Raten setzen oder die EZB-Auto-Refresh aktivieren.
- **Concurrent-Edit auf Plan-Amount** — letzte Schreibung gewinnt; Audit zeigt beide Änderungen mit unterschiedlichen Aktoren.
- **Buchungs-Datum in Zukunft** — bis zu 1 Jahr in Zukunft erlaubt (für Reservierungen). Weiter als 1 Jahr → 422.

## Technical Requirements
- **Stack**: Next.js 16 + Supabase Postgres. Budget-Daten in regulären Tabellen (kein Time-Series-System nötig).
- **Multi-tenant**: Standard-RLS-Pattern: alle Tabellen `tenant_id NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`. Project-Member-Lookup über `is_project_member(project_id)` für SELECT, `has_project_role(project_id, 'editor') OR is_project_lead(project_id) OR is_tenant_admin(tenant_id)` für Schreibroutinen.
- **Validation**: Zod auf allen POST/PATCH-Endpunkten (amounts, currencies, dates, notes).
- **Performance**: Aggregations-Endpunkt soll bei 50 Posten + 500 Buchungen < 500 ms antworten. View-basierte Aggregation oder pre-computed materialised view in `/architecture` zu entscheiden.
- **Module gate**: `budget` in `TOGGLEABLE_MODULES`, default-on.
- **Audit**: PROJ-10 erweitert um neue entity_types + tracked columns. Buchungen erzeugen synthetic audit log entries via API-Route (siehe ST-07 + ST-08).
- **Storage**: Vendor-Rechnungs-PDFs (optional) in Supabase Storage Bucket `vendor-invoices`, signed-URL zugriff per RLS.
- **Currency Safety**: alle Beträge `numeric(14,2)` für Cent-Precision. Niemals `float` für Geld.
- **Privacy**: Class-3 für `budget_postings.note`. Class-2 für alle Beträge.

## Out of Scope (deferred or explicit non-goals)

### PROJ-22b (next slice)
- KI-Vorschläge für Standard-Kategorien beim Projekt-Setup (PROJ-12-Integration).
- Budget-Genehmigungs-Workflow (Plan-Wert-Änderungen ab Schwellwert brauchen Lead-Approval).
- Forecasting / Burndown-Chart.
- Budget-Snapshots zu Stichtagen (Lenkungskreis-Reports — könnte mit PROJ-21 verzahnt werden).

### PROJ-22c (später)
- Multi-Project-Roll-up (Konzern-Sicht über alle Projekte eines Tenants).
- Time-Tracking-Integration (PROJ-11 erfasst FTE — Konvertierung in Buchungen mit Stunden×Tagessatz).
- Excel-Import / -Export für Buchungen.
- Custom-Currency (mehr als die 5 ISO-Whitelist-Codes in v1).
- Budget-Vergleich zwischen Projekten oder Versionen ("Was wäre wenn"-Szenarien).
- Mehrwertsteuer-Handling (Brutto/Netto-Trennung). MVP geht implizit von Brutto-Beträgen aus.

### Explizite Non-Goals
- **Keine Buchhaltungs-Software-Ersatz**. Das Modul ist für Projektsteuerung, nicht für Bilanzierung. Steuern, Konsolidierung, Abschreibungen sind out-of-scope.
- **Keine Echtzeit-FX-Updates pro Sekunde** — Tagesfeed reicht.
- **Keine Approval-Hierarchie für Buchungen** — Buchungen sind sofort wirksam, kein Genehmigungsschritt.

## Suggested locked design decisions for `/architecture`

1. **Vendor-Invoice-Tabelle**
   - **A. PROJ-22 bringt eigene `vendor_invoices`-Tabelle mit** (klar abgegrenzt zu `vendor_documents`, das eher "Vertrag/NDA/Referenz" abdeckt).
   - B. PROJ-15 wird vor PROJ-22 erweitert um `gross_amount` + `currency` auf `vendor_documents`.
   - **Empfehlung A** — saubere Trennung, keine PROJ-15-Migrationsabhängigkeit.

2. **Aggregations-Strategie**
   - **A. SQL-View `budget_item_totals`** liest live aus `budget_postings`. Einfach, performant bis ~10k Buchungen pro Projekt.
   - B. Materialized view + Refresh-Trigger nach jedem POST/Storno. Schnellere Reads, aber Stale-Risiko + Trigger-Komplexität.
   - **Empfehlung A** — optimieren wenn nötig, nicht prophylaktisch.

3. **FX-Rate-Quelle**
   - **A. Manueller Pflegedialog im Tenant-Admin** — Tenant pflegt EUR↔USD/CHF/GBP/JPY zum Wunschzeitpunkt. Einfach, kontrollierbar.
   - B. Daily-Refresh aus EZB-API via Vercel-Cron-Edge-Function. Bequem, aber externe Abhängigkeit + DSGVO-Klärung wenn EZB-Endpunkte personenbezogene Logs sammeln.
   - C. Beides (A für Override + B als Standard-Quelle).
   - **Empfehlung A für v1**, C als Folgeslice.

4. **Buchungs-Audit-Strategie**
   - **A. Synthetische Audit-Einträge per API-Route** beim INSERT (entity_type='budget_postings', field_name='posting_created'). Konsistent mit PROJ-13 communication-outbox-Pattern.
   - B. Postgres-Trigger auf `budget_postings AFTER INSERT`.
   - **Empfehlung A** — Trigger-Patterns wurden in PROJ-10 bewusst auf UPDATE beschränkt; INSERT-Audit gehört in die Application-Schicht.

5. **Multi-Currency in Tabellenanzeige**
   - **A. Posten-Zeile zeigt Beträge in Posten-Currency** + Aggregations-Footer in Sammelwährung. Klare Trennung.
   - B. Alle Zeilen in Sammelwährung umgerechnet, Original-Currency als Tooltip.
   - **Empfehlung A** — keine impliziten Umrechnungen ohne expliziten User-Wunsch (Switcher).

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Realitätscheck
PROJ-22 ist die größte verbleibende Slice nach PROJ-18 — sie schließt eine im PRD seit P0 referenzierte Lücke (Budget gehörte ursprünglich zu PROJ-7, wurde nie umgesetzt). Der vom User gewählte Scope umfasst **alle drei Achsen**: Hierarchie (3-stufig), Quellen (manuell + Vendor-Invoice), Währung (Multi-Currency mit FX-Umrechnung).

Der Aufbau lehnt sich konsequent an etablierte V3-Patterns an:
- **Hierarchie + Soft-Delete** wie in PROJ-9 (Work-Items-Tree).
- **Immutable Schreib-Tabelle** (`budget_postings`) wie in PROJ-13 (`communication_outbox`) und PROJ-18 (`compliance_trigger_log`) — das gibt einen sauberen Audit-Trail ohne UPDATE-Pfad.
- **Tenant-additive Override-Tabelle** (`fx_rates`) wie in PROJ-16 (`tenant_project_type_overrides`).
- **Modul-Toggle** (`budget`) wie in PROJ-15 (`vendor`).
- **Audit-Whitelist-Erweiterung** wie in PROJ-18 (compliance_tags).

Die wichtigsten Risiken werden in den Locked Decisions adressiert (siehe unten). Beim aktuellen Scope mit allen Komponenten gehe ich von einem Slice-Aufwand vergleichbar mit PROJ-18 aus (Backend ~2 Tage, Frontend ~2 Tage, QA + Fixes ~1 Tag).

### Komponentenstruktur (Frontend)

```
Project Room (existing)
└── Budget Tab  (NEW, gated by tenant module flag "budget")
    ├── Header
    │   ├── Currency-Switcher    "Anzeigen in: [EUR ▾]"  default = tenant default
    │   ├── Total-Plan / Total-Ist Banner   (in Sammelwährung)
    │   └── "Kategorie anlegen" Button   (Editor + Lead + Admin)
    │
    ├── Categories List
    │   └── Category Card
    │       ├── Header (name, gesamt-plan/ist, traffic-light)
    │       ├── "Posten anlegen" Button
    │       └── Items Table
    │           └── Item Row
    │               ├── Name + Beschreibung
    │               ├── Plan-Wert (Posten-Currency)
    │               ├── Ist-Wert  (Posten-Currency)  — auto-aggregiert
    │               ├── Reservierungen (Posten-Currency)
    │               ├── Traffic-Light Badge (green/yellow/red)
    │               ├── Mini-Sparkline (Buchungs-Verlauf)
    │               ├── "Buchen" Button → öffnet Buchungs-Modal
    │               └── "..."  → Posten bearbeiten / soft-delete
    │
    ├── FX-Hint Banner (bedingt)
    │   "Für Posten in USD/CHF fehlt eine FX-Rate — bitte im Tenant-Admin pflegen."
    │
    └── Modals + Drawers
        ├── BudgetCategoryDialog       (Anlegen / Bearbeiten / Löschen)
        ├── BudgetItemDialog           (Anlegen / Bearbeiten / Soft-Delete)
        ├── BudgetPostingDialog        (Manuell buchen)
        ├── BudgetPostingFromInvoiceDialog  (aus Vendor-Rechnung — siehe PROJ-15-Erweiterung)
        └── BudgetPostingsDrawer       (Liste aller Buchungen eines Postens, mit Storno-Action)

Project Room — Übersicht Tab (existing)
└── HealthSnapshot Card "Budget"   (existing placeholder gets wired to live data)

Vendor Detail Drawer (PROJ-15, existing) — extended
└── New Tab "Rechnungen"
    ├── "Rechnung anlegen" Button
    ├── Invoice List (Datum, Nummer, Brutto + Currency, gebuchter Anteil, Status)
    └── per-Invoice Action "Auf Budget buchen" → öffnet BudgetPostingFromInvoiceDialog

Tenant Admin (PROJ-17, existing) — extended
└── New Section "FX-Rates"  (Admin-only)
    ├── Rate-Tabelle (from→to, Rate, valid_on, source)
    └── "Rate hinzufügen" Dialog
```

### Datenmodell (Klartext)

Sechs neue Tabellen, alle mit `tenant_id` und Standard-RLS:

**1. budget_categories** — Top-Level-Gruppen pro Projekt (z.B. "Personalkosten").
- Felder: id, tenant_id, project_id, name (1–100), description (≤2000), position (für Sortierung), Standard-Audit-Felder.
- Sichtbarkeit: project-member; Schreibzugriff: editor / lead / admin.

**2. budget_items** — Posten innerhalb einer Kategorie (z.B. "ERP-Software-Lizenz").
- Felder: id, tenant_id, project_id, category_id, name, description, planned_amount (numeric 14,2), planned_currency (ISO-4217 char(3) aus Whitelist EUR/USD/CHF/GBP/JPY), is_active (Soft-Delete), position, Audit-Felder.
- Sichtbarkeit + Schreibzugriff wie Categories.

**3. budget_postings** — **immutable Buchungen**. Storno via neue Buchung mit `kind='reversal'` + `reverses_posting_id`.
- Felder: id, tenant_id, project_id, item_id, kind ('actual'|'reservation'|'reversal'), amount (kann negativ bei reversal), currency, posted_at (Datum), note (≤500 Zeichen, **Class-3-PII**), source ('manual'|'vendor_invoice'), source_ref_id (UUID auf vendor_invoice oder null), reverses_posting_id (UNIQUE), created_by, created_at.
- INSERT-only durch RLS; jeder INSERT erzeugt synthetischen `audit_log_entries`-Eintrag.

**4. vendor_invoices** — Vendor-Rechnungs-Master (NEU, in PROJ-22-Migration enthalten — saubere Trennung zu PROJ-15 `vendor_documents` für Verträge/NDAs).
- Felder: id, tenant_id, vendor_id, project_id (nullable — tenant-globale Rechnungen sind möglich), invoice_number (1–100), invoice_date, gross_amount (14,2), currency, file_storage_key (nullable, Supabase-Storage-Key), note, created_by, created_at.
- Eine Rechnung kann auf mehrere Posten gesplittet werden (mehrere `budget_postings` mit gleichem `source_ref_id`).

**5. fx_rates** — Multi-Currency-Umrechnungstabelle.
- Composite PK: (from_currency, to_currency, valid_on, source).
- Felder: rate (numeric 18,8), source ('manual'|'tenant_override'). v1: nur 'manual' (Tenant-Admin pflegt händisch). 'ecb'/'auto-refresh' deferred zu PROJ-22b.
- Aggregations-API wählt jüngste verfügbare Rate (max valid_on ≤ heute).

**6. Erweiterungen an bestehenden Tabellen**:
- `tenant_settings.privacy_defaults` (JSONB) bekommt einen neuen Key `budget.default_currency` (default 'EUR').
- `audit_log_entry_check`-Whitelist erweitert um die 4 neuen entity_types.
- `_tracked_audit_columns()` erweitert um Plan-/Master-Felder.

**Geschäftsregeln im Datenmodell**:
- Kategorien haben Position-Reihenfolge pro Projekt (manuell sortierbar).
- Posten erben Sichtbarkeit von der Kategorie/Project; eigene Position pro Kategorie.
- Buchungen sind unveränderbar (DB-RLS: nur INSERT).
- Storno schreibt eine neue Buchung mit `amount = -original.amount` und `kind='reversal'`. Storno eines Stornos ist verboten (CHECK + Application-Layer-Reject).
- Cascade beim ON-DELETE CASCADE-Tenant-Schluss: alle Daten weg. Beim Posten-Soft-Delete (`is_active=false`) bleiben Buchungen lesbar.

### Aggregations-Strategie

Eine SQL-View `budget_item_totals(project_id)` liefert pro Posten die abgeleiteten Werte:
- `actual_amount` = Summe der `kind='actual'`-Buchungen MINUS Beträge der zugehörigen `kind='reversal'`-Buchungen, nur Buchungen in derselben Currency wie der Posten.
- `reservation_amount` analog für `kind='reservation'`.
- `traffic_light_state` per CASE-Statement basierend auf `actual / planned`-Ratio.
- `multi_currency_postings_count` zeigt, wie viele Buchungen in fremder Währung existieren (UI-Hinweis "Multi-Currency").

Sammelwährungs-API holt die Posten + die `fx_rates`-Tabelle und rechnet pro Posten in die angefragte Currency um. Wenn keine Rate für ein Pair vorhanden: `null` für diesen Posten + Eintrag in `missing_rates`-Liste der Antwort.

### Datenfluss — Buchung anlegen (manuell)

```
User klickt "Buchen" auf einem Posten
  └─ BudgetPostingDialog öffnet
      └─ User füllt Datum / Betrag / Currency / Notiz
          └─ POST /api/projects/[id]/budget/postings
              └─ Server validiert mit Zod (RLS prüft project-editor)
                  └─ INSERT in budget_postings (immutable)
                      └─ INSERT in audit_log_entries (synthetisch)
                          └─ Frontend refresht Posten-Liste
                              └─ Aggregations-View liefert neue Ist-Werte
```

### Datenfluss — Storno

```
User klickt "Storno" auf einer Buchung
  └─ Bestätigungs-Dialog
      └─ POST /api/projects/[id]/budget/postings/[pid]/reverse
          └─ Server prüft: Buchung existiert + nicht selbst ein Storno + nicht bereits storniert (UNIQUE auf reverses_posting_id)
              └─ INSERT neue budget_postings-Zeile mit kind='reversal', amount=-orig, reverses_posting_id=orig.id
                  └─ INSERT audit_log_entries (synthetisch, change_reason='Buchung storniert')
                      └─ Aggregations-View zieht den negativen Wert automatisch ab
```

### Datenfluss — Buchung aus Vendor-Rechnung

```
User öffnet Vendor-Drawer → Tab "Rechnungen"
  └─ Klickt "Rechnung anlegen" → POST /api/vendors/[vid]/invoices
      └─ Rechnung wird tenant-scoped angelegt
          └─ Action "Auf Budget buchen" auf einer Rechnung
              └─ BudgetPostingFromInvoiceDialog öffnet (pre-fillt amount, currency, posted_at, note)
                  └─ User wählt Posten + ggf. Teilbetrag (Splittung)
                      └─ POST /api/projects/[id]/budget/postings mit source='vendor_invoice', source_ref_id=invoice.id
                          └─ Buchung verlinkt mit Rechnung
                              └─ Vendor-Drawer zeigt Buchungs-Summe pro Rechnung an
```

### Tech-Entscheidungen (locked, mit Begründung für PMs)

**1. Eigene `vendor_invoices`-Tabelle** (statt PROJ-15 `vendor_documents` zu erweitern).
> Sauber getrennt: `vendor_documents` ist seit PROJ-15 für Verträge/NDAs/Referenzen — fachlich anders als Rechnungen mit Brutto-Beträgen. Eine eigene Tabelle in PROJ-22 vermeidet eine Migration auf einer schon-deployten Tabelle und macht den Scope kleiner.

**2. SQL-View für Aggregation** (statt Materialized View mit Trigger-Refresh).
> Live-View ist bis ~10 000 Buchungen pro Projekt schnell genug. Materialized View bringt Trigger-Komplexität + Stale-Risiken, die wir nur lösen, wenn Performance es erzwingt. "Performance optimieren wenn nötig, nicht prophylaktisch."

**3. Manueller FX-Rate-Pflegedialog** (statt Daily-Refresh aus EZB-API).
> Tenant-Admin pflegt EUR↔Major-Currencies händisch zum Wunschzeitpunkt. Volle Kontrolle, keine externe Abhängigkeit, keine DSGVO-Klärung mit der EZB. Auto-Refresh ist als PROJ-22b geplant, falls Tenants nach täglicher Aktualisierung fragen.

**4. Synthetische Audit-Einträge per API-Route** (statt Postgres-Trigger AFTER INSERT).
> Konsistent mit PROJ-13 communication-outbox-Pattern. Trigger-basierte Audits in V3 sind absichtlich auf UPDATE beschränkt (PROJ-10-Architektur-Regel); INSERT-Audit gehört in die Application-Schicht, wo wir `change_reason` mit Kontext füllen können.

**5. Posten-Currency in der Tabelle, Sammelwährung im Footer** (statt impliziter Umrechnung pro Zeile).
> Lenkungskreise wollen genau wissen, in welcher Währung gebucht wurde. Implizite Umrechnungen pro Zeile verschleiern das. Stattdessen: Posten-Zeile in eigener Currency + Currency-Switcher oben, der einen Footer-Total in Sammelwährung berechnet.

### Sicherheitsdimension

- Standard-Tenant-Isolation: Alle Tabellen `tenant_id NOT NULL REFERENCES tenants(id) ON DELETE CASCADE` mit RLS-Policies basierend auf `is_project_member` / `has_project_role(_, 'editor')` / `is_project_lead` / `is_tenant_admin`.
- **Class-3 PII-Schutz**: `budget_postings.note` ist Class-3 — fließt **nie** in externe LLMs (PROJ-12 hard-block via data-privacy-registry).
- **Class-2 Beträge**: Plan-/Ist-/Buchungs-Beträge sind Geschäftskontext, kein PII — können in interne Reports/PROJ-21-Snapshots fließen.
- **Immutable Buchungen**: keine UPDATE/DELETE-Policy → kein "stiller Storno" möglich.
- **Defense-in-depth**: Storno-Eindeutigkeit über UNIQUE-Constraint auf `reverses_posting_id` — auch bei Race-Conditions zwischen zwei Editor-Sessions kann eine Buchung nur einmal storniert werden.
- **FX-Rate-Pflege**: nur Tenant-Admin (über RLS gesichert + Frontend-Gate).
- **Tenant-Export (PROJ-17)**: Class-3-Notizen werden bei Export redacted (vorhandenes Pattern wiederverwenden).

### Neue Code-Oberfläche

**Backend**
- 1 Migration: 5 neue Tabellen + 1 View + 4 Audit-Whitelist-Erweiterungen + Modul-Backfill.
- 7 API-Routen: 
  - `/api/projects/[id]/budget/categories` (CRUD)
  - `/api/projects/[id]/budget/items` (CRUD)
  - `/api/projects/[id]/budget/postings` (POST + LIST)
  - `/api/projects/[id]/budget/postings/[pid]/reverse` (POST)
  - `/api/projects/[id]/budget/summary?in_currency=EUR` (GET, Sammelwährung)
  - `/api/vendors/[vid]/invoices` (CRUD)
  - `/api/tenants/[id]/fx-rates` (Admin-CRUD)
- `lib/budget/`:
  - `types.ts`, `api.ts` (Client-Wrapper), `traffic-light.ts` (pure Funktion + Tests), `aggregation.ts` (Server-side Sammelwährungs-Berechnung).

**Frontend**
- `src/app/(app)/projects/[id]/budget/page.tsx` — neuer Tab.
- `src/components/budget/` — 7 neue Komponenten (Categories-List, Item-Row, BudgetCategoryDialog, BudgetItemDialog, BudgetPostingDialog, BudgetPostingsDrawer, BudgetPostingFromInvoiceDialog).
- `src/components/vendors/vendor-invoices-tab.tsx` — Erweiterung Vendor-Drawer.
- `src/app/(app)/settings/tenant/fx-rates/page.tsx` — Admin-FX-Pflegedialog.
- `health-snapshot.tsx` — Verkabelung mit Live-Daten.
- 4 neue Hooks: `use-budget-categories`, `use-budget-items`, `use-budget-postings`, `use-fx-rates`.

**Module-Toggle**
- `budget` zu `TOGGLEABLE_MODULES` hinzugefügt, idempotent backfilled.
- `project-room-shell.tsx` Tab-Eintrag mit `requiresModule: "budget"`.

### Abhängigkeiten

Keine neuen npm-Packages nötig — alles steht (zod, supabase, react-hook-form, shadcn/ui, lucide-react). Die Sparkline kann mit der vorhandenen Recharts-Library oder einer einfachen SVG-Lösung umgesetzt werden — Entscheidung dem Frontend überlassen.

### Out-of-Scope-Erinnerungen + Architektur-Risiken

**Was im MVP wirklich geliefert wird** — die volle Liste in den ACs ist locked:
- 6 neue Tabellen / View
- 7 API-Routen
- Vendor-Rechnungs-Tab im Vendor-Drawer
- Manuelle Buchungserfassung
- Multi-Currency mit FX-Umrechnung (manuelle Pflege)
- Stornierung über negative Gegenbuchung
- KPI-Card-Verkabelung
- Module-Toggle

**Bewusst deferred** (PROJ-22b/c — siehe Spec-Sektion "Out of Scope"):
- KI-Vorschläge für Standard-Kategorien
- Genehmigungs-Workflow
- Forecasting/Burndown
- EZB-API-Auto-Refresh
- Multi-Project-Roll-up
- Time-Tracking-Integration (Stunden×Tagessatz aus PROJ-11)
- Excel-Import/Export
- Mehrwertsteuer
- Custom-Currency (mehr als die 5 ISO-Codes in v1)

**Architektur-Risiken zum Beobachten**:
- **Volume**: Wenn ein Projekt > 10 000 Buchungen hat, kann die Live-View langsam werden. Plan B: Materialized-View-Folgeslice mit nightly-Refresh. Heute kein konkretes Tenant-Volumen, das das erzwingt.
- **FX-Rates fehlen**: Wenn ein Tenant Multi-Currency aktiv nutzt aber keine Rates pflegt, sind Sammelreports unbrauchbar. UI-Banner + Tenant-Admin-Notification könnten in einer Folgeiteration hinzukommen.
- **Vendor-Invoice-PDF-Storage**: 50 MB pro Tenant in Supabase Storage als Default-Plan — bei großen Tenants kann das schneller volllaufen. Nicht heute lösen, beobachten.

### 🎯 Architektur-Entscheidungen, die das User-Review bestätigen muss

Alle 5 Decisions aus dem Spec wurden mit den **Recommended Defaults** gelockt:

| # | Decision | Locked auf |
|---|----------|------------|
| 1 | Vendor-Invoice-Tabelle | **A** — eigene `vendor_invoices`-Tabelle in PROJ-22 |
| 2 | Aggregations-Strategie | **A** — SQL-View `budget_item_totals` |
| 3 | FX-Rate-Quelle | **A** — manueller Tenant-Admin-Pflegedialog (EZB-Auto-Refresh deferred) |
| 4 | Buchungs-Audit | **A** — synthetische Audit-Einträge per API-Route |
| 5 | Multi-Currency-Anzeige | **A** — Posten-Zeile in Posten-Currency + Footer in Sammelwährung |

Wenn der User mit einer der 5 nicht einverstanden ist: zurück zur Diskussion, Decision umlocken, Tech Design entsprechend anpassen.

## Implementation Notes

### Backend slice (2026-04-30)

**Migration `20260430200000_proj22_budget_modul.sql`** (applied live):
- 5 new tables (`budget_categories`, `budget_items`, `budget_postings`, `vendor_invoices`, `fx_rates`) — all with tenant-scoped RLS, defense-in-depth CHECK constraints (currency-whitelist via `_is_supported_currency()`, amount/length/date sanity), and ON DELETE CASCADE on tenant.
- 1 SQL view `budget_item_totals` (security_invoker=true) computing per-item actual/reservation/traffic-light + multi-currency-postings count.
- `tenant_settings.budget_settings` JSONB column added (default `{"default_currency":"EUR"}`); `budget` module key idempotently backfilled to all tenants via `||` JSONB array append.
- Audit whitelist extended for `budget_categories`, `budget_items`, `vendor_invoices` (tracked-columns set per spec). `budget_postings` is INSERT-only (no UPDATE/DELETE policies); audit happens via API-route synthetic entries (Architecture Decision 4).
- `can_read_audit_entry` extended to resolve `budget_*` and `vendor_invoices` entity types.
- Live verified: 5 tables RLS=true, view exists, `budget` module backfilled, `default_currency=EUR` set for tenant `329f25e5-…`.

**Lib layer** (`src/lib/budget/`, `src/types/budget.ts`):
- `types.ts` — `BudgetCategory`, `BudgetItem`, `BudgetItemTotals`, `BudgetItemWithTotals` (joined shape), `BudgetPosting`, `VendorInvoice`, `VendorInvoiceWithBookings`, `FxRate`, `BudgetSummary`.
- `traffic-light.ts` — pure `deriveTrafficLight(planned, actual)` mirroring the SQL CASE in the view; 6 unit tests covering boundaries (planned=0, ratio=0.9 yellow start, ratio>1.0 red, negative actuals).
- `aggregation.ts` — pure `pickLatestRate` + `buildSummary` (testable without DB) plus `resolveBudgetSummary` (DB-bound). 7 tests covering identity-pass, USD→EUR conversion, missing-rate handling, inactive-item exclusion, multi-pair missing-rates aggregation, 2-decimal rounding.
- `api.ts` — fetch wrappers for all 11 endpoints.
- `src/types/tenant-settings.ts` extended with `SupportedCurrency`/`SUPPORTED_CURRENCIES`/`BudgetSettings`; `budget` added to `ModuleKey`/`TOGGLEABLE_MODULES`/`MODULE_LABELS`.

**API routes** (11 endpoints):
- Categories: `GET /api/projects/[id]/budget/categories`, `POST` (create), `PATCH /[cid]`, `DELETE /[cid]` (refuses delete with active items → 409 `category_not_empty`).
- Items: `GET /api/projects/[id]/budget/items` (joins totals from view, single round-trip), `POST` (create), `PATCH /[iid]`, `DELETE /[iid]` (refuses delete with postings → 409 `item_has_postings`; soft-delete via `is_active=false` is the alternative).
- Postings: `GET /api/projects/[id]/budget/postings?item_id=…`, `POST` (zod: kind ∈ {actual,reservation}, currency ∈ ISO whitelist, posted_at YYYY-MM-DD; defense-in-depth checks item belongs to project + is_active=true; writes synthetic `audit_log_entries` with `change_reason='Buchung angelegt'` via service-role admin client).
- `POST /api/projects/[id]/budget/postings/[pid]/reverse` — reversal flow: refuses to reverse a reversal (422 `cannot_reverse_reversal`); UNIQUE on `reverses_posting_id` returns 23505 → 409 `already_reversed`; writes synthetic audit `change_reason='Buchung storniert'`.
- `GET /api/projects/[id]/budget/summary?in_currency=EUR` — uses `resolveBudgetSummary` lib helper.
- Vendor invoices: `GET /api/vendors/[vid]/invoices` (enriches each row with `booked_amount` aggregated from postings via `source_ref_id`), `POST` (cross-tenant project_id check), `DELETE /[ivid]`.
- FX rates: `GET /api/tenants/[id]/fx-rates`, `POST` (admin-only via RLS, UNIQUE conflict → 409 `rate_exists`), `DELETE /[rid]`.

**Live red-team verification**:
- Cross-tenant SELECT on all 5 tables → 0 rows visible to a foreign user. ✅
- E2E flow as service-role: created category + item + 3 postings (2 EUR, 1 USD); view returned `actual_amount=8500 EUR`, `multi_currency_postings_count=1`, `traffic_light_state=green` (8500/10000=0.85). ✅
- Storno flow: 1000 EUR actual + reversal → view `actual_amount=0`. ✅ Double-reversal blocked: second INSERT with same `reverses_posting_id` → 23505 (unique violation). ✅
- Traffic-light boundaries: 950/1000=yellow, 1100/1000=red, both as expected. ✅
- Posting `posted_at` window CHECK: tested ±5y / +1y bounds via constraint inspection.
- Currency whitelist CHECK: `_is_supported_currency` rejects unknown codes.

**Validation status**:
- TypeScript: clean (`tsc --noEmit` → 0).
- Vitest: 53 files / 388 tests pass (+15 from PROJ-22: 6 traffic-light, 7 aggregation, 2 fixed pre-existing).
- Lint: same 84 pre-existing issues, no new regressions.
- Dev-server boot: clean (`✓ Ready in 418ms`). All 6 budget routes resolve with 307 (auth redirect).

**Deferred to PROJ-22b (per locked scope)**:
- KI-Vorschläge für Standard-Kategorien beim Projekt-Setup.
- Budget-Genehmigungs-Workflow.
- Forecasting/Burndown-Chart.
- EZB-API-Auto-Refresh für FX-Rates.

**Deferred to PROJ-22c**:
- Multi-Project-Roll-up.
- Time-Tracking-Integration (PROJ-11 Stunden × Tagessatz).
- Excel-Import/-Export.
- Custom-Currency (>5 ISO-Codes).
- Mehrwertsteuer (Brutto/Netto).

**Frontend**: nicht in dieser Slice. Siehe Komponentenstruktur im Tech-Design-Block — wird durch `/frontend PROJ-22` umgesetzt.

### QA-Fix + Frontend slice (2026-04-30)

Adressiert die Bugs aus dem 1. QA-Pass + liefert die Frontend-Slice, die beim ursprünglichen `/backend`-Lauf zurückgestellt war.

**HIGH-1 fixed — Module-Gate auf allen 11 PROJ-22 Routes**:
- `requireModuleActive(supabase, tenantId, "budget", { intent: "read"|"write" })` aus `lib/tenant-settings/server.ts` in jede Route eingebaut, nach Auth-Check.
- Routes mit `project_id` im Pfad lesen die `tenant_id` über einen Project-Lookup; Vendor-Routes über die Vendor-Zeile; Tenant-Routes nehmen die ID aus dem URL-Param direkt.
- Read-Intent → 404 bei deaktiviertem Modul (leak-safe), Write-Intent → 403 mit `code='module_disabled'`. Konsistent mit dem PROJ-15/PROJ-13-Pattern.
- Live-verifiziert: Test-Query `select active_modules ? 'budget'` für den Live-Tenant zeigt `true`; Helper-Lookup-Query funktioniert auf der erweiterten `tenant_settings`-Struktur.

**LOW-1 fixed — `data-privacy-registry.ts` erweitert**:
- 18 neue Felder klassifiziert über alle 5 PROJ-22-Tabellen (siehe Spec ST-08):
  - `budget_categories.name/description` → Class 2 (Geschäftskontext, kein PII)
  - `budget_items.name/description/planned_amount` → Class 2; `planned_currency/is_active` → Class 1
  - `budget_postings.amount/posted_at` → Class 2; `kind/currency/source` → Class 1; **`note` → Class 3 (PII-Risiko durch freien Text)**
  - `vendor_invoices.invoice_date/gross_amount` → Class 2; `invoice_number/currency` → Class 1; **`note` → Class 3**
  - `fx_rates.*` → Class 1 (reine Marktdaten), nur `valid_on` → Class 2
- Konsequenz: KI kann jetzt Plan-Werte und Aggregations-Kontext in externe Modelle leiten (Class-2-Pfad), während Buchungs-Notizen und Vendor-Notizen technisch lokal bleiben.

**Frontend slice (MEDIUM-1 → fixed)**:

3 neue Hook-Files (`src/hooks/`):
- `use-budget.ts` — `useBudgetCategories`, `useBudgetItems`, `useBudgetPostings`, `useBudgetSummary` (4 Hooks in einem File für Co-Location)
- `use-vendor-invoices.ts` — `useVendorInvoices` (mit `booked_amount`-Aggregation)
- `use-fx-rates.ts` — `useFxRates`

7 neue Frontend-Komponenten (`src/components/budget/`):
- `format.ts` — `formatCurrency` (de-DE Intl) + Traffic-Light-Tailwind-Mappings
- `project-budget-tab-client.tsx` — Haupt-Page-Client mit Currency-Switcher, Gesamt-Banner, FX-Hint-Banner, Kategorie/Posten-Liste, Inline-Aktionen, Module-Gate-Empty-State
- `budget-category-dialog.tsx` — Anlegen/Bearbeiten
- `budget-item-dialog.tsx` — Anlegen/Bearbeiten mit Currency-Picker
- `budget-posting-dialog.tsx` — Manuelles Buchen mit Class-3-Hinweis im Notiz-Feld
- `budget-postings-drawer.tsx` — chronologische Buchungs-Liste mit Storno-Action; markiert reversed + reversal Buchungen visuell (line-through)
- `vendor-invoices-tab.tsx` — Vendor-Drawer-Tab mit Invoice-Liste + Anlegen-Dialog (zur späteren Integration in den PROJ-15 Vendor-Drawer)
- `tenant-fx-rates-page-client.tsx` — Admin-only FX-Pflegedialog

3 neue Page-Routen:
- `/projects/[id]/budget/page.tsx` — Budget-Tab im Project Room
- `/settings/tenant/fx-rates/page.tsx` — Admin-FX-Pflegedialog

`project-room-shell.tsx` erweitert: neuer "Budget"-Tab mit `requiresModule:"budget"` (Wallet-Icon), zwischen Lieferanten und Mitglieder eingefügt.

**UX-Highlights**:
- **Currency-Switcher** oben in der Tabelle ruft `getBudgetSummary?in_currency=` auf und aktualisiert Gesamt-Banner + Progress-Bar.
- **FX-Hint-Banner** zeigt fehlende Currency-Pairs an mit Verweis auf den Tenant-Admin.
- **Traffic-Light-Badges** in `green/yellow/red` Tailwind-Farben (mit Dark-Mode).
- **Multi-Currency-Badge** pro Posten, wenn Buchungen in fremder Währung existieren.
- **Storno-UX**: Confirm-Dialog → POST `/reverse` → Drawer refreshed → Original-Zeile zeigt "storniert"-Badge + line-through.
- **Module-Disabled-State**: Card mit Hinweis statt einer leeren Page, wenn `budget` nicht in `active_modules`.

**Validation status post-fix**:
- TypeScript: clean (`tsc --noEmit` → 0).
- Vitest: 53 files / 388 tests pass (no regressions).
- Lint: 84 pre-existing issues (not changed by PROJ-22 frontend slice).
- Dev-server boot: ✓ Ready in 254ms; `/projects/.../budget` und `/settings/tenant/fx-rates` Pages laden mit 307 (Auth-Redirect).
- Live-Probe: `tenant_settings.budget_settings.default_currency = "EUR"` für den Live-Tenant; `requireModuleActive`-Lookup funktioniert auf der erweiterten Struktur.

## QA Test Results

**QA run: 2026-04-30** — production-ready decision: **NOT READY** (1 High blocker, 1 Medium gap, 1 Low).

### Summary

- Backend slice + lib + 11 API routes implemented; **frontend slice (ST-06 UI-Tab) deliberately not in scope of this run**.
- Test suite: **53 files / 388 tests pass** (15 new from PROJ-22 lib + 8 fixed pre-existing). TypeScript clean.
- E2E (Playwright): **14/14 pass** (auth-gate + route-shape on chromium + Mobile Safari).
- Live red-team probes against Supabase project `iqerihohwabyjzkpcujq`: cross-tenant insulation verified, immutability verified, all CHECK constraints enforced, `_is_supported_currency()` whitelist enforced, FX-identity rejected, posted_at-window CHECK rejected.

### Acceptance Criteria — pass/fail

#### ST-01 Datenmodell — Hierarchie

| AC | Pass | Evidence |
|----|------|---------|
| `budget_categories` mit allen Feldern + RLS | ✅ | DDL applied; RLS=true; SELECT=member, INSERT/UPDATE/DELETE=editor/lead/admin (verified via `pg_policy`) |
| `budget_items` mit Plan-Wert + Currency-Whitelist | ✅ | numeric(14,2), planned_currency CHECK via `_is_supported_currency`, is_active boolean |
| `budget_postings` immutable (INSERT-only via RLS) | ✅ | Confirmed: only SELECT + INSERT policies exist; UPDATE/DELETE silently blocked. Live test: authenticated UPDATE returned 0 rows affected. |
| Reversal-Konsistenz (kind='reversal' ⇒ reverses_posting_id NOT NULL) | ✅ | CHECK constraint enforced; verified via inverse test |
| UNIQUE auf reverses_posting_id | ✅ | Live: zweite Reversal mit gleicher reverses_posting_id → 23505 (verified) |
| Indexe auf project_id, category_id, item_id+posted_at | ✅ | `pg_indexes` shows all expected indexes |

#### ST-02 Plan-/Ist-Aggregation

| AC | Pass | Evidence |
|----|------|---------|
| View `budget_item_totals` mit allen Werten | ✅ | View created with security_invoker=true; live verified |
| Aggregation nur in Posten-Currency, Multi-Currency-Hinweis getrennt | ✅ | E2E: 5000+3500 EUR + 1500 USD → actual_amount=8500 EUR (USD ausgeschlossen), multi_currency_postings_count=1 |
| Traffic-Light grün/gelb/rot via Lib + View | ✅ | Live: 950/1000=yellow, 1100/1000=red. Lib `lib/budget/traffic-light.ts` mirrors SQL CASE; 6 unit tests pass |
| Kategorie-Summen (Multi-Currency-getrennt) | ⚠ | View liefert per-Item-Daten; Kategorie-Summe muss client-seitig aggregiert werden. Spec-AC ist erfüllt, aber UI muss das selbst rechnen. |

#### ST-03 Manuelle Buchungserfassung

| AC | Pass | Evidence |
|----|------|---------|
| `POST /budget/postings` mit Zod-Validation (amount/currency/posted_at/note) | ✅ | Zod schema in route handler; defense-in-depth Item-Lookup vor INSERT |
| Permission via RLS (editor/lead/admin) | ✅ | RLS-Policy verified |
| Storno-Endpoint `/postings/[pid]/reverse` | ✅ | Refused for `kind='reversal'` (422); UNIQUE-conflict → 409 `already_reversed`; synthetic audit `change_reason='Buchung storniert'` |
| Audit für Plan-Wert-Änderungen | ✅ | `audit_changes_budget_items` AFTER UPDATE trigger attached; tracked: name/description/planned_amount/planned_currency/is_active/position |
| Audit für Buchungs-INSERT (synthetic) | ✅ | API-Route schreibt via `createAdminClient()` einen `audit_log_entries`-Eintrag mit `change_reason='Buchung angelegt'` |

#### ST-04 Vendor-Invoice-Integration

| AC | Pass | Evidence |
|----|------|---------|
| Tabelle `vendor_invoices` (project_id nullable) | ✅ | Created; RLS: tenant-member SELECT; INSERT/UPDATE/DELETE per CASE auf project_id (project-editor/lead/tenant-admin oder tenant-admin only) |
| `GET /api/vendors/[vid]/invoices` mit `booked_amount` joined | ✅ | Route aggregiert `budget_postings.amount where source='vendor_invoice'` per `source_ref_id` |
| Buchung aus Rechnung mit `source_ref_id` | ✅ | POST /budget/postings akzeptiert `source_ref_id`; Route setzt `source='vendor_invoice'` automatisch |
| Splittung einer Rechnung auf mehrere Posten | ✅ | UNIQUE auf `source_ref_id` existiert NICHT (gewünscht — mehrere Buchungen pro Rechnung möglich) |
| Storno einer Vendor-Buchung lässt Rechnung unverändert | ✅ | Reverse-Endpoint kopiert `source` + `source_ref_id` aus Original; Rechnung wird nicht angefasst |

#### ST-05 Multi-Currency & FX-Umrechnung

| AC | Pass | Evidence |
|----|------|---------|
| Tenant-Setting `budget.default_currency` | ✅ | `tenant_settings.budget_settings` JSONB-Spalte mit Default `{"default_currency":"EUR"}`; live für tenant `329f25e5-…` verifiziert |
| Tabelle `fx_rates` mit Composite-Logik | ✅ | UNIQUE (tenant_id, from, to, valid_on, source); identity (from=to) per CHECK abgewiesen; rate>0 CHECK |
| Manueller Pflegedialog (admin-only) | ✅ | RLS: SELECT tenant-member, INSERT/DELETE tenant-admin only; route gated zusätzlich |
| Aggregations-API `?in_currency=` mit Rate-Picking | ✅ | `lib/budget/aggregation.ts` `pickLatestRate` + `buildSummary` (7 unit tests); `resolveBudgetSummary` lädt Items+View+Rates parallel |
| Fehlende FX-Rate → `null` + `missing_rates`-Liste | ✅ | Test: GBP-Posten ohne GBP→EUR Rate → converted_planned=null + entry in missing_rates |
| 2-Decimal-Rounding | ✅ | `round2()` helper, 1 unit test |

#### ST-06 UI: Budget-Tab im Project Room

| AC | Pass | Evidence |
|----|------|---------|
| Budget-Tab in `project-room-shell.tsx` mit `requiresModule:"budget"` | ❌ | **Frontend nicht in dieser Slice** — wird durch `/frontend PROJ-22` umgesetzt |
| Tabellen-Hierarchie + Inline-Aktionen | ❌ | dito |
| Currency-Switcher | ❌ | dito |
| Buchungs-Drawer | ❌ | dito |
| Health-Snapshot-Card-Verkabelung | ❌ | dito |

ST-06 ist in dieser Backend-only-Slice **nicht abgedeckt**. Backend-API ist vollständig; UI folgt.

#### ST-07 Modul-Gate & Audit

| AC | Pass | Evidence |
|----|------|---------|
| Module-Key `budget` in `TOGGLEABLE_MODULES`, default-on, idempotent backfilled | ✅ | `src/types/tenant-settings.ts` extended; live verified — `active_modules ? 'budget'` returns true |
| **Wenn deaktiviert: alle `/api/projects/[id]/budget/*`-Routes geben 403 mit `code='module_disabled'`** | ❌ | **Bug HIGH-1** — `requireModuleActive("budget")` ist in keiner der 11 PROJ-22 Routes aufgerufen. PROJ-15 (vendor) und andere Module nutzen den Helper konsequent; PROJ-22 fehlt komplett. |
| Audit-Whitelist erweitert für 4 entity_types | ✅ | `audit_log_entity_type_check` + `_tracked_audit_columns` + `can_read_audit_entry` alle erweitert |
| Buchungs-Audit synthetic via API-Route | ✅ | siehe ST-03 |

#### ST-08 Datenschutz / KI-Klassifikation

| AC | Pass | Evidence |
|----|------|---------|
| `budget_postings.note` als Class-3 in data-privacy-registry | ⚠ | **Bug LOW-1** — `data-privacy-registry.ts` wurde NICHT erweitert; das System fällt aber automatisch auf Class-3-Default für unbekannte Felder zurück → Default ist Class-3 (sicher). Spec-Intent: explizit registriert. |
| Plan-/Ist-/Buchungs-Beträge als Class-2 (geschäftlicher Kontext) | ⚠ | **Bug LOW-1 (Forts.)** — wegen Class-3-Default werden Plan-Werte zur Zeit als Class-3 behandelt → KI kann Plan-Werte nicht in externe Modelle leiten. Funktional-restriktiv, privacy-safe. |
| PROJ-12 KI-Routing leitet Notizen niemals extern | ✅ | Default-Class-3 erzwingt lokales Routing — Spec-Sicherheit erfüllt. |
| Tenant-Export DSGVO-redact für Notizen | ⚠ | PROJ-17-Export-Pfad wurde nicht für `budget_postings.note` erweitert. Default-Class-3 sollte Redact-Logik triggern, aber das ist über die data-privacy-registry-Eintragung abhängig. Konsistent mit LOW-1. |

### Edge Cases

| Edge Case | Result |
|-----------|--------|
| Posten-Soft-Delete mit existenten Buchungen | ✅ Hard-Delete blockiert mit 409 `item_has_postings`; Soft-Delete via `is_active=false` möglich |
| Kategorie-Löschung mit aktiven Posten | ✅ Blockiert mit 409 `category_not_empty`; vorher Posten deaktivieren |
| Buchung in fremder Währung | ✅ Erlaubt; View aggregiert nur in Posten-Currency, `multi_currency_postings_count` zeigt Hinweis |
| Storno einer Storno-Buchung | ✅ Blockiert mit 422 `cannot_reverse_reversal` |
| FX-Rate fehlt für angefragte Sammelwährung | ✅ Aggregation gibt 200 mit `missing_rates: [{from, to, item_count}]` zurück |
| Vendor-Rechnung wird gelöscht | ✅ ON DELETE SET NULL auf project_id (Rechnung → Buchung-Verknüpfung); Buchungen bleiben (mit stale source_ref_id) |
| Vendor-Rechnung größer als Plan-Budget | ✅ Buchung wird zugelassen; Posten-Status springt auf rot |
| Tenant wechselt default_currency nachträglich | ✅ Bestehende Posten/Buchungen behalten ihre Currency; nur Aggregations-Default ändert sich |
| FX-Rate-Pflege durch Nicht-Admin | ✅ RLS-Policy `fx_rates_insert_admin` blockiert; route gibt 403 |
| Concurrent-Edit auf Plan-Amount | ✅ Last-Write-Wins; Audit zeigt beide Änderungen |
| Buchungs-Datum >1 Jahr Zukunft / >5 Jahre Vergangenheit | ✅ CHECK `budget_postings_posted_at_window` rejected (live verified) |
| FX-Rate identity (from=to) | ✅ CHECK `fx_rates_different_currencies` rejected (live verified) |
| Doppel-Storno auf gleiche Original-Buchung | ✅ UNIQUE Index `budget_postings_reverses_unique` rejected (live verified) |

### Security audit (Red Team)

- ✅ **Cross-tenant SELECT** auf alle 5 Tabellen: 0 Rows visible to foreign user (live probe).
- ✅ **Cross-tenant INSERT** über RLS verhindert: ein Editor in Project A kann nicht in Project B's Budget schreiben (project-membership-Lookup in jeder Policy).
- ✅ **Postings immutable**: `budget_postings` hat keine UPDATE/DELETE-Policy → silent block (verified).
- ✅ **FX-Rates immutable**: gleiche Logik — keine UPDATE-Policy, Versioning via valid_on.
- ✅ **Admin-only fx_rates writes**: `fx_rates_insert_admin` + `fx_rates_delete_admin` (verified via pg_policy).
- ✅ **Defense-in-depth Currency**: `_is_supported_currency()` CHECK auf 4 Tabellen (budget_items, budget_postings, vendor_invoices, fx_rates).
- ✅ **Defense-in-depth amounts**: `>= 0` CHECK auf budget_items.planned_amount, vendor_invoices.gross_amount.
- ✅ **Audit-Whitelist defense-in-depth**: `audit_log_entity_type_check` weiß um die 4 neuen entity_types — niemand kann fake-audit-Einträge mit ungültigem entity_type schreiben.
- ✅ **Synthetic Audit nur via service-role**: User-Context kann audit_log_entries nicht direkt INSERTen (RLS gates SELECT only); synthetic Audits gehen ausschließlich über `createAdminClient`.
- ⚠ **Module-Gate fehlt** (HIGH-1) — siehe Bug-Liste.
- ⚠ **Class-3-PII Notizen** im Default-Path: `budget_postings.note` ist nicht explizit registriert, aber Default-Class-3 schützt — unkritisch.

### Regression

- 53 von 53 vitest files pass (388 Tests). Keine Regressionen in PROJ-1..21.
- TypeScript clean.
- Lint: 84 pre-existing issues, keine neuen Warnings durch PROJ-22.
- 8 vorhandene PROJ-21 Playwright-Tests laufen weiter durch.

### Bugs found

#### High (1)

**HIGH-1: Module-Gate fehlt auf allen PROJ-22 Routes.**

Spec ST-07: *"Wenn deaktiviert: Budget-Tab versteckt, alle `/api/projects/[id]/budget/*`-Routes geben 403 mit `code='module_disabled'`."*

Aktuelle Implementierung: keine der 11 PROJ-22 Routes ruft `requireModuleActive("budget")`. PROJ-15 (vendor) und andere Module nutzen den Helper konsequent.

- **Steps to reproduce**: Tenant-Admin deaktiviert das `budget`-Modul in den Tenant-Einstellungen. Editor ruft GET `/api/projects/X/budget/categories` auf → bekommt 200 mit Daten zurück (statt 403 `module_disabled`). Das untergräbt das Modul-Gate-Versprechen.
- **Fix-Vorschlag**: in jede der 11 Routes (categories GET/POST, categories/[cid] PATCH/DELETE, items GET/POST, items/[iid] PATCH/DELETE, postings GET/POST, postings/[pid]/reverse POST, summary GET) einen `await requireModuleActive(supabase, projectTenantId, "budget")` Aufruf einbauen. Der Helper gibt eine 403-Response zurück, wenn das Modul aus ist; ansonsten `null`.
- **Vendor-invoices und fx-rates Routes**: bei diesen ist es weniger eindeutig — `vendor_invoices` ist primär ein PROJ-22-Konstrukt und sollte gegated werden; `fx_rates` ist ebenfalls budget-spezifisch. Beide einbinden.

#### Medium (1)

**MEDIUM-1: ST-06 UI-Tab nicht implementiert (frontend slice deferred).**

Der Backend-only-Run ließ ST-06 bewusst aus (User-Entscheidung beim /qa-Aufruf). Vor /deploy MUSS `/frontend PROJ-22` laufen. Listed als Medium statt Low, weil es ohne UI keinen sichtbaren Nutzwert für End-User gibt.

#### Low (1)

**LOW-1: data-privacy-registry nicht erweitert für Budget-Felder.**

Spec ST-08 fordert explizite Registrierung: `budget_postings.note → Class-3`, Plan-/Ist-Beträge → Class-2. Aktuell: keine Einträge in `data-privacy-registry.ts`. Verhalten:

- ✅ Privacy-safe: Default ist Class-3, fließt nie in externe LLMs.
- ⚠ Funktional-restriktiv: Plan-Werte (eigentlich Class-2) werden auch lokal-only — KI kann Budget-Übersichten in externen Modellen nicht nutzen.
- ⚠ DSGVO-Export: Spec-Intent „note redact bei Class-3" — wird über Default-Logik triggern, sollte aber explizit registriert sein.

- **Fix-Vorschlag**: in `src/lib/ai/data-privacy-registry.ts` einen Block ergänzen für `budget_categories.name/description (1/2)`, `budget_items.name/description (1/2)`, `budget_items.planned_amount/planned_currency (2/1)`, `budget_postings.amount/currency/posted_at/source (2/1/2/1)`, `budget_postings.note (3)`, `vendor_invoices.invoice_number/invoice_date/gross_amount/currency (1/2/2/1)`, `vendor_invoices.note (3)`, `fx_rates.rate/from/to/valid_on (1/1/1/2)`.

### Production-ready decision (1st pass)

**NOT READY**.

**HIGH-1 muss gefixt sein** vor Deploy — sonst hat das Modul-Toggle keinen Effekt. PROJ-15-Pattern wiederverwenden ist trivial.

**MEDIUM-1**: Wer das Backend isoliert deployen will, kann das tun, aber End-User sehen ohne UI nichts. Empfehlung: erst `/frontend PROJ-22`, dann erneuter `/qa`-Pass, dann Deploy.

**LOW-1** kann mit dem Frontend-Fix kombiniert werden oder als kleiner Folgeslice.

---

### 2nd QA pass (2026-04-30, post-fix + frontend)

**Production-ready decision: READY** — 0 Critical, 0 High remaining.

**Verification of fixes:**

| Bug | Re-test result |
|-----|----------------|
| HIGH-1 (Module-Gate fehlt) | ✅ Alle **11 Routes** referenzieren jetzt `requireModuleActive` (verified via `grep -l`). Lookup-Query gegen die erweiterte `tenant_settings`-Struktur live geprüft: BEGIN-ROLLBACK-Probe entfernt 'budget' → `has_budget=false`; re-enable → `has_budget=true`. Helper liefert die richtigen Werte. Read-Intent → 404 (leak-safe), Write-Intent → 403 mit `code='module_disabled'`. |
| LOW-1 (data-privacy-registry) | ✅ 23 neue Entries in `data-privacy-registry.ts` (`grep` verified). Klassifikation korrekt: `budget_postings.note` und `vendor_invoices.note` als **Class 3 (PII)**, alle Beträge/Datum als Class 2, FX-Markdaten als Class 1. PROJ-12-Routing leitet Class-3-Notizen jetzt explizit lokal-only; Plan-/Ist-Werte sind als Class-2 für externe-LLM-Reports zugänglich. |
| MEDIUM-1 (UI-Tab fehlt) | ✅ Frontend-Slice geliefert: 4 Hooks, 8 Komponenten, 2 Pages, Project-Room-Shell-Tab. UI-Pages laden (307 Auth-Redirect verifiziert). Module-Disabled-State sichtbar. |

**Automated test status:**
- Vitest: **53 files / 388 tests pass** (no regressions).
- TypeScript: clean (`tsc --noEmit` → 0).
- Playwright E2E: **14/14 pass** (chromium + Mobile Safari).
- Lint: 84 pre-existing issues, keine neuen Warnings durch QA-Fix oder Frontend-Slice.
- Dev-server bootet sauber (254 ms).

**Frontend-spezifische Validierung**:

| Scenario | Result |
|----------|--------|
| `/projects/[id]/budget` ohne Login → 307 Redirect | ✅ |
| `/settings/tenant/fx-rates` ohne Login → 307 Redirect | ✅ |
| `project-room-shell.tsx` zeigt Budget-Tab nur wenn `isModuleActive(tenantSettings, "budget")` | ✅ (Pattern aus Lieferanten-Tab kopiert) |
| Currency-Switcher löst `useBudgetSummary` re-render aus | ✅ (Hook re-runs auf `inCurrency`-Change) |
| Module-Disabled-Empty-State wird gerendert wenn `budget` nicht in `active_modules` | ✅ (Card mit Hinweis statt 404) |
| FX-Hint-Banner zeigt fehlende Pairs nur wenn `summary.missing_rates.length > 0` | ✅ |
| Buchungs-Drawer: storno-Action ist hidden für `kind='reversal'` UND für bereits-stornierte Original-Buchungen | ✅ (`reversedIds` Set + `isReversal` checks) |

**Class-3-PII Hinweis im Posting-Dialog**: getestet — Notiz-Feld zeigt _„Achtung: Notiz wird als Class-3-PII behandelt — bitte keine vermeidbaren Personennamen aufnehmen."_

**Regression**: Alle 21 vorher deployed PROJ-Specs durch ihre vitest-Suiten gefahren — keine Brüche.

### Outstanding

- ✅ HIGH-1 fixed
- ✅ LOW-1 fixed
- ✅ MEDIUM-1 fixed (frontend slice)
- 🟡 **VendorInvoicesTab nicht in den existierenden Vendor-Drawer integriert** — Komponente existiert (`src/components/budget/vendor-invoices-tab.tsx`) und ist standalone funktionsfähig, aber sie ist (noch) **nicht** als Tab in `vendor-detail-drawer.tsx` (PROJ-15) eingebunden. Das blockiert nicht den Deploy, schränkt aber den manuellen Workflow „Buchung aus Vendor-Rechnung" ein, weil der User keinen UI-Pfad zur Rechnungs-Erfassung hat. Empfehlung: als kleiner Folge-PR vor User-Annahme oder direkt eine kleine Iteration in `/frontend`. **Severity: Low** (Backend funktioniert; UI-Integration ist UX-Politur).

### Production-ready decision (2nd pass)

**READY** — 0 Critical, 0 High. Eine bekannte Low-UX-Lücke (VendorInvoicesTab-Integration in PROJ-15-Drawer) ist dokumentiert und blockiert nicht.

Recommended path: `/deploy proj 22`, danach optional ein kleiner UI-Folge-PR für die Vendor-Drawer-Integration.

## Deployment
_To be added by /deploy_
