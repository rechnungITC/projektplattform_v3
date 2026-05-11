# PROJ-44: Context Ingestion Pipeline

## Status: In Progress (α docs + β-foundation table/API live; γ/δ/ε deferred)
**Created:** 2026-05-06
**Last Updated:** 2026-05-11

## Kontext

Das PRD verspricht: "AI, die Emails, Meeting-Notizen und Dokumente vor-analysiert und strukturierte Projekt-Items vorschlägt — immer reviewable, never opaque." PROJ-12 (AI-Router) liefert die Provider-Auswahl und Class-3-Härtung; PROJ-44 ist die fehlende Eingabe-Schicht davor: ein Pipeline-Stub, in den Nutzer Dokumente/Emails/Meeting-Notizen einreichen können, der die Inputs klassifiziert (Privacy-Klasse, Quelle, Sprache), persistiert und als Proposal-Kandidaten in eine Queue legt.

## Review-/Architektur-Anknüpfungen

- `docs/decisions/v3-ai-proposal-architecture.md` — alle AI-Outputs müssen reviewable, traceable und akzeptierbar sein.
- `docs/decisions/data-privacy-classification.md` — Class-3-Inputs (personenbezogene Daten) müssen technisch vom externen LLM-Pfad ausgeschlossen werden.
- PROJ-12 — AI-Router liefert Provider-Routing pro Tenant + Purpose (Class-3 → lokaler Pfad).
- PROJ-30 — `narrative`-Purpose-Erweiterung als Vorbild für eine neue `proposal_from_context`-Purpose.

## Dependencies

- **Requires:** PROJ-1 Authentication, Tenants, RBAC.
- **Requires:** PROJ-12 KI Assistance & Privacy Paths.
- **Recommended after:** PROJ-55 Tenant-Kontext-Hardening (Cookie-Resolver wird in jeder Ingestion-Route gebraucht).
- **Feeds:** PROJ-30 narrative purpose · zukünftige `proposal_from_context` purpose · PROJ-58 Graph-Recommendations.

## MVP-Schnitt

Reine Persistenz + Klassifizierung. KEIN automatisches AI-Processing in dieser Slice. Die Slice liefert die Daten, auf die spätere AI-Slices aufsetzen.

**Knotenobjekt: `context_source`**

Felder (minimal):

- `id`, `tenant_id`, `project_id` (nullable — tenant-wide Quellen zulässig)
- `kind`: `'document' | 'email' | 'meeting_notes' | 'transcript' | 'other'`
- `title`, `content_excerpt` (capped 8k chars für Speicher-Sanity), `content_full_url` (optional Storage-Pointer)
- `source_metadata` JSONB (z. B. Email-Absender, Meeting-Teilnehmer, Original-Dateiname)
- `language`: `'de' | 'en' | null` (autodetected later)
- `privacy_class`: 1/2/3 (per Klassifizierungs-Regeln aus `data-privacy-classification.md`)
- `created_by`, `created_at`, `updated_at`
- `processing_status`: `'pending' | 'processing' | 'classified' | 'failed' | 'archived'` (default `pending`)
- `last_processed_at`, `last_failure_reason`

## Slice-Struktur

| Slice | Inhalt | Schema-Change | Status |
|---|---|---|---|
| **44-alpha** | Spec docs + privacy-class registry alignment | Nein | Live (2026-05-11) |
| **44-beta** | `context_sources` table + RLS + POST/GET API | Ja, neue Tabelle | Live (2026-05-11) |
| **44-gamma** | Auto-Privacy-Klassifikator (Regex/Wörterbuch) + tone metadata | Nein | Deferred |
| **44-delta** | AI Proposal Queue (`proposal_from_context` purpose im Router) | Nein | Deferred |
| **44-epsilon** | UI: Upload, Liste, Proposal-Review-Drawer | Nein | Deferred |

## Implementation Notes

### 2026-05-11 — Foundation slice (α docs + β data/API)

**44-α — Spec docs**

- Diese Datei. Die spec-Datei existierte bisher nur als Verweis in `features/INDEX.md`, ohne Inhalt auf Platte. PROJ-44-α legt sie an und stellt den MVP-Schnitt klar.

**44-β — Tabelle + API**

- Neue Migration `20260511150000_proj44b_context_sources.sql` (live über Supabase MCP applied; Datei mirror committed).
- Tabelle `context_sources` mit `tenant_id NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`, `project_id nullable` FK auf `projects`, Kind/Privacy-Class Enums, `processing_status` Enum, Tracked-Audit-Columns über `_tracked_audit_columns('context_sources')`.
- RLS: tenant-member SELECT, tenant-member INSERT (mit Tenant-Validation gegen `is_tenant_member(tenant_id)`), tenant-admin UPDATE/DELETE.
- Indizes: `(tenant_id, project_id, created_at DESC)` für die Listenroute, `processing_status` für künftige Worker-Polls.
- 2 API-Routen unter `src/app/api/context-sources/`:
  - `GET /api/context-sources` — listet Sources im aktiven Tenant; optional `project_id`-Filter.
  - `POST /api/context-sources` — registriert eine neue Source (Metadaten + Auszug). Class-3-Pflichtfeld validiert.

### Deferred (γ + δ + ε)

- **γ — Privacy-Klassifikator:** regelbasierte Erkennung (Personennamen, Telefonnummern, IBANs) bestimmt `privacy_class` automatisch beim INSERT. Out-of-scope für Foundation; UI macht heute den Default-3-Vorschlag.
- **δ — Proposal Queue:** Erweiterung des AI-Routers (`src/lib/ai/router.ts`) um `proposal_from_context`-Purpose, die einen Context-Source als Input nimmt und Proposals in `ai_proposals` schreibt.
- **ε — UI:** Upload-Drawer in `/stammdaten/context-sources` (oder Project-Room) + Proposal-Review-Liste, die auf PROJ-12 Reviewer-Pattern aufbaut.

Jede Deferral-Slice ist additiv und braucht **keine** Schema-Änderung mehr — die Foundation-Tabelle deckt das End-State-Modell ab.

## QA Test Results

- 2 API-Route-Smokes (auth-gate, validation).
- 1 Playwright unauth smoke.
- Live MCP verification: Tabelle existiert, RLS-Policies aktiv.
- Vitest weiterhin grün.

## Deployment

- **Date deployed:** 2026-05-11
- **Production URL:** https://projektplattform-v3.vercel.app
- **DB migration:** `20260511150000_proj44b_context_sources.sql` (live via Supabase MCP; file mirror committed).
- **Rollback plan:** `git revert` des Batch-7-Commits. Migration ist forward-only — Tabelle bleibt nach Revert leer in der DB; manuelles `DROP TABLE context_sources` nur nötig wenn der Pilot-Tenant keine echten Rows mehr enthält.
