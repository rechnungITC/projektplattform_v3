---
id: PROJ-120
title: "Bewertungsmodell und Business Case verknüpfen"
issue_type: Story
epic_code: I
epic_title: "Bewertung & Kaufpreislogik"
priority: Highest
priority_source: "Must (MVP)"
labels: ["ma-platform", "epic-i", "mvp"]
dependencies: ["G3", "K2", "L2", "L3"]
roles: ["CFO / Finance Lead", "Deal Lead", "Executive Sponsor", "Externe M&A-Berater", "PMO-Lead (lesend)"]
summary_for_jira: "[I1] Bewertungsmodell und Business Case verknüpfen"
---

# PROJ-120: Bewertungsmodell und Business Case verknüpfen

## Status: Approved
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic I — Bewertung & Kaufpreislogik)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND** · Andockpunkt: neu (an PROJ-22 Budget). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** I — Bewertung & Kaufpreislogik  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP)  
> **Labels:** `ma-platform` · `epic-i` · `mvp`  
> **Abhängigkeiten:** `G3`, `K2`, `L2`, `L3`

**User Story:**

Als CFO/Finance Lead möchte ich Bewertungsmodelle und Business Cases als Artefakte am Deal verknüpfen, versionieren und mit Findings (G3) sowie Synergien (K2) in Beziehung setzen, damit die Bewertung in jeder Phase nachvollziehbar ist und Änderungen dokumentiert sind.

**Beschreibung / Kontext:**

Phase 4 und Phase 6 des Modells fordern eine indikative bzw. finale Bewertung. Die Plattform stellt selbst kein Bewertungsmodell bereit – Bewertung erfolgt in spezialisierten Tools (Excel, dedizierte Bewertungssoftware). Die Plattform muss jedoch die Bewertungsversionen und die zugehörige Entscheidungslogik nachvollziehbar machen.

**Akzeptanzkriterien:**

- [ ] Pro Deal können Bewertungs-Artefakte (Excel/PDF/Link) versioniert hinterlegt werden, je mit Stand-Datum, Methode (Multiple, DCF, Vergleichstransaktionen, Substanzwert), Ergebnis (Kaufpreisbandbreite), Annahmen und Verfasser.
- [ ] Versionswechsel sind explizit dokumentiert (z. B. 'V2 – nach Integration der Financial-DD-Findings').
- [ ] Bewertungsversionen können mit Findings (G3) und Synergie-Hypothesen (K2) verknüpft werden.
- [ ] Eine 'Aktuelle Bewertungssicht' zeigt die jeweils gültige Version und die Kaufpreisbandbreite.

**Abgrenzungen (Out of Scope):**

- Die Plattform berechnet keine Unternehmensbewertung selbst.
- Keine Sensitivitätsanalyse innerhalb der Plattform.
- Speicherung erfolgt als Verweis und/oder Anhang – keine Excel-Live-Rechnung in der Plattform.

**Offene Fragen:**

- Sollen Bewertungs-Excel-Dateien (mit hochsensiblen Daten) in der Plattform gespeichert oder nur verlinkt werden?
- Müssen Bewertungen vor jedem Stage-Gate aktualisiert werden (Pflicht)?

**Definition of Ready:**

- [ ] Datenmodell für Bewertungsartefakte und Version ist abgestimmt.
- [ ] Sichtbarkeit (Inner Circle) ist mit Finance und Legal abgestimmt.

**Definition of Done:**

- [ ] Anlage, Versionierung, Verknüpfung und Aktuelle-Bewertungssicht funktionieren.
- [ ] Audit-Trail erfasst Versionswechsel.
- [ ] Berechtigungen sind getestet.

**Abhängigkeiten:**

- G3
- K2
- L2
- L3

**Betroffene Rollen:**

- CFO / Finance Lead
- Deal Lead
- Executive Sponsor
- Externe M&A-Berater
- PMO-Lead (lesend)

---

## Tech Design (Solution Architect)

**Architektur-Datum:** 2026-08-07 · **Reuse-Klasse:** EXTEND (PROJ-106-Versionsketten-Rezept + PROJ-104-Tabellen-Rezept) · **CIA-reviewed:** 2026-08-07 (6 Forks gelockt, GO; 1 sicherheitsrelevantes Finding ändert das MVP)

### Leitprinzip
Die Plattform **rechnet keine Bewertung** — sie führt ein **Bewertungs-Register je Deal**: eine unveränderliche Versionskette, deren Kopf die „Aktuelle Bewertungssicht" ist. Gebaut nach dem bewährten Rezept (Need-to-know + Audit + SECURITY-DEFINER-RPC), nicht als Parallelmodul. Das eigentliche Modell bleibt im Fachwerkzeug (Excel/Bewertungssoftware) und wird **verlinkt**, nicht hochgeladen.

### Neue Datenobjekte
```
ma_valuations (Versionskette je Deal — genau EIN gültiger Kopf pro Projekt)
- id, tenant_id, project_id
- version_no            (1, 2, 3 … je Deal)
- supersedes_valuation_id  (nullable FK self, ON DELETE SET NULL)
- is_current            (Kopf-Markierung; partial-unique pro project_id)
- version_comment       (AC2: „V2 – nach Integration der Financial-DD-Findings")
- title
- valuation_date        (Stand-Datum — AC1)
- method                (multiple | dcf | comparable_transactions | net_asset — AC1)
- value_low / value_high  numeric(18,2)   (Kaufpreisbandbreite — AC1/AC4)
- currency              char(3), default EUR, geprüft gegen _is_supported_currency
- assumptions           (Annahmen — AC1)
- author_user_id        (Verfasser — fachlicher Autor, bewusst ≠ created_by)
- confidentiality_level (Default 'confidential' — DoR „Inner Circle", H1)
- created_by, created_at, updated_at

ma_valuation_links (AC3 — echtes M:N Bewertung ↔ Finding)
- id, tenant_id, valuation_id (FK CASCADE)
- linked_kind  CHECK ('dd_finding')   ← bewusst nur EIN Wert (F3)
- linked_id, note
- UNIQUE (valuation_id, linked_kind, linked_id)
```
Artefakt (Excel/PDF/Link) hängt **nicht** an einer eigenen Spalte, sondern über die bestehende
`external_document_links`-Fläche (neuer `entity_type='ma_valuation'`).

### Gelockte Architektur-Entscheidungen (CIA 2026-08-07)
- **F1 — Eine Kette pro Deal (ADJUST).** `create unique index … on ma_valuations(project_id) where is_current` — nicht das PROJ-106-Per-Slot-Muster. AC4 formuliert gültige Version + Bandbreite im **Singular**; PROJ-121 (Kaufpreis-Bridge) braucht genau einen Anker-EV; die PROJ-131-Kachel rendert eine Zahl. Multi-Methoden-Realität (Football-Field) wird über `method` + Detailtiefe im verlinkten Artefakt abgebildet, konsistent mit „Die Plattform berechnet keine Bewertung". Der RPC flippt **erst** den alten Kopf, **dann** INSERT → der Unique-Index braucht kein `deferrable`. Schließt zugleich die PROJ-106-Schwäche (dort ist Single-Head nur RPC-erzwungen, ohne DB-Constraint).
- **F2 — Nur Verlinkung, kein Upload (ADJUST, sicherheitsgetrieben).** Erweiterung von `external_document_links` um `entity_type='ma_valuation'` (Resolver-Branch + idempotenter CHECK-Swap + Cleanup-Trigger). Damit erbt der Artefakt-Link die vollständige 4-Achsen-Need-to-know-Gate von PROJ-115 gratis. **Upload ist NO-GO**, weil `documents` keine `confidentiality_level`-Spalte hat **und** — live gegen Prod verifiziert — die Policy `documents_bucket_select` jedem *Projektmitglied* SELECT auf jedes Objekt unter `<tenant>/<project>/…` gibt. Ein App-Layer-Download-Proxy wäre dort ein **Scheingate** (direkt über den Storage-Client umgehbar). → PROJ-Y-120c, blockiert durch PROJ-Y-115c.
- **F3 — Link-Tabelle ja, toter Forward-Compat-Wert nein.** CHECK enthält **nur** `'dd_finding'`. `'synergy_hypothesis'` jetzt aufzunehmen erzeugt einen Wert ohne FK, ohne Resolver-Branch, ohne Cleanup-Trigger und ohne Need-to-know-Ableitung → einschleusbare Dangling-Referenzen bei null Nutzen. Stattdessen **expliziter Erweiterungs-Kontrakt** im Migrations-Header + Vermerk in der PROJ-126-Spec. Die M&A-Konvention „direkte FK am Kind" trägt hier nicht: eine Version integriert n Findings, ein Finding beeinflusst n Versionen.
- **F4 — Keine Bewertungs-Pflicht am Stage-Gate (NO-GO für Block).** Kein Eingriff in die deployten `decide_stage_gate` / `stage_gate_prereadiness`. Kein AC verlangt es; PROJ-109 hat die identische Frage (Maßnahmen-Abdeckung) bewusst als **weiches** Signal entschieden — ein harter Block wäre ein Präzedenz-Bruch und könnte einen Deal blockieren, obwohl die Bewertung fachlich gültig ist. Weiches Signal → PROJ-Y-120b.
- **F5 — PROJ-131-Kachel „Kaufpreisbandbreite" füllen (GO mit Auflagen).** Sichtbarste Einlösung von AC4; `steering_report` ist SECURITY INVOKER → Need-to-know wirkt gratis. Auflagen: **letzte, separate Migration**; Funktionskörper aus der **LIVE-Definition** neu aufbauen (nicht aus der Repo-Datei — sonst überschreibt man fremde Parallel-Änderungen); PROJ-131-Pentest A–G verbatim grün inkl. Aggregat-Leak-Probe; Synergie-Kachel bleibt `n/a`. Bei Merge-Konflikt: Kachel herausnehmen, der Rest der Slice ist unabhängig.
- **F6 — Explizite Währung (GO).** `value_low`/`value_high numeric(18,2)` + `currency char(3) not null default 'EUR'` mit `_is_supported_currency`-CHECK (PROJ-22-Reuse). Cross-Border-Deals in USD/CHF sind M&A-Normalfall, und die Bandbreite ist der **Input für PROJ-121** — eine Bridge ohne Währung ist wertlos. Nachrüsten wäre besonders teuer, weil der Immutability-Guard die Spalten einfriert. Bewusste Abweichung vom EUR-impliziten `dd_findings`; ausdrücklich **nicht** das inkonsistente `*_eur`+`*_currency`-Paar von `committees`. Keine FX-Umrechnung im MVP.

### Pflicht-Hardening-ACs (CIA)
- **AC-120-H1** `confidentiality_level` Default **`'confidential'`** (bewusste Abweichung vom plattformweiten `'standard'`, begründet durch DoR „Inner Circle") + RESTRICTIVE `can_access_classified`-Gates auf **allen vier Achsen** (SELECT / INSERT-with-check / UPDATE / DELETE) — PROJ-115-Muster, nicht die `work_item_documents`-Lücke.
- **AC-120-H2** `ma_valuation_links` gated auf **beiden** Seiten (Bewertungs-Level **und** Finding-Level), damit die Existenz eines `strict`-Findings nicht über den Link inferierbar wird (schließt die PROJ-107-F-2-Klasse strukturell).
- **AC-120-H3** Keine INSERT/UPDATE-RLS-Policy auf Schreibpfaden: alle Mutationen über SECURITY-DEFINER-RPC **ohne actor-Parameter** (`auth.uid()`), `revoke execute … from public, anon`, expliziter Rollen- **und** Clearance-Re-Check im RPC.
- **AC-120-H4** Immutability-Guard-Trigger (42501) auf allen Inhaltsspalten; nur `is_current` änderbar. Partial-Unique-Index gegen Doppel-Kopf.
- **AC-120-H5** Audit-Trio (`audit_log_entity_type_check`, `_tracked_audit_columns`, `can_read_audit_entry`) **in derselben Migration**, **per Anchor-Replace aus den LIVE-Definitionen** (nicht als hartkodierter Volltext — 4 Parallel-Slices schreiben auf dieselbe Fläche; live bereits belegt durch `project_skills` aus PROJ-78), Geschwister-Zweige erhalten, `grant execute … to authenticated` explizit **nach** jedem Recreate.
- **AC-120-H6** Pflicht-Live-RPC-Smoke gegen Prod mit Rollback / 0 Residue: Kette V1→V2 mit Flip · Doppel-Kopf-Reject · Immutability-Reject · Need-to-know (nicht-cleared Member sieht 0, nach Clearance 1) · **Aggregat-Leak-Probe** · Link-Gate beidseitig · Cross-Tenant · anon-EXECUTE-Revoke · PROJ-115-Pentest A–I verbatim grün · PROJ-131-Pentest A–G verbatim grün.
- **AC-120-H7** Nav-Hotspot `src/lib/method-templates/index.ts` additiv, `requiresProjectType: 'ma'`, minimaler Eingriff (1 Icon-Import, 1 Konstante, 1 Array-Zeile).

### Was neu gebaut wird
1. **Migration 1** `20260807100000_proj120_valuation_business_case.sql` — `ma_valuations` + `ma_valuation_links` (RLS + 4-Achsen-Need-to-know), Immutability-Guard, Partial-Unique-Kopf-Index, `external_document_links`-Erweiterung (CHECK-Swap + Resolver-Branch + Cleanup-Trigger), 3 RPCs (`add_ma_valuation_version`, `set_ma_valuation_link`, `remove_ma_valuation_link`), Audit-Trio per Anchor-Replace aus LIVE + Re-Grant.
2. **Migration 2** `20260807101000_proj120_steering_report_valuation.sql` — `steering_report` aus LIVE-Def um die Bandbreite erweitert (F5, bewusst separat/letzte).
3. **API-Routen:** `GET/POST /api/projects/[id]/valuations`, `GET/POST/DELETE /api/projects/[id]/valuations/[vid]/links`.
4. **Frontend:** Tab „Bewertung" (`bewertung`, M&A-only) — Aktuelle-Bewertungssicht-Karte, Versions-Timeline, Neue-Version-Dialog, Findings-Verknüpfung, Artefakt-Links via bestehender `ExternalLinksSection`.

### Komponenten-Struktur (UI)
```
M&A-Projektraum
└── Tab „Bewertung" (neu, requiresProjectType ma)
    ├── Karte „Aktuelle Bewertungssicht"  (AC4)
    │   └── Bandbreite (low–high + Währung) · Methode · Stand-Datum · Verfasser · Vertraulichkeit
    ├── Versions-Timeline (AC2)
    │   └── je Version: v{N} · Stand-Datum · Methode · Bandbreite · Versionskommentar
    │       (ältere durchgestrichen/abgeblendet, Kopf mit „aktuell"-Badge)
    ├── Dialog „Neue Version"  → RPC (atomarer Flip + Insert)
    ├── Sektion „Verknüpfte Findings" (AC3)  → Finding-Picker + Notiz
    └── Sektion „Artefakte" → bestehende <ExternalLinksSection entityType="ma_valuation">

Querschnitt: PROJ-131 Steering-Kachel „Kaufpreisbandbreite" zeigt statt „n/a" die gültige Bandbreite.
```

### Offene Spec-Fragen — beantwortet
- **„Excel-Dateien speichern oder nur verlinken?"** → **Verlinken.** Upload erst, wenn das DMS klassifikationsfähig ist (PROJ-Y-115c → PROJ-Y-120c). Begründung live verifiziert (F2).
- **„Müssen Bewertungen vor jedem Stage-Gate aktualisiert werden (Pflicht)?"** → **Nein, keine Pflicht.** Weiches Signal als Followup (PROJ-Y-120b).

### Deviations (dokumentiert, alle forward-compat)
- **AC3-Hälfte „Synergie-Hypothesen (K2)"** nicht baubar — PROJ-126 existiert nicht (live verifiziert: 0 Tabellen/Spalten/RPCs). Findings-Hälfte wird voll gebaut; Synergie-Hälfte via Erweiterungs-Kontrakt an PROJ-126 übergeben.
- **Kein Löschen von Bewertungsversionen** im MVP (append-only, Invariante #5-Geist). Korrektur = neue Version mit Versionskommentar.
- **Kein Datei-Upload** (F2, sicherheitsgetrieben).
- **Keine FX-Umrechnung** der Bandbreite (PROJ-22-FX bewusst nicht angezogen).

### Tech-Entscheidungen (für PM)
- **Register statt Rechner:** Die Plattform macht Bewertungen nachvollziehbar, sie ersetzt kein Finanzmodell — genau wie die Spec es fordert.
- **Unveränderliche Versionskette:** Eine einmal gültige Bewertung kann nicht stillschweigend umgeschrieben werden; jede Änderung ist eine neue, kommentierte Version. Das ist die Grundlage des Audit-Trails.
- **Verlinken statt Hochladen:** bewusst konservativ — die Dateiablage kann eine hochsensible Bewertungs-Excel heute nicht auf „Inner Circle" einschränken.
- **Währung von Anfang an:** nachträglich einzubauen wäre teuer, weil ältere Versionen eingefroren sind.

### Abhängigkeiten (Pakete)
**Keine neuen npm-Pakete.** Zwei Supabase-Migrationen.

### Risiken
- **R-1** Audit-Trio ist geteilter Zustand mit 4 Parallel-Slices → Anchor-Replace aus LIVE + Re-Grant + Verifikation, dass fremde `entity_type`-Werte erhalten bleiben (H5).
- **R-2** `external_link_parent_ctx` / `entity_type`-CHECK ist die wahrscheinlichste Merge-Kollision mit PROJ-122 → idempotenter Swap, additiver Resolver-Branch.
- **R-3** `steering_report`-Replace könnte fremde Parallel-Änderungen überschreiben → aus LIVE ableiten, separate letzte Migration, im Konfliktfall herausnehmbar.
- **R-4** Aggregat-Leak über die Steering-Kachel (nicht-cleared Member darf die Bandbreite einer `confidential`-Bewertung nicht sehen) → INVOKER + Pflicht-Pentest.

### Followups (PROJ-Y)
- **PROJ-Y-115c (hochstufen, sicherheitsrelevant):** Vertraulichkeits-Layer für `documents`/`work_item_documents` + Verengung der Bucket-Policies. Jetzt Blocker für zwei Slices.
- **PROJ-Y-120a:** Per-Methode-Teilbandbreiten (Football-Field-Sicht).
- **PROJ-Y-120b:** weiches `valuation_current`-Signal in `stage_gate_prereadiness`.
- **PROJ-Y-120c:** Upload-Pfad für Bewertungsartefakte (nach PROJ-Y-115c).
- **PROJ-126-Kontrakt:** `'synergy_hypothesis'` in `ma_valuation_links` + Cleanup-Trigger + Gate-Zweig.

---

## Backend Implementation Notes (2026-08-08)

**Migration 1 — `20260807211457_proj120_valuation_business_case.sql`** (in Prod).
- `ma_valuations`: Versionskette je Deal (`version_no`, `supersedes_valuation_id`, `is_current`, `version_comment`, `title`, `valuation_date`, `method`, `value_low`/`value_high numeric(18,2)`, `currency char(3)` gegen `_is_supported_currency`, `assumptions`, `author_user_id`, `confidentiality_level` **Default `'confidential'`**). **F1-Invariante als DB-Constraint**: `unique index … (project_id) where is_current`.
- `ma_valuation_links`: M:N Bewertung ↔ Finding, CHECK **nur** `'dd_finding'` + Erweiterungs-Kontrakt für PROJ-126 im Migrations-Header (CHECK **und** Gate-Zweig **und** Cleanup-Trigger — sonst Dangling-Referenzen).
- RLS: SELECT permissive (`is_project_member`) + **RESTRICTIVE `can_access_classified` auf allen vier Achsen**; keine INSERT/UPDATE/DELETE-permissive-Policy → Schreiben ausschließlich über RPCs (H3). Links sind **beidseitig** gegated über `_ma_valuation_link_target_visible` (H2, fail-closed bei unbekanntem Kind).
- Immutability-Guard-Trigger (42501) auf allen Inhaltsspalten; nur `is_current` änderbar (H4).
- 3 RPCs `add_ma_valuation_version` / `set_ma_valuation_link` / `remove_ma_valuation_link` — SECURITY DEFINER, **kein actor-Param** (`auth.uid()`), Rollen- **und** Clearance-Re-Check, `revoke … from public, anon`.
- `external_document_links` um `entity_type='ma_valuation'` erweitert (idempotenter CHECK-Swap + additiver Resolver-Branch + Cleanup-Trigger).
- **Audit-Trio per Anchor-Replace aus den LIVE-Definitionen** (H5) + expliziter `grant execute … to authenticated` danach. Verifiziert, dass fremde Zweige erhalten blieben — `project_skills` der parallelen PROJ-78-Session steht weiterhin im CHECK. `_tracked_audit_columns('ma_valuations') = ['is_current']` (nur diese Spalte ist überhaupt änderbar) → der Versionswechsel ist auditiert (DoD).

**Migration 2 — `20260808142745_proj120_steering_report_valuation.sql`** (in Prod, F5).
`steering_report` **aus der LIVE-Definition** neu aufgebaut; additiv nur die CTE `valuation_current`, der Key `'valuation'` und vier `pre_read`-Felder. **SECURITY INVOKER bleibt** → Need-to-know greift im Aufrufer-Kontext, kein zweites Gate.

**Migrations-Versions-Drift (PROJ-134):** MCP `apply_migration` vergab trotz korrekt übergebenem `name` eigene Versionen (`20260807211457` bzw. `20260808142745`). Gemäß `docs/production/migration-naming.md` wurden die **Repo-Dateien auf die Prod-Versionen umbenannt**. Beide kollisionsfrei; Apply-Reihenfolge unverändert. **Abweichung von der Vorgabe „Fenster 20260807 10xxxx"** — die verbindliche PROJ-134-Regel hat Vorrang, der Zweck (Kollisionsfreiheit) ist erfüllt. `check:migration-naming` = 0 errors.

**API/TS:** `GET|POST /api/projects/[id]/valuations`, `GET|POST|DELETE /api/projects/[id]/valuations/[vid]/links`; `src/types/valuation.ts`, `src/lib/ma-project/valuations-api.ts`, `src/hooks/use-valuations.ts`; `ExternalLinkEntityType` additiv um `"ma_valuation"` erweitert (3 Consumer, alle additiv — LOW blast radius).

### Live-Nachweise (Pflicht, alle gegen Prod, 0 Residue)
| Suite | Ergebnis |
|---|---|
| `tests/sql/PROJ-120-valuation-pentest.sql` A–N | **16/16 PASS** |
| PROJ-131-Pentest A–G verbatim + neue Fälle H/I | **9/9 PASS** |
| `tests/sql/PROJ-115-external-links-pentest.sql` A–I (Regression) | **9/9 PASS** |
| Supabase-Advisors | **0 ERROR** (129 WARN; die 4 PROJ-120-WARNs sind die repo-übliche `authenticated_security_definer_function_executable`-Klasse) |

Kern-Beweise: Kette V1→V2 mit atomarem Flip · zweite Kette abgelehnt (23514) · Immutability-Guard (42501) · Doppel-Kopf am Partial-Unique-Index (23505) · **Aggregat-Leak-Probe**: nicht freigegebener Projekt-*Lead* sieht 0 Bewertungen **und** `max(value_high) is null` **und** im Steering-Report weder `valuation` noch die Pre-Read-Bandbreite · Link zu einem `strict`-Finding für einen nur bewertungs-freigegebenen Nutzer unsichtbar · non-M&A-Projekt abgelehnt (P0001) · Cross-Tenant 0 · anon-EXECUTE auf allen 3 RPCs entzogen · Audit-Zeile für den Versionswechsel.

## Frontend Implementation Notes (2026-08-08)

- Nav: `MA_VALUATION_SECTION` (`bewertung`, Icon `Calculator`, `requiresProjectType: "ma"`), eingefügt zwischen DD-Bericht und Operativem Reporting. **Minimaler Eingriff im Hotspot:** 1 Icon-Import, 1 Konstante, 1 Array-Zeile.
- Route `src/app/(app)/projects/[id]/bewertung/page.tsx` + `src/components/projects/ma/valuations-page.tsx`:
  - Karte **„Aktuelle Bewertungssicht"** (Bandbreite, Methode, Stand-Datum, Version, Vertraulichkeits-Badge, Annahmen) — AC4
  - **Versionshistorie** mit Versionskommentar; abgelöste Stände abgeblendet, Kopf mit „aktuell"-Badge — AC2
  - Dialog **„Neue Version"** (setzt `supersedes` automatisch auf den aktuellen Kopf) — AC1
  - **„Verknüpfte DD-Findings"** mit Picker + Entfernen — AC3 (Findings-Hälfte)
  - **„Bewertungs-Artefakte"** über die bestehende `<ExternalLinksSection entityType="ma_valuation">` — AC1/F2
  - alle Mutationen `edit_master`-gated
- PROJ-131-Kachel „Kaufpreisbandbreite" zeigt jetzt die Bandbreite; bei fehlender Bewertung **oder** fehlender Freigabe denselben neutralen `n/a`-Platzhalter — aus der Anzeige ist damit **nicht** ableitbar, ob eine Bewertung existiert. Synergie-Kachel bleibt `n/a`.

## Quality Gates (2026-08-08)
| Gate | Baseline | Ergebnis |
|---|---|---|
| `npm run lint` | 0 | **0 errors** |
| `npx tsc --noEmit` | 13 | **13** (identische Verteilung, 0 neue) |
| `npx vitest run` | 2605/2605 | **2627/2627** (+22 neue Route-Tests) |
| `npm run build` | clean | **clean**, 3 neue Routen registriert |
| `npm run check:migration-naming` | 0 errors | **0 errors** |
| Playwright `tests/PROJ-120-valuation.spec.ts` | — | **7/7 chromium** |

## Deviations
- **AC3 Synergie-Hälfte nicht gebaut** — K2/PROJ-126 existiert nachweislich nicht (0 Tabellen/Spalten/RPCs). Findings-Hälfte vollständig; Synergie-Hälfte per Erweiterungs-Kontrakt übergeben.
- **Kein Löschen von Bewertungsversionen** (append-only, Invariante-#5-Geist). Korrektur = neue Version mit Kommentar.
- **Kein Datei-Upload** (F2, sicherheitsgetrieben).
- **Keine FX-Umrechnung** der Bandbreite.
- **Migrations-Fenster** siehe PROJ-134-Absatz oben.
- **Mobile Safari** im E2E übersprungen (fehlende WebKit-Host-Libs, PROJ-67/F2 — Umgebung, nicht Slice).

## QA Test Results (2026-08-08) — PASS, PRODUCTION-READY

**0 Critical · 0 High · 1 Low (in-QA gefixt) · 0 offen**

### Acceptance Criteria
| AC | Ergebnis | Nachweis |
|---|---|---|
| AC1 — versionierte Bewertungs-Artefakte mit Stand-Datum, Methode, Bandbreite, Annahmen, Verfasser | ✅ PASS | Pentest A/B (Kette V1→V2 mit allen Feldern); Route-Tests 400 bei unbekannter Methode / invertierter Bandbreite / nicht unterstützter Währung; UI-Dialog. Artefakt = Verweis (F2). |
| AC2 — Versionswechsel explizit dokumentiert | ✅ PASS | `version_comment` („V2 – nach Integration der Financial-DD-Findings") in Pentest B; Immutability-Guard (D) erzwingt, dass Korrekturen neue Versionen sind; Versionshistorie-UI. |
| AC3 — Verknüpfung mit Findings (G3) **und** Synergien (K2) | ⚠️ **PARTIAL** | Findings-Hälfte voll: Pentest H1/H2 + Route-Tests + UI-Picker. **Synergie-Hälfte nicht baubar** — PROJ-126 existiert nachweislich nicht (0 Tabellen/Spalten/RPCs). Erweiterungs-Kontrakt im Migrations-Header + Followup. |
| AC4 — „Aktuelle Bewertungssicht" mit gültiger Version + Bandbreite | ✅ PASS | Partial-Unique-Index garantiert genau einen Kopf (Pentest E); Karte im Tab; zusätzlich in der PROJ-131-Steering-Kachel (Fall H). |

### Security / Red-Team (live gegen Prod, Impersonation, 0 Residue)
| Suite | Ergebnis |
|---|---|
| `tests/sql/PROJ-120-valuation-pentest.sql` A–N | **16/16 PASS** (nach dem F-1-Fix erneut 16/16) |
| Red-Team-Supplement O–U + S2–S5 | **11/11 PASS** (nach Fix) |
| PROJ-131-Pentest A–G verbatim + neue Fälle H/I | **9/9 PASS** |
| `tests/sql/PROJ-115-external-links-pentest.sql` A–I (Regression) | **9/9 PASS** |
| Supabase-Advisors | **0 ERROR** |

Geblockte Angriffsvektoren: direkter INSERT/UPDATE unter Umgehung der RPCs — selbst als Tenant-Admin (O/P/Q) · SQL-Injection in `linked_kind` (R, parameterisiert → 22023) · Cross-Tenant-Version-Anlage (T) · Cross-Tenant-Lesen von Bewertungen und Links (K/S2) · **Aggregat-Leak**: nicht freigegebener Projekt-*Lead* sieht 0 Bewertungen, `max(value_high) is null`, und im Steering-Report weder `valuation` noch die Pre-Read-Bandbreite (G/I) · Link zu einem `strict`-Finding für einen nur bewertungs-freigegebenen Nutzer unsichtbar (H2) · anon-EXECUTE auf allen RPCs entzogen (L) · non-M&A-Projekt abgewiesen (J).

### Findings
**F-1 (Low, in-QA gefixt) — Existenz-Orakel im Sichtbarkeits-Helfer.**
`_ma_valuation_link_target_visible` delegierte ausschließlich an `can_access_classified`, das für Stufe `'standard'` bedingungslos `true` liefert (bewusst so — Need-to-know liegt additiv über der Mitglieds-RLS der jeweiligen Tabelle). Weil der Helfer an `authenticated` ge-granted sein **muss** (die RLS-Policy ruft ihn im Aufrufer-Kontext auf), war er auch direkt als RPC aufrufbar: ein Nutzer eines fremden Tenants bekam für ein `standard`-Finding `true` und konnte damit die Existenz einer ihm bekannten dd_findings-UUID bestätigen.
*Bewertung Low:* kein Inhaltsabfluss (nur ein Boolean), ein gültiges v4-UUID musste bereits vorliegen, und das eigentliche Link-Gate war **nicht** geschwächt — die SELECT-Policy UND-verknüpft den Helfer mit der Bewertungs-Seite, weshalb Fall K (Cross-Tenant → 0 Links) durchgehend grün blieb.
*Fix:* Migration `20260808144247_proj120_link_visibility_membership_guard` — explizite `is_project_member`-Prüfung im Helfer (fail-closed). Re-Test S/S2–S5 **5/5 PASS** (kein Over-Block: Projektmitglieder sehen ihre Links unverändert), Haupt-Pentest danach erneut **16/16 PASS**.

### Automatisierte Tests
- `tests/PROJ-120-valuation.spec.ts` — **7/7 chromium** (alle 5 API-Flächen + malformed id + `/bewertung`-Seite auth-gated)
- Route-Unit-Tests **22/22**; volle Vitest-Regression **2627/2627**

### Deviations
- **D-1** AC3-Synergie-Hälfte → PROJ-126 (Erweiterungs-Kontrakt hinterlegt).
- **D-2** Kein Löschen von Versionen (append-only, Invariante-#5-Geist).
- **D-3** Kein Datei-Upload (F2, sicherheitsgetrieben) → PROJ-Y-120c nach PROJ-Y-115c.
- **D-4** Mobile Safari im E2E übersprungen (fehlende WebKit-Host-Libs, PROJ-67/F2 — Umgebung, nicht Slice).
- **D-5** Migrations-Fenster: Repo-Dateien tragen die Prod-Versionen (PROJ-134-Regel), nicht das ursprünglich zugewiesene `20260807 10xxxx`.

**Empfehlung: PRODUCTION-READY** (kein Deploy im Rahmen dieses Laufs — Branch endet nach `/qa`).

## Environment Fix (nicht Teil der Slice, nicht committet)
Im Worktree war `npm run lint` kaputt (`TypeError: expand is not a function`): der Hardlink-Kopie fehlten die verschachtelten `minimatch/node_modules/{brace-expansion@1,balanced-match@1}` sowie `concat-map`, sodass `minimatch@3` gegen das gehobene `brace-expansion@5` lief. Aus dem Primary-Checkout gespiegelt (nur `node_modules`, gitignored) — kein Repo-Change.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · I — Bewertung & Kaufpreislogik_
