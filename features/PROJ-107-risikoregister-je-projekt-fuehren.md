---
id: PROJ-107
title: "Risikoregister je Projekt führen"
issue_type: Story
epic_code: E
epic_title: "Risiken & Red Flags"
priority: Highest
priority_source: "Must (MVP)"
labels: ["ma-platform", "epic-e", "mvp"]
dependencies: ["A1", "A2", "C1", "L3"]
roles: ["Risiko-Owner (je Workstream)", "Deal Lead", "PMO-Lead", "Steering Committee (Eskalationsempfänger)"]
summary_for_jira: "[E1] Risikoregister je Projekt führen"
---

# PROJ-107: Risikoregister je Projekt führen

## Status: In Progress
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic E — Risiken & Red Flags)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **DUP→REUSE** · Andockpunkt: PROJ-20 Risks (Score/Heatmap teils neu). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** E — Risiken & Red Flags  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP)  
> **Labels:** `ma-platform` · `epic-e` · `mvp`  
> **Abhängigkeiten:** `A1`, `A2`, `C1`, `L3`

**User Story:**

Als Risiko-Owner möchte ich Projekt-Risiken mit Beschreibung, Bewertung (Eintrittswahrscheinlichkeit × Schadenshöhe), Maßnahmen und Verantwortlichem erfassen, damit das Risikomanagement während des gesamten Deals stringent nachvollziehbar ist.

**Beschreibung / Kontext:**

Das Modell verlangt ein durchgängiges Risikoregister. Risiken entstehen in allen Phasen (strategisch, Bewertung, DD, Vertrag, Closing, PMI). Die Plattform muss ein zentrales Register mit standardisierter Bewertungslogik bereitstellen.

**Akzeptanzkriterien:**

- [ ] Risiko anlegbar mit Pflichtfeldern: Titel, Kategorie, Beschreibung, Eintrittswahrscheinlichkeit (1–5), Schadenshöhe (1–5), Status, Owner.
- [ ] Aus der Bewertung wird automatisch ein Risiko-Score und Heat-Map-Quadrant abgeleitet.
- [ ] Risiken sind Phase, Workstream und ggf. Deliverable zuordenbar.
- [ ] Maßnahmen pro Risiko sind als Aufgaben (C1) verknüpfbar.
- [ ] Eine Risiko-Heatmap und eine Top-Risiken-Liste sind im Reporting verfügbar.

**Abgrenzungen (Out of Scope):**

- Quantitative Schadensberechnung (EUR-Wert) ist optional, nicht erzwungen.
- Keine automatische Risiko-Identifikation durch KI.

**Offene Fragen:**

- Welche Risiko-Kategorien sollen verbindlich sein?
- Soll die Bewertungsskala (1–5 oder 1–10) plattformweit verbindlich sein?
- Müssen Risiken bei Stage-Gate-Übergängen explizit überprüft und kommentiert werden?

**Definition of Ready:**

- [ ] Bewertungsmethodik (Skala, Score-Formel) ist mit Risikomanagement abgestimmt.
- [ ] Risiko-Kategorien sind definiert.

**Definition of Done:**

- [ ] Risikoregister ist funktional, Heatmap dargestellt, Aufgaben verknüpfbar.

**Abhängigkeiten:**

- A1, A2 – Projekt, Phase
- C1 – Aufgaben (für Maßnahmen)
- L3 – Audit-Trail

**Betroffene Rollen:**

- Risiko-Owner (je Workstream)
- Deal Lead
- PMO-Lead
- Steering Committee (Eskalationsempfänger)

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · E — Risiken & Red Flags_

---

## Tech Design (Solution Architect)

**Architected:** 2026-07-03 · **Klasse:** DUP→REUSE auf PROJ-20 `risks` · **CIA-reviewed** (2 Forks + 1 Zusatz, beide Empfehlungen vom User bestätigt) · **Kein neues Dependency** · **1 Migration**

### Leitgedanke

PROJ-107 baut **kein neues Risiko-Modell**. Der geteilte Plattform-Core (PROJ-20 `risks`) liefert schon fast alles, was die Akzeptanzkriterien verlangen. Diese Slice ergänzt nur die vier echten Lücken und zieht zwei Hygiene-Punkte nach. Die Regel aus dem Readiness-Guide gilt: „PROJ-107 erweitern und konfigurieren, nicht neu bauen."

### Was der Core heute schon kann (Reuse ohne Neubau)

| AC | Bereits im Core vorhanden |
|---|---|
| Bewertung 1–5 × 1–5 | `probability`/`impact` sind 1–5 (mit Wertebereichs-Prüfung), plattformweit fix — die offene Spec-Frage „1–5 oder 1–10" ist damit **beantwortet: 1–5**. |
| AC-2 Score automatisch | `score` ist eine **automatisch berechnete Spalte** (Wahrscheinlichkeit × Auswirkung, 1–25) — keine App-Logik nötig. |
| AC-2 Heatmap-Quadrant | Eine **5×5-Heatmap** existiert bereits im Risiko-Tab (`risk-matrix.tsx`), plus Listen- und Matrix-Ansicht. |
| AC-3 Workstream-Zuordnung | `risks.workstream_id` existiert (PROJ-102). |
| AC-3 Phasen-Zuordnung | Über die vorhandene polymorphe Verknüpfungstabelle `risk_links` (`phase`). |
| AC-1 Status/Owner/Titel/Beschreibung | Alle vorhanden. Status-Werte: offen/gemindert/akzeptiert/geschlossen. |
| Audit | Feldgenaue Historie (PROJ-10) ist für Risiken voll verdrahtet. |
| KI-Vorschläge | PROJ-89 („Risiken aus Kontext") schreibt bereits in dieselbe Tabelle. |

### Die vier echten Lücken (das ist der Slice)

**1. Risiko-Kategorie (AC-1 Pflichtfeld) — Fork A → Tenant-Katalog „A2-lite" (bestätigt)**
- Neue tenant-eigene **Katalogtabelle** für Risiko-Kategorien (Schlüssel, Anzeige-Label, optionaler Projekttyp-Bezug, Sortierung, aktiv-Flag) — analog dem bewährten Muster von DD-Stream-Vorlagen und Berechtigungsprofilen.
- Beim ersten Gebrauch in einem M&A-Projekt wird ein **M&A-DD-Standardsatz** einmalig vorbefüllt (Copy-on-first-use), Vorschlag: *Financial · Tax · Legal · Commercial/Market · Operational · HR/Organizational · IT/Technology · Compliance/Regulatory · Environmental/ESG · Integration/PMI*. (Liste vom Produkt bestätigbar.)
- `risks` bekommt eine **optionale** Kategorie-Referenz (kein Pflichtfeld auf DB-Ebene). Konsequenz: **kein Backfill** der Bestands-Risiken, der KI-Insert-Pfad (PROJ-89) bleibt gültig, andere Projekttypen bleiben unberührt.
- **Pflicht nur im M&A-Risiko-Formular** (Formular-Validierung), nicht global. So bleibt „Kategorie ist Pflicht" fachlich erfüllt, ohne den geteilten Core zu verhärten.
- Nutzen fürs Reporting: eine **stabile, gruppierbare Achse** für „Top-Risiken je Kategorie" (PROJ-116/131/132).

**2. Need-to-know-Vertraulichkeit auf `risks` — Fork B → jetzt mitziehen (bestätigt)**
- **Warum jetzt und nicht später:** Es gibt eine **reale Vertraulichkeitsnaht**. DD-Findings (PROJ-114) verweisen direkt auf Risiken; ein streng vertrauliches Finding kann heute auf ein Risiko zeigen, dessen Titel das Deal-Problem verrät und das **für jedes Projektmitglied sichtbar** ist. Das Risikoregister ist die einzige ungegattete Tabelle in der DD-Kette.
- **Umsetzung als geboundete Erweiterung, exakt nach dem PROJ-100a-Rezept**, das bereits auf den ebenso geteilten Core-Tabellen `phases` und `work_items` läuft:
  - neue Vertraulichkeitsstufe pro Risiko, **Standardwert „standard"**;
  - ein zusätzlicher, additiver „Vertraulichkeits-Riegel" (das etablierte `can_access_classified`-Gate) **oberhalb** der bestehenden Zugriffsregeln;
  - Standardstufe = für jedes Projektmitglied sichtbar → **für alle Nicht-M&A-Projekte ein No-op** (keine Verhaltensänderung).
- **Regressionsflächen (im Bau + QA zu prüfen):** die vier bestehenden Zugriffsregeln müssen für Standard-Risiken byte-identisch bleiben; der KI-Insert-Pfad erbt den Standardwert (kein Code-Change, nur verifizieren); alle Aggregat-/Report-Abfragen über Risiken müssen im **Aufrufer-Rechtekontext** laufen, damit kein Aggregat-Leak entsteht (Lehre aus `dd_findings_summary`); Vertraulichkeitsstufe kommt in die Audit-Whitelist.
- **Neuer Hardening-/Pentest-AC** (siehe unten) — nicht still, sondern als dokumentierte Erweiterung der core-blinden Spec.

**3. Maßnahmen als Aufgaben verknüpfbar (AC-4) + Deliverable-Zuordnung (AC-3) — Fork C → `risk_links` additiv (bestätigt)**
- Die vorhandene Verknüpfungstabelle `risk_links` wird additiv um zwei Ziel-Arten erweitert: **`work_item`** (eine Maßnahme = eine Aufgabe, PROJ-9) und **`deliverable`** (PROJ-104, deployed → Referenzintegrität gegeben).
- Kein neuer Fremdschlüssel, keine neue Tabelle. Der bestehende Validierungs-Mechanismus (prüft Existenz + gleiche Projekt-/Tenant-Zugehörigkeit) wird um die zwei neuen Ziel-Arten ergänzt. Die Verknüpfungs-Prüfung emuliert **kein** Vertraulichkeits-Gate — Sichtbarkeit regelt weiterhin die RLS.
- Das Freitext-Feld `mitigation` bleibt für Kurz-Notizen; die echte Nachverfolgung läuft über verknüpfte Aufgaben.

**4. Reporting-Oberfläche (AC-5) — Heatmap vorhanden, Top-Risiken-Liste ergänzen**
- Die Heatmap existiert bereits im Projekt-Raum. Ergänzt wird eine **Top-Risiken-Sicht** (nach Score absteigend, gruppierbar nach Kategorie/Workstream/Phase) und deren Einbindung in die Reporting-Ausgabe (PROJ-21/PROJ-64). Alle Aggregationen laufen im Aufrufer-Rechtekontext (Need-to-know-konform).

### Hygiene (im selben Slice)

- **`workstream_id` nachziehen:** in die Audit-Whitelist, in die API-Feldauswahl und in den TypeScript-Typ — sonst bleibt eine Workstream-Neuzuordnung unauditiert.
- **Severity-Schwellen vereinheitlichen:** Heute existieren **drei** divergierende Schwellen-Schemata (DB-Funktion 6/12/19 4-stufig; Tabelle 16/9/4; KI-Tab 15). Kanonisch wird die **DB-Funktion `_risk_severity_bucket`** (low/medium/high/critical). Die UI **mappt den Bucket auf einen Farbton**, statt den Score neu zu klassifizieren. Begründung: bereits von geteilten Auswertungen konsumiert, das Reporting braucht **eine** Skala, und der distinkte `critical`-Bucket ist fürs Deal-Breaker-Framing wertvoll.

### Datenmodell (in Worten, kein Code)

- **`risk_categories`** (neu, tenant-eigen): Katalog der wählbaren Kategorien. Tenant-isoliert, admin-pflegbar.
- **`risks`** (bestehend, erweitert): + optionale Kategorie-Referenz, + Vertraulichkeitsstufe (Default „standard"). Alles Übrige unverändert.
- **`risk_links`** (bestehend, erweitert): zwei zusätzliche erlaubte Ziel-Arten (`work_item`, `deliverable`).

### Migrations-Oberfläche (eine Migration)

Katalogtabelle + Tenant-RLS + Audit-Verdrahtung; optionale Kategorie-Referenz auf `risks`; Vertraulichkeitsstufe auf `risks` + drei RESTRICTIVE-Zugriffsregeln (SELECT/UPDATE/DELETE) nach 100a-Muster; Audit-Whitelist um `workstream_id` + Vertraulichkeitsstufe erweitert; `risk_links`-Prüfregel + Validierungs-Trigger um `work_item`/`deliverable` erweitert. Audit-CHECK/`can_read_audit_entry` aus den **Live-Definitionen** neu bauen (Geschwister-Einträge erhalten, `authenticated`-Grant re-setzen — bekannte Fallen aus PROJ-114).

### Neue/geänderte Akzeptanzkriterien (Ergänzung zur core-blinden Ursprungs-Spec)

- [ ] **AC-107-6 (Vertraulichkeit):** Risiken tragen eine Need-to-know-Stufe (Default „standard"); das additive Gate schränkt Sicht/Änderung/Löschung analog PROJ-100a ein. Nicht-M&A-Projekte (alle „standard") verhalten sich unverändert.
- [ ] **AC-107-7 (Pflicht-Pentest, live):** Live-RPC-Smoke gegen Prod (mit Rollback, 0 Residue) beweist: default-deny für nicht-cleared Mitglieder auf vertraulichen Risiken; `standard` bleibt für Projektmitglieder transparent; kein Cross-Clearance-/Cross-Tenant-Leak; **kein Aggregat-Leak über `dd_findings.linked_risk_id`** und über die Top-Risiken/Heatmap-Aggregation. Plus Non-M&A-Regressionstest (byte-identisches Verhalten der 4 Bestands-Policies).
- [ ] **AC-107-8 (Kein Backfill/Kein Bruch):** Bestands-Risiken und der PROJ-89-KI-Insert-Pfad funktionieren nach der Migration unverändert (Kategorie optional, Vertraulichkeit „standard").

### Nicht in dieser Slice (bewusst)

- Quantitative EUR-Schadensberechnung (Spec: optional) — kommt über PROJ-114/120/121.
- KI-Auto-Kategorisierung der Risiken — Followup (PROJ-89 liefert vorerst ohne Kategorie).
- Stage-Gate-Pflicht-Review von Risiken (offene Spec-Frage) — gehört zu PROJ-110, hier nur verknüpfbar.
- Verschieben der Severity-Logik in eine berechnete Spalte — die DB-Funktion bleibt kanonisch.

### Abhängigkeiten

Keine neuen npm-Pakete. Nutzt: PROJ-20 (risks/risk_links), PROJ-100a (`can_access_classified`), PROJ-102 (workstream_id), PROJ-104 (deliverables, deployed), PROJ-9 (work_items), PROJ-10 (Audit), PROJ-89 (KI-Insert).

### Handoff

- **Backend zuerst** (Migration + API + RPC/Policies + Live-Pentest-Smoke): Kern dieser Slice ist datenmodell-nah. → `/backend`
- Danach **Frontend** (Kategorie-Auswahl + Pflicht im M&A-Formular, Vertraulichkeits-Picker, Verknüpfung von Aufgaben/Deliverables, Top-Risiken-Sicht, Severity-Bucket→Farbton). → `/frontend`
- Dann **QA** (AC-107-7 Pentest ist Pflicht-Gate). → `/qa`

---

## Implementation Notes — Backend (2026-07-03)

**Migration:** `supabase/migrations/20260703135741_proj107_risk_register.sql` (applied to prod, PROJ-134-konform: Repo-Dateiname == registrierte Version). Audit-Tabelle ist `public.audit_log_entries` (nicht `audit_log`).

**Was gebaut wurde (DUP→REUSE, kein neues Risiko-Modell):**
- **(A) Kategorie:** neue tenant-eigene `risk_categories` (key/label/`applies_to_project_type` [null=alle]/sort_order/is_active), Tenant-RLS (read=member, write=admin), moddatetime + Field-Audit-Trigger. `risks.category_id` **nullable FK ON DELETE SET NULL** → kein Backfill. Lazy-Seed via `seed_risk_categories_if_empty(tenant)` (SECURITY DEFINER, member-gated, idempotent, M&A-DD-Standardsatz 10 Kategorien).
- **(B) Need-to-know:** `risks.confidentiality_level` (`ma_confidentiality_level`, Default `'standard'`) + 3 RESTRICTIVE `can_access_classified`-Policies (SELECT/UPDATE/DELETE, USING-only, **kein** INSERT-Gate — spiegelt `work_items` byte-genau). Non-M&A (alle 'standard') = No-op.
- **(C) risk_links:** CHECK additiv `+ 'work_item' + 'deliverable'`; `tg_risk_links_validate_fn` CASE um beide Zweige erweitert (Existenz + Tenant-Grenze; kein Vertraulichkeits-Emulat). Kein neuer FK.
- **Hygiene:** `_tracked_audit_columns('risks')` += `category_id`/`confidentiality_level`/`workstream_id`; `risk_categories` als neuer Audit-Entity-Type in CHECK + `_tracked_audit_columns` + `can_read_audit_entry` (is_tenant_member). `can_read_audit_entry` nach Recreate **`authenticated`-EXECUTE re-granted** (PROJ-114-Lektion). Audit-CHECK aus Live-Def rebuilt (alle Geschwister-Entities erhalten).

**API/Code:** `risks` GET/POST/[rid] SELECT + Zod (create/patch) + `Risk`-Type + `RiskInput` um `category_id`/`confidentiality_level`/`workstream_id` erweitert (Spread-Pattern → Drift-Tests grün). Neue Routen: `GET/POST /api/risk-categories`, `PATCH/DELETE /api/risk-categories/[id]` (tenant-admin CRUD), `GET /api/projects/[id]/risk-categories` (form-Quelle + M&A-Lazy-Seed + Typ-Filter). Client-Wrapper `src/lib/risk-categories/api.ts`.

**Gates:** ESLint 0; tsc 0 neu (nur Baseline-Fehler in fremden Test-Files); vitest **2225/2225** (+ neue risk-categories-Route-Tests + erweiterte Drift-Kitchensinks); build clean (3 Routen registriert); migration-naming guard OK.

**AC-107-7 Live-Pentest** (`tests/sql/PROJ-107-risk-register-pentest.sql`, gegen Prod, Self-Rollback, **0 Residue**): **A–J 10/10 PASS** — A create+generated-score, B standard-transparent (non-M&A-Regression), C default-deny, D ordered-clearance, E cross-tenant, F write-gate, G **Aggregat-Leak über `dd_findings.linked_risk_id` geschlossen**, H work_item+deliverable-Links + cross-tenant-reject, I seed idempotent+member-gated, J Audit risks+risk_categories.

**Offen für /frontend:** Kategorie-Picker + Pflicht im M&A-Risiko-Formular, Vertraulichkeits-Picker, Aufgaben-/Deliverable-Verknüpfung (risk_links neue Kinds), Top-Risiken-Sicht, Severity-Bucket→Farbton-Vereinheitlichung, Admin-Katalog-Seite (Stammdaten). **CIA-Review nach /frontend, vor /qa** (User-Vorgabe).

**Followup-Kandidaten:** KI-Auto-Kategorisierung der PROJ-89-Risiko-Vorschläge (heute ohne Kategorie); Top-Risiken-Integration in PROJ-116/131/132-Reporting.

## Implementation Notes — Frontend (2026-07-03)

Reine DUP→REUSE-Erweiterung der bestehenden Risiko-UI (kein Neubau, kein neues Dep, kein Schema-/Backend-Change).

- **Severity vereinheitlicht (AC-2/Hygiene):** neue Single-Source `src/lib/risks/severity.ts` (`riskSeverityBucket` = DB-`_risk_severity_bucket` 6/12/19 4-Tier low/medium/high/critical + `riskSeverityBadgeTone`/`riskSeverityCellTone`). `risk-table.tsx`, `risk-matrix.tsx` und `ai-proposals/risk-proposal-tab.tsx` mappen jetzt Score→Bucket→Tint statt drei divergenter Ad-hoc-Schwellen (16/9/4 · 16/9/4 · 15). +Unit-Test `severity.test.ts`.
- **Risk-Form (AC-1):** M&A-only Block mit Kategorie-Picker (Pflicht via konditionalem Zod-Schema `buildSchema(isMaProject)`, Optionen aus `listProjectRiskCategories`) + Vertraulichkeits-Picker (`MA_CONFIDENTIALITY_LEVELS`, Default 'standard'). Für Nicht-M&A-Projekte unsichtbar/optional. Wiring über `RiskInput.category_id`/`confidentiality_level`.
- **Risk-Tab-Client:** `useProject` → `isMaProject`; lädt Kategorien nur für M&A (Server-Lazy-Seed), reicht `categories`/`categoryLabels`/`isMaProject` an Form + Tabelle. Tabelle zeigt für M&A zwei Spalten (Kategorie-Badge + Vertraulichkeits-Badge mit Lock-Icon).
- **Risk-Links-Tab (AC-3/AC-4):** `RiskLinkKind` += `work_item`/`deliverable`; Picker lädt zusätzlich Work-Items (Aufgaben/Maßnahmen) + Deliverables und bietet sie in eigenen Command-Gruppen mit Icons/Badges an (Phase/Sprint-Verhalten unverändert).
- **Top-Risiken (AC-5):** die Liste ist bereits `score desc` sortiert (API) = Top-Risiken-first; Heatmap-Matrix existiert. Dedizierte gruppierte Reporting-Sicht bewusst zu PROJ-116/131/132 verschoben (Followup).
- **Admin-Katalog:** `Stammdaten → Risikokategorien` (`/stammdaten/risikokategorien`) — `risk-categories-page-client.tsx` + `risk-category-form-dialog.tsx` (tenant-admin CRUD via `listRiskCategories`/create/update/delete), Karte im Stammdaten-Index registriert.

**Gates:** ESLint 0; tsc 0 neu; vitest **2227/2227** (+2 severity); build clean (`/stammdaten/risikokategorien` + risk-categories-Routen registriert). shadcn-only, `useMemo`-Schema statt `form.watch` für Neu-Logik.

**Nächster Schritt:** CIA-Review (User-Vorgabe) vor `/qa`.

## CIA Pre-QA-Review (2026-07-03) — KEIN Blocker, /qa freigegeben

CIA-Verdikt: Build sauber, spec-treu, 100a-Rezept korrekt gespiegelt, Pentest substanziell → **Umsetzen / → /qa** mit gezieltem Fokus. Findings:

**Dokumentierte Deviations (bewusst, kein Neu-Bau):**
- **D-CIA-1 (Kategorie-Pflicht UI-only):** Die M&A-Kategorie-Pflicht wird nur clientseitig (konditionales Zod in `risk-form.tsx`) durchgesetzt; DB-`category_id` ist nullable ohne CHECK und `riskCreateSchema.category_id` ist optional → ein direkter M&A-Risk-POST ohne Kategorie gelingt server-seitig. Konsistent mit dem spec-gelockten „nullable FK, kein Backfill". Server-Durchsetzung → PROJ-Y-107a.
- **D-CIA-2 (INSERT über eigener Clearance):** Legt ein Nicht-cleared-Editor ein Risiko mit höherer `confidentiality_level` an, committet der INSERT, aber die `RETURNING`-Klausel läuft gegen die SELECT-RESTRICTIVE-Policy → 0 Zeilen → API meldet 500/`create_failed`, Zeile bleibt als „Phantom" persistiert. Kein Sicherheitsloch (INSERT schreibt, liest nicht; Downgrade-Lesepfad ist per UPDATE-USING blockiert), **byte-identisch zu work_items** → lokale Härtung bewusst NICHT vorgenommen (Konsistenz). Produktweite WITH-CHECK-Härtung → PROJ-Y-107c.

**QA-Pflicht-Fokus (über Pentest-SQL hinaus):**
1. INSERT oberhalb eigener Clearance → API-Fehlerverhalten + Phantom-Row (D-CIA-2).
2. Server-Bypass der Kategorie-Pflicht (direkter POST ohne category_id) → dokumentiert akzeptiert (D-CIA-1).
3. `isMaProject`-Loading-Fenster: Create-Drawer vor Projekt-Load → greift Pflicht/Vertraulichkeits-UI? (ggf. Button gaten bis `project` geladen).
4. `risk_links`-Ziel-Inferenz: Trigger prüft nur Tenant+Existenz, NICHT `confidentiality_level` des Ziels → Blind-Link-by-ID an nicht-sichtbares work_item/deliverable möglich? Picker zeigt RLS-gefilterte Targets? (→ PROJ-Y-107b).
5. **Audit-Regression (Inzident-Klasse, Pflicht vor Approved):** Prod-Verifikation dass (a) `can_read_audit_entry` `authenticated`-EXECUTE nach Apply vorhanden ist und (b) kein bestehender entity_type-Zweig verloren ging — Spot-Check eines Fremd-Entity-HistoryTab (z. B. `dd_findings`/`committees`).

**Followups (PROJ-Y-Kandidaten):**
- PROJ-Y-107a (should): server-seitige M&A-Kategorie-Pflicht via project_type-Lookup im risks-POST.
- PROJ-Y-107b (should, security-nice): confidentiality-aware `risk_links`-Validierung (Trigger um `can_access_classified`-Ziel-Prüfung erweitern).
- PROJ-Y-107c (could, produktweit): WITH-CHECK-Härtung für confidentiality auf `risks`+`work_items` (INSERT-Level ≤ Clearance, Downgrade-Schutz) — nur bei Pilot-Bedarf.
- Bestätigt: KI-Auto-Kategorisierung → PROJ-89-Familie; Top-Risiken-Reporting → PROJ-116/131/132.
