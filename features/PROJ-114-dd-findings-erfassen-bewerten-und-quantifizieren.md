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

## Status: Architected (CIA-reviewed 2026-06-25 — EXTEND auf PROJ-112/20/10/100a; dd_findings + dd_finding_escalations, Need-to-know geerbt vom Stream, Deal-Breaker→Escalation-Zeilen+PROJ-64-Inbox, Risk-Link via direkter FK, Aggregat via SECURITY-INVOKER-RPC, 6 Hardening-ACs. Forward-compat zu 113/116/I1/J1. Kein neues Dep. → /backend)
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

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · G — Due Diligence_
