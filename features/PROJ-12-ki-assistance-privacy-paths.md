# PROJ-12: KI Assistance and Data-Privacy Paths

## Status: In Review
**Created:** 2026-04-25
**Last Updated:** 2026-04-29

## Summary
Builds the platform's AI integration layer: a single model-routing component (cloud Claude vs local Ollama), a class-3 hard block that prevents personal data from reaching external models, KI proposals for planning units (work items, risks, decisions) generated only after explicit user action, and a review/approve flow that never auto-mutates business data. Also covers F12.1 privacy classification, F12.2 traceability, F12.3 contextual compliance hints, and F2.1b KI-driven wizard alternative. Inherits V2 EP-10.

## Dependencies
- Requires: PROJ-1 (Auth, Tenants, Roles)
- Requires: PROJ-2 (Project CRUD) — KI proposals scoped per project
- Requires: PROJ-8 (Stakeholders) — class-3 marker
- Requires: PROJ-9 (Work Items) — proposals target these
- Requires: PROJ-10 (Audit) — proposals + acceptance audited
- Influences: PROJ-13 (KI-drafted communication), PROJ-14 (MCP bridge)
- Hard prerequisite for any AI feature in V3

## V2 Reference Material
- **Epic file:** `~/projects/Projeketplattform_v2_D.U/planning/epics/ep-10-ki-assistenz-und-datenschutz.md`
- **Stories:** `~/projects/Projeketplattform_v2_D.U/planning/stories/ep-10.md` (ST-01 model routing, ST-02 class-3 block, ST-03 proposal generation, ST-04 review/approve flow, F12.1 privacy config, F12.2 traceability, F10.2 model selection, F12.3 compliance hints) plus EP-03 F2.1b KI-driven wizard alternative
- **ADRs:** `docs/decisions/data-privacy-classification.md`, `docs/decisions/metamodel-infra-followups.md` (Ollama provider)
- **V2 code paths to study during /architecture and /backend:**
  - `apps/api/src/projektplattform_api/services/ai/router.py` — model router with class-3 check
  - `apps/api/src/projektplattform_api/services/ai/data_privacy.py` — `classify_field`, `classify_payload`
  - `apps/api/src/projektplattform_api/services/ai/providers/{anthropic,ollama}.py`
  - `apps/api/src/projektplattform_api/routers/work_item_suggestions.py`

## User Stories
- **[V2 EP-10-ST-01]** As an operator, I want a single AI abstraction layer so that different models can be plugged per use case.
- **[V2 EP-10-ST-02]** As an operator, I want personal data technically blocked from external AI so that GDPR is enforced, not just policy.
- **[V2 EP-10-ST-03]** As a user, I want KI proposals for planning units derived from my project context after I ask for them.
- **[V2 EP-10-ST-04]** As a user, I want to review, accept, reject, or edit each KI proposal before it lands as active project data.
- **[V2 F12.1]** As an operator, I want the data privacy base configuration (3-class scheme + GDPR storage concept) implemented from day one.
- **[V2 F12.2]** As a project lead, I want every AI-generated piece tagged with origin, model, and validation status so that traceability holds.
- **[V2 F10.2]** As a sysadmin, I want per-tenant model-selection configuration with hard block on class 3 → cloud.
- **[V2 F12.3]** As a project lead, I want context-aware compliance hints derived from project type so I consider GDPR/works-council/IT-Sec early.
- **[V2 F2.1b]** As a project owner, I optionally want to use a KI-guided dialog instead of the regular wizard.

## Acceptance Criteria

### Model routing (ST-01)
- [ ] Single `aiRouter.invoke({ purpose, payload, classification, tenant_id })` API in `src/lib/ai/router.ts` (or Edge Function).
- [ ] Routes to Anthropic (Claude) for class-1/2; routes to local Ollama (or stub) for class-3.
- [ ] Logs every call: timestamp, tenant, project, purpose, classification, chosen provider, success/error.
- [ ] Errors from the model are caught and returned as structured error envelopes; UI surfaces a friendly message.

### Class-3 block (ST-02)
- [ ] A central `classifyPayload(payload)` helper inspects every field of an outgoing payload and returns the highest data class involved.
- [ ] If `classification = 3`, external (cloud) routing is rejected with `403 / external-blocked`. No bypass — even tenant admins cannot override.
- [ ] Block events logged with timestamp, user, tenant, project.
- [ ] User-facing message: "External AI is not permitted for this content (contains personal data)."

### Privacy classification (F12.1)
- [ ] Field-level classification registry: `{ table.column → 1|2|3 }`. Default unspecified = 3.
- [ ] Stored as a TypeScript module (`src/lib/ai/data-privacy-registry.ts`) for the V3 stack — derived from V2's `data_privacy.py`.
- [ ] Initial classifications match V2's data-privacy-classification.md table (project name=2, type=1, lifecycle=1, profile email=3, stakeholder name/email=3, etc.).
- [ ] GDPR delete concept documented: depersonalize the original record, audit rows age out via retention.
- [ ] DSGVO export (Art. 15/20) endpoint deferred to PROJ-17 (tenant admin can trigger a redacted export).

### Proposal generation (ST-03)
- [ ] `POST /api/projects/[id]/ki/suggest` with body `{ purpose: 'work_items'|'risks'|'decisions', context: ... }` triggers a proposal run.
- [ ] Proposals stored in `work_item_suggestions` (or `ki_suggestions`) with status `draft`, full provenance metadata.
- [ ] Proposals are method-aware (only kinds visible for the project's method are proposed).
- [ ] Proposals do NOT mutate active project objects — only the suggestion table.
- [ ] Generation requires explicit user action; no background polling that costs tokens silently.

### Review + approve flow (ST-04)
- [ ] UI tab "KI Vorschläge" shows pending proposals.
- [ ] Per proposal: Accept (creates the real entity), Reject (marks rejected), Edit (allows inline edit before accept).
- [ ] Acceptance creates the actual `work_items` (or risks/decisions/etc) row, audited with `change_reason='ki_acceptance'` and a link back to the suggestion.
- [ ] Rejection logs reason (optional free text).
- [ ] No mass-acceptance.
- [ ] No automatic acceptance by rules.

### Traceability (F12.2)
- [ ] Every AI-generated record carries metadata: `created_via='ki', ki_run_id, ki_model, ki_timestamp, ki_status (draft|accepted|rejected|modified)`.
- [ ] Detail view shows the metadata badge.
- [ ] Filter "AI-derived only" available on lists.
- [ ] Exportable AI-event log (per PROJ-10 audit + a dedicated view).

### Per-tenant model selection (F10.2)
- [ ] `tenant_settings.ai_provider_config` JSONB stores per-tenant: `{ external_provider: 'anthropic'|'none', local_provider: 'ollama'|'stub', ollama_base_url? }`.
- [ ] Admin UI in PROJ-17 lets a tenant admin select.
- [ ] Class-3 hard block applies regardless of config.

### Compliance hints (F12.3)
- [ ] Catalog `compliance_hints` keyed by project type (e.g. ERP → GDPR, works-council, IT security; software → license check).
- [ ] Hints are recommendations, never blockers.
- [ ] Each hint has an "Acknowledge" button that records actor + optional comment in audit log.

### KI-driven wizard alternative (F2.1b)
- [ ] Optional "Use KI-Dialog" toggle on the wizard entry (PROJ-5 integration).
- [ ] Free-text dialog extracts master data into the same wizard's Review step — never auto-creates a project.
- [ ] Class-3 input blocked from the external model.

## Edge Cases
- **Tenant admin tries to disable class-3 block** → not possible by design (no setting exposes it).
- **Stand-alone deployment with no external AI** → `external_provider='none'`; all AI calls route local; if local is unavailable, calls fail with a clear message (no silent cloud fallback).
- **Proposal accepted on a project that since changed methods** → if the kind is no longer visible, acceptance creates the row anyway (history honored), UI hides it as per method visibility (PROJ-9).
- **Proposal rejected, then user wants to undo the rejection** → re-running generation is the path; no "un-reject" button v1.
- **AI run timeout** → caller sees error; partial proposals not persisted.
- **Cost limit per tenant exceeded** → block + clear error; tracked in tenant_settings (deferred to PROJ-17).
- **Ollama base URL unreachable** → class-3 path fails gracefully; log + UI message.
- **User edits a proposal then accepts** → metadata says `ki_status='modified'`; audit shows what user changed.

## Technical Requirements
- **Stack:** Next.js 16 + Supabase Edge Functions (TypeScript) + Anthropic SDK + Ollama HTTP client. Use Anthropic prompt caching for repeated context.
- **Multi-tenant:** All AI run logs and suggestion tables MUST have `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`. RLS on `ki_suggestions`: project members for read; only system + admin for write.
- **Validation:** Zod for the suggestion payload; runtime type-narrowing on `classification`.
- **Auth:** Supabase Auth + project role checks.
- **Privacy:** Hard `classifyPayload` check before any external call; logged; no bypass.
- **Provider abstraction:** Strategy pattern: `AIProvider` interface with `Anthropic`, `Ollama`, `Stub` implementations.
- **Performance:** Long-running generations as Edge Functions with streaming; UI shows progress.

## Out of Scope (deferred or explicit non-goals)
- Auto-anonymization of class-3 fields.
- KI-based legal evaluation.
- Exception-approval workflow that bypasses class-3 block.
- Self-evaluation of model output ("how confident is this?") beyond model-reported confidence.
- Fine-tuning.
- KI-generated communication content (PROJ-13).
- MCP bridge (covered in PROJ-14).

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Realitätscheck und Scope

Die Spec ist groß — 9 funktionale Bereiche von Modell-Routing bis KI-Wizard. Ein Single-Iteration-Build wäre das Doppelte des bisherigen Tempos und würde das Risiko in einer Iteration bündeln, ohne dass das Produkt unterwegs nutzbar wird. **Wir bauen einen vollständigen Vertical Slice „KI-Vorschläge für Risiken" und legen die Fundamente so, dass weitere Slices (Decisions, Work-Items, Wizard, Compliance-Hints) inkremental dazu kommen.**

Bestandsstand vor dieser Iteration:
- `/projects/[id]/ai-proposals` ist Coming-Soon — wird durch diese Iteration real.
- `work_items` hat bereits `created_from_proposal_id` aus PROJ-9 — PROJ-12 nutzt das.
- `risks`, `decisions`, `open_items` haben keine AI-Provenienz-Spalten; wir lösen das mit einer **separaten Provenienz-Tabelle**, statt jede Entitätstabelle anzufassen.
- `EXTERNAL_AI_DISABLED`-Hook aus PROJ-3 existiert und wird hier zum ersten Mal konsumiert.

### MVP-Scope (diese Iteration)

```
✅ IN dieser Iteration                       ⏳ DEFERRED (eigene Slices)
─────────────────────────────────────────    ───────────────────────────────
Privacy-Klassifikations-Register             KI-Wizard-Alternative (F2.1b)
Klasse-3 Hard-Block                          Compliance-Hints-Katalog (F12.3)
Provider-Abstraktion (Anthropic + Stub)      Per-Tenant-Modell-Auswahl-UI
Modell-Router mit Klassifikations-Check      Decisions- und Work-Item-Vorschläge
KI-Run-Logging                               Streaming-UI (Iteration 2)
Risk-Vorschläge (vollständige Vertikale)     Ollama-Provider (Iteration 2)
Review/Accept/Reject/Edit-UI                 Cost-Tracking pro Tenant
Provenance-Tracking auf akzeptierten Risks   PROJ-17 Admin-UI für AI-Provider-Config
Audit-Reason `ki_acceptance`
```

### Komponentenstruktur

```
Projektraum
└── Tab „KI-Vorschläge"   (vorher Coming-Soon → jetzt real)
    ├── Generate-Button („Vorschläge für Risiken anfordern")
    │   └── Optional: Kontext-Eingabe (Freitext oder Auto-Kontext aus Projekt)
    │
    ├── Vorschlagsliste (gefiltert nach Status: draft / accepted / rejected)
    │   └── Vorschlags-Karte
    │       ├── Provenance-Badge: „KI · Claude · 14:32 · run_id"
    │       ├── Inline-Edit (Felder: title, probability, impact, mitigation, …)
    │       ├── Accept-Button → legt echtes Risk an, audit-reason `ki_acceptance`
    │       ├── Reject-Button → optionaler Begründungstext
    │       └── Klassifikations-Hinweis (falls Klasse-3-Felder im Kontext)
    │
    └── Run-Historie (zusammengefaltet, einsehbar pro Vorschlag)

Risiken-Tab (existiert)
└── Filter „Nur KI-erzeugt" (neu — joint mit ki_provenance)
└── Risk-Karte: Badge „KI-erzeugt" sichtbar wenn provenance-Eintrag existiert

Server-Schicht
├── lib/ai/data-privacy-registry.ts   (Klassifikations-Map table.column → 1|2|3)
├── lib/ai/classify.ts                (classifyPayload-Helper, höchste Klasse)
├── lib/ai/router.ts                  (aiRouter.invoke; ruft classify, dann Provider)
├── lib/ai/providers/
│   ├── anthropic.ts                  (echte Claude-Calls via @ai-sdk/anthropic)
│   ├── stub.ts                       (deterministischer Fake für Tests + Stand-alone)
│   └── ollama.ts                     (Stub-Stand mit „not implemented" — Iteration 2)
├── api/projects/[id]/ki/suggest      (POST: Vorschläge generieren)
├── api/ki/suggestions/[id]/accept    (POST: → Risiko anlegen, audit_reason `ki_acceptance`)
├── api/ki/suggestions/[id]/reject    (POST)
└── api/ki/suggestions/[id]/edit      (PATCH: Inline-Edit vor Accept)
```

### Datenmodell (Klartext)

**Drei neue Tabellen, alle multi-tenant + RLS-geschützt:**

**ki_runs** — eine Zeile pro KI-Aufruf (auch wenn der Klasse-3-Block greift)
- Wer (actor, tenant, project), wann, Zweck (`risks` für jetzt; später erweiterbar)
- Höchste Datenklasse im Payload (1 / 2 / 3)
- Ausgewählter Provider (`anthropic` / `stub` / `ollama`) und Modell-ID
- Status (`success` / `error` / `external_blocked`)
- Token-Verbrauch und Dauer (für spätere Cost-Tracking-Slice)
- Optionaler Error-Text bei Fehlern

**ki_suggestions** — eine Zeile pro generiertem Einzelvorschlag
- Verknüpfung zur `ki_run`-Zeile (Sammelaufrufe können mehrere Vorschläge erzeugen)
- Tenant + Project Scope (RLS)
- Vorschlags-Inhalt als JSONB (entitätstyp-spezifisches Schema, Zod-validiert)
- Status: `draft` (frisch generiert) / `accepted` / `rejected` / `modified` (vom User editiert vor Accept)
- Bei Accept: Verweis auf die erzeugte Entität (`accepted_entity_type`, `accepted_entity_id`)
- Bei Reject: optionaler Begründungstext
- Modified-Tracking: ursprünglicher Inhalt bleibt im JSONB; Edit-Diff sichtbar

**ki_provenance** — Verknüpfung von akzeptierten Entitäten zu ihrer Suggestion
- (entity_type, entity_id) → ki_suggestion_id
- Genau eine Zeile pro KI-akzeptierter Entität
- Wird beim Accept-RPC atomar zusammen mit der Entität angelegt
- Filter „Nur KI-erzeugt" auf dem Risiken-Tab macht einen Left-Join über diese Tabelle
- Dasselbe Schema funktioniert später für decisions / work_items / open_items — ohne Schema-Änderung an den Entitätstabellen

**Privacy-Klassifikations-Register** — TypeScript-Modul ohne DB
- Map `{ "stakeholders.name": 3, "stakeholders.contact_email": 3, "projects.name": 2, "projects.project_type": 1, … }`
- Default für unspezifizierte Felder = 3 (sicher)
- Wird vom `classifyPayload`-Helper konsumiert; jedes ausgehende AI-Payload wird geprüft

### Tech-Entscheidungen

| Entscheidung | Warum |
|---|---|
| Vercel AI SDK (`ai` + `@ai-sdk/anthropic`) | Standard auf Vercel-Stack, Streaming + Tool-Calls eingebaut, Provider-Switch über String. PRD nennt explizit den Anthropic-Pfad. |
| Direct-Provider statt AI Gateway in MVP | PRD-Vorgabe „via Anthropic SDK"; AI Gateway bleibt eine spätere Option, sobald mehrere Modelle verglichen werden. |
| Eine `ki_provenance`-Tabelle statt Spalten an jeder Entitätstabelle | Vermeidet Schema-Änderungen an risks / decisions / work_items / open_items. Eine Provenienz-Quelle für alles. Einfacher zu erweitern, wenn eine neue Entitätsart KI-Vorschläge bekommt. |
| Klassifikation als TS-Modul, nicht als DB-Tabelle | Statische Konfiguration, deployt mit dem Code, versioniert über Git. Eine DB-Tabelle würde laufzeit-änderbar, was für eine Sicherheits-Klassifikation nicht gewollt ist. |
| Klasse-3-Block im Router (vor dem Provider-Call) | Wenn das Payload Klasse-3 enthält UND der gewählte Provider extern ist, blockt der Router noch bevor die Library lädt. Defense vor `EXTERNAL_AI_DISABLED` (PROJ-3) — beide greifen, beide werden geloggt. |
| `EXTERNAL_AI_DISABLED` (PROJ-3) wird hier konsumiert | Der Hook aus PROJ-3 ist jetzt ein echter Konsument: bei `true` werden alle externen Provider übersprungen, der Router fällt auf den lokalen Provider zurück (Stub heute, Ollama morgen). |
| Stub-Provider statt Mock | Ein echter Code-Pfad, der deterministische Fake-Vorschläge erzeugt. Ermöglicht E2E-Tests ohne Anthropic-Quota, Demos ohne API-Key, Stand-alone-Bootstrap ohne Ollama. |
| Risk-Vorschläge als erste Vertikale | Klares Schema (Titel, P, A, Mitigation), keine Append-only-Komplexität wie Decisions, keine Hierarchie wie Work-Items. Schnellster Pfad zu „KI-Akzept landet als echtes Datum". |
| Accept-Endpoint als SECURITY DEFINER RPC | Atomares Anlegen von (Risk, ki_provenance)-Paar in einer Transaktion. Audit-Reason `ki_acceptance` wird über die GUC-Konvention (PROJ-10) gesetzt. |
| Klasse-3 Block kann nicht überschrieben werden | Spec: „No bypass — even tenant admins cannot override." Keine Setting-Toggle, keine Admin-Override. UI bietet diese Option auch nicht an. |
| Server-only Lese-Pfade für Klassifikation | Das Register und die Klassifikations-Logik leben in Server-Code. Der Browser sieht nur das Resultat („dieses Payload enthält Klasse-3 → Block"), nie die Klassifikations-Tabelle selbst. |
| Audit-Reason auf akzeptierten Entitäten = `ki_acceptance` | Konsistent mit PROJ-10 (Reasons werden als String festgehalten); History-Tab und Audit-Reports filtern danach. |

### Sicherheitsdimension

**Verteidigungsschichten gegen unbeabsichtigten Class-3-Leak:**
1. `data-privacy-registry.ts` — statische Klassifikation pro Feld
2. `classifyPayload()` im Router — höchste Klasse im Payload
3. Block bei Klasse-3 + externer Provider → 403 mit `external-blocked`
4. `EXTERNAL_AI_DISABLED=true` (PROJ-3) — kein externer Provider unabhängig vom Payload
5. RLS auf `ki_runs` / `ki_suggestions` — Cross-Tenant-Lecks bleiben technisch unmöglich
6. Audit-Trail über jeden AI-Aufruf — auch der geblockte Aufruf wird gelogged

**Abuse-Vektoren, die wir blocken:**
- Tenant-Admin versucht, ein Setting zu setzen, das die Klasse-3-Sperre öffnet → existiert nicht in der UI; nicht in der Spec; keine API-Route exponiert
- User editiert einen Vorschlag und versucht, Klasse-3-Daten in den extern-routbaren Kontext zu schmuggeln → Edit-Endpoint klassifiziert den editierten Inhalt erneut, blockt bei Klasse-3
- Externer Provider liefert halluzinierte Klasse-3-Daten zurück → akzeptierter Vorschlag landet im Audit, ist nachvollziehbar, kann gelöscht werden

### Neue Code-Oberfläche

**Eine Migration:** `proj12_ki_suggestions_runs_provenance.sql` — drei Tabellen, RLS, ein SECURITY DEFINER Accept-RPC.

**API-Routen (4 neu):**
- `POST /api/projects/[id]/ki/suggest` — generiert Vorschläge für angegebenen Zweck
- `POST /api/ki/suggestions/[id]/accept` — atomar Entität anlegen + Provenance setzen
- `POST /api/ki/suggestions/[id]/reject` — Statuswechsel + optionaler Reason
- `PATCH /api/ki/suggestions/[id]` — Inline-Edit der Felder vor Accept

**Lib-Module (5 neu):**
- `lib/ai/data-privacy-registry.ts`, `lib/ai/classify.ts`, `lib/ai/router.ts`, `lib/ai/providers/{anthropic,stub,ollama}.ts`

**UI-Seiten + Komponenten:**
- `app/(app)/projects/[id]/ai-proposals/page.tsx` ersetzen
- `components/projects/ai-proposals/` — Tab-Client, Vorschlagsliste, Vorschlagskarte mit Inline-Edit, Run-Historie

**Risiken-Tab Erweiterung:**
- Filter „Nur KI-erzeugt" am bestehenden RiskTabClient
- Provenance-Badge auf Risiko-Karten
- HistoryTab zeigt `ki_acceptance`-Reason als Badge

### Abhängigkeiten

**Neue npm-Pakete:**
- `ai` (Vercel AI SDK) — Provider-agnostische Streaming-Schicht
- `@ai-sdk/anthropic` — Direct-Anthropic-Provider, nutzt `ANTHROPIC_API_KEY` env

**Neue Env-Variablen** (alle server-side, nicht NEXT_PUBLIC_):
- `ANTHROPIC_API_KEY` — Pflicht für externen Provider; falls fehlend, fällt der Router automatisch auf den Stub-Provider zurück (Stand-alone-Setup ohne externen Key bleibt funktional)
- `EXTERNAL_AI_DISABLED` (existiert aus PROJ-3) — wird jetzt konsumiert

### Out-of-Scope-Erinnerungen (aus der Spec)

- Auto-Anonymisierung von Klasse-3-Feldern
- KI-basierte rechtliche Bewertung
- Bypass-Workflow für Klasse-3
- Self-Confidence des Modells
- Fine-Tuning
- KI-generierte Kommunikation (PROJ-13)
- MCP-Bridge (PROJ-14)

### Drei offene Design-Fragen — beide Optionen zur Wahl

#### Frage 1 — Welche Vorschlagsart in dieser Iteration?

**Option A: Risks** *(in obiger Skizze gezeigt)*
- Pro: Klares, kleines Schema; PROJ-20 frisch deployed; Compliance-Wert direkt sichtbar (Risikoregister mit KI-Vorschlägen).
- Pro: Risk-Score ist DB-berechnet → der Vorschlag liefert nur P+I, der Score erscheint automatisch.
- Contra: Risiken sind ein eher niedrig-frequentierter Anwendungsfall (man legt nicht 20 Risiken pro Tag an).

**Option B: Work-Items**
- Pro: Hochfrequent — Backlog-Anlage ist der häufigste Anwendungsfall; KI-Wert sofort spürbar.
- Pro: `created_from_proposal_id` existiert schon in der work_items-Tabelle.
- Contra: Komplexeres Schema (kind, parent, sprint, story_points), Methoden-Aware-Filterung (PROJ-9), Hierarchie-Semantik. Größerer Umfang.
- Contra: Sprint/Phase-Zuordnung beim KI-Vorschlag unklar — der User muss das oft nachjustieren.

#### Frage 2 — Anthropic-Modell-Default?

**Option A: Claude Opus 4.7** (`claude-opus-4-7`)
- Pro: Bestes Ergebnis, niedrigere Halluzinationsrate, passt zur Marke „enterprise".
- Contra: 5×–8× teurer als Sonnet pro Token.

**Option B: Claude Sonnet 4.6** (`claude-sonnet-4-6`)
- Pro: Sehr gutes Preis-/Leistungsverhältnis; passt zu MVP-Volumina.
- Pro: Schneller; gute Latenz für interaktiven Review-Workflow.
- Contra: Gelegentlich schwächer bei strukturierten Outputs als Opus.

#### Frage 3 — Auto-Kontext oder User-Kontext?

**Option A: Auto-Kontext** *(in obiger Skizze gezeigt)*
- Server zieht selbst Projekttyp, Phasen, vorhandene Work-Items, Stakeholder-Rollen als Kontext.
- Pro: Niedrige Hürde — User klickt einen Button, Vorschläge erscheinen.
- Contra: Klasse-3-Felder (Stakeholder-Namen) im Kontext → Klasse-3-Block greift → externer Provider kommt nie zum Zug.

**Option B: User-Freitext-Kontext**
- User tippt einen kurzen Kontextbeschreibung („wir bereiten ein ERP-Rollout vor, Phase Spec, 3 Module").
- Pro: Klare Trennung — der User entscheidet bewusst, was er schickt; Klasse-3-Risiko deutlich niedriger.
- Pro: Spec sagt „Generation requires explicit user action; no background polling that costs tokens silently" — explizite Eingabe verstärkt das.
- Contra: Höhere Hürde.

### Festgelegte Design-Entscheidungen

**Frage 1 — Vorschlagsart: Option A (Risks).** Klares Schema, schneller Vertikal-Slice, baut auf dem frisch deployten PROJ-20 auf.

**Frage 2 — Modell-Default: Option A (Claude Opus 4.7, `claude-opus-4-7`).** Beste Qualität, niedrigste Halluzinationsrate. Der Default lässt sich per Env-Variable (`ANTHROPIC_MODEL`) ohne Code-Änderung auf Sonnet umschwenken, falls Volumen-/Kostenlage das nötig macht.

**Frage 3 — Kontext-Quelle: Option A (Auto-Kontext mit kuratierter Allowlist).** Damit der externe Provider tatsächlich zum Einsatz kommt, definiert der Auto-Context-Sammler eine **Allowlist** von Feldern, die garantiert Klasse 1–2 sind — und keine Klasse-3-Felder einbezieht. Default-Allowlist:

```
projects:    name (Klasse 2), project_type (1), project_method (1),
             lifecycle_status (1), planned_start_date (2),
             planned_end_date (2)
phases:      name (1), planned_start (2), planned_end (2), status (1)
milestones:  name (1), target_date (2), status (1)
work_items:  title (2), kind (1), status (1)        — KEINE description (kann Klasse-3-Freitext enthalten)
risks:       title (2), probability (1), impact (1) — vorhandene Risiken als Negativ-Beispiele für Generierung
```

**NICHT im Auto-Kontext:** Stakeholder (alle Felder Klasse 3), Profile-Daten, Notizen, Beschreibungstexte, Audit-Log. Wenn ein User mit diesen Daten arbeiten will, wird das in einer späteren Slice über einen explizit gewählten Kontext-Erweiterungs-Toggle abgebildet — und wird dann Klasse-3 klassifiziert und zwingend lokal geroutet.

`classifyPayload` läuft als zweite Verteidigungslinie über den fertigen Auto-Context — falls die Allowlist erweitert wird und versehentlich ein Klasse-3-Feld enthält, blockt der Router immer noch.

## Implementation Notes

### Backend (2026-04-29)

**Migration applied to project iqerihohwabyjzkpcujq:**
- `20260429160000_proj12_ki_runs_suggestions_provenance.sql` — three tables (`ki_runs`, `ki_suggestions`, `ki_provenance`) with RLS via the existing `is_project_member` / `has_project_role` / `is_tenant_admin` helpers; one SECURITY DEFINER RPC `accept_ki_suggestion_risk` that creates a risk row + provenance link + ki_acceptance audit row in one transaction.

**Key implementation choices:**
- `ki_provenance` is a separate join table (entity_type, entity_id) → suggestion. No schema churn at the entity layer; the same provenance shape will work for decisions / work_items / open_items in later slices.
- Status enum `external_blocked` is used as a *successful-but-routed-local* tag — the run delivered suggestions, but the router refused to send Class-3 / EXTERNAL_AI_DISABLED payloads to the cloud provider. Errors are `error`; clean cloud calls are `success`.
- Audit on KI acceptance: the `accept_ki_suggestion_risk` RPC writes one `audit_log_entries` row with `change_reason='ki_acceptance'`, `field_name='_record'`, and the full payload as `new_value`. HistoryTab + audit reports surface this directly.

**npm packages added:**
- `ai` (Vercel AI SDK v6) — provider-agnostic structured-output generation.
- `@ai-sdk/anthropic` — direct Claude provider, reads `ANTHROPIC_API_KEY`.

**Lib modules (8 new):**
- `lib/ai/types.ts` — shared types (RiskAutoContext, RiskSuggestion, RouterRiskResult).
- `lib/ai/data-privacy-registry.ts` — `table.column → 1|2|3` map; default-3 for unknown.
- `lib/ai/classify.ts` — `classifyRiskAutoContext()` walks the curated context and returns max class observed.
- `lib/ai/auto-context.ts` — server-side collector; explicit allowlist queries (no Class-3 fields requested).
- `lib/ai/providers/types.ts` — `AIRiskProvider` interface.
- `lib/ai/providers/stub.ts` — deterministic fake; always works without an API key.
- `lib/ai/providers/anthropic.ts` — real call via `generateObject` with a Zod schema.
- `lib/ai/providers/ollama.ts` — placeholder that throws; reserved for the later iteration.
- `lib/ai/router.ts` — picks provider, classifies, logs `ki_runs`, persists `ki_suggestions`, returns the run summary.

**API routes (5 new):**
- `POST /api/projects/[id]/ki/suggest` — generate, returns run + suggestion ids.
- `GET  /api/projects/[id]/ki/suggestions` — list with optional status filter.
- `POST /api/ki/suggestions/[id]/accept` — atomic create entity + provenance via RPC.
- `POST /api/ki/suggestions/[id]/reject` — conditional UPDATE; 409 if not draft.
- `PATCH /api/ki/suggestions/[id]` — inline edit a draft suggestion's payload.

**Frontend client wrapper:** `lib/ki/api.ts` (typed fetch around the 5 routes).

**Types module:** `src/types/ki.ts` (`KiRun`, `KiSuggestion`, `KiProvenance`, plus enums).

**Verification:**
- `npx vitest run` — **224/224 green** (was 201; +23 new: 4 registry + 5 classify + 4 router + 4 suggest route + 5 accept route + 1 misc).
- `npx tsc --noEmit` — clean.
- `npm run build` — clean; new routes appear in the route table.
- `npm run lint` — baseline 51 problems unchanged; PROJ-12 introduces zero new lint findings.

**Open follow-ups (handed to /frontend):**
- Replace `app/(app)/projects/[id]/ai-proposals/page.tsx` (currently the coming-soon card) with the real KI-Vorschläge tab: generate-button, suggestion list with inline-edit, accept/reject flow, run history.
- Add a "Nur KI-erzeugt"-filter to the existing Risiken-Tab and a "KI-erzeugt"-badge to risk cards (left-join on `ki_provenance`).
- Show the KI-acceptance reason as a badge in HistoryTab (currently the `change_reason` is recorded but not styled as a distinct chip).

### Frontend (2026-04-29)

**KI-Vorschläge tab (replaces the coming-soon page):**
- `components/projects/ai-proposals/ai-proposals-tab-client.tsx` — orchestrator with three tabs (Offen / Übernommen / Abgelehnt) + per-tab counts.
- `components/projects/ai-proposals/generate-panel.tsx` — count selector, generate button, post-run badges (classification + provider + model id), defensive `<Alert>` when `external_blocked=true` so the user knows the LLM did NOT go to the cloud.
- `components/projects/ai-proposals/suggestion-card.tsx` — per-suggestion card with score chip, accept / reject / inline-edit buttons, reject-with-reason field, and a "KI-Originalfassung anzeigen" Collapsible when the user has edited the payload.
- `components/projects/ai-proposals/suggestion-edit-form.tsx` — Zod-validated edit form mirroring the risk shape.
- `app/(app)/projects/[id]/ai-proposals/page.tsx` — replaces `<ComingSoon …/>` with `<AiProposalsTabClient …/>`.

**Risiken tab additions:**
- "Nur KI-erzeugt" Switch in the toolbar; a Set of KI-derived risk-IDs is built client-side from `listSuggestions(projectId, { status: "accepted" })` and joined with the risks list — no new backend endpoint needed.
- `RiskTable`: small "KI" badge with Sparkles icon next to the title for KI-derived risks.
- `RiskMatrix`: Sparkles icon prefix on risk markers; tooltip annotates "(aus KI-Vorschlag)".

**HistoryTab (PROJ-10) reason styling:**
- `ki_acceptance` renders as a primary-tinted Badge with an "Aus KI-Vorschlag übernommen" tooltip.
- Bonus pass while editing the helper: `decision_logged`, `decision_revised`, `open_item_converted_to_task`, `open_item_converted_to_decision` reasons now also have human labels in the badge (previously they showed the raw reason string).

**Verification:**
- `npx vitest run` → **224/224 green** (no test changes needed; the frontend is wired through existing typed clients).
- `npx tsc --noEmit` → clean.
- `npm run build` → clean; `/projects/[id]/ai-proposals` and `/projects/[id]/risiken` both compile.
- Dev-server smoke probe — both pages return HTTP 307 (auth-redirect via middleware) without compile errors; `/api/projects/[id]/ki/suggest` also reachable.
- `npm run lint` → baseline +2 instances of the established `react-hooks/set-state-in-effect` pattern (matches the existing repo baseline of 41 instances of the same rule; no new rule classes).

## QA Test Results

**Run:** 2026-04-29 · QA pass + live DB red-team + Stub-provider end-to-end against project `iqerihohwabyjzkpcujq`.

### Acceptance Criteria

#### Model routing (ST-01)
| AC | Result | Evidence |
|---|---|---|
| Single `aiRouter.invoke({ purpose, payload, classification, tenant_id })` API | ✅ | `lib/ai/router.ts#invokeRiskGeneration` |
| Routes to Anthropic for class-1/2; routes local for class-3 | ✅ | `router.test.ts` covers all four branches; live test confirmed Stub fallback when no key |
| Logs every call with timestamp/tenant/project/purpose/classification/provider/success-error | ✅ | `ki_runs` row written per call; status enum ('success' / 'error' / 'external_blocked') |
| Errors return structured envelope; UI shows friendly message | ✅ | Suggest route returns 502 with `error_message`; `GeneratePanel` toast |

#### Class-3 block (ST-02)
| AC | Result | Evidence |
|---|---|---|
| Central `classifyPayload()` returns max class | ✅ | `classify.ts#classifyRiskAutoContext` + 5 vitest cases |
| Class-3 → external rejected (no bypass) | ✅ | `router.test.ts` "logs 'external_blocked' when classification is 3"; UI Alert in `GeneratePanel` |
| Block events logged | ✅ | `ki_runs.status='external_blocked'` carries timestamp + tenant + project + actor |
| User-facing message on block | ✅ | `GeneratePanel` shows "Externes Modell wurde geblockt" Alert + toast warning |

#### Privacy classification (F12.1)
| AC | Result | Evidence |
|---|---|---|
| Field-level registry `table.column → 1\|2\|3` | ✅ | `data-privacy-registry.ts`; 50+ entries |
| Default = 3 for unspecified | ✅ | `data-privacy-registry.test.ts` covers fallback |
| Initial classifications match V2 table | ✅ | projects.name=2, project_type=1, lifecycle=1, profiles.email=3, stakeholders.name/email=3 — all verified in unit tests |
| GDPR delete concept documented | ⏳ | Documented as a paragraph in this spec; deferred export endpoint per spec to PROJ-17 |
| DSGVO export endpoint deferred | ✅ | Per spec, delivered by PROJ-17 |

#### Proposal generation (ST-03)
| AC | Result | Evidence |
|---|---|---|
| `POST /api/projects/[id]/ki/suggest` triggers proposal run | ✅ | Route handler + 4 vitest cases |
| Proposals stored in `ki_suggestions` with full provenance | ✅ | DB schema + live test |
| Method-aware kinds | ⚠️ | Risks aren't method-gated (every project type has them). Method-aware filtering kicks in for work_items in a later slice — flag I1. |
| Proposals do NOT mutate active project objects | ✅ | Suggestions live in their own table; only the accept-RPC writes to the entity layer |
| Generation requires explicit user action | ✅ | No background polling; only `/ki/suggest` POST triggers a run |

#### Review + approve flow (ST-04)
| AC | Result | Evidence |
|---|---|---|
| UI tab "KI Vorschläge" with pending proposals | ✅ | `app/(app)/projects/[id]/ai-proposals/page.tsx` |
| Per proposal: Accept / Reject / Edit | ✅ | `SuggestionCard` |
| Acceptance creates entity with `change_reason='ki_acceptance'` and link back | ✅ | Live verified: 1 audit row, full payload in `new_value` |
| Rejection logs reason (optional) | ✅ | `rejectSuggestion(reason)` |
| No mass-acceptance | ✅ | UI exposes only single accept |
| No automatic acceptance by rules | ✅ | No auto path in code |

#### Traceability (F12.2)
| AC | Result | Evidence |
|---|---|---|
| Every AI-generated record carries metadata | ✅ | `ki_provenance` row + `ki_suggestions.ki_run_id` + `ki_runs.model_id`; `was_modified` flag |
| Detail view shows the metadata badge | ✅ | RiskTable + RiskMatrix render Sparkles+KI badge for KI-derived risks |
| Filter "AI-derived only" | ✅ | "Nur KI-erzeugt" Switch in RiskTabClient |
| Exportable AI-event log | ⏳ | `ki_runs` rows are visible to project members via the existing audit/runs SELECT path; a dedicated export view is a follow-up — flag L1 |

#### Per-tenant model selection (F10.2)
| AC | Result | Evidence |
|---|---|---|
| `tenant_settings.ai_provider_config` JSONB | ⏳ Deferred (PROJ-17) | Per locked design |
| Admin UI in PROJ-17 | ⏳ | Per locked design |
| Class-3 hard block applies regardless of config | ✅ | Router checks classification + `EXTERNAL_AI_DISABLED` independently |

#### Compliance hints (F12.3)
| AC | Result | Evidence |
|---|---|---|
| `compliance_hints` catalog | ⏳ Deferred | Own slice |
| Recommendations not blockers | ⏳ | Own slice |
| Acknowledge button | ⏳ | Own slice |

#### KI-driven wizard alternative (F2.1b)
| AC | Result | Evidence |
|---|---|---|
| Optional toggle on wizard entry | ⏳ Deferred | Per locked design (PROJ-5 already deployed; hooking adds risk) |
| Free-text dialog → wizard Review step | ⏳ | Own slice |
| Class-3 input blocked from external | ⏳ | Own slice (router already enforces this rule) |

### Edge Cases

| Case | Spec | Result |
|---|---|---|
| Tenant admin tries to disable class-3 block | impossible by design | ✅ No setting exposes it |
| Stand-alone with no external AI | `external_provider='none'`, all calls local | ✅ `EXTERNAL_AI_DISABLED=true` honored; router routes local; `ANTHROPIC_API_KEY` absent → Stub fallback |
| Proposal accepted on changed-method project | row created, hidden by method visibility | ⚠️ Untested explicitly. Risks aren't method-gated so the case doesn't apply for the MVP slice. Re-verify when work_item suggestions ship. |
| Proposal rejected, user wants to undo | re-run is the path; no un-reject | ✅ Reject is terminal; no "un-reject" button in UI |
| AI run timeout | error returned; no partial proposals | ✅ Provider errors caught in router → ki_runs.status='error', no suggestions persisted |
| Cost limit per tenant | block + clear error (deferred PROJ-17) | ⏳ Deferred per spec |
| Ollama base URL unreachable | graceful fail | ✅ Provider throws "not implemented"; router falls back to Stub for local |
| User edits proposal then accepts | metadata says modified | ✅ `is_modified` flips true; `was_modified` carried into provenance; `original_payload` stays for diff in UI |

### Security Audit (red team)

| Check | Result |
|---|---|
| Cross-tenant SELECT on ki_runs / ki_suggestions / ki_provenance | ✅ Non-member counts are 0 across all three tables for another tenant's project |
| Direct INSERT into ki_provenance by user | ✅ Blocked — no INSERT policy on the table; insertion only via `accept_ki_suggestion_risk` SECURITY DEFINER RPC |
| Direct INSERT into audit_log_entries (PROJ-10 carryover) | ✅ Still blocked — only SELECT policy |
| Class-3 payload routed externally | ✅ Router escalates to local provider; tested live + unit |
| ANTHROPIC_API_KEY absent → router fails closed? | ✅ Falls back to Stub; tests cover; no silent error |
| Convert RPC `accept_ki_suggestion_risk` requires editor+ | ✅ Internal `has_project_role / is_project_lead / is_tenant_admin` check |
| Tampering with `ki_suggestions` to bypass single-accept invariant | ❌ **H2** — see Bug Audit |
| `ki_runs` UPDATE for final status / tokens / error | ❌ **H1** — see Bug Audit |
| Information leak via accept-RPC ordering (state-before-auth) | ⚠️ **L1** — see Bug Audit |
| `classifyPayload` defense-in-depth on auto-context allowlist | ✅ Confirmed — adding a Class-3 field to the auto-context shape forces local routing |
| SQL injection via dynamic SQL in convert/accept RPCs | ✅ All values are `$1`/`$2` placeholders; no `format()` with raw text |
| XSS via suggestion title / mitigation in JSX | ✅ React auto-escapes; no `dangerouslySetInnerHTML` |

### Regression check

| Area | Result |
|---|---|
| `npx vitest run` 224/224 (201 prior + 23 PROJ-12) | ✅ |
| `npx tsc --noEmit` | ✅ |
| `npm run build` | ✅; `/projects/[id]/ai-proposals` and `/projects/[id]/risiken` both compiled |
| `npm run lint` | ✅ +2 instances of established `react-hooks/set-state-in-effect` pattern; no new rule classes |
| PROJ-3 `isExternalAIBlocked()` consumer wired | ✅ Router uses it; covered by `router.test.ts` |
| PROJ-10 HistoryTab reasons rendering | ✅ `ki_acceptance` styled distinctly; existing `undo`/`restore_from_*` reasons unchanged |
| PROJ-20 risks / decisions / open_items unaffected | ✅ PROJ-12 migration only ADDS three tables + one RPC; no schema changes to existing entities |
| Dev server smoke probe (Turbopack) | ✅ `/projects/[id]/ai-proposals`, `/projects/[id]/risiken`, `/api/projects/[id]/ki/suggest` all return 307 (auth-redirect) without compile errors |

### Bug Audit

| Severity | ID | Description | Fix complexity |
|---|---|---|---|
| **High** | H1 | **`ki_runs` UPDATE silently fails under RLS.** The router optimistically inserts a run row with `status='success'`, then UPDATEs with the final status (success/error/external_blocked) + tokens + latency + error_message. The migration creates SELECT and INSERT policies but **no UPDATE policy** — RLS denies UPDATE without raising an error, so the row stays at the optimistic 'success' even when the provider erred or the call was external-blocked. Result: telemetry is wrong, error trail is empty, audit shows 'success' for failures. Verified live: a user-context UPDATE to `status='external_blocked', input_tokens=120, output_tokens=210, latency_ms=850` was silently dropped. | Low — add an UPDATE policy on `ki_runs` for editor+, with the same `using` and `with check` predicates as INSERT. |
| **High** | H2 | **`ki_suggestions` status is mutable from terminal states.** A project editor can directly UPDATE `status='accepted'` → `'draft'`, clear `accepted_entity_*` and `accepted_at`, and the suggestion is re-armed for another accept call — producing a SECOND risk row from the same suggestion (verified live: ran `accept_ki_suggestion_risk` twice on the same suggestion, got two distinct risk_ids; ki_provenance ended up with two rows pointing at different risks while `ki_suggestions.accepted_entity_id` was overwritten by the second accept). Same root cause as PROJ-20 H1: RLS UPDATE policy is too permissive, no DB-level state-machine enforcement. The spec contract "no mass-acceptance / no automatic acceptance" is bypassable via direct DB. | Low — BEFORE-UPDATE trigger on `ki_suggestions` that pins terminal states (`accepted`, `rejected` are sealed) and only allows draft → accepted/rejected/edit. Mirrors the `enforce_decision_immutability()` pattern from PROJ-20. Consider also UNIQUE on `ki_provenance.ki_suggestion_id` as a belt-and-suspenders. |
| Low | L1 | **Accept-RPC checks state before authorization.** A non-member calling `accept_ki_suggestion_risk(<known UUID>)` learns whether the suggestion exists and is in a terminal state via the `suggestion_not_draft` return. Cross-tenant UUIDs aren't enumerable, so the practical leak is bounded — but the cleaner pattern is auth-before-state. | Low — reorder the RPC: check `has_project_role(...)` first; return `forbidden` regardless of state. Apply same fix to `convert_open_item_to_*` RPCs from PROJ-20 if affected (verified separately). |
| Low | L2 | **AI-event-log export view not built.** Spec mentions "Exportable AI-event log (per PROJ-10 audit + a dedicated view)." `ki_runs` rows are queryable via the existing SELECT path but no `/api/ki/runs/export` endpoint exists. Project members can derive it from raw queries; admins use the existing audit export for `ki_acceptance` reasons. | Low — small follow-up endpoint, can ship in the next AI slice. |
| Info | I1 | **Method-aware filtering for proposals not exercised.** Spec says proposals should be "method-aware (only kinds visible for the project's method are proposed)". Risks aren't method-gated so the AC doesn't apply to the MVP slice. Re-verify when work-item suggestions ship. | — |
| Info | I2 | **Per-tenant model selection deferred.** Per locked design, owned by PROJ-17. Class-3 hard block already applies regardless. | — |
| Info | I3 | **Compliance hints catalog deferred.** Per locked design, separate slice. | — |
| Info | I4 | **KI-driven wizard alternative deferred.** Per locked design, separate slice. | — |
| Info | I5 | **No E2E tests for the KI-Vorschläge tab.** Project-wide gap (no Playwright tests anywhere yet). Backend rigour achieved via direct DB red-team probes; UI rigour is type-check + build + dev-server compile probe. | — |

### Production-Ready Decision

**NOT READY.**

H1 + H2 share a structural pattern with PROJ-20's H1/M1 (RLS UPDATE policies too permissive over state-machine tables). They're independent here, but the same fix shape (BEFORE-UPDATE state-machine trigger + targeted UPDATE policy) closes both.

H1 is silent: telemetry is wrong but no user-visible failure. H2 is silent until a malicious or curious editor pokes at the DB directly via the Supabase JS client — at which point one suggestion can spawn N duplicate risks with broken provenance.

L1 is a small reorder in the SECURITY DEFINER RPCs, harmless on its own but worth shipping with the H-fixes.

**Recommended next step:** `/backend` to:
1. Add `ki_runs` UPDATE policy (closes H1).
2. Add `enforce_ki_suggestion_immutability()` BEFORE-UPDATE trigger that pins `status` to `draft → accepted | rejected` (closes H2).
3. Add UNIQUE on `ki_provenance.ki_suggestion_id` (defense in depth on H2).
4. Reorder `accept_ki_suggestion_risk` to check authorization first (closes L1).

Then re-run `/qa`.

### Suggested follow-ups (not blockers)
1. L2 — small `/api/ki/runs/export` endpoint when the audit-export workflow needs structured AI telemetry.
2. I1–I5 — deferred per locked design or project-wide.
3. Add Playwright E2E for the KI flow once the test infra exists.

## Deployment
_To be added by /deploy_
