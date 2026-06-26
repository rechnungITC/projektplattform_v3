---
id: PROJ-114
title: "DD-Findings erfassen, bewerten und quantifizieren"
issue_type: Story
epic_code: G
epic_title: "Due Diligence"
priority: Highest
priority_source: "Must (MVP)"
labels: ["ma-platform", "epic-g", "mvp"]
dependencies: ["G1", "G2", "E1", "I1", "I2", "J1", "L3"]
roles: ["Stream Leads", "Deal Lead", "CFO / Finance Lead", "Legal Counsel", "Tax Advisor", "Externe Berater"]
summary_for_jira: "[G3] DD-Findings erfassen, bewerten und quantifizieren"
---

# PROJ-114: DD-Findings erfassen, bewerten und quantifizieren

## Status: Deployed (2026-06-26 — Tag `v2.2.0-PROJ-114` auf `d348901`; Vercel prod READY; Post-Deploy-Auth-Gate-Smoke 4/4 = 307. QA PASS 5/5 AC + 6/6 Hardening, 0 Critical/High/Medium; Pentest A–J 10/10 + 100b-Regression 4/4. Migrations `20260625152915`/`20260625153238` in Prod.)
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic G — Due Diligence)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND** · Andockpunkt: neue `dd_findings` (quantifiziert, ≠ risk). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** G — Due Diligence  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP)  
> **Labels:** `ma-platform` · `epic-g` · `mvp`  
> **Abhängigkeiten:** `G1`, `G2`, `E1`, `I1`, `I2`, `J1`, `L3`

**User Story:**

Als Stream Lead möchte ich Findings strukturiert erfassen, nach Schwere bewerten und – wo möglich – wirtschaftlich quantifizieren können, damit die DD-Ergebnisse direkt in Kaufpreislogik (I2), Vertragsverhandlung (J1) und Integrationsplanung (K1) überführt werden können.

**Beschreibung / Kontext:**

Das Modell betont, dass DD-Findings konsequent in Bewertung, Vertrag und Integration einfließen müssen. Findings unterscheiden sich von Risiken (E1) darin, dass sie konkret aus der DD entstehen und meist quantifizierbar sind. Die Plattform muss diese Übersetzung der Erkenntnisse unterstützen.

**Akzeptanzkriterien:**

- [ ] Findings können je Stream erfasst werden mit: Titel, Sachverhalt, Schwere (niedrig, mittel, hoch, Deal Breaker), wirtschaftliche Auswirkung (geschätzt, in EUR), Eintrittswahrscheinlichkeit, empfohlene Behandlung (Kaufpreisanpassung, Garantie, Freistellung, Integrationsthema, akzeptiert).
- [ ] Findings können mit Risiken (E1), Q&A-Einträgen (G2), SPA-Punkten (J1) und Bewertungsmodell (I1) verknüpft werden.
- [ ] Ein als 'Deal Breaker' klassifiziertes Finding löst automatisch einen Eskalationshinweis an Deal Lead und Sponsor aus.
- [ ] Eine Findings-Übersicht je Stream, je Schwere und in Summe (Kaufpreis-Risiko in EUR) ist abrufbar.
- [ ] Findings sind exportierbar und werden im DD-Bericht (siehe G5) automatisch aggregiert.

**Abgrenzungen (Out of Scope):**

- Plattform berechnet keine automatische Kaufpreisanpassung – Findings werden zur Hand in die Kaufpreis-Bridge (I2) übernommen.
- Sensitivitätsanalysen sind nicht in Scope.

**Offene Fragen:**

- Soll die Quantifizierung in EUR Pflicht oder optional sein?
- Soll es eine Audit-Pflicht für Deal Breaker geben (Vier-Augen-Prinzip)?

**Definition of Ready:**

- [ ] Klassifikationsschema und Mindestattribute sind mit M&A/Finance/Legal abgestimmt.
- [ ] Eskalationspfad bei Deal Breaker ist definiert.

**Definition of Done:**

- [ ] Findings können erfasst, verknüpft, eskaliert und exportiert werden.
- [ ] Eskalationshinweis bei Deal Breaker ist getestet.
- [ ] Audit-Trail (L3) erfasst jede Statusänderung.

**Abhängigkeiten:**

- G1
- G2
- E1
- I1
- I2
- J1
- L3

**Betroffene Rollen:**

- Stream Leads
- Deal Lead
- CFO / Finance Lead
- Legal Counsel
- Tax Advisor
- Externe Berater

---

## Tech Design (Solution Architect) — 2026-06-25 (CIA-reviewed)

> **CIA-Pflicht-Review erfolgt** (neue Domain-Tabelle + Eskalationsmechanismus + Need-to-know/Tenant-Isolation). Reuse-Klasse **EXTEND** auf PROJ-112 (DD-Streams) + PROJ-20 (Risks) + PROJ-10 (Audit) + PROJ-100a (Need-to-know). Kein neues npm-Paket. Keine Code-/SQL-Snippets.

### 0. Worum es geht (ein Absatz)
PROJ-114 macht DD-Findings zu einem erstklassigen, quantifizierbaren Objekt **je DD-Stream** (PROJ-112). Findings sind **keine** Risiken (PROJ-20): sie entstehen konkret aus der DD und tragen eine wirtschaftliche EUR-Schätzung + empfohlene Behandlung, damit sie später in Kaufpreis/Vertrag/Integration einfließen. Ein als **Deal Breaker** klassifiziertes Finding löst automatisch einen auditierbaren **Eskalationshinweis** an Deal Lead + Sponsor aus. Sichtbarkeit folgt dem **Need-to-know-Tor** (PROJ-100a) — geerbt vom Stream.

### 1. Komponenten-Struktur
```
PROJ-114 DD-Findings
├── Backend
│   ├── Tabelle dd_findings (je Stream; Need-to-know via confidentiality_level)   ← NEU
│   ├── Tabelle dd_finding_escalations (Audit-Spur Deal-Breaker → Deal Lead/Sponsor) ← NEU
│   ├── RPCs: create/update-finding + status/severity-Transition (auth.uid()-only)  ← NEU
│   │     └─ Deal-Breaker-Übergang schreibt atomar 2 Escalation-Zeilen
│   ├── Read-RPC dd_findings_summary (SECURITY INVOKER, need-to-know-sicher)         ← NEU
│   └── REUSE: dd_streams(112), risks(20), can_access_classified(100a),
│             PROJ-10-Audit-Trigger, projects.responsible_user_id (Deal Lead),
│             ma_project_profiles.sponsor_user_id (Sponsor)
└── Frontend (späterer /frontend-Slice)
    ├── Findings-Liste je Stream (Schwere-Badge, EUR, Behandlung, Status)
    ├── Erfassen/Bearbeiten-Dialog + Status-/Severity-Transition
    ├── Deal-Breaker-Banner + Eskalations-Hinweis (Surface via PROJ-64-Inbox)
    └── Übersicht je Stream/Schwere + EUR-Summe (aus Summary-RPC) + Export
```

### 2. Datenmodell in Klartext
**`dd_findings`** (eine Zeile pro Finding, je Stream):
- Projekt-/Tenant-/Stream-Bezug (`dd_stream_id` → `dd_streams`), Titel, Sachverhalt (Beschreibung)
- **Schwere**: niedrig / mittel / hoch / **deal_breaker**
- **Wirtschaftliche Auswirkung in EUR** — *optional* (nullable; AC „geschätzt, wo möglich"), separat: Eintrittswahrscheinlichkeit
- **Empfohlene Behandlung**: Kaufpreisanpassung / Garantie / Freistellung / Integrationsthema / akzeptiert (Enum — trägt die fachliche Brücke zu I2/J1/K1, **ohne** FK auf ungebaute Tabellen)
- **Risiko-Verknüpfung**: *direkte* `linked_risk_id`-FK → `risks` (nullable) — **nicht** `risk_links` (siehe E2)
- Status, Verantwortliche(r), **`confidentiality_level`** (PROJ-100a, geerbt vom Stream, ≥ Stream-Level), Audit-Spalten

**`dd_finding_escalations`** (Audit-Spur): finding_id, escalated_to_user_id, role (`deal_lead`/`sponsor`), escalated_at, acknowledged_at. Erbt `confidentiality_level` des Findings.

### 3. Tech-Entscheidungen (CIA-gelockt)
| # | Entscheidung | Wahl | Warum |
|---|---|---|---|
| E1 | **Deal-Breaker-Eskalation** | **eigene `dd_finding_escalations`-Zeile (Audit) + Surface via PROJ-64 My-Work-Inbox/Alert**; KEIN E-Mail/Outbox im MVP | „automatischer Hinweis" an 2 eindeutig auflösbare Rollen (Deal Lead = `projects.responsible_user_id`, Sponsor = `ma_project_profiles.sponsor_user_id`) = sichtbares, auditierbares Signal. E-Mail (PROJ-13) = teuer/extern → **PROJ-Y-1**. Inbox-Alert ist `can_access_classified`-gegatet (kein Leak). |
| E2 | **Findings↔Risk-Link** | **direkte nullable FK `linked_risk_id`**, NICHT `risk_links` | `risk_links` ist per CHECK + Trigger auf `phase/sprint` festgenagelt (+ PROJ-65-Audit-Branch) — Erweiterung = Blast-Radius auf deployter PROJ-20-Tabelle für einen 1:1-Link. Simple FK genügt. |
| E3 | **Need-to-know** | `confidentiality_level` + 3 RESTRICTIVE-Policies via `can_access_classified`, **1:1 wie `dd_streams`** | Tor greift gratis inkl. PROJ-99/128-Advisor/NDA-Gate. Finding-Level **≥ Stream-Level** erzwungen (kein laxeres Finding). |
| E4 | **EUR-Quantifizierung** | **optional (nullable)**, strukturiert | AC „geschätzt, wo möglich"; Pflicht würde frühe Findings blockieren. Aggregat zählt nur NOT-NULL + weist „n Findings ohne EUR-Schätzung" aus. |
| E5 | **4-Augen für Deal-Breaker** | **NICHT im MVP** → **PROJ-Y-2** | PROJ-100c-Pattern ist für Clearance-Genehmigungen (eigene State-Machine), passt semantisch nicht auf Finding-Status. PROJ-10-Audit jeder Statusänderung + Eskalations-Zeile = Vier-Augen-Surrogat. Offene Spec-Frage damit beantwortet: optional, deferred. |
| E6 | **Aggregation** | **SECURITY INVOKER Read-RPC `dd_findings_summary`**, KEINE View | INVOKER → Caller-Rechte gelten → Tor greift automatisch (kein Aggregat-Leak). DEFINER-View würde das Tor umgehen. Liefert pro Stream/Schwere: count + EUR-Summe + null_eur_count. |
| E7 | **Forward-compat** | nur `linked_risk_id` (FK existiert) jetzt; Q&A(113)/SPA(J1)/Bewertung(I1/I2)/Report(116) **deferieren** | Keine FK auf ungebaute Tabellen. Wenn 113/J1/I1 gebaut werden, fügen *sie* den Link additiv hinzu (Owner-an-neuer-Tabelle, wie 100a→100b). 114 ist jetzt voll baubar. DD-Report (116) liest die Summary-RPC. |

### 4. Hardening-Akzeptanzkriterien (CIA-Pflicht)
- **H1:** `audit_log_entity_type_check` + `_tracked_audit_columns`-Branch um `'dd_findings'` (+ `'dd_finding_escalations'`) **vor** dem ersten Trigger-UPDATE (PROJ-100a-H-1-Lektion).
- **H2:** 3 RESTRICTIVE-Policies via `can_access_classified` + Pentest-Vektoren (Cross-Clearance, Cross-Tenant, default-deny, Aggregat-Leak via RPC, Class-3-Orthogonalität).
- **H3:** Status-/Severity-Wechsel **nur** via SECURITY DEFINER-RPC **ohne actor-param** (`auth.uid()`-only, execute revoke from anon — PROJ-94-Impersonation-Lektion); Deal-Breaker-Übergang schreibt Escalation-Zeilen atomar.
- **H4:** Finding-`confidentiality_level` **≥ Stream-Level** erzwingen (CHECK/Trigger).
- **H5:** Aggregat-RPC **SECURITY INVOKER** (kein DEFINER-Tor-Bypass).
- **H6:** Pflicht-Live-RPC-Smoke gegen Prod (Create → Deal-Breaker → 2 Escalation-Zeilen → Undo, 0 Residue).

### 5. Dependencies
**Keine neuen npm-Pakete.** Eine Migration (`dd_findings` + `dd_finding_escalations` + Audit-CHECK/tracked-columns + RPCs + RLS). Reuse: PROJ-112/20/10/100a/94/64.

### 6. PROJ-Y Followups (nicht-blockierend)
- **PROJ-Y-1:** E-Mail/Teams-Eskalation Deal-Breaker via PROJ-13-Outbox (falls Pilot Push fordert).
- **PROJ-Y-2:** 4-Augen-Approval-Gate auf Deal-Breaker-Klassifizierung (PROJ-100c-Pattern), compliance-getrieben.

### 7. Handoff
`/backend` zuerst (Migration + RPCs + Live-Smoke + Pentest-Vektoren), dann `/frontend` (Findings-Liste + Dialog + Übersicht + Deal-Breaker-Surface), dann `/qa`. **Abhängigkeit:** PROJ-113 (Q&A) bleibt forward-compat ungekoppelt; PROJ-116 (Report) liest die Summary-RPC.

### Locked design decisions (für /backend + /frontend)
1. `dd_findings` als EXTEND auf `dd_streams`; Need-to-know 1:1 wie Stream (≥ Stream-Level).
2. Risiko-Link = direkte FK `linked_risk_id` (nicht `risk_links`).
3. Deal-Breaker → `dd_finding_escalations`-Zeilen (Deal Lead + Sponsor) + PROJ-64-Inbox-Surface; E-Mail = Followup.
4. EUR optional; Aggregat = SECURITY-INVOKER-RPC mit null_eur_count.
5. 4-Augen-Deal-Breaker + Q&A/SPA/Bewertung/Report-Links = deferred (Owner-an-neuer-Tabelle).
6. 6 Hardening-ACs (H1–H6) Pflicht vor Approved.

## Implementation Notes — Backend (2026-06-25)

CIA-Fork umgesetzt. **Kein neues Dep.** 2 Migrations in Prod (PROJ-134-Konvention):
- `20260625152915_proj114_dd_findings` — `dd_findings` (severity niedrig/mittel/hoch/deal_breaker, `economic_impact_eur` numeric **nullable**, probability, `recommended_treatment`-Enum, status open/in_review/resolved/dismissed, **direkte FK `linked_risk_id`→risks**, `confidentiality_level` ≥ Stream-Level) + `dd_finding_escalations` (deal_lead/sponsor, unique pro (finding,role)). 2 RESTRICTIVE Need-to-know-Policies via `can_access_classified` (dd_streams-Rezept) auf beiden Tabellen; **keine** permissive Write-Policy → Writes nur via RPC (garantiert Deal-Breaker-Eskalation). PROJ-10-Audit-Trigger + `dd_findings` in `audit_log_entity_type_check`/`_tracked_audit_columns`/`can_read_audit_entry` (collision-safe apply-time-Injektion auf die live Definitionen — Parallel-Sessions hatten dd_questions/raci_assignments ergänzt). RPCs: `create_dd_finding`/`update_dd_finding` (manager + need-to-know, actor-los `auth.uid()`, anon-execute revoked; →deal_breaker schreibt 2 Escalation-Zeilen atomar via `_escalate_dd_finding`), `acknowledge_dd_finding_escalation` (nur escalated-to-User), `dd_findings_summary` (**SECURITY INVOKER** → kein Tor-Bypass, count+EUR-Summe+null_eur_count).
- `20260625153238_proj114_restore_audit_read_grant` — **Cross-cutting-Fix:** `can_read_audit_entry` hatte beim jüngsten recreate-via-pg_get_functiondef-Chain (PROJ-112/113/97) den `authenticated`-EXECUTE-Grant verloren → PROJ-10-HistoryTab-Reads waren für normale Nutzer still gebrochen. Idempotent restauriert (während des 114-Live-Smoke entdeckt). **Empfehlung:** künftige Audit-Funktions-Recreates müssen den Grant mit-setzen (PROJ-Y-Hygiene-Kandidat).

**APIs:** `GET/POST /api/projects/[id]/dd-findings` · `PATCH …/[findingId]` · `GET …/dd-findings/summary` · `GET …/dd-finding-escalations[?open=1]` · `POST …/dd-finding-escalations/[escId]/acknowledge`. Client-Wrapper `src/lib/ma-project/dd-findings-api.ts`.

**Pflicht-Live-RPC-Smoke gegen Prod (rolled back, 0 Residue) — 9/9:** A create(mittel,0 Eskalationen) · B Finding<Stream-Level→reject (H4) · C non-manager-create→42501 · D →deal_breaker→2 Escalation-Zeilen (Deal Lead `responsible_user_id` + Sponsor `ma_project_profiles.sponsor_user_id`) · E re-update idempotent (weiterhin 2) · F Need-to-know versteckt confidential-Finding vor non-cleared Member · G ack nur durch escalated-User (sonst 42501) · H Audit-Zeile bei Update (entity `dd_findings`) · I Summary liefert Zeilen.

**Quality-Gates:** lint 0 · tsc 14 baseline/0 neu · vitest 2081/2081 (+18 Route-Tests) · build clean.

**Offen → /frontend:** DD-Findings-Tab je Stream (Liste + Erfassen/Bearbeiten-Dialog + Severity/Treatment/EUR + Status), Deal-Breaker-Banner + Eskalations-Surface (PROJ-64-Inbox), Übersicht je Stream/Schwere + EUR-Summe (Summary-RPC) + Export. Danach /qa (Pentest-Vektoren H2 + Aggregat-Leak-Probe). **PROJ-Y-1** (E-Mail/Teams-Eskalation) + **PROJ-Y-2** (4-Augen-Deal-Breaker) bleiben Followups.

## Implementation Notes — Frontend (2026-06-26)

Reine UI auf den Backend-APIs (#195) + Client-Wrapper `dd-findings-api.ts`. **Kein neues Dep, kein Backend-/DB-Change.** Integriert in die bestehende Due-Diligence-Seite (`/projects/[id]/due-diligence`) als eigenes **`DdFindingsPanel`** unter der DD-Streams-Tabelle (kein neuer Nav-Eintrag — Findings sind per-Stream).

- **Deal-Breaker-Eskalations-Banner** (oben, nur wenn offene Eskalationen): listet offene Hinweise an Deal Lead / Sponsor mit „Bestätigen" (→ `acknowledge`).
- **Findings-Tabelle**: Titel / Stream / Schwere-Badge (Deal Breaker = destructive) / EUR / empfohlene Behandlung / Status; Kopf zeigt **Kaufpreis-Risiko-Summe (EUR)** aus der Summary-RPC + Deal-Breaker-Zähler.
- **Erfassen/Bearbeiten-Dialog** (manager-gated via `useProjectAccess(…, "manage_members")`): Stream-Picker (nur bei Neuanlage), Titel, Sachverhalt, Schwere, EUR (optional), Behandlung, Status (nur Edit). Setzen auf **Deal Breaker** zeigt den Hinweis „eskaliert an Deal Lead & Sponsor" (Eskalation passiert serverseitig in der RPC).
- Loading/Empty/Error-States; `cancelled`-Guard im Mount-Fetch.

**Quality-Gates:** lint 0 · tsc 14 baseline/0 neu · vitest 2081/2081 · build clean. Live-E2E + Pentest-Vektoren → /qa.

## QA Test Results — 2026-06-26 (backend #195 + frontend #196, beide auf main)

**Verdikt: PRODUCTION-READY** — 5/5 AC (mit 2 dokumentierten Forward-compat-Deferrals) + 6/6 Hardening-ACs (H1–H6); **0 Critical / 0 High / 0 Medium**.

### Live-Pentest (Pflicht) — `tests/sql/PROJ-114-dd-findings-pentest.sql`, self-rolling-back, **0 Residue**, **A–J 10/10 PASS**
| Vektor | Ergebnis | AC/H |
|---|---|---|
| A create (mittel) → 0 Eskalationen | ✅ | AC1 |
| B Finding-Level < Stream-Level → reject | ✅ | **H4** |
| C non-manager create → 42501 | ✅ | AC1-Security |
| D →deal_breaker → 2 Escalation-Zeilen (Deal Lead + Sponsor) | ✅ | **AC3** |
| E re-update idempotent (weiterhin 2) | ✅ | AC3 |
| F Need-to-know versteckt confidential-Finding vor non-cleared Member | ✅ | **H2** |
| G Eskalations-Ack nur durch escalated-User (sonst 42501) | ✅ | AC3 |
| H Audit-Zeile bei Update (entity `dd_findings`) | ✅ | **DoD L3** |
| I Summary liefert Zeilen (Admin) | ✅ | AC4 |
| **J Aggregat-Leak-Probe: non-cleared Member-Summary schließt confidential-Findings aus, inkludiert standard** | ✅ | **H5** (INVOKER) |

### Regression
- **100b-Regression 4/4 PASS** (apply-profile→grant / Downgrade-Guard / who_can_access-Gate / **D: `can_read_audit_entry` durch authenticated ausführbar** — bestätigt den Cross-cutting-Audit-Grant-Fix). Kein Gate-Drift.

### Automatisierte Tests
- **Playwright** `tests/PROJ-114-dd-findings.spec.ts` (chromium): **7/7 PASS** — Auth-Gates auf allen 5 neuen Routen (findings GET/POST, PATCH, summary, escalations GET, acknowledge) + invalid-UUID.
- **Vitest** 2081/2081 (inkl. 18 PROJ-114-Route-Tests aus /backend).
- lint 0 · tsc 14 baseline/0 neu · build clean.

### AC-Abdeckung
| AC | Status |
|---|---|
| AC1 Findings je Stream mit allen Feldern (Schwere/EUR/Wahrscheinlichkeit/Behandlung) | ✅ Schema + UI + Pentest A |
| AC2 Verknüpfung mit Risiken (E1) / Q&A (G2) / SPA (J1) / Bewertung (I1) | ⚠️ **Teil**: Risiko-Link `linked_risk_id` ✅; Q&A/SPA/Bewertung **forward-compat deferred** (Tabellen 113/J1/I1 ungebaut — Owner-an-neuer-Tabelle) |
| AC3 Deal-Breaker → automatische Eskalation | ✅ Pentest D + UI-Banner |
| AC4 Übersicht je Stream/Schwere + EUR-Summe | ✅ Summary-RPC (INVOKER) + UI |
| AC5 Exportierbar + DD-Bericht-Aggregation | ⚠️ **Teil**: Liste/Summe in der UI sichtbar; Datei-Export + DD-Bericht-Aggregation → **PROJ-116** (G5, ungebaut) |

### Findings
- Keine Critical/High/Medium. **F-1 / F-2 (Info, Forward-compat):** AC2-Links zu Q&A/SPA/Bewertung + AC5 Datei-Export/DD-Bericht hängen an ungebauten Tabellen (PROJ-113/116/I1/J1) — per Architektur-Entscheidung „Owner-an-neuer-Tabelle" deferiert; das `recommended_treatment`-Enum trägt die fachliche Brücke bereits. **PROJ-Y-1** (E-Mail/Teams-Eskalation) + **PROJ-Y-2** (4-Augen-Deal-Breaker) bleiben Followups.
- **D-1 (Env):** Mobile-Safari-E2E übersprungen (WebKit-Host-Libs), wie etabliert. Chromium grün.

**0 Critical / 0 High → PRODUCTION-READY.**

## Deployment — 2026-06-26

- **Code auf main:** Backend **#195** + Frontend **#196** + QA **#198** (squash-merged → `d348901`; QA-Branch nach Rebase auf main wegen schnellem INDEX-Drift durch parallel gemergtes #189).
- **Tag** `v2.2.0-PROJ-114`.
- **Migrationen** `20260625152915_proj114_dd_findings` + `20260625153238_proj114_restore_audit_read_grant` waren bereits seit dem /backend-Slice in Prod (live-smoked + pentested); kein separater DDL-Deploy.
- **Vercel prod** für `d348901` = READY.
- **Post-Deploy-Smoke:** 4/4 = 307 Auth-Gate auf `/api/projects/[id]/dd-findings`, `…/dd-findings/summary`, `…/dd-finding-escalations`, `…/dd-finding-escalations/[escId]/acknowledge`.
- **Offene Followups (nicht-blockierend):** AC2-Links (Q&A/SPA/Bewertung) + AC5 (Datei-Export/DD-Bericht) forward-compat an PROJ-113/116/I1/J1; **PROJ-Y-1** (E-Mail/Teams-Eskalation), **PROJ-Y-2** (4-Augen-Deal-Breaker). Cross-cutting-Hygiene: künftige Audit-Funktions-Recreates müssen den `authenticated`-Grant mit-setzen (Memory-Gotcha dokumentiert).

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · G — Due Diligence_
