# PROJ-34: Stakeholder Communication Tracking

## Status: In Progress (34-α backend + API + tab skeleton implemented 2026-05-12; β/γ.1/γ.2/δ/ε/ζ open)
**Created:** 2026-05-06
**Last Updated:** 2026-05-12

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
Als Projektleiter möchte ich Sentiment und Kooperationssignale auf Interaktions-Ebene haben, sodass beginnender Konflikt früh sichtbar wird.

Akzeptanzkriterien:
- `sentiment` ∈ {−2, −1, 0, +1, +2} (`strongly_negative`..`strongly_positive`); nullable wenn nicht erfasst.
- `cooperation_signal` ∈ {−2, −1, 0, +1, +2} (`obstructive`..`collaborative`); nullable.
- Beide Felder können **manuell** gesetzt UND als **AI-Proposal** vorgeschlagen werden. Source-Tracking: `manual` | `ai_proposed` | `ai_accepted` | `ai_rejected`.
- AI-Routing geht ausschließlich über den **PROJ-12 Router** mit neuem Purpose `sentiment` und Class-3-Hard-Block: Wenn der Tenant kein eigenes Provider-Key-Set hat (PROJ-32) und der Summary als Class-3 klassifiziert ist, fail-closed mit "Sentiment AI nicht verfügbar".
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

### ST-04 Coaching Context
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
| AC-7 | γ.1 | Neuer PROJ-12 Purpose `sentiment` (Class-3-fixed, Tenant-Provider-Pflicht) + Cost-Cap-Topf 500/Monat/Tenant (CIA-L7) |
| AC-8 | γ.2 | AI-Vorschlag-Pill am Interaktion-Item; Accept/Reject/Modify-Dialog setzt `_source` korrekt; Per-Participant-Vektor statt Skalar |
| AC-9 | γ.1 | Class-3-Block fail-closed mit lesbarer Fehlermeldung (keine Default-Tenant-Bypass, kein Class-2-Fallback per CIA-L1) |
| AC-10 | δ | `awaiting_response` + `response_due_date` + `replies_to_interaction_id` Spalten + Logik |
| AC-11 | δ | "Offene Antworten"-Section auf Stakeholder + Overdue-Badge |
| AC-12 | δ | Project-Health-Signal (PROJ-56-Integration) zählt Overdue als yellow/red |
| AC-13 | ε | `stakeholder_coaching_recommendations` Tabelle + RLS + API |
| AC-14 | ε | AI-Generation mit zitierten Interaktion-IDs + Profile-Feldern + `review_state` Workflow |
| AC-15 | ε | DSGVO-Redaktion: Recommendation wird mit Stakeholder redacted (PROJ-10-Hook) |
| AC-16 | ζ | `tenant_settings.risk_score_overrides.communication_weight` (0..1, default 0) |
| AC-17 | ζ | PROJ-35 `compute_stakeholder_risk_score` liest optional Avg-Sentiment + Cooperation-Signal + Overdue-Count |

## Edge Cases

- **Stakeholder gelöscht (FK CASCADE)** — `stakeholder_interaction_participants` Cascade greift; wenn das die letzte Beteiligung der Interaktion war, bleibt die Interaktion bestehen aber ohne Participant → UI muss `(keine Stakeholder zugeordnet)` rendern.
- **Multi-Tenant-Cross-Project** — eine Interaktion darf nie Stakeholder aus einem anderen Projekt referenzieren (Trigger: `enforce_interaction_stakeholder_same_project`).
- **AI-Provider down während Sentiment-Routing** — Interaktion wird trotzdem gespeichert; Sentiment bleibt `null` + UI-Toast "AI-Vorschlag fehlgeschlagen, Werte können manuell gesetzt werden".
- **Class-3-Hard-Block** — Tenant hat keine eigenen AI-Keys → AI-Pill verschwindet, Edit-Form nur manuell. Kein Fallback auf Platform-Keys.
- **Coaching-Recommendation zitiert gelöschte Interaktion** — `cited_interaction_ids[]` filtert ID raus, UI zeigt `(Quelle nicht mehr verfügbar)` Hinweis.
- **Self-Interaction (Stakeholder kommuniziert mit sich selbst über uns)** — nicht erlaubt, Trigger blockt `direction=bidirectional` bei nur 1 Stakeholder.
- **Replies-to-Chain länger als 1** — `replies_to_interaction_id` ist nicht-rekursiv für MVP; Thread-View deferred.

## Out of Scope

- ❌ **Automatische E-Mail-Inbox-Ingestion** → PROJ-44 Context Ingestion (write-path).
- ❌ **Echter Teams/Slack-Adapter** für inbound → PROJ-49 / PROJ-14b.
- ❌ **Autonomes Versenden** von AI-Coaching-Empfehlungen → PROJ-39 Assistant Action Packs.
- ❌ **Sentiment-Per-Stakeholder bei Multi-Stakeholder-Meeting** — MVP: 1 Wert pro Interaktion; per-Participant-Signals deferred to PROJ-34-ν (zukünftig).
- ❌ **Thread-View / Conversation-Reconstruction** — `replies_to_interaction_id` reicht für 1-Hop, kein Voll-Thread.
- ❌ **Voice-Recordings / Transcripts** — PROJ-37/41 Assistant Speech.
- ❌ **Materialized Sentiment-Aggregates** — alles compute-on-read solange < 500 Interactions/Stakeholder.

## Technical Requirements

- Jede neue Tabelle MUSS `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE` haben.
- RLS-Policies MÜSSEN über `is_tenant_member(tenant_id)` + `has_project_access(project_id, 'view'|'manage')` gehen — keine direkten `auth.uid()`-Vergleiche.
- AI-derived Felder MÜSSEN `_source` (`manual|ai_*`), `_model`, `_provider`, `confidence` tracken (V3-Prinzip 2: AI as proposal layer).
- AI-Calls MÜSSEN über `invokeSentimentGeneration` / `invokeCoachingGeneration` gehen — kein direkter Provider-Call aus der API-Route. Hard-Block für Class-3 ohne Tenant-Keys.
- DSGVO-Export (PROJ-10/17): Interactions + Recommendations sind redaction-eligible.
- Audit-Log: `_tracked_audit_columns`-Whitelist umfasst `sentiment`, `cooperation_signal`, `awaiting_response`, `response_due_date`, `review_state` (PROJ-10-Hook).
- Schema-Drift-Guard (PROJ-42): Slice-Migration muss vor Frontend-`.from(...).select(...)` deployed werden.

## Empfohlene interne Phasierung (nicht-bindend für /architecture)

| Slice | Inhalt | Migration | UI | Aufwand |
|---|---|---|---|---|
| **34-α** | ✅ Implemented 2026-05-12 — Interaction-Log (ST-01): Tabellen + RLS + API CRUD + Stakeholder-Detail Tab. Tabellen inkl. `deleted_at`-Soft-Delete + Field-Level-Audit-Trigger (CIA-L2) | 2 Tables (`stakeholder_interactions`, `stakeholder_interaction_participants` mit Per-Participant-Signal-Spalten per CIA-L3) + 1 Trigger (same-project) | "Kommunikation"-Tab + Inline-Add-Form + List | ~2 PT |
| **34-β** | Manual Signals (ST-02 Teil 1): Sentiment/Cooperation als Slider **pro Participant** | 0 (Spalten in α) | Slider im Edit-Form pro Participant + Pill am List-Item | ~0.5 PT |
| **34-γ.1** | AI-Sentiment Backend: PROJ-12-Router `sentiment`-Purpose + Class-3-Lock + PROJ-32d Cost-Cap-Topf + Per-Participant-Output-Vektor | 0 (Spalten in α) + Router-Erweiterung | — | ~1.5 PT |
| **34-γ.2** | AI-Sentiment UI: AI-Vorschlag-Pill + Review-Queue + Accept/Reject/Modify-Dialog | 0 | AI-Vorschlag-Pill + Modal | ~1 PT |
| **34-δ** | Response-Behavior (ST-03): awaiting_response + Overdue **lazy-on-read via Generated Column** (CIA-L5) + Project-Health-Feed | 0 (Spalten in α) | "Offene Antworten"-Section + Overdue-Badge + PROJ-56-Hook | ~1 PT |
| **34-ε** | Coaching Context (ST-04): Recommendations-Tabelle + AI-Generation + Review + Citing + DSGVO-Hard-Delete-Cascade (CIA-L6) | 1 Table (`stakeholder_coaching_recommendations`) | "Empfehlungen"-Section + Annotated Citations | ~2 PT |
| **34-ζ** | PROJ-35 Feed: Communication-Signals optional in `compute_stakeholder_risk_score`. Default `communication_weight=0` (Opt-in per CIA-L4) | 0 (`tenant_settings.risk_score_overrides`-Patch) | Toggle in Risk-Score-Tenant-Config | ~1 PT |

**Total: ~9.5 PT** (vs. 9 PT pre-CIA — +0.5 PT für γ-Split + Per-Participant-Sentiment, −0.5 PT für Lazy-Overdue ohne Cron).

## Aufwandsschätzung

- **Backend** (3 Migrations + 4 API-Surfaces + PROJ-12-Router-Erweiterung + RLS + Audit-Hook + Per-Participant-Aggregation-View): ~4 PT
- **Frontend** (Stakeholder-Detail-Tab + Add/Edit-Form mit Per-Participant-Slidern + AI-Vorschlag-Workflow + Coaching-Section + Health-Signal-Card): ~4 PT
- **AI/Integration** (PROJ-12 `sentiment` + `coaching` Purposes Class-3-fixed, PROJ-32d Cost-Cap-Topf 500/Monat): ~1 PT
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

### F) Datenfluss bei AI-Sentiment-Vorschlag (γ.1 + γ.2)

1. Projektleiter erfasst eine Interaktion (Summary, Stakeholder).
2. Server-Action triggert PROJ-12-Router mit Purpose `sentiment`, Class-3.
3. Router prüft Tenant-Provider-Keys (PROJ-32). Wenn keine → fail-closed, UI zeigt "AI nicht verfügbar".
4. Wenn vorhanden → Sentiment-Vektor pro Teilnehmer wird angefragt.
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
