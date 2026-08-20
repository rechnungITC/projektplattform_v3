---
id: PROJ-98
title: "Gremien und Steuerungskreise abbilden"
issue_type: Story
epic_code: B
epic_title: "Rollen, Gremien & Governance"
priority: Medium
priority_source: "Should (für SteerCo-fähigen Betrieb wichtig)"
labels: ["ma-platform", "epic-b", "should-have"]
dependencies: ["A1", "B1", "F1", "F2", "H1"]
roles: ["Deal Lead", "PMO-Lead", "Executive Sponsor", "Steering-Committee-Mitglieder"]
summary_for_jira: "[B2] Gremien und Steuerungskreise abbilden"
---

# PROJ-98: Gremien und Steuerungskreise abbilden

## Status: Deployed (2026-07-03 — tag v2.8.0-PROJ-98)
## Deployment Scope: mvp

> **Scope-Klassifikation (PROJ-Y-145b, Tranche 3, 2026-08-20):** **AC2 „teilweise"** — `decision_scope`/`escalation_scope` nur als Freitext, strukturierter Stage-Gate-/Eskalations-Link deferiert; AC3/AC4/AC5-Termine ebenfalls zurückgestellt (Zielkennungen in der Spec, siehe Registerhinweis zur ID-Kollision). PROJ-117 hat die Termin-Hälfte seither geliefert.

**Deployed 2026-07-03:** Code live auf main via #216 (backend) + #221 (frontend) + #223 (QA); Migration `20260702120000_proj98_committees` seit /backend in Prod. Vercel-Prod-Deploy von `c09e164` (#223) **READY** (dpl_47x7i4uXovUYD6tarBSq59LrH38A, target=production). Kein neues Dep, keine separate Runtime-Migration im Closure. Post-Deploy-Smoke: 307-Auth-Gates auf `/projects/[id]/gremien` + `/api/projects/[id]/committees`. Tag `v2.8.0-PROJ-98`. Forward-compat-Followups offen: PROJ-Y-1 (Stage-Gate-Link/110), PROJ-Y-2 (Meeting-Link+nächste-Termine/117), PROJ-Y-3 (Template-Prefill/96), PROJ-Y-4 (strukturierter Eskalations-Link/111).

**Architected (CIA-reviewed 2026-07-01 — GO mit ADJUST):** EXTEND auf PROJ-112-Backbone-Rezept; `committees` + `committee_members` (stakeholder-zentriert, Invariante #4); Need-to-know via PROJ-100a-Tor (kein eigenes ACL); forward-compat-Defer für Stage-Gate/Meeting/Template-Links (110/117/96); 6 Hardening-ACs H1–H6. Kein neues Dep.

**Backend gebaut 2026-07-02:** Migration `20260702120000_proj98_committees` in Prod — 2 Tabellen: `committees` (Name/Zweck/Frequenz + `decision_scope` + nullable `value_threshold_eur`/Währung + `escalation_scope` + `confidentiality_level`; permissive Projekt-Policies + **3 RESTRICTIVE `can_access_classified`-Gates** + moddatetime + `record_audit_changes`-Trigger) und `committee_members` (`stakeholder_id NOT NULL` → User-Link erbt via `stakeholders.linked_user_id`; `role_in_committee` chair/member/observer + `is_voting`; Sichtbarkeit erbt via EXISTS auf committees, Vertraulichkeit transitiv; Audit-Trigger). **Audit-CHECK + `_tracked_audit_columns` + `can_read_audit_entry` für BEIDE Tabellen in derselben Migration** (verbatim vom Live-Stand + 2 Branches; PROJ-114-H-1-Lektion). 6 impersonation-sichere SECURITY-DEFINER-RPCs (`create/update/delete_committee`, `add/update/remove_committee_member`; kein actor-Param, `auth.uid()` intern, `revoke anon`; H5 stakeholder↔project/tenant-Konsistenz in `add_committee_member`). 4 API-Routen (collection GET/POST, item PATCH/DELETE, members POST, member PATCH/DELETE) + Client-Wrapper `committees-api.ts`.

**Quality-Gates:** route.test 6/6; eslint 0; tsc 14 baseline/0 neu; build clean (4 neue Routen). Supabase-Advisors: 0 ERROR, 0 rls_disabled (nur die erwarteten SECURITY-DEFINER-executable-Hinweise wie bei allen RPCs).

**H6 Pflicht-Live-RPC-Smoke** gegen Prod (`tests/sql/PROJ-98-committees-pentest.sql`, self-rolling-back, **0 Residue**): **A–J 10/10 PASS** — create (standard+strict) · add-member · **H5 cross-project-reject (23514)** · **H2 need-to-know** (non-cleared Member sieht standard NICHT strict) · **H4** non-manager-create-block (42501) · anon-execute-revoked · **H1** cross-tenant-0-committees · **H3** Audit-Zeilen für beide Tabellen · remove-member.

**Frontend gebaut 2026-07-02:** Projektraum-Sektion „Gremien" (`MA_GREMIEN_SECTION`, `tabPath: gremien`, `requiresProjectType: 'ma'`, nach Rollen&RACI injiziert) + Route `(app)/projects/[id]/gremien/page.tsx` + `committees-page.tsx`: Gremien-Liste als Cards (Name + Vertraulichkeits-Badge + Frequenz + Zweck + Entscheidungskompetenz/Wert-Schwelle + Eskalationen + Besetzungs-Tabelle); Anlegen/Bearbeiten-Dialog + Löschen (manager-gated via `useProjectAccess('manage_members')`); **Besetzungs-Sheet** (Mitglieder mit Inline-Rolle/Stimmrecht-Edit + Entfernen; „Mitglied hinzufügen" via Stakeholder-Picker desselben Projekts, ausblenden bereits verknüpfter, Rolle chair/member/observer + Stimmrecht-Switch); Lade-/Leer-/Fehler-States; Reuse `committees-api`, `listStakeholders`, `MA_CONFIDENTIALITY_LEVEL_LABELS`, shadcn Card/Dialog/Sheet/Table/Badge/Select/Switch. Kein neues Dep, kein Backend-Change. **Gates:** eslint 0, tsc 14 baseline/0 neu, build clean (Route `/projects/[id]/gremien`). Cross-Session-Hinweis: in Worktree `projektplattform_v3-proj98` gebaut (Primär-Checkout durch PROJ-102-Session belegt); `method-templates/index.ts` nur additiv erweitert (`MA_GREMIEN_SECTION` + `Users`-Icon).

**QA PASS 2026-07-02 (0 Critical/0 High → PRODUCTION-READY):**

- **Funktionale ACs:** AC1 (Gremien anlegbar: Name/Zweck/Frequenz/Mitglieder/Entscheidungskompetenz) ✅. **AC2** teilweise — `decision_scope`/`escalation_scope` als Freitext live; strukturierter Stage-Gate-/Eskalations-Link **forward-compat deferred** (PROJ-110/111 ungebaut → PROJ-Y-1/PROJ-Y-4). **AC3** (Meeting-Protokoll-Verknüpfung) deferred → PROJ-Y-2 (PROJ-117 ungebaut). **AC4** (Standard-Gremien aus Template) deferred → PROJ-Y-3 (PROJ-96 ungebaut). **AC5** Gremienübersicht: Besetzung ✅; „nächste Termine" deferred → PROJ-Y-2. DoD „Berechtigungen je Gremium technisch wirksam" ✅ (PROJ-100a-Tor). Alle Deferrals waren im Tech-Design gelockt (forward-compat), keine neuen Funde.
- **6 Hardening-ACs (H1–H6) alle ✅** via Live-Pentest + Code-Review.
- **Live-Pentest** `tests/sql/PROJ-98-committees-pentest.sql` (self-rolling-back, **0 Residue**, gegen aktuellen Prod re-verifiziert): **A–J 10/10 PASS** — create std+strict · add-member · **H5 cross-project-reject (23514)** · **H2 need-to-know** (non-cleared Member sieht standard NICHT strict) · **H4 non-manager-block (42501)** · anon-execute-revoked · **H1 cross-tenant 0 committees** · **H3 Audit-Zeilen für beide Tabellen** · remove.
- **Playwright** `tests/PROJ-98-committees.spec.ts` 8/8 chromium: Auth-Gates auf allen 4 Route-Flächen (committees collection GET/POST · item PATCH/DELETE · members POST · member PATCH/DELETE) + Gremien-Seite. Route-Unit 6/6.
- **Gates:** eslint 0; tsc 14 baseline/0 neu; build clean; Supabase-Advisors 0 ERROR / 0 rls_disabled.
- **D-1 (Env):** Mobile-Safari-Playwright skipped (WebKit-Host-Libs fehlen — bekanntes Env-Issue PROJ-67/F2; chromium deckt ab).

→ `/deploy`.
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic B — Rollen, Gremien & Governance)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND** · Andockpunkt: neue `committees`-Tabelle (M&A-Lücke). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** B — Rollen, Gremien & Governance  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should (für SteerCo-fähigen Betrieb wichtig)  
> **Labels:** `ma-platform` · `epic-b` · `should-have`  
> **Abhängigkeiten:** `A1`, `B1`, `F1`, `F2`, `H1`

**User Story:**

Als PMO-Lead möchte ich Gremien wie Steering Committee, Core Team, Workstream Meetings und Integration Management Office mit Mitgliedern, Terminen und Entscheidungskompetenzen anlegen, damit das Governance-Modell des Deals nachvollziehbar abgebildet ist.

**Beschreibung / Kontext:**

Das Modell sieht eine klare Gremienlogik vor (Executive Sponsor, SteerCo, Deal Core Team, Workstreams, IMO). Diese Gremien tagen in unterschiedlichen Frequenzen, treffen unterschiedliche Entscheidungen und sind unterschiedlich besetzt.

**Akzeptanzkriterien:**

- [ ] Gremien sind je Projekt anlegbar mit Name, Zweck, Frequenz, Mitgliedern und Entscheidungskompetenz.
- [ ] Pro Gremium ist erkennbar, welche Stage-Gates (F1) es entscheidet und welche Eskalationen es bearbeitet.
- [ ] Termine eines Gremiums sind mit Meeting-Protokollen (H1) verknüpfbar.
- [ ] Standard-Gremien sind aus dem Template (A3) vorbelegt.
- [ ] Eine Gremienübersicht zeigt aktuelle Besetzung und nächste Termine.

**Abgrenzungen (Out of Scope):**

- Kalenderintegration ist Erweiterung (siehe Open Questions), nicht zwingend MVP.
- Gesellschaftsrechtliche Vorgaben (Aufsichtsrat etc.) werden nicht durch die Plattform geprüft.

**Offene Fragen:**

- Sollen Gremientermine mit Outlook/Google Kalender synchronisiert werden?
- Sollen Entscheidungskompetenzen als Schwellenwerte abgebildet werden (z. B. 'SteerCo bis 50 Mio. EUR Kaufpreis')?
- Wie wird Vertraulichkeit zwischen Gremien gesteuert (z. B. AR sieht keine operativen DD-Details)?

**Definition of Ready:**

- [ ] Gremienstruktur ist mit Geschäftsführung abgestimmt.
- [ ] Entscheidungskompetenzen sind definiert.

**Definition of Done:**

- [ ] Gremien sind anlegbar, befüllbar und mit Stage-Gates und Meetings verknüpfbar.
- [ ] Übersicht ist verfügbar.
- [ ] Berechtigungen je Gremium sind technisch wirksam.

**Abhängigkeiten:**

- A1 – Projektanlage
- B1 – Rollen
- F1, F2 – Stage-Gates, Entscheidungslog
- H1 – Meetings

**Betroffene Rollen:**

- Deal Lead
- PMO-Lead
- Executive Sponsor
- Steering-Committee-Mitglieder

## Tech Design (Solution Architect) — 2026-07-01 (CIA-reviewed)

> **CIA-Pflicht-Review erfolgt (GO mit ADJUST).** Reuse-Klasse **EXTEND** — neue `committees`/`committee_members` auf dem live-bewährten PROJ-112-Backbone-Rezept (per-Projekt-Extension + `confidentiality_level` + RESTRICTIVE-Policies + Audit-Verdrahtung). **Kein neues npm-Paket, keine neue Rechteengine.** Andockpunkte alle deployt (PROJ-8/57/97/100a/10); Links zu ungebauten Specs (110/117/96) forward-compat aufgeschoben.

### 0. Worum es geht (ein Absatz)
PROJ-98 bildet die **Governance-Gremien** eines M&A-Deals ab (Executive Sponsor, Steering Committee, Deal Core Team, Workstream-Meetings, IMO): je Projekt anlegbare Gremien mit Zweck, Tagungsfrequenz, Besetzung und Entscheidungskompetenz, plus eine Gremienübersicht mit Besetzung. Vertraulichkeit je Gremium (z. B. „AR sieht keine operativen Details") läuft über das **bestehende Need-to-know-Tor** (PROJ-100a) — kein neues Rechtemodell.

### 1. Komponenten-Struktur
```
PROJ-98 Gremien & Steuerungskreise
├── Backend
│   ├── Tabelle committees (je Projekt)                                    ← NEU
│   │     Name, Zweck, Frequenz, Entscheidungskompetenz (+ optionale
│   │     Wert-Schwelle), Eskalations-Scope, confidentiality_level
│   ├── Tabelle committee_members (stakeholder-zentriert)                  ← NEU
│   │     stakeholder_id + Gremien-Rolle (Vorsitz/Mitglied/Beobachter) +
│   │     stimmberechtigt
│   ├── Mutations-RPCs (create/update committee, add/remove member,        ← NEU
│   │     impersonation-sicher: kein actor-Param, revoke anon)
│   └── REUSE: stakeholders (+linked_user_id, PROJ-8/57), can_access_classified
│              (PROJ-100a), record_audit_changes/_tracked_audit_columns/
│              can_read_audit_entry (PROJ-10), M&A-Rollen (PROJ-97)
└── Frontend
    ├── Projektraum-Sektion „Gremien" (requiresProjectType ma)            ← NEU
    ├── Gremien-Liste + Anlegen/Bearbeiten-Dialog (manager-gated)
    ├── Besetzungs-Sheet (Stakeholder als Mitglied hinzufügen, Rolle/Stimme)
    └── Übersicht: aktuelle Besetzung je Gremium (nächste Termine → H1-defer)
```

### 2. Datenmodell in Klartext
**`committees`** (je Projekt, tenant-scoped): Name (Pflicht), Zweck, Frequenz (Freitext-MVP, z. B. „wöchentlich/ad hoc"), **Entscheidungskompetenz** als Freitext `decision_scope` + optionale **Wert-Schwelle** (`value_threshold_eur` + Währung, für „SteerCo bis 50 Mio."), Eskalations-Scope (Freitext-MVP), `confidentiality_level` (standard/vertraulich/streng — PROJ-100a-Enum, default standard), Sortierung, Audit-Felder.

**`committee_members`** (je Gremium): Verweis auf **Stakeholder** (Pflicht — der kanonische Personen-Anker; ein Platform-User-Bezug erbt optional über `stakeholders.linked_user_id`, damit externe SteerCo-/AR-Mitglieder ohne Login abbildbar bleiben → „Stakeholder ≠ User", Invariante #4), Gremien-Rolle (Vorsitz/Mitglied/Beobachter), stimmberechtigt (ja/nein). Eindeutig je (Gremium, Stakeholder). Sichtbarkeit erbt über das Gremium.

**Vertraulichkeit:** Die `confidentiality_level` gated die **Sichtbarkeit der Gremien-Zeile** über `can_access_classified()` (3 RESTRICTIVE-Policies, dd_streams-Rezept 1:1). Sie ist **orthogonal** zur Objekt-Vertraulichkeit von DD-Streams/Findings — „AR sieht keine DD-Details" ist bereits durch deren eigene `confidentiality_level` gelöst; PROJ-98 baut **kein** Gremien-getriebenes Durchgriffs-ACL.

### 3. Tech-Entscheidungen (CIA-gelockt)
| # | Entscheidung | Wahl | Warum |
|---|---|---|---|
| E1 | **Mitglieder-Modell** | **stakeholder-zentriert** (`committee_members.stakeholder_id NOT NULL`; User-Link erbt via `stakeholders.linked_user_id`) | Ein kanonischer Personen-Anker (Invariante #4 / PROJ-8/57). Polymorphe user/stakeholder-Referenz dupliziert den Anker → Inkonsistenz-Risiko → abgelehnt. Externe (Sponsor/AR) = Stakeholder ohne User-Link. |
| E2 | **Vertraulichkeit je Gremium** | **PROJ-100a-Tor** (`confidentiality_level` + `can_access_classified()`-RESTRICTIVE-Policies) | Wiederverwendung der einen deployten Rechteengine. Eigenes Gremien-ACL = zweites, driftbares Rechtemodell → NO-GO. |
| E3 | **Entscheidungskompetenz** | **Hybrid**: `decision_scope` (Freitext) + nullable `value_threshold_eur` + Währung | Macht die „bis X Mio."-Frage abfragbar ohne Rule-Engine. Schwellen-*Enforcement* bleibt PROJ-110-Gate-Logik. |
| E4 | **Stage-Gate-Link (F1/110)** | **forward-compat defer** → spätere M:N-Join-Tabelle `committee_stage_gates` | Gate-Tabelle ungebaut; jetzt nur dokumentierter Kontrakt (analog PROJ-112 `phase_id` nullable / PROJ-116 D1). |
| E5 | **Meeting-Link (H1/117)** | **forward-compat defer** → spätere Verknüpfung | Meetings ungebaut; Übersicht zeigt „nächste Termine" erst nach 117. |
| E6 | **Template-Prefill (A3/96)** | **defer** (reines additives Seed-Verhalten, keine Schema-Kopplung) | Standard-Gremien-Seed dockt an, sobald PROJ-96 deployt. |
| E7 | **Eskalations-Zuordnung (AC2)** | **`escalation_scope` Freitext-MVP** | Strukturierter Link → PROJ-111 Decision-Log. |

### 4. Hardening-Akzeptanzkriterien (CIA-Pflicht)
- **H1 Tenant-Isolation:** Cross-Tenant-Read/Write auf `committees`/`committee_members` blockiert (Live-SQL-Pentest analog `PROJ-114-dd-findings-pentest.sql`).
- **H2 Need-to-know:** `streng`-Gremium für non-cleared Member unsichtbar; default-deny; Class-3-Orthogonalität grün.
- **H3 Audit-entity_type (PROJ-114-H-1-Lektion):** `committees` + `committee_members` in **derselben Migration** in `audit_log_entity_type_check` **UND** `_tracked_audit_columns` **UND** `can_read_audit_entry`-Zweig ergänzen; per Live-Grant-Smoke verifizieren (sonst brechen Audit-Inserts still).
- **H4 Impersonation-sichere RPCs (PROJ-94-Lektion):** Mutationen via SECURITY-DEFINER-RPC ohne `actor`-Param, `auth.uid()` intern, `revoke execute from anon`.
- **H5 Stakeholder-Tenant-Konsistenz:** `stakeholder_id` muss demselben Projekt/Tenant gehören (kein Cross-Project-Stakeholder im Gremium).
- **H6 Pflicht-Live-RPC-Smoke** gegen Prod (0 Residue) vor „Approved".

### 5. Dependencies
**Keine neuen npm-Pakete.** 1 Migration (2 Tabellen + Policies + RPCs + Audit-Verdrahtung + CHECK-Erweiterung). Reuse: PROJ-8/57 (Stakeholder + linked_user_id), PROJ-100a (Need-to-know-Tor), PROJ-10 (Audit), PROJ-97 (Rollen).

### 6. PROJ-Y Followups (nicht-blockierend)
- **PROJ-Y-1:** Stage-Gate-Zuordnung (`committee_stage_gates` M:N) — sobald PROJ-110 deployt.
- **PROJ-Y-2:** Meeting-/Protokoll-Verknüpfung + „nächste Termine" in der Übersicht — sobald PROJ-117 deployt.
- **PROJ-Y-3:** Standard-Gremien-Seed aus Projekt-Template — sobald PROJ-96 deployt.
- **PROJ-Y-4:** Kalender-Sync (Outlook/Google) — Spec-Open-Question, out-of-scope MVP.

### 7. Handoff
`/backend` zuerst (2 Tabellen + RESTRICTIVE-Policies + Audit-CHECK-Erweiterung in DERSELBEN Migration + impersonation-sichere RPCs + Live-RPC-Smoke H1–H6), dann `/frontend` (Projektraum-Sektion „Gremien" + Liste/Dialog + Besetzungs-Sheet + Übersicht), dann `/qa` (H1–H3-Pentest im gemischten Need-to-know-/Tenant-Kontext). Abhängigkeiten 110/117/96 bleiben forward-compat ungekoppelt.

### Locked design decisions (für /backend + /frontend)
1. `committees` + `committee_members` (stakeholder-zentriert, Invariante #4) — Backbone-Rezept PROJ-112.
2. Vertraulichkeit = PROJ-100a-Tor auf der Gremien-Zeile; kein eigenes ACL.
3. Entscheidungskompetenz = `decision_scope` Freitext + nullable Wert-Schwelle; Enforcement bleibt PROJ-110.
4. Stage-Gate/Meeting/Template/Eskalation forward-compat deferred (PROJ-Y-1..4).
5. 6 Hardening-ACs (H1–H6) Pflicht vor Approved; Audit-CHECK-Erweiterung + Impersonation-Sicherheit sind die zwei historischen Fallstricke.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · B — Rollen, Gremien & Governance_
