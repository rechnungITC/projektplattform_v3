# PROJ-34: Stakeholder Communication Tracking

## Status: In Progress (34-α/β/γ.1/γ.2/δ/ζ live on main; ε open)
**Created:** 2026-05-06
**Last Updated:** 2026-05-13

## Summary

Stakeholder-Kommunikation als strukturierte Projektdaten erfassen: Interaktions-Historie, Sentiment, Kooperationssignale, Response-Verhalten, Coaching-Kontext. Schließt die Lücke, die PROJ-33 und PROJ-35 explizit offen gelassen haben — Stakeholder-Risiko nutzt heute nur qualitative Profil-Daten (Big5, Skills, Power/Influence), kann aber nicht aus tatsächlichem Kommunikationsverhalten lernen.

Scope-Disziplin:
- **In-Scope:** manuelle Erfassung von Interaktionen + Signale, AI-Vorschläge für Sentiment/Cooperation, Response-Latenz-Tracking, Coaching-Empfehlungen mit Quellenzitierung, optionales Risk-Score-Feed an PROJ-35.
- **Out-of-Scope (eigene PROJs):** automatische E-Mail-Inbox-Ingestion (→ PROJ-44 Context Ingestion), realer Teams-Adapter (→ PROJ-49), autonomes Versenden von Nachrichten (→ PROJ-39 Assistant Action Packs).

## Dependencies

- **Requires:** PROJ-8 Stakeholder-Core (Stakeholder-Tabelle + Detail-Surface)
- **Requires:** PROJ-13 Communication Center (Outbound-Mail/Chat als Sendekanal)
- **Requires:** PROJ-12 KI Assistance (AI-Router + Class-3-Hard-Block)
- **Requires:** PROJ-30 Narrative Purpose (Beweis-Pattern für Multi-Purpose-Router; PROJ-34 fügt `sentiment`-Purpose hinzu)
- **Requires:** PROJ-32 Tenant Custom AI Provider Keys (SaaS-konformes Routing)
- **Requires:** PROJ-33 Stakeholder Extension (qualitative Profile als Coaching-Input)
- **Influences:** PROJ-35 Stakeholder-Wechselwirkungs-Engine (echte Kommunikations-Signale ergänzen Big5/Skill-basierten Risiko-Score)
- **Influences:** PROJ-39 Assistant Action Packs (Coaching-Recommendations können später als Assistant-Vorschläge ausgespielt werden)
- **Feeds (later):** PROJ-44 Context Ingestion kann automatisch in `stakeholder_interactions` schreiben statt nur in `context_sources`

## V2 Reference Material

- `docs/decisions/stakeholder-vs-user.md` — Stakeholder ist fachlich, nicht RBAC
- `docs/decisions/stakeholder-data-model.md` — V2-Stakeholder-Model + Kommunikationsfelder
- `docs/decisions/communication-framework.md` — V2-Kommunikations-Channels
- `docs/Stakeholderwissen/` — Domain-Wissen-Pool (Sentiment, Reaktionsverhalten, Coaching-Patterns)

## User Stories

### ST-01 Interaction Log
Als Projektleiter möchte ich Stakeholder-Interaktionen mit Channel, Datum, Beteiligten und Zusammenfassung erfassen, sodass die Kommunikationshistorie nicht in Freitext-Notizen verloren geht.

Akzeptanzkriterien:
- Eine Interaktion ist projekt- und tenant-scoped (RLS via `is_tenant_member(tenant_id)` + `has_project_access(project_id, 'view')`).
- Eine Interaktion kann **1 oder mehrere Stakeholder** referenzieren (`stakeholder_interaction_participants` N:M).
- Channels: `email`, `meeting`, `chat`, `phone`, `other`.
- Direction: `inbound` (Stakeholder → uns), `outbound` (uns → Stakeholder), `bidirectional` (Meeting).
- Pflichtfelder: `channel`, `direction`, `interaction_date`, `summary` (≤ 500 Zeichen), ≥ 1 Stakeholder.
- Raw-Content wird **nicht** persistiert — nur user-redigierter Summary. AI-Verarbeitung nur über den Summary, niemals über externen E-Mail-Body (Class-3-Schutz auf DB-Ebene).
- Edit/Delete nur durch `created_by` oder Project-Manager-Rolle (PROJ-4 RBAC).

### ST-02 Sentiment & Cooperation Signals
Als Projektleiter möchte ich Sentiment und Kooperationssignale pro beteiligtem Stakeholder einer Interaktion haben, sodass beginnender Konflikt früh sichtbar wird.

Akzeptanzkriterien:
- `sentiment` ∈ {−2, −1, 0, +1, +2} (`strongly_negative`..`strongly_positive`); nullable wenn nicht erfasst.
- `cooperation_signal` ∈ {−2, −1, 0, +1, +2} (`obstructive`..`collaborative`); nullable.
- Beide Felder leben **pro Participant** auf `stakeholder_interaction_participants`; ein Multi-Stakeholder-Meeting wird nicht auf einen einzelnen Interaktionswert reduziert.
- Beide Felder können **manuell** gesetzt UND als **AI-Proposal** vorgeschlagen werden. Source-Tracking: `manual` | `ai_proposed` | `ai_accepted` | `ai_rejected`.
- AI-Routing geht ausschließlich über den **PROJ-12 Router** mit neuem Purpose `sentiment` und Class-3-Hard-Block: keine Platform-Keys für Class-3; γ.1 nutzt bei extern geblocktem Pfad den lokalen Stub mit neutralen Signalen und `status='external_blocked'`.
- AI-Vorschlag erscheint als Pill am Interaktions-Item; Accept/Reject/Modify-Dialog überschreibt Werte und setzt `_source` korrekt.
- Provider/Model + `confidence` werden gespeichert (Source Traceability per V3-Prinzip 2).

### ST-03 Response Behavior
Als Projektleiter möchte ich Response-Latenz und Missing-Response-Muster sehen, sodass blockierte Stakeholder-Loops sichtbar werden.

Akzeptanzkriterien:
- Eine Interaktion mit `direction='outbound'` kann beim Erstellen als `awaiting_response=true` mit `response_due_date` markiert werden.
- Inbound-Interaktion mit Bezug zur ursprünglichen Outbound-Interaktion (`replies_to_interaction_id`) schließt `awaiting_response` und setzt `response_received_date`.
- "Overdue"-Indikator (lazy-compute: `awaiting_response AND response_due_date < CURRENT_DATE`) erscheint auf Stakeholder-Detail.
- Liste **"Offene Antworten"** auf Stakeholder-Detail + Project-Room-Health-Signal (feeds PROJ-56 als zusätzliches Health-Input).
- Response-Behavior darf **nur nach Review** in PROJ-35 Risk-Score einfließen (`tenant_settings.risk_score_overrides.communication_weight`).

### ST-04 Coaching Context (ε — sharpened 2026-05-13)

**As** the Projektleiter, **I want** AI-vorgeschlagene Coaching-Empfehlungen pro Stakeholder, **so dass** ich für outreach / tonality / escalation / celebration konkrete, belegbare Handlungsoptionen vorgeschlagen bekomme — ohne dass die KI hinter meinem Rücken Daten verändert.

**Empfehlungs-Quellen** (locked durch User-Antwort 2026-05-13):

| # | Quelle | Felder | Bemerkung |
|---|---|---|---|
| Q1 | **Stakeholder-Profil** (PROJ-33) | Big5 (5 Dim), Skill-Profile, `reasoning`, `attitude`, `management_level`, `decision_authority`, `communication_need`, `preferred_channel` | Statisch, Class-3 (personal data) |
| Q2 | **Interaktions-Historie** | letzte **10 Interaktionen ODER letzte 30 Tage** (kleinerer der beiden), Felder: `summary`, `channel`, `direction`, `interaction_date`, per-participant `participant_sentiment`, `participant_cooperation_signal` | Class-3, da Summary verhaltensbasiert |
| Q3 | **PROJ-35 Risk-Score + Eskalations-Indikatoren** | aktueller `risk_score`, aktives Eskalations-Pattern (1..4), `critical_path`-Flag | Read-only |
| Q4 | **PROJ-35 Big5-Tonalitäts-Lookup** (32 Kombinationen) | Ergebnis als String-Hint (z.B. *"sachlich, datengetrieben"*) | **Read-only Eingabe** in den Coaching-Prompt — kein Auto-Promotion zur Recommendation |
| Q5 | **Response-Verhalten** (PROJ-34-δ) | offene Antworten (count), Average Response Latency, Overdue-Flag | Verhaltensbasiert |

**Recommendation-Output:**

- `recommendation_kind` ∈ `outreach` / `tonality` / `escalation` / `celebration` (≤ 4 Kinds).
- AI emittiert **0..n Recommendations pro Call** über alle 4 Kinds (kann auch 0 sein wenn keine Empfehlung sinnvoll); maximal **1 pro Kind pro Call** (insgesamt 0..4 pro Trigger).
- `recommendation_text` ≤ 1000 Zeichen.
- `cited_interaction_ids[]` (welche der Q2-Interaktionen wurden zitiert) + `cited_profile_fields[]` (welche der Q1-Profile-Schlüssel wurden zitiert).
- AI-only generiert (PROJ-12 Purpose `coaching`); `review_state` ∈ `draft|accepted|rejected|modified`.
- Tonality-Lookup-Hint (Q4) wird im `prompt_context_meta.tonality_hint` auditiert, **nicht** als separater Recommendation-Output gemappt.

**Trigger-Modell (Pull):**

- Manueller Button **"✦ Coaching-Empfehlungen anfragen"** in der Empfehlungen-Section am Stakeholder-Tab.
- **Kein** Auto-Trigger nach Interaktion, **kein** Nightly-Cron, **kein** Risk-Threshold-Trigger (alle bewusst out-of-scope für MVP — siehe Out-of-Scope-Liste unten).
- Wiederholbar; jeder Trigger ist ein eigener `ki_runs`-Eintrag.

**Lifecycle / DSGVO (CIA-L6 confirmed):**

- DSGVO-Hard-Delete eines Stakeholders **cascade-löscht** seine Coaching-Recommendations via FK.
- Audit-Replacement-Marker `audit.kind='redacted_with_stakeholder'` dokumentiert nur den Redaktions-Akt — der redaktierte Inhalt erscheint nicht im Audit-Log (Art. 17 DSGVO).
- Soft-Delete einer Recommendation (z.B. user-rejected) bleibt soft (keine FK-Kaskade).
Als Projektleiter möchte ich Kommunikationsempfehlungen basierend auf Stakeholder-Profil und jüngsten Interaktionen, sodass Ansprache zielgerichteter wird.

Akzeptanzkriterien:
- Coaching-Recommendation hat: `recommendation_kind` (`outreach`, `tonality`, `escalation`, `celebration`), `recommendation_text` (≤ 1000 Zeichen).
- Jede Recommendation muss **Quellen zitieren**: `cited_interaction_ids[]` + `cited_profile_fields[]` (z.B. `['big5_neuroticism', 'skill_negotiation']`).
- AI-only generiert (PROJ-12 Purpose `coaching`); `review_state` ∈ `draft|accepted|rejected|modified`.
- Recommendations sind **rein advisory** — keine automatische Auslösung von Outbound-Kommunikation.
- Bei DSGVO-Redaktion eines Stakeholders (PROJ-10/17): Recommendations werden mit redacted, da sie personenbezogen sind.
- Assistant Action Packs (PROJ-39) können später `review_state='accepted'`-Recommendations lesen, dürfen aber nichts ausführen.

## Acceptance Criteria (per Slice)

| AC | Slice | Inhalt |
|---|---|---|
| AC-1 | α | `stakeholder_interactions` + `stakeholder_interaction_participants` Tabellen mit RLS (tenant + project access) |
| AC-2 | α | `POST/GET/PATCH/DELETE /api/projects/[id]/stakeholders/[sid]/interactions` |
| AC-3 | α | Stakeholder-Detail-Tab "Kommunikation" mit Inline-Add-Form + List-View |
| AC-4 | α | Multi-Stakeholder-Interaktion: 1 Meeting kann ≥ 1 Stakeholder zugeordnet werden |
| AC-5 | β | Manuelle Sentiment-/Cooperation-Slider **pro Stakeholder-Participant** im Edit-Form (CIA-L3) persistieren mit `source='manual'` |
| AC-6 | β | Pill-Anzeige der Werte in List-Item, eine Pill pro Participant (Farbschema: rot=−2, gelb=0, grün=+2) |
| AC-7 | γ.1 | Neuer PROJ-12 Purpose `sentiment` (Class-3-fixed, Tenant-Provider-Pflicht) + bestehender Tenant-AI-Cost-Cap; separater `sentiment`-Topf bleibt L7-Follow-up |
| AC-8 | γ.2 | AI-Vorschlag-Pill am Interaktion-Item; Accept/Reject/Modify-Dialog setzt `_source` korrekt; Per-Participant-Vektor statt Skalar |
| AC-9 | γ.1 | Class-3-Block ohne Platform-Key-Fallback; Router markiert `external_blocked`, γ.2 zeigt daraus die lesbare UI-Meldung |
| AC-10 | δ | `awaiting_response` + `response_due_date` + `replies_to_interaction_id` Spalten + Logik |
| AC-11 | δ | "Offene Antworten"-Section auf Stakeholder + Overdue-Badge |
| AC-12 | δ | Project-Health-Signal (PROJ-56-Integration) zählt Overdue als yellow/red |
| AC-13 | ε | `stakeholder_coaching_recommendations` Tabelle + RLS + API (Pflicht-Spalten: `recommendation_kind`, `recommendation_text`, `cited_interaction_ids[]`, `cited_profile_fields[]`, `review_state`, `provider`, `model`, `tonality_hint`) |
| AC-14 | ε | AI-Generation per manuellem Trigger; aggregiert Q1..Q5 Quellen; AI emittiert 0..n Recommendations (≤ 1 pro Kind pro Call); `review_state` lifecycle `draft → accepted/rejected/modified` |
| AC-15 | ε | DSGVO-Redaktion: Cascade-Delete per FK + Audit-Marker `redacted_with_stakeholder` (kein Inhalt im Audit) |
| AC-16 | ε | UI reuse: AIReviewShell aus γ.2 zeigt 1 Card pro Recommendation mit Kind-Badge + zitierten Interaktionen + zitierten Profile-Feldern + Accept/Reject/Modify |
| AC-17 | ε | PROJ-35 Tonality-Lookup (32 Kombinationen) ist Read-only-Eingabe in den Coaching-Prompt; das Lookup-Ergebnis wird in `prompt_context_meta.tonality_hint` auditiert, niemals direkt zur Recommendation promoted |
| AC-16 | ζ | `tenant_settings.risk_score_overrides.communication_weight` (0..1, default 0) |
| AC-17 | ζ | PROJ-35 `compute_stakeholder_risk_score` liest optional Avg-Sentiment + Cooperation-Signal + Overdue-Count |

## Edge Cases

- **Stakeholder gelöscht (FK CASCADE)** — `stakeholder_interaction_participants` Cascade greift; wenn das die letzte Beteiligung der Interaktion war, bleibt die Interaktion bestehen aber ohne Participant → UI muss `(keine Stakeholder zugeordnet)` rendern.
- **Multi-Tenant-Cross-Project** — eine Interaktion darf nie Stakeholder aus einem anderen Projekt referenzieren (Trigger: `enforce_interaction_stakeholder_same_project`).
- **AI-Provider down während Sentiment-Routing** — Interaktion wird trotzdem gespeichert; Sentiment bleibt `null` + UI-Toast "AI-Vorschlag fehlgeschlagen, Werte können manuell gesetzt werden".
- **Class-3-Hard-Block** — Tenant hat keine eigenen AI-Keys → kein externer Provider, lokaler neutraler Stub-Fallback für γ.1, Edit-Form bleibt manuell bis γ.2 Review-UI. Kein Fallback auf Platform-Keys.
- **Coaching-Recommendation zitiert gelöschte Interaktion** — `cited_interaction_ids[]` filtert ID raus, UI zeigt `(Quelle nicht mehr verfügbar)` Hinweis.
- **Self-Interaction (Stakeholder kommuniziert mit sich selbst über uns)** — nicht erlaubt, Trigger blockt `direction=bidirectional` bei nur 1 Stakeholder.
- **Replies-to-Chain länger als 1** — `replies_to_interaction_id` ist nicht-rekursiv für MVP; Thread-View deferred.

## Out of Scope

- ❌ **Automatische E-Mail-Inbox-Ingestion** → PROJ-44 Context Ingestion (write-path).
- ❌ **Echter Teams/Slack-Adapter** für inbound → PROJ-49 / PROJ-14b.
- ❌ **Autonomes Versenden** von AI-Coaching-Empfehlungen → PROJ-39 Assistant Action Packs.
- ❌ **Auto-Trigger** für Coaching-Generierung (Nightly-Cron, Risk-Threshold, Post-Interaction-Hook) — alle drei bewusst out-of-scope für ε MVP. Trigger ist ausschließlich Pull (manueller Button am Stakeholder-Tab). Auto-Trigger erst bei expliziter Nachforderung evaluieren (separate Slice).
- ❌ **Coaching-Mehrfach-Output je Kind** pro Call (z.B. 2 outreach-Empfehlungen gleichzeitig) — AI ist auf ≤ 1 Recommendation pro Kind pro Call beschränkt. Mehrere Iterationen ⇒ User triggert erneut.
- ❌ **Direkte UI-Promotion des Tonality-Lookup-Ergebnisses** als eigene Recommendation (siehe AC-17 — Lookup ist Prompt-Input, kein Output-Pfad).
- ❌ **Vollautomatische Akzeptanz von AI-Signalen** — Sentiment-/Cooperation-Werte bleiben Proposal- bzw. Review-gesteuert; kein Auto-Write ohne User-Entscheidung.
- ❌ **Thread-View / Conversation-Reconstruction** — `replies_to_interaction_id` reicht für 1-Hop, kein Voll-Thread.
- ❌ **Voice-Recordings / Transcripts** — PROJ-37/41 Assistant Speech.
- ❌ **Materialized Sentiment-Aggregates** — alles compute-on-read solange < 500 Interactions/Stakeholder.

## Technical Requirements

- Jede neue Tabelle MUSS `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE` haben.
- RLS-Policies MÜSSEN über `is_tenant_member(tenant_id)` + `has_project_access(project_id, 'view'|'manage')` gehen — keine direkten `auth.uid()`-Vergleiche.
- AI-derived Felder MÜSSEN `_source` (`manual|ai_*`), `_model`, `_provider`, `confidence` tracken (V3-Prinzip 2: AI as proposal layer).
- AI-Calls MÜSSEN über `invokeSentimentGeneration` / `invokeCoachingGeneration` gehen — kein direkter Provider-Call aus der API-Route. Hard-Block für Class-3 ohne Platform-Key-Fallback; lokaler Stub ist nur neutraler Review-Queue-Fallback.
- DSGVO-Export (PROJ-10/17): Interactions + Recommendations sind redaction-eligible.
- Audit-Log: `_tracked_audit_columns`-Whitelist umfasst `sentiment`, `cooperation_signal`, `awaiting_response`, `response_due_date`, `review_state` (PROJ-10-Hook).
- Schema-Drift-Guard (PROJ-42): Slice-Migration muss vor Frontend-`.from(...).select(...)` deployed werden.

## Empfohlene interne Phasierung (nicht-bindend für /architecture)

| Slice | Inhalt | Migration | UI | Aufwand |
|---|---|---|---|---|
| **34-α** | ✅ Implemented 2026-05-12 — Interaction-Log (ST-01): Tabellen + RLS + API CRUD + Stakeholder-Detail Tab. Tabellen inkl. `deleted_at`-Soft-Delete + Field-Level-Audit-Trigger (CIA-L2) | 2 Tables (`stakeholder_interactions`, `stakeholder_interaction_participants` mit Per-Participant-Signal-Spalten per CIA-L3) + 1 Trigger (same-project) | "Kommunikation"-Tab + Inline-Add-Form + List | ~2 PT |
| **34-β** | Manual Signals (ST-02 Teil 1): Sentiment/Cooperation als Slider **pro Participant** | 0 (Spalten in α) | Slider im Edit-Form pro Participant + Pill am List-Item | ~0.5 PT |
| **34-γ.1** | ✅ Deployed 2026-05-13 — AI-Sentiment Backend: PROJ-12-Router `sentiment`-Purpose + Class-3-Lock + Per-Participant-Output-Vektor. γ.1 nutzt den bestehenden Tenant-AI-Cost-Cap; separater Purpose-Cap bleibt deferred. | 0 (Spalten in α) + Router-Erweiterung | — | ~1.5 PT |
| **34-γ.2** | AI-Sentiment UI: AI-Vorschlag-Pill + Review-Queue + Accept/Reject/Modify-Dialog | 0 | AI-Vorschlag-Pill + Modal | ~1 PT |
| **34-δ** | Response-Behavior (ST-03): awaiting_response + Overdue **lazy-on-read via Generated Column** (CIA-L5) + Project-Health-Feed | 0 (Spalten in α) | "Offene Antworten"-Section + Overdue-Badge + PROJ-56-Hook | ~1 PT |
| **34-ε** | Coaching Context (ST-04): Recommendations-Tabelle + AI-Generation + Review + Citing + DSGVO-Hard-Delete-Cascade (CIA-L6) | 1 Table (`stakeholder_coaching_recommendations`) | "Empfehlungen"-Section + Annotated Citations | ~2 PT |
| **34-ζ** | PROJ-35 Feed: Communication-Signals optional in `compute_stakeholder_risk_score`. Default `communication_weight=0` (Opt-in per CIA-L4) | 0 (`tenant_settings.risk_score_overrides`-Patch) | Toggle in Risk-Score-Tenant-Config | ~1 PT |

**Total: ~9.5 PT** (vs. 9 PT pre-CIA — +0.5 PT für γ-Split + Per-Participant-Sentiment, −0.5 PT für Lazy-Overdue ohne Cron).

## Aufwandsschätzung

- **Backend** (3 Migrations + 4 API-Surfaces + PROJ-12-Router-Erweiterung + RLS + Audit-Hook + Per-Participant-Aggregation-View): ~4 PT
- **Frontend** (Stakeholder-Detail-Tab + Add/Edit-Form mit Per-Participant-Slidern + AI-Vorschlag-Workflow + Coaching-Section + Health-Signal-Card): ~4 PT
- **AI/Integration** (PROJ-12 `sentiment` + `coaching` Purposes Class-3-fixed, bestehender PROJ-32d-Cost-Cap; separater `sentiment`-Topf deferred): ~1 PT
- **QA** (Unit-Tests pro Slice, Class-3-Red-Team-Suite analog PROJ-30, Edge-Cases-Coverage inkl. 2-koop/2-obstr-Meeting, Playwright-Smoke): ~1 PT
- **Total:** ~9.5 PT (CIA-bestätigt).

## Architecture Decisions LOCKED (CIA-Review 2026-05-12)

Die ursprünglich offenen Architektur-Forks wurden vom Continuous Improvement Agent beantwortet. Folgende Punkte sind ab jetzt **gelockt** und gehen so in `/backend`:

- **L1 — Class-3-fixed AI-Routing für Sentiment + Coaching.**
  Alle User-Summaries werden ausnahmslos als Class-3 klassifiziert (personenbezogene Verhaltensbewertung). Tenant-Provider-Pflicht ohne Class-2-Bypass. Tenants ohne eigene Provider-Keys (PROJ-32) sehen kein AI-Sentiment.
- **L2 — Field-Level-Audit + Soft-Delete (`deleted_at`) auf Interactions.**
  Trigger `record_audit_changes` via PROJ-10-Pattern; Audit-Whitelist umfasst `summary`, `sentiment`, `cooperation_signal`, `awaiting_response`, `response_due_date`, `review_state`. Soft-Delete für reguläre Lifecycle-Löschungen. DSGVO-Redaktion bleibt Hard-Delete (siehe L6).
- **L3 — Per-Participant-Sentiment statt 1-Wert-pro-Interaktion.**
  `stakeholder_interaction_participants` trägt `participant_sentiment` + `participant_cooperation_signal` + `participant_signal_source`. Aggregierter Wert auf Interaction-Ebene als View/Computed (Median für MVP-Default — Aggregations-Formel-Wahl ist UX-Frage, gehört zum Frontend-Mockup).
  Verhindert systematische Verwässerung des PROJ-35-Risk-Scores bei Multi-Stakeholder-Meetings (Edge-Case 2 koop / 2 obstr).
- **L4 — `communication_weight` opt-in mit Default 0.**
  PROJ-35-Integration aktiviert sich erst durch expliziten Tenant-Admin-Toggle. Bestehende Risk-Scores bleiben nach Deploy unverändert.
- **L5 — Overdue-Detection lazy-on-read via Generated Column / View-Expression.**
  Kein 4. Vercel-Cron, kein zusätzliches `CRON_SECRET`. Last-Größenordnung (≤100 offene Requests / Tenant) macht Cron unnötig.
- **L6 — DSGVO-Class-3-Redaktion: Hard-Delete-Cascade.**
  FK `ON DELETE CASCADE` von Interactions + Coaching-Recommendations auf Stakeholder. Zusätzlicher Audit-Replacement-Marker dokumentiert den Redaktions-Akt selbst, nicht den redaktierten Inhalt (DSGVO Art. 17 konform).
- **L7 — Separater PROJ-32d Cost-Cap-Topf `sentiment` mit Default 500 Calls/Monat/Tenant.**
  Eigener Cap statt geteilter Topf mit `narrative`/`risk`; verhindert Cross-Purpose-Budget-Erosion. Tenant-Admin kann anpassen.
  **Implementation note 2026-05-13:** γ.1 verwendet vorerst den bestehenden `tenant_ai_cost_caps`-Topf, weil ein purpose-scoped Schema-Change den Backend-Router-Slice deutlich vergrößert hätte. Der separate `sentiment`-Topf bleibt als eigenes Follow-up offen.
- **L8 — 7 Slices statt 6: γ wird in γ.1 (Backend-Router + DB) und γ.2 (UI-Review-Queue) gesplittet.**
  Erlaubt feature-flag-gated Backend-Erprobung vor UI-Exposure. Neue Slice-Tabelle und PT-Schätzung oben aktualisiert (~9.5 PT).

## Tech Design (Solution Architect)

> PM-Sicht: Was wird gebaut, wo lebt es im Produkt, welche Datenflüsse, welche Tech-Wahl warum. Keine SQL/TS-Snippets.

### A) Komponenten-Struktur

```
Project-Room
└── Stakeholder-Detail-Page  (existing: src/app/(app)/projects/[id]/stakeholder/page.tsx)
    ├── Profile-Tab           (existing — PROJ-33)
    ├── Risk-Tab              (existing — PROJ-35)
    └── Kommunikations-Tab    (NEW — PROJ-34)
        ├── Add-Interaction-Form
        │   ├── Channel-Select (email/meeting/chat/phone/other)
        │   ├── Direction-Select (inbound/outbound/bidirectional)
        │   ├── Date-Picker
        │   ├── Stakeholder-Multi-Select  (existing combobox-Pattern aus PROJ-33)
        │   ├── Summary-Textarea (≤500 Zeichen)
        │   └── Awaiting-Response-Toggle + Due-Date-Picker
        ├── Interaction-List
        │   └── Interaction-Item
        │       ├── Header (date, channel, direction, ggf. Overdue-Badge)
        │       ├── Summary
        │       ├── Per-Participant-Pills (Sentiment + Cooperation pro Stakeholder)
        │       ├── AI-Vorschlag-Pill (wenn AI-Vorschlag pending — γ.2)
        │       └── Edit/Delete-Menu
        ├── Offene-Antworten-Section  (δ)
        │   └── Outbound-Liste sortiert nach Due-Date, Overdue rot
        └── Empfehlungen-Section  (ε — Coaching)
            └── Recommendation-Card
                ├── Kind-Badge (outreach/tonality/escalation/celebration)
                ├── Text + zitierte Interaktionen + zitierte Profil-Felder
                └── Review-Buttons (Accept / Reject / Modify)

Tenant-Settings  (existing: src/app/(app)/settings/tenant/risk-score)
└── Risk-Score-Config-Page
    └── NEW Toggle "Kommunikations-Signale einbeziehen" (ζ)
```

### B) Daten-Modell (Plain Language)

**Interaktion** (eine Kommunikation mit einem oder mehreren Stakeholdern):
- Wo, wann, wie (Channel, Direction, Datum)
- Eine Zusammenfassung in den Worten des Projektleiters (kein Roh-Inhalt extern!)
- Wartet auf Antwort? Bis wann? Antwort kam wann?
- Wer hat es erfasst (für RBAC-Edit-Rechte)
- Wann gelöscht? (Soft-Delete für Recovery)

**Teilnahme** (Bridge zwischen Interaktion und Stakeholder):
- Welche Interaktion + welcher Stakeholder
- **Sentiment pro Teilnehmer** (−2 bis +2) — kommt von Mensch oder von AI
- **Kooperations-Signal pro Teilnehmer** (−2 bis +2)
- Provenance: Quelle (manual/AI-vorgeschlagen/AI-akzeptiert/AI-abgelehnt), Provider, Modell, Konfidenz

**Coaching-Empfehlung** (von AI vorgeschlagen, vom Mensch reviewed):
- Welcher Stakeholder, welche Art Empfehlung
- Empfehlungs-Text (≤1000 Zeichen)
- Welche Interaktionen wurden als Quellen zitiert
- Welche Profil-Felder (Big5, Skills) wurden als Quellen zitiert
- Review-State: Entwurf / Akzeptiert / Abgelehnt / Modifiziert
- Provenance: Provider, Modell

**Tenant-Konfig-Patch** (kein neues Modell, nur Erweiterung):
- `tenant_settings.risk_score_overrides.communication_weight` — Zahl 0..1, Default 0

**Wo lebt es:** PostgreSQL via Supabase, RLS-geschützt nach Tenant + Project-Membership. Audit-Trail über bestehenden PROJ-10-Mechanismus.

### C) Tech-Entscheidungen (warum diese Wahl, kein Code)

| Entscheidung | Warum |
|---|---|
| **Eigene Tabellen statt JSONB auf `stakeholders`** | Interaktionen sind N:M zu Stakeholdern (1 Meeting → mehrere Stakeholder), JSONB skaliert nicht für Listen-Queries, Audit-Trail und RLS-Pflege wird komplex. |
| **Per-Participant-Sentiment-Spalten auf der Bridge-Tabelle** | Verhindert Verwässerung im PROJ-35-Risk-Score; korrekte Modellierung der Realität (in einem Meeting können sich Stakeholder unterschiedlich verhalten). |
| **Existierender PROJ-12-Router statt Direct-Anthropic-Call** | Class-3-Hard-Block kommt für lau mit; Provider-Switch über Tenant-Keys (PROJ-32) ist eingebaut; Cost-Cap-Pattern bereits da (PROJ-32d). |
| **Soft-Delete für reguläre Löschung + Hard-Delete-Cascade nur für DSGVO** | DSGVO Art. 17 ist nicht-verhandelbar; reguläre Löschung muss reversibel sein (Bedienfehler-Recovery). |
| **Lazy-on-Read für Overdue statt Cron** | Last ist klein, Cron-Slot bei Vercel begrenzt, weniger bewegliche Teile = weniger Bugs. |
| **shadcn/ui Komponenten** (Card, Tabs, Slider, Dialog, Combobox) — alle existieren | Keine Custom-UI-Primitives, keine neuen Dependencies. |

### D) Dependencies (Pakete)

Keine neuen npm-Pakete. Alle benötigten UI-Primitives (shadcn Slider, Dialog, Tabs, Combobox) und Backend-Pattern (PROJ-12-Router, PROJ-10-Audit, PROJ-32d-Cost-Cap) sind bereits deployed.

### E) Schnittstellen-Übersicht (API-Surface)

- Liste der Interaktionen eines Stakeholders im Projekt
- Erstelle / Update / Soft-Delete einer Interaktion
- Triggere AI-Sentiment-Vorschlag für eine Interaktion (Class-3-checked)
- Akzeptiere / Reject / Modifiziere AI-Vorschlag
- Liste der Coaching-Empfehlungen eines Stakeholders
- Triggere AI-Coaching-Generierung
- Akzeptiere / Reject Coaching-Empfehlung
- Tenant-Setting `communication_weight` lesen / setzen (PROJ-35-Integration-Hook)

Alle Routes folgen dem existierenden Pattern `src/app/api/projects/[id]/stakeholders/[sid]/...`.

### F-ε) Datenfluss bei AI-Coaching-Empfehlung (ε)

1. Projektleiter öffnet Stakeholder-Detail-Tab "Kommunikation" → Empfehlungen-Section.
2. Klick auf "✦ Coaching-Empfehlungen anfragen" → Server-Action.
3. Server aggregiert die 5 Quellen aus ST-04:
   - Q1: Profile via Supabase JOIN auf `stakeholders` + zugehörige Big5/Skill-Tabellen.
   - Q2: Letzte 10 Interaktionen ODER letzte 30 Tage (LIMIT, ORDER BY date DESC).
   - Q3: PROJ-35 `risk_score` + Eskalations-Pattern + Critical-Path-Flag via existierender RPC.
   - Q4: PROJ-35 Tonality-Lookup-RPC → `tonality_hint` String (z.B. "sachlich, datengetrieben").
   - Q5: PROJ-34-δ Response-Stats (awaiting count, avg latency, overdue flag).
4. PROJ-12-Router mit Purpose `coaching`, Class-3 (CIA-L1 hard-fixed via `classifyCoachingAutoContext`).
5. Router prüft Tenant-Provider-Keys (PROJ-32). Wenn kein zulässiger Provider → lokaler neutraler Stub-Fallback (0 Recommendations, `ki_runs.status='external_blocked'`).
6. AI-Provider liefert 0..n Recommendations (max. 1 pro Kind). Jede mit `recommendation_text`, `cited_interaction_ids[]`, `cited_profile_fields[]`.
7. Server persistiert N Rows in `stakeholder_coaching_recommendations` mit `review_state='draft'`, `provider`, `model`, `tonality_hint` aus Q4.
8. Frontend re-fetcht → AIReviewShell aus γ.2 rendert 1 Card pro Recommendation; UI zeigt Kind-Badge + Text + Citations.
9. PL klickt Accept/Reject/Modify → existierender γ.2-Batch-Pattern (eigene Route für Coaching analog `ai-review`).

### F) Datenfluss bei AI-Sentiment-Vorschlag (γ.1 + γ.2)

1. Projektleiter erfasst eine Interaktion (Summary, Stakeholder).
2. Server-Action triggert PROJ-12-Router mit Purpose `sentiment`, Class-3.
3. Router prüft Tenant-Provider-Keys (PROJ-32). Wenn kein zulässiger externer/tenant-lokaler Provider verfügbar ist → lokaler neutraler Stub-Fallback, `ki_runs.status='external_blocked'`, keine Platform-Key-Nutzung.
4. Wenn ein zulässiger Provider vorhanden ist → Sentiment-Vektor pro Teilnehmer wird angefragt.
5. Antwort landet in der Bridge-Tabelle als `_source='ai_proposed'`.
6. Frontend rendert AI-Pill am Item, Projektleiter klickt Accept/Reject/Modify.
7. State wechselt auf `ai_accepted` / `ai_rejected` / `manual` (bei Modify).
8. Wenn Tenant `communication_weight > 0` und akzeptiert → PROJ-35-Risk-Score-Recompute via existierende RPC.

### G) Verbleibende OFs für Frontend-Mockup (nicht Architecture-blocking)

- **OF-1** Aggregationsformel für Per-Participant-Werte auf Interaction-Ebene: Mean / Median / Mode. → Wird im UI-Mockup bei `/frontend` entschieden.
- **OF-2** Overdue-Threshold pro Projekt-Method (Scrum: 3 Tage / Waterfall: 14 Tage)? → Method-Gating-Entscheidung, gehört zum PROJ-26-Pattern.

---

## Beantwortete Open Questions (CIA-Review 2026-05-12)

Diese Themen wurden vor dem Lock-Block adressiert; ursprüngliche Fragen-Formulierung bleibt zur Nachvollziehbarkeit erhalten:

1. **Sentiment-AI-Routing Class-3-Path** — Sentiment-Analyse über User-erstellten Summary: Wann ist der Summary Class-2 (Stakeholder-Name + sachlicher Inhalt) vs Class-3 (personenbezogene Bewertung)? Default-Klassifizierung muss CIA reviewen. Vorschlag: alle Summaries → Class-3 → Tenant-Provider-Pflicht (PROJ-32).
2. **Soft-Delete vs Field-Level-Audit für Interactions** — PROJ-10 hat Field-Level-Audit. Bei häufigen Edits einer Interaktion: pro Edit ein Audit-Row vs Soft-Delete + neue Row? Trade-off: Audit-Tabellengröße vs DSGVO-Export-Komplexität.
3. **Sentiment bei Multi-Stakeholder-Meeting** — MVP-Vorschlag: 1 Wert pro Interaktion. CIA soll prüfen ob das in Edge-Cases (4 Stakeholder, 2 kooperativ, 2 obstruktiv) falsche Signale ergibt für PROJ-35-Risk-Score. Alternativ: per-Participant-Signals (n*m Table-Rows) → Effort +1 PT.
4. **PROJ-35 risk_score input weighting (Default)** — Wenn `communication_weight` neu eingeführt wird: Default 0 (opt-in) vs Default 0.2 (opt-out)? Sicherheits-Default: 0, weil bestehende Tenants nicht plötzlich andere Risk-Scores sehen sollen.
5. **Overdue-Compute Strategy** — lazy-on-read vs nightly-cron-update. CIA-Empfehlung für PROJ-35 war lazy-bis-500. Bei 10 offenen Requests / Projekt eher unproblematisch — Vorschlag: lazy bestätigen.
6. **AI-Coaching DSGVO-Lifecycle** — Coaching-Recommendation zitiert Profile-Felder + Interaktion-IDs. Bei DSGVO-Redaktion eines Stakeholders: Recommendation hart-löschen vs redacted-Marker? Vorschlag: Cascade-Delete via FK + Audit-Row "redacted-with-stakeholder".
7. **Provider-Cost-Cap-Strategie** — Sentiment-AI läuft potentiell auf jeder neuen Interaktion. Bei 50 Interaktionen/Tag/Tenant ist das ~1500 API-Calls/Monat zusätzlich. PROJ-32d Cost-Cap muss `sentiment`-Purpose abdecken; CIA soll Default-Cap empfehlen.

## Success Verification (für /qa)

- **AC-Coverage:** alle 17 ACs als Unit/Integration/E2E gepinnt.
- **Class-3-Red-Team:** 5+ Attacks analog PROJ-30 (Bypass-Versuche über raw_content, Provider-Force, Confidence-Manipulation).
- **DSGVO-Coverage:** Redaktions-Test über Interaktion → Recommendation-Cascade.
- **Performance-Baseline:** Stakeholder-Detail-Tab mit 100 Interaktionen lädt < 1.5 s (TTI).
- **PROJ-42 Schema-Drift:** alle neuen `.from(...).select(...)`-Calls in Tests gegen Shadow-DB grün.

---

_Übergang zu `/architecture` erfolgt 2026-05-12 mit CIA-Review. Die 8 Architecture-Locks oben + Tech Design legen die Grundlage für `/backend`. `/frontend` braucht zusätzlich Mockups für die zwei verbleibenden UX-Fragen (OF-1 Aggregationsformel, OF-2 Method-spezifischer Overdue-Threshold)._

## Implementation Notes — 34-α (2026-05-12)

Erste Slice live: Interaction-Log + Tab-Skelett.

**Migration** `supabase/migrations/20260512170000_proj34_alpha_interactions.sql`
(via Supabase MCP applied):

- Tabelle `stakeholder_interactions` mit Channel-/Direction-/Source-Enums,
  Summary ≤500 Zeichen, 1-Hop-Reply-Chain, Soft-Delete `deleted_at`
  (CIA-L2), Response-Consistency-CHECK (only Outbound darf
  `response_received_date` setzen), Self-Reply-Block.
- Bridge `stakeholder_interaction_participants` mit Per-Participant-Spalten
  `participant_sentiment` / `participant_cooperation_signal` (CIA-L3)
  inklusive Provenance-Spalten (`_source` / `_model` / `_provider` /
  `_confidence`). Spalten sind in α nullable und werden erst in β/γ
  befüllt.
- Same-Project-/Same-Tenant-Trigger blocken Cross-Project-Participants
  und Cross-Project-Replies (`P0003`-Errors mit lesbarem Code).
- RLS: project-member SELECT/INSERT/UPDATE, project-manager + tenant-admin
  DELETE.
- `_tracked_audit_columns` + `audit_log_entity_type_check` extended;
  AFTER-UPDATE-Trigger via `record_audit_changes` für PROJ-10-Audit.
- 4 Indizes auf Interaction-Tabelle (tenant+project, project+date desc
  partial, awaiting partial, replies) + 3 Indizes auf Bridge.

**API (alle hinter `requireProjectAccess(... 'view'|'edit')`)**

- `GET  /api/projects/[id]/stakeholders/[sid]/interactions` — Liste +
  Participants pro Interaktion (zwei Round-Trips: Bridge-IDs, dann
  Interactions+Participants).
- `POST /api/projects/[id]/stakeholders/[sid]/interactions` — Insert
  Interaction + URL-Stakeholder als Initial-Participant; Rollback der
  Interaction-Row, falls Cross-Project-Participants den Trigger triggern.
- `GET  /api/projects/[id]/interactions/[iid]` — Single Read, 404 für
  Soft-Deleted.
- `PATCH /api/projects/[id]/interactions/[iid]` — Partial-Update über
  separates Schema **ohne** Zod-Defaults (sonst leakten
  `awaiting_response=false`, `source='manual'` in jeden PATCH-Body und
  triggerten den Update-Pfad bei leerem Body).
- `DELETE /api/projects/[id]/interactions/[iid]` — Soft-Delete, setzt
  `deleted_at`.

**Frontend**

- `CommunicationTab` als 4. Tab im Stakeholder-Drawer
  (`stakeholder-tab-client.tsx`): Stammdaten / Profil / **Kommunikation** /
  Historie.
- Inline-Add-Form (Channel-Select, Direction-Select, datetime-local,
  Summary-Textarea mit 500-Zeichen-Counter).
- Interaction-Liste mit Badges (Channel, Direction, Multi-Participant-Count,
  Antwort-offen) + Soft-Delete-Confirm-Dialog.
- `loading` aus `interactions === null` derived (vermeidet React-Compiler-
  Warning bei synchronem `setState` im Effect).

**Tests**

- 22 vitest-Cases über beide Route-Dateien:
  - 401 unauthenticated für GET/POST/DELETE
  - 403 unauthorized (kein Project-Membership + kein Tenant-Admin)
  - 400 Validation (invalid Channel, Summary > 500, leerer PATCH-Body)
  - 404 cross-project Stakeholder beim Create
  - 200/201 Happy-Path GET-List, POST-Create
  - 200 PATCH refresh
  - 204 DELETE Soft-Delete
  - 404 soft-deleted Reads

**Schema-Drift-Guard** (PROJ-42): Migration vor PR-Open auf live Supabase
appliziert; alle neuen `.from(...).select(...)`-Calls validieren gegen das
neue Schema.

**Known Deviations vs Tech Design**

- Per-Participant-Editor-UI ist in α nicht aktiviert (Slider folgt in β);
  bridge-Spalten existieren bereits damit β eine Pure-Frontend-Slice wird.
- Aggregations-View für Interaction-Level-Sentiment (OF-1) noch nicht
  modelliert; wird mit β/γ entschieden.
- `replies_to_interaction_id` ist im POST-Body möglich, UI hat dafür aber
  noch keinen Picker — deferred until response-behavior-Slice (δ).

**Next slice:** 34-β — manuelle Sentiment-/Cooperation-Slider pro Participant
am Edit-Form. Reine Frontend-Slice ohne Migration (Spalten existieren bereits).

## Implementation Notes — 34-γ.1 (2026-05-13, PR #17 squash `fb2bf71`)

Backend-only AI-Sentiment-Router-Erweiterung. Keine Migration, keine UI.

**Router (`src/lib/ai/`)**

- `AIPurpose` um `'sentiment'` erweitert (`types.ts`).
- Neue Types `SentimentAutoContext` (mit `participants: { stakeholder_id, label }[]`)
  und `SentimentSignal` (per Participant: `sentiment ∈ [-2,+2]`, `cooperation_signal ∈ [-2,+2]`, `confidence ∈ [0,1]`).
- `classifySentimentAutoContext()` (in `classify.ts`) gibt **immer** Klasse 3 zurück
  — Tenant-Default wird per CIA-L1 ignoriert, kein Class-2-Fallback.
- `AIProvider.generateSentiment(...)` optional auf der Provider-Schnittstelle (`providers/types.ts`).
- `invokeSentimentGeneration()` (`router.ts`) spiegelt `invokeNarrativeGeneration`:
  Class-3-Hard-Block → Tenant-Provider-Pflicht → `tenant_ai_cost_caps`-Check →
  `ki_runs`-Insert → Provider-Call → Stub-Fallback wenn `generateSentiment`
  fehlt → Rückgabe enthält die vom Provider gelieferten `SentimentSignal`s;
  der Stub liefert deterministisch **eine** `SentimentSignal` pro übergebenem
  Participant.
- `StubProvider.generateSentiment()` emittiert neutrale `0/0`-Signals mit
  `confidence=0.3` pro Participant — γ.2 Review-Queue erfordert weiterhin
  expliziten Accept/Reject pro Stakeholder.

**Tests (`src/lib/ai/router.test.ts`)**

- +3 Cases: Class-3-Lock auch bei Tenant-Default Class-1; Cost-Cap-Reject;
  per-Participant-Output-Cardinality. Suite jetzt 27/27 grün.

**Bewusste Abweichungen vs Spec**

- Real-Provider Anthropic/OpenAI/Google haben `generateSentiment` **noch nicht**
  implementiert — Stub ist der kanonische lokale Pfad bis zur nächsten
  Provider-Feature-Slice. Funktional ausreichend für γ.2-UI-Entwicklung.
- CIA-L7 separater Cost-Cap-Topf (500/Monat/Tenant für Sentiment) **deferred**:
  Sentiment teilt sich aktuell den globalen `tenant_ai_cost_caps`. Purpose-
  scoped Caps würden Schema + RPC ändern und hätten γ.1 in eine größere Slice
  verwandelt. Re-evaluation in γ.2 oder als 32e-Slice.

**Doc-Drift (vor γ.1 bemerkt)**

- Implementation Notes für 34-β, 34-δ, 34-ζ wurden in den jeweiligen Sessions
  nicht in diese Spec nachgepflegt (PRs #10/#12/#13 merged). PROJ-34-Backfill
  als Pflege-Item vermerkt; nicht γ.1-blocking.

**Next slice:** 34-γ.2 — AI-Vorschlag-Pill am Interaction-List-Item +
Accept/Reject/Modify-Dialog gegen `invokeSentimentGeneration`. Designer-Pass
für Inline-Edit + Drill-Down-Drawer nötig (siehe `.claude/rules/designer.md`).

## Implementation Notes — 34-γ.2 Frontend (2026-05-13)

Designer-Spec: `docs/design/proj-34-gamma2-ai-review.md` (12 FE-ACs).
Frontend-only slice; Backend für Trigger- und Batch-Review-Routes folgt
in `/backend`-Pass.

**Neue Komponenten (`src/components/stakeholders/communication/`)**

- `ai-proposal-pill.tsx` — `AIProposalPill` mit 4 Varianten
  (`proposed | stub | loading | failed`) am `InteractionItem`-Header.
  Counter `"✦ KI-Vorschlag · {n} offen"` schrumpft mit Decisions.
- `participant-pills-strip.tsx` — `ParticipantPillsStrip` (N rows pro
  Interaktion bei >1 Teilnehmern) mit Source-Halo (`ring-2 ring-primary/40`
  für `ai_proposed`, ✓/✗ Suffix für accept/reject), dashed-border-
  Confidence-Microbar (FE-7) markiert Stub-Confidence 0.3 sichtbar anders.
- `participant-review-card.tsx` — `ParticipantReviewCard` (exported für
  ε-Reuse) mit ToggleGroup-Slidern, DecisionChip und 3-State-Decision
  (`accept/reject/modify`). Auto-Collapse via derived state (kein
  useEffect — `react-hooks/set-state-in-effect`-lint-clean).
- `ai-review-sheet.tsx` — `AIReviewSheet` mit rechtem Sheet
  (`Sheet side="right" sm:max-w-2xl`, Mirror von PROJ-33
  `profile-edit-sheet.tsx`). Local-State Decision-Map, Bulk-Accept-Confirm
  bei N≥5, Discard-AlertDialog bei ungespeicherten Decisions, Stub- und
  External-Blocked-Banner via shadcn `Alert`.

**Neue Helper / API-Surface (`src/lib/stakeholder-interactions/`)**

- `aggregate.ts` — `aggregateInteractionSignal(values[])` returns
  `{ median, spread, count, hasSpread }`. Median-Wahl per Designer-D5
  (Mean lügt auf bimodalen 2-koop+2-obstr-Meetings); `hasSpread` flag
  bei `max - min ≥ 3` für Streuung-Badge.
- `api.ts` — `InteractionParticipant`-Type um
  `participant_sentiment_confidence`, `_model`, `_provider` erweitert
  (Spalten existieren bereits in α-Migration). Neue Helpers
  `triggerSentimentReview()` (POST `/sentiment-trigger`) und
  `submitAIReviewBatch()` (PATCH `/ai-review`). Beide Endpunkte sind
  **/backend-TODO**.

**Modifizierte Komponente (`communication-tab.tsx`)**

- `CommunicationTab` lädt jetzt einmal `listStakeholders(projectId)` für
  Name-Lookup-Map (Fail-soft auf "Stakeholder" wenn nicht geladen).
- `InteractionItem` zeigt `AIProposalPill` mit `derivePillVariant`
  (proposed/stub/hidden) basierend auf `participant_sentiment_source` +
  `_provider`. Transient `requestState` (idle/loading/failed) überlagert
  derived variant ohne useEffect.
- `>1`-Participants: `ParticipantSignalRow` (β, focused-stakeholder-edit)
  wird durch `ParticipantPillsStrip` (alle Teilnehmer read-only) ersetzt
  (FE-6); 1-Participant-Fall behält β unverändert (keine Regression).
- "✦ KI-Analyse anfragen"-Button erscheint wenn keine AI-Rows existieren.

**Tests**

- `aggregate.test.ts` — 7 Cases (Empty, Null-Filter, Odd/Even-Median,
  Bimodal-Spread, Edge `spread=2`-Schwelle).
- `ai-proposal-pill.test.tsx` — 6 Cases (4 Varianten + Click + Compact).
- `tests/PROJ-34-gamma2-ai-review.spec.ts` — Playwright Auth-Gate-Smoke
  auf den zwei zukünftigen Routen. Erwartet aktuell 404/405 alongside
  307/401 weil /backend noch fehlt.

**Bewusste Out-of-Scope (deferred to /backend pass)**

- `POST /api/projects/[id]/interactions/[iid]/sentiment-trigger` — ruft
  `invokeSentimentGeneration` auf, schreibt `_source='ai_proposed'`-Rows.
- `PATCH /api/projects/[id]/interactions/[iid]/ai-review` — Batch-
  Transition `ai_proposed → ai_accepted/ai_rejected/manual`, idempotent,
  field-level Audit via PROJ-10.
- Mini-Queue-Mode des Sheets (mehrere Interaktionen pro Stakeholder
  in einer Session reviewen) — Designer "Now"-Item für späteren Polish.
- Projekt-weite Open-AI-Reviews-Inbox — bewusst **PROJ-65-Kandidat**
  (Designer D4 "Next").

**Build / Lint / Tests**

- `npx tsc --noEmit` — clean
- `npx eslint src/components/stakeholders/communication/ src/lib/stakeholder-interactions/` — clean
- `npx vitest run` — 13/13 grün auf den neuen Specs
- `npm run build` — production build successful

## Implementation Notes — 34-γ.2 Backend (2026-05-13)

Zwei neue API-Routen schließen den Frontend-Loop. Keine neue Migration —
alle Bridge-Spalten existieren bereits in α-Migration (`participant_*`
inklusive `_confidence numeric(4,3)`).

**`POST /api/projects/[id]/interactions/[iid]/sentiment-trigger`**

- Auth + `requireProjectAccess(..., "edit")` + tenant_id-Extraction aus
  access.project (Pattern aus `preview-ki/route.ts`).
- Lädt Interaction (404 wenn soft-deleted) + Participants (400 wenn 0).
- Lädt Stakeholder-Namen für `SentimentAutoContext.participants[].label`
  (Namen only, keine PII — gleicher Disclaimer wie in `types.ts`).
- Ruft `invokeSentimentGeneration` aus γ.1 (Class-3 hard-lock + Stub-
  Fallback bleiben im Router).
- `external_blocked` → kein DB-Write, Response `{ run: { ..., status:
  "external_blocked", confidence_avg: null } }`.
- Sonst: pro Signal UPDATE auf `stakeholder_interaction_participants`
  mit `_source = 'ai_proposed'`, `_model`, `_provider`, `_confidence`.
- Response `{ run: { provider, model, status, confidence_avg } }`.

**`PATCH /api/projects/[id]/interactions/[iid]/ai-review`**

- Auth + `requireProjectAccess(..., "edit")`.
- Body via Zod `discriminatedUnion` auf `decision`:
  - `accept`/`reject`/`modify` (modify benötigt `overrides`).
- Pro Decision ein UPDATE mit idempotenter WHERE-Clause
  `participant_sentiment_source = 'ai_proposed'`. Bereits-decided Rows
  bleiben unberührt (kein Re-transition, kein Audit-Noise).
- Transitionen:
  - `accept` → beide `_source` auf `ai_accepted`, Werte bleiben.
  - `reject` → beide `_source` auf `ai_rejected`, alle Werte + AI-
    Provenance null.
  - `modify` → beide `_source` auf `manual`, Override-Werte gesetzt,
    AI-Provenance null (User-Override löscht AI-Quelle).
- Audit feuert automatisch via PROJ-10-Trigger auf Bridge.
- Response: `{ updated_participants: InteractionParticipant[] }` (Frontend
  ersetzt damit den lokalen Cache).

**Tests**

- `ai-review/route.test.ts` — 7 Cases (Auth 401 / 403 / Validation 400×2 /
  accept / reject / modify mit korrekten Spalten-Updates).
- `sentiment-trigger/route.test.ts` — 6 Cases (401 / 403 / 404-soft-
  deleted / 400-no-participants / success-with-write / external_blocked
  without write).
- 13/13 grün via `npx vitest run …`.

**Build**

- `npm run build` listet beide Routen als `ƒ` (dynamic): `/api/projects/[id]/
  interactions/[iid]/sentiment-trigger` und `…/ai-review`.

**Bewusste Out-of-Scope (Designer "Next")**

- Mini-Queue-Mode pro Stakeholder (Sheet iteriert mehrere Interaktionen
  in einer Session).
- Projektweite Open-AI-Reviews-Inbox (PROJ-65-Kandidat).
- Realtime-Push beim AI-Complete (aktuell verlässt sich UI auf
  `onSignalsChanged()`-Refresh nach dem Trigger).

## QA Test Results — 34-γ.2 (2026-05-13)

Tested against AC-8 + AC-9 with focus on Class-3-Defense-in-Depth, RLS
auf `stakeholder_interaction_participants`, und der State-Maschine
`ai_proposed → ai_accepted/ai_rejected/manual`.

### Acceptance Criteria

| AC | Slice | Status | Evidence |
|---|---|---|---|
| AC-1 | α | ✅ Pass | Live since 2026-05-12 PR #8 |
| AC-2 | α | ✅ Pass | Live since 2026-05-12 PR #8 |
| AC-3 | α | ✅ Pass | Live since 2026-05-12 PR #8 |
| AC-4 | α | ✅ Pass | Live since 2026-05-12 PR #8 |
| AC-5 | α | ✅ Pass | Live since 2026-05-12 PR #8 |
| AC-6 | β | ✅ Pass | Live since 2026-05-12 PR #10 |
| AC-7 | β | ✅ Pass | Live since 2026-05-12 PR #10 |
| AC-8 | γ.2 | ✅ Pass | `AIProposalPill` (4 Varianten), `AIReviewSheet` mit Accept/Reject/Modify (ParticipantReviewCard pro Stakeholder), Routes `sentiment-trigger` + `ai-review` mit korrektem `_source`-Mapping. Per-Participant-Vektor: γ.1-Router schreibt 1 Row pro Participant, UI rendert `ParticipantPillsStrip` mit N Rows. 7/7 route-tests + 6/6 component-tests grün. |
| AC-9 | γ.1+γ.2 | ✅ Pass | `classifySentimentAutoContext` lockt Class-3 unconditional (CIA-L1). Kein Platform-Key-Fallback — Router liefert `external_blocked` wenn kein Tenant-Provider. UI: `sentiment-trigger`-Route gibt `{ run: { status: "external_blocked" }}` zurück; `InteractionItem.onTrigger` zeigt Toast + behält Pill versteckt. Sheet zeigt zusätzlich `ExternalBlockedBanner` via shadcn `Alert` mit Link zu `/settings/tenant/ai-providers`. |
| AC-10..AC-17 | δ/ε/ζ | ✅/⏳ | δ + ζ live; ε offen |

### Edge-Case Coverage (Designer §D Matrix)

| Edge | Status |
|---|---|
| AI-call läuft (loading pill) | ✅ Implemented via `requestState='loading'` |
| AI-call abgeschlossen, pending review | ✅ Pill `proposed` + Strip mit Halo |
| AI-call mit Stub | ✅ Pill `stub` (tertiary tone) + Confidence dashed-border bei 0.3 |
| External_blocked | ⚠ Partial — Toast statt persistenter Tab-Level-Banner (F-2) |
| AI-call failed | ✅ Pill `failed` + Retry-Handler |
| Bereits reviewed | ✅ Pill verschwindet (derived state), Strip zeigt Final-Werte |
| Mixed (some decided) | ✅ Counter dekrementiert, Per-Row-Halo |
| Stakeholder deleted | ⚠ Silently filtered statt greyed-out (F-5) |
| Permission denied (view-only) | ⚠ Backend 403 ✓, aber UI zeigt Pill als clickable (F-3) |
| Offline / 403 mid-review | ✅ Toast + Sheet behält Local-State |
| Empty (no AI yet) | ✅ "✦ KI-Analyse anfragen" Trigger-Button sichtbar |

### Security Audit (Red-Team)

| Vector | Status | Notes |
|---|---|---|
| Cross-tenant authorization | ✅ Safe | `requireProjectAccess(... 'edit')` + RLS via `is_project_member(project_id)` |
| Cross-project participant write | ✅ Safe | α-Trigger `tg_sip_validate_same_project_fn` enforced |
| Input validation | ✅ Safe | Zod `discriminatedUnion` auf `decision`, `min(-2).max(2)` auf overrides |
| Class-3 defense-in-depth | ✅ Safe | γ.1: auto-classifier hart auf 3 (kein Tenant-Default-Override), Provider-Selection rejects external, Cost-Cap, Stub-Fallback deterministisch — **4 layers** |
| SQL injection | ✅ Safe | Supabase parameterized |
| Bridge-RLS | ✅ Safe | `is_project_member(project_id)` auf SELECT/INSERT/UPDATE/DELETE |
| Sensitive data in responses | ✅ Safe | `provider`/`model`/`confidence_avg` sind Infrastructure-Metadaten, keine PII |
| Decision-ID-Forgery | ✅ Safe | UUID-Validation + WHERE-Clause `_source = 'ai_proposed'` (idempotent) |
| Audit trail completeness | ⚠ Partial | `_model`/`_provider`/`_confidence` nicht in `_tracked_audit_columns` für Bridge — aber `ki_runs` führt vollständigen Run-Audit (F-1) |

### Regression

- `npm test -- --run` — **1397/1397 ✓** (162 test files). Keine Regression auf bestehenden Features.
- `npx playwright test tests/PROJ-34-gamma2-ai-review.spec.ts` — **4/4 ✓** (Chromium + Mobile Safari).
- `npm run build` — production build clean, beide neue Routen als `ƒ` dynamic.

### Bugs / Findings

| # | Severity | Type | Description | Fix Path |
|---|---|---|---|---|
| F-1 | Low | Audit | `_tracked_audit_columns('stakeholder_interaction_participants')` umfasst nur 4 β-Spalten; γ.2 schreibt zusätzlich `_model`/`_provider`/`_confidence`, die nicht via PROJ-10-Trigger auditiert werden. Risiko gering: `ki_runs` führt den Run-Audit; Bridge-Spalten sind denormalisiert. | Folgemigration: Whitelist erweitern auf 7 Spalten. ~5 LOC. |
| F-2 | Medium | UX | `external_blocked` zeigt nur transienten Toast statt persistenten Tab-Level-Banner (Designer §D verlangt `Alert` mit `ShieldAlert` + Link über AddInteractionForm, session-dismissable via localStorage). Funktional kein Verlust — Pill bleibt korrekt versteckt, manuelle β-Eingabe weiterhin möglich. | Tab-Banner-Komponente + localStorage-Hook. ~30 LOC. |
| F-3 | Medium | UX | View-only-User sieht AI-Pill als clickable (Backend rejected mit 403, aber UI hat kein `cursor-not-allowed` + Tooltip). Kein Security-Issue. | Rolle-Check im Frontend + `disabled`-Prop weiterleiten. |
| F-4 | Low | UX | Failed-State hat kein Retry-Limit. Designer spec: "Nach 2 Retries permanent muted state". Aktuell unbegrenzte Retry-Clicks möglich. | Retry-Counter in `requestState`. |
| F-5 | Low | UX | CASCADE-deleted Stakeholders werden im Sheet silently gefiltert; Designer wollte greyed-out Row mit "(Stakeholder gelöscht)"-Label. | Sheet-Body um deleted-row branch ergänzen. |
| F-6 | Low | UX | "KI-Analyse anfragen"-Button immer sichtbar; Designer wollte Hide wenn Tenant keinen Provider hat. Aktuell relies on Backend-Reject. | Tenant-Provider-Lookup in CommunicationTab + Conditional. |
| F-7 | Low | UX | Während AI-Loading zeigt Pill den Spinner, aber `ParticipantPillsStrip` bleibt unverändert (kein Skeleton-Strip). | `Skeleton`-Branch in Strip. |
| F-8 | Low | UX | Save-Failure zeigt nur Single-Toast; Designer wollte Per-Card-Error-Border bei partial Failure. Aktuell stays-open ist da, aber Per-Row-Highlight fehlt. | Per-Card error-state in Sheet. |

### Production-Ready Decision

**READY** — Keine Critical/High Bugs. AC-8 und AC-9 vollständig erfüllt;
Core State-Maschine `ai_proposed → ai_accepted/ai_rejected/manual` + Per-
Participant-Vektor + Class-3-Block + External-Blocked-Pfad funktionieren
korrekt. Alle 8 Findings sind UX-Polish-Items oder denormalisierte
Audit-Lücken, die in einem Folgeslice (z.B. γ.2-Polish oder ε-Begleit-
Hardening) angegangen werden können.

**Empfehlung Fix-Priorität:**
1. F-1 (Audit) vor nächstem Production-Snapshot — 5 LOC, Compliance-relevant.
2. F-2 + F-3 (UX-Klärung von Class-3-blockierten und view-only-Tenants) — beide Medium, beide auf Sicht prüfen ob Pilot-Tenants betroffen.
3. F-4..F-8 — sammelbar in einer Polish-Slice nach ε.

**Test-Suite:**
- Unit tests: 6 (`ai-proposal-pill`) + 7 (`aggregate`) + 13 (route tests) = **26 new** tests, alle grün
- E2E: 2 Playwright smoke tests (Auth-Gate), beide grün

## Polish — 34-γ.2 Findings F-1 / F-2 / F-3 (2026-05-13)

**F-1 Audit-Tracked-Columns Migration** — `20260513140000_proj34_gamma2_audit_columns_extension.sql`. Extends the `_tracked_audit_columns('stakeholder_interaction_participants')` whitelist with `participant_sentiment_model`, `_provider`, `_confidence`. Live on Supabase (verified via direct function call returning all 7 columns). AI-provenance changes on the bridge are now field-level audited via PROJ-10 trigger.

**F-2 External-Blocked Tab-Banner** — persistent shadcn `Alert` above `AddInteractionForm` with `ShieldAlert` icon + link to `/settings/tenant/ai-providers`. Triggered when any `sentiment-trigger` call returns `status='external_blocked'`. Initialised lazily from localStorage key `proj34:external_blocked:{projectId}` (SSR-safe). Session-dismissable via X-button.

**F-3 View-only Pill-Disable** — `useProjectAccess(projectId, "edit_master")` propagated through `InteractionList` → `InteractionItem`. AIProposalPill receives `disabled={!canEdit}` (component already supported tooltip "Nur Projekt-Manager dürfen KI-Vorschläge prüfen."). The "✦ KI-Analyse anfragen"-Trigger-Button is hidden completely for view-only users.

**Tests / Build:**
- `npx tsc --noEmit` clean
- `npx eslint src/components/stakeholders/communication/` clean
- `npx vitest run` — 45/45 across affected suites
- `npm run build` — production build clean

## Deployment — 34-γ.2 (2026-05-13)

- **PR:** [#22](https://github.com/rechnungITC/projektplattform_v3/pull/22), squash-merged 2026-05-13T11:15:35Z.
- **Production:** https://projektplattform-v3.vercel.app/ via Vercel auto-deploy on main.
- **Smoke (prod):** beide γ.2-Routen antworten mit HTTP 307 (Auth-Redirect) für unauthenticated callers — Auth-Gate funktioniert.
  - `POST /api/projects/[id]/interactions/[iid]/sentiment-trigger` → 307 ✓
  - `PATCH /api/projects/[id]/interactions/[iid]/ai-review` → 307 ✓
- **CI:** Schema Drift Guard ✓ · Vercel Preview ✓ · Vercel Production ✓
- **Bekannte Findings noch offen:** F-1 (Audit-Tracked-Columns) + F-2..F-8 — siehe QA-Block. Nicht-blockierend, gehören in eine Polish-Slice nach ε.

