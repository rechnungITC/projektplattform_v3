---
id: PROJ-97
title: "Projektrollen und Verantwortlichkeiten verwalten"
issue_type: Story
epic_code: B
epic_title: "Rollen, Gremien & Governance"
priority: Highest
priority_source: "Must (MVP – Voraussetzung jeder Aufgaben- und Deliverable-Steuerung)"
labels: ["ma-platform", "epic-b", "mvp"]
dependencies: ["A1", "B4"]
roles: ["Deal Lead", "PMO-Lead", "Workstream Leads", "HR-Vertretung (lesend)"]
summary_for_jira: "[B1] Projektrollen und Verantwortlichkeiten verwalten"
---

# PROJ-97: Projektrollen und Verantwortlichkeiten verwalten

## Status: In Progress (97a + 97b Backend + Frontend gebaut 2026-06-24/25 — Fachrollen + Verantwortungs-Ansicht + RACI-Engine + UI; /qa offen)

## Implementation Notes — Frontend (2026-06-25)

- **Nav** `MA_ROLES_SECTION` („Rollen & RACI", Icon `Network`, `requiresProjectType: 'ma'`) in `method-templates/index.ts`. Route `/projects/[id]/rollen`.
- **`ma-roles-raci-page.tsx`**: zwei Karten.
  - **97a Verantwortungs-Ansicht** (`ResponsibilityCard`): liest `GET /api/projects/[id]/roles` (Client-Wrapper `roles-api.ts`), Tabelle Fachrolle → zugeordnete Stakeholder mit **„extern"-Badge** (`origin='external'`); Mehrfachrollen sichtbar.
  - **97b RACI-Matrix** (`RaciMatrixCard`): Work-Item-Picker (`useWorkItems`) × Fachrollen (`MA_STANDARD_ROLES`) × R/A/C/I als Toggle-Buttons. Set/clear via `raci-api.ts` (`setWorkItemRaci`/`clearWorkItemRaci`); aktiver Buchstabe erneut klicken = entfernen. **„A=genau-einer"**-Konflikt (409) → Toast + Reload (zeigt den serverseitig durchgesetzten Ist-Zustand). Editieren gated auf `edit_master` (sonst read-only mit Hinweis).
- **Gates:** lint 0, tsc 14 baseline/0 neu, vitest 2046/2046, build clean (Route registriert).
- **Offen:** /qa (E2E Verantwortungs-Ansicht + RACI set/A-Konflikt/clear; Negativtests). `target_type='deliverable'` → PROJ-104.
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic B — Rollen, Gremien & Governance)

## Implementation Notes — 97a Backend (2026-06-24)

Slice **97a** (Rollen & Zuordnung, niedriges Risiko) gebaut; **97b** (RACI-Engine, HOCH-Risiko, polymorphe `raci_assignments`) bewusst noch offen. **Reiner Reuse, keine neue Tabelle, kein neuer Dep, keine Migration.**

- **Fachrollen-Werteliste** (E1): `MA_STANDARD_ROLES` in `src/lib/project-types/catalog.ts` — 4 → **11** M&A-Fachrollen (Executive Sponsor, Deal Lead, PMO-Lead, CFO/Finance, Legal, Tax, HR, IT, Communications, Externer Berater, Target Management). Einzige Quelle; `MA_PROFILE.standard_roles` referenziert sie. RBAC (`project_memberships.role`) bleibt strikt getrennt (Invariante #4). `sponsor` → `executive_sponsor` umbenannt (PROJ-94-Test angepasst).
- **Validierung** `isValidMaRoleKey(key)` — App-Layer-Lookup gegen die Liste (kein neuer FK-Zwang), für künftige Stakeholder-role_key-Validierung.
- **Verantwortungs-Ansicht** (AC-97-1/2/4/5): `GET /api/projects/[id]/roles` — read-only Aggregation über bestehende `stakeholders` (role_key-Slot), gruppiert je Fachrolle + „extern"-Marker (`origin='external'`), „Sonstige"-Bucket für nicht-katalogisierte role_keys. Mehrfachrollen via mehrere Stakeholder-Einträge.

**Quality-Gates:** lint 0, tsc 14 baseline/0 neu, vitest +9 (4 catalog/helper + 5 route), build clean (Route registriert).

**Offen (97a):** 97a-Frontend (Rollenliste + Verantwortungs-Ansicht-UI, „extern"-Badge → reuse Stakeholder-/PROJ-57-Linking-UI); Rollenlisten-Vorbefüllung → PROJ-96; durchgesetzte Externe-Sichtbarkeit → PROJ-99. Historisierung via PROJ-10-Audit (keine eigenen Zeitspalten).

## Implementation Notes — 97b RACI-Engine Backend (2026-06-25)

Slice **97b** (RACI-Engine, HOCH-Risiko/Schema-Lock-in) gebaut — genau nach Tech-Design E2. **Eine neue Tabelle, kein neuer Dep.**

- **Tabelle** `raci_assignments` (Migration `20260624154503`, in Prod; Repo == prod-Version per PROJ-134): **polymorph** (`target_type` CHECK heute nur `'work_item'` — `'deliverable'` wird von PROJ-104 freigeschaltet), `target_id`, **Träger = Fachrolle** (`role_key`, NICHT die Person → Rollenwechsel bleiben konsistent, Invariante #4), `raci_letter` (R/A/C/I). Multi-Tenant-Invariante (`tenant_id`/`project_id` NOT NULL + FK CASCADE).
- **Zentrale Geschäftsregel als DB-Constraint** (nicht UI): „**Accountable = genau einer pro Ziel**" via partiellem Unique-Index `raci_one_accountable (target_type, target_id) WHERE raci_letter='A'`; zusätzlich Unique `(target_type, target_id, role_key)` (eine Letter pro Rolle/Ziel).
- **Polymorpher Integritäts-Guard:** die set/clear-RPCs lösen `tenant_id`/`project_id` aus dem `work_items`-Ziel auf (existiert nicht → 02000), kein direkter Polymorph-FK (PROJ-9-Muster).
- **RLS:** SELECT project-member/admin; INSERT/UPDATE/DELETE lead/editor/admin (defense-in-depth, Writes laufen über RPCs).
- **RPCs** `set_work_item_raci` (upsert, A-Konflikt → 23505) + `clear_work_item_raci`; SECURITY DEFINER, `auth.uid()`-only, anon revoked.
- **Audit (PROJ-10):** `audit_log_entity_type_check` + `_tracked_audit_columns` + `can_read_audit_entry` um `raci_assignments` erweitert (vermeidet den PROJ-100a-H-1-entity_type-Bug); AFTER-UPDATE-Trigger auditiert `raci_letter`-Wechsel.
- **API** `GET/POST/DELETE /api/projects/[id]/work-items/[wid]/raci` (role_key app-layer via `isValidMaRoleKey`; 409/403/404/400-Mapping). Client-Wrapper `src/lib/ma-project/raci-api.ts`.

**Pflicht-Live-RPC-Smoke gegen Prod (0 Residue via ROLLBACK_MARKER):** set R/A/C ✓; zweiter Accountable → REJECTED(23505) ✓; Reassign A (A→R, dann neue A) ✓; nicht-existentes Work-Item → REJECTED(02000) ✓ (Guard); Nicht-Member → REJECTED(42501) ✓ (Authority); clear=1 ✓; Audit-Trigger 1 Zeile ✓. Security-Advisor: 0 ERROR, 0 rls_disabled auf `raci_assignments`.

**Quality-Gates:** lint 0, tsc 14 baseline/0 neu, vitest +9 (Route), build clean (Route registriert).

**Offen (97b):** RACI-Matrix-Editor-UI je Aufgabe → /frontend; `target_type='deliverable'` → PROJ-104; /qa Negativtests (A=genau-einer, Guard, RLS/Tenant-Isolation).
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **DUP→REUSE** · Andockpunkt: PROJ-4 RBAC + PROJ-57 Linking; RACI-Feld neu. Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** B — Rollen, Gremien & Governance  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP – Voraussetzung jeder Aufgaben- und Deliverable-Steuerung)  
> **Labels:** `ma-platform` · `epic-b` · `mvp`  
> **Abhängigkeiten:** `A1`, `B4`

**User Story:**

Als Deal Lead möchte ich Projektrollen (intern und extern) anlegen, Personen zuweisen und Verantwortlichkeiten pro Phase, Workstream und Artefakt sichtbar machen, damit jederzeit klar ist, wer für was zuständig ist.

**Beschreibung / Kontext:**

Das Modell unterscheidet diverse M&A-Rollen (Executive Sponsor, Deal Lead, CFO/Finance, Legal, Tax, HR, IT, Communications, externe Berater, Target Management). Die Plattform muss diese Rollen abbilden und mit RACI-Logik je Aufgabe und Deliverable verknüpfen.

**Akzeptanzkriterien:**

- [ ] Eine Rollenliste mit Beschreibung ist je Projekt pflegbar und aus dem Template (A3) vorbefüllt.
- [ ] Personen können einer oder mehreren Rollen zugeordnet werden; gleiche Person kann mehrere Rollen tragen.
- [ ] Pro Aufgabe (C1) und Deliverable (D1) kann eine RACI-Zuordnung gepflegt werden.
- [ ] Sichtbar ist, wer aktuell für welche Aufgaben/Deliverables 'Accountable' ist.
- [ ] Externe Berater werden klar als 'extern' markiert (siehe B3) und haben standardmäßig eingeschränkte Sichtbarkeit.

**Abgrenzungen (Out of Scope):**

- Keine Anbindung an ein HR-System für Mitarbeiterstammdaten in dieser Story (siehe Open Questions).
- Komplexe Skill-Matching-Logik ist nicht Teil der Plattform.

**Offene Fragen:**

- Soll die Personenverwaltung über das interne Identity-Provider-System (AD, Entra ID) erfolgen?
- Wie werden Rollenwechsel während eines Deals historisiert?
- Müssen rechtliche Stellvertretungsregelungen abgebildet werden?

**Definition of Ready:**

- [ ] Rollenkatalog ist mit M&A, HR und Legal abgestimmt.
- [ ] RACI-Modell ist definiert.
- [ ] Identity-Provider-Frage ist geklärt.

**Definition of Done:**

- [ ] Rollen sind anlegbar, Personen zuweisbar, RACI je Artefakt setzbar.
- [ ] Verantwortungs-Ansicht zeigt korrekte Zuordnung.
- [ ] Historisierung von Rollenwechseln ist nachweisbar.

**Abhängigkeiten:**

- A1 – Projektanlage
- B4 – Berechtigungskonzept

**Betroffene Rollen:**

- Deal Lead
- PMO-Lead
- Workstream Leads
- HR-Vertretung (lesend)

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · B — Rollen, Gremien & Governance_

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

> **Authored:** 2026-06-24 · **Author:** /architecture skill (CIA-reviewed)
> **Audience:** PM + dev team. Keine Code-/SQL-Snippets; nur strukturelle Referenzen.
> **Reuse-Klasse (ADR `ma-domain-architecture`):** **DUP→REUSE** — Andockpunkt **PROJ-4 RBAC + PROJ-57 Linking**; **RACI ist genuin neu**.

### 0. Scope + Slice-Split (CIA-empfohlen, User-bestätigt 2026-06-24)

PROJ-97 mischt zwei unterschiedlich risikobehaftete Konzerne. Es wird daher in **zwei Slices** geliefert (Muster wie PROJ-100a/100b — eine Spec, zwei Slices):

| Slice | Inhalt | Risiko | Entblockt |
|---|---|---|---|
| **97a — Rollen & Zuordnung** | M&A-Fachrollen-Werteliste + Person→Rolle-Zuordnung + „extern"-Markierung + Verantwortungs-Ansicht („wer ist wofür zuständig") | NIEDRIG (fast reiner Reuse) | sofort baubar → entblockt PROJ-95-Betrieb + PROJ-101 |
| **97b — RACI-Engine** | RACI-Zuordnung (R/A/C/I) pro Aufgabe (PROJ-9) und — forward-kompatibel — pro Deliverable (PROJ-104) | HOCH (genuiner Neubau, Schema-Lock-in) | reift unabhängig, forward-kompatibel zu PROJ-104 |

**Begründung des Splits:** Die risikoarme Rollen-Auslieferung (97a) darf nicht am RACI-Neubau (97b) hängen. 97a ist Reuse auf bestehenden Strukturen; 97b braucht ein polymorphes Schema mit DB-Geschäftsregel und ein noch nicht existierendes zweites Zielobjekt (Deliverables).

### 1. Was gebaut wird (Komponenten-Sicht)

```
PROJ-97a — Rollen & Zuordnung
├── Backend
│   ├── M&A-Fachrollen-Werteliste (Code-Konstante, ~10 Rollen)  ← NEU, in src/lib/project-types/ (erweitert MA_PROFILE.standard_roles)
│   │     Executive Sponsor, Deal Lead, CFO/Finance, Legal, Tax, HR, IT, Comms, Externer Berater, Target Mgmt
│   ├── Validierung `stakeholders.role_key` gegen die Liste     ← NEU (App-Layer/Lookup, kein neuer FK-Zwang)
│   └── REUSE: `stakeholders` (role_key + origin), PROJ-57-Linking (Person↔Stakeholder↔Resource↔Rolle), PROJ-10-Audit
├── Frontend
│   ├── Rollenliste je Projekt (vorbefüllt aus Template/A3)     ← NEU dünne Verwaltung; Vorbefüllung = PROJ-96 (Fork 5)
│   ├── Person→Rolle-Zuweisung (Mehrfachrollen, AC-97-2)        ← REUSE Stakeholder-/PROJ-57-Linking-UI
│   ├── „extern"-Badge (origin='external', AC-97-5)             ← REUSE vorhandenes origin-Feld
│   └── Verantwortungs-Ansicht „wer ist wofür zuständig"        ← NEU Lese-Sicht (Rolle → Personen je Projekt/Phase)
└── REUSE-Querschnitt: PROJ-4 RBAC (lead/editor/viewer bleibt technische Identität, getrennt!), PROJ-100a Tenant-/Need-to-Know

PROJ-97b — RACI-Engine
├── Backend
│   ├── Tabelle `raci_assignments` (POLYMORPH)                  ← NEU
│   │     target_type ('work_item' | später 'deliverable'), target_id, role_key (Träger=Fachrolle), raci_letter (R/A/C/I)
│   │     + tenant_id (Multi-Tenant-Invariante) + Audit (PROJ-10)
│   ├── DB-Regel „Accountable = genau einer"                   ← NEU (partieller Unique je Ziel, raci_letter='A')
│   ├── Integritäts-Guard auf target (Trigger/Whitelist)       ← REUSE-Muster aus PROJ-9 polymorphic dependencies
│   └── RPCs set/clear RACI (SECURITY DEFINER, RLS-geschützt)
└── Frontend
    └── RACI-Matrix-Editor je Aufgabe (PROJ-9 work_item)        ← NEU; Deliverable-Tab erst wenn PROJ-104 existiert
```

### 2. Datenmodell in Klartext

**97a — kein neues Schema.** Die M&A-Fachrollen sind eine **deklarative Werteliste im Code** (erweitert die bereits existierende `MA_PROFILE.standard_roles` im Project-Type-Catalog von 4 auf die ~10 genannten Rollen). **Träger einer Fachrolle** ist die bestehende `stakeholders`-Zeile über ihren **`role_key`**-Slot; „extern" ist das bereits vorhandene **`origin='external'`**. Mehrfachrollen einer Person (AC-97-2) bilden sich über **mehrere Stakeholder-/PROJ-57-Link-Einträge** ab. **Historisierung von Rollenwechseln** (DoD) kommt „frei Haus" aus dem **PROJ-10-Field-Audit** — keine eigenen „gültig von–bis"-Spalten (das wäre Doppelstruktur).

**97b — eine neue, polymorphe Tabelle `raci_assignments`.** Jede Zeile verknüpft **ein Ziel** (`target_type` + `target_id`) mit **einer Fachrolle** (`role_key`, nicht der Person!) und **einem RACI-Buchstaben** (R/A/C/I). **Warum die Rolle als Träger und nicht die Person:** wechselt die Person, bleibt die RACI-Zeile korrekt an der Rolle hängen — das macht Rollenwechsel automatisch konsistent und respektiert Invariante #4 (Stakeholder ≠ User). **Warum polymorph:** das zweite Zielobjekt (Deliverables, PROJ-104) existiert noch nicht; die Tabelle wird heute polymorph angelegt, lässt aber zunächst **nur `target_type='work_item'`** zu — `'deliverable'` wird erlaubt, sobald PROJ-104 die Tabelle liefert. Die zentrale Geschäftsregel **„Accountable = genau einer pro Ziel"** lebt als **DB-Constraint** (partieller Unique), nicht in der UI.

### 3. Tech-Entscheidungen (das Warum) — CIA-gelockt (E1–E4)

| # | Entscheidung | Wahl | Warum / Trade-off |
|---|---|---|---|
| **E1** | Fachrollen-Registry | Code-Werteliste (PROJ-6) + Träger `stakeholders.role_key`; **keine neue Katalog-Tabelle** | Nutzt zwei existierende Strukturen; AC-97-5 „extern" via `origin` geschenkt; Invariante #4 gewahrt. Trade-off: `role_key` ist heute freier String → leichte Validierung gegen die Liste nötig (sonst Tippfehler-Rollen). |
| **E2** | RACI-Persistenz (97b) | **Polymorphe** `raci_assignments`, **Träger = Fachrolle**, `A`-genau-einer als **DB-Constraint**, heute nur `work_item` | Einziger forward-kompatibler Weg (PROJ-104 fehlt); rollen-getragen ⇒ Rollenwechsel automatisch korrekt. Trade-off: polymorphe FKs ohne DB-RI auf `target_id` → Integritäts-Guard per Trigger/Whitelist (Muster existiert in PROJ-9 dependencies). |
| **E3** | Person→Rolle | **PROJ-57-Linking + PROJ-10-Audit** (keine eigenen Zeitspalten) | DRY auf dem dedizierten Andockpunkt; Audit erfüllt „Historisierung nachweisbar". Trade-off: Audit zeigt Änderungen, keine „gültig von–bis"-Zeitscheiben — falls späteres Reporting punktgenaue Gültigkeit braucht, nachrüstbar. |
| **E4** | Externe-Berater-Sichtbarkeit | nur `origin='external'`-Markierung + RBAC in 97; **kein** Clearance-Gating hier | Die *durchgesetzte* eingeschränkte Sichtbarkeit ist **PROJ-99**-Scope (nutzt dann PROJ-100a-Clearance-Rezept). Trade-off: zwischen 97 und 99 sind Externe markiert, aber noch nicht restriktiv gegated — akzeptabel, weil PROJ-100a die Tenant-RLS-Grundsicherung ohnehin trägt. |
| — | RBAC vs. Fachrolle | strikt getrennt: `project_memberships.role` (lead/editor/viewer) bleibt technische Identität | CLAUDE.md Invariante #4. M&A-Fachrollen niemals in den RBAC-CHECK mischen. |

### 4. Öffentliche API (Routen — konzeptionell)

- **97a NEU:** `…/roles` (Projekt-Rollenliste lesen/pflegen), Person→Rolle-Zuweisung über bestehende Stakeholder-/PROJ-57-Routen; Verantwortungs-Ansicht als Lese-Endpoint/Aggregation.
- **97b NEU:** `…/work-items/[wid]/raci` (RACI je Aufgabe lesen/setzen); später analog für Deliverables.
- **REUSE:** PROJ-8 Stakeholder-Routen, PROJ-57-Linking, PROJ-4 Member-Routen, PROJ-10 HistoryTab.

### 5. Was sich außerhalb von PROJ-97 ändert

- `src/lib/project-types/catalog.ts` — `MA_PROFILE.standard_roles` von 4 auf ~10 Fachrollen erweitert (97a).
- `_tracked_audit_columns()` — relevante Rollen-Zuordnungs- und RACI-Spalten ergänzt (Historisierung E3/E2).
- `audit_log_entity_type_check` + `can_read_audit_entry` — um `raci_assignments` erweitert (97b, Muster wie PROJ-94/100a).
- Polymorpher Integritäts-Guard — Wiederverwendung des PROJ-9-Dependency-Musters.

### 6. Tests

- 97a: Werteliste-Validierung, Mehrfachrollen, „extern"-Markierung, Verantwortungs-Ansicht; Rollenwechsel-Audit-Smoke (PROJ-10).
- 97b: **Live-RPC-Smoke (Pflicht)** für set/clear RACI gegen Prod; **„Accountable = genau einer"**-Constraint (zweites A am selben Ziel muss scheitern); polymorpher Guard (ungültiger `target_type`/`target_id` abgewiesen); RLS/Tenant-Isolation.
- Regression: PROJ-4/8/57-Suiten unverändert grün.

### 7. Out of Scope (explizit deferiert — benannt)

- **PROJ-96** (Fork 5): Vorbefüllung der Rollenliste aus dem Projekt-Template „A3" (Copy-on-Create) — 97a baut gegen die Code-Werteliste, 96 ersetzt sie später durch Template-Lookup.
- **PROJ-104**: `raci_assignments.target_type='deliverable'` (heute nur `'work_item'` zugelassen; Tabelle bereits polymorph).
- **PROJ-99**: clearance-basierte, durchgesetzte Externe-Berater-Sichtbarkeit (97 markiert nur).
- **IdP-Föderation** (AD/Entra), rechtliche Stellvertretung, HR-System-Anbindung — offene Spec-Fragen, nicht MVP (PROJ implementiert keine eigene IAM, Auth via Corporate-IdP).

### 8. Dependencies (Pakete)

**Keine neuen npm-Pakete.** 97a = reiner Reuse; 97b = eine neue Tabelle + RPCs + Trigger-Guard (alles mit Bestandsmustern).

### 9. Risiko + Trade-off

| Risiko | Sev | Mitigation |
|---|---|---|
| RACI-Schema-Lock-in bei PROJ-104 | HOCH | Polymorph + Fachrollen-Träger + „A=genau-einer"-Constraint ab Tag 1; nur `work_item` zugelassen, Tabelle aber polymorph. |
| Polymorphe FK ohne referenzielle Integrität | MITTEL | Trigger/Whitelist-Guard (PROJ-9-Muster) + `target_type`-CHECK. |
| Zwei Wahrheiten für „welche Rollen gibt es" | MITTEL | Genau **eine** Quelle: Code-Werteliste; keine parallele Katalog-Tabelle. |
| Sichtbarkeits-Doppelung mit PROJ-99 | NIEDRIG | 97 markiert nur „extern"; Gating strikt PROJ-99. |
| Doppelte Historisierung | NIEDRIG | Nur PROJ-10-Audit, keine eigenen Zeitspalten. |

### Locked design decisions (für /frontend + /backend)

1. **Split 97a (Rollen & Zuordnung, jetzt) + 97b (RACI, eigenständig)** — eine Spec, zwei Slices.
2. **Fachrollen = Code-Werteliste** (PROJ-6) + Träger `stakeholders.role_key`; **keine neue Rollen-Tabelle**; RBAC strikt getrennt (Invariante #4).
3. **RACI = polymorphe `raci_assignments`**, Träger=Fachrolle, „A=genau-einer" als DB-Constraint, heute nur `work_item`; `deliverable` → PROJ-104.
4. **Person→Rolle via PROJ-57-Linking + PROJ-10-Audit** (keine eigenen Gültigkeitsspalten).
5. **„extern" nur markieren** (origin); Clearance-Gating → PROJ-99.
6. **Rollenlisten-Vorbefüllung → PROJ-96** (Fork 5).
