# PROJ-33: Erweitertes Stakeholder-Management — Stammdaten + Skill/Persönlichkeit + Self-Assessment

## Status: Planned
**Created:** 2026-05-02
**Last Updated:** 2026-05-02

> ⚠️ **Scope-Warning:** Diese Spec deckt 4 fachlich zusammenhängende, technisch aber unabhängig deploybare Blöcke (A bis D, siehe Acceptance Criteria). Das Spec-Volumen liegt bei ~7-8 Personentagen Implementation. Für `/architecture` und `/backend` empfohlen wird **internes Phasing** der Migrationen + Feature-Flags pro Block, sodass jede Phase getrennt QA + Deploy hat. CIA-Review zwingend bei `/architecture` (touched: PROJ-8, PROJ-13, PROJ-31; introduces: catalog-Pattern, Big5-Methodik, Magic-Link-Flow #2).

## Summary

Erweitert die deployed PROJ-8 Stakeholders um qualitative Steuerungs-Felder (Begründung, Stakeholder-Typ, Management-Ebene, Haltung, Konflikt-Potenzial usw.), führt Skill-Profile (5 fachliche Dimensionen) und Persönlichkeitsprofile (Big5/OCEAN, public domain) als Radar-Charts ein, und erlaubt externen Stakeholdern via Magic-Link ein Self-Assessment. Self-Assessment + PM-Fremdbewertung werden in derselben Radar-Visualisierung übereinandergelegt — der PM sieht Wahrnehmungs-Differenzen sofort.

Drei wesentliche Architektur-Entscheidungen aus /requirements:
- **Big5 (OCEAN)** statt DISG (public domain, keine Lizenz-Risiken)
- **Stakeholder-Typ-Catalog** ist tenant-erweiterbar (analog PROJ-6 Catalog-Pattern)
- **Self-Assessment** läuft via signed Magic-Link wie PROJ-31 Approval-Page (kein Plattform-Account für externe Stakeholder erforderlich)

## Dependencies
- **Requires:**
  - **PROJ-8** (Stakeholders, deployed) — erweitert die `stakeholders`-Tabelle um qualitative Felder + neue Beziehungen.
  - **PROJ-13** (Communication Center, deployed) — Magic-Link-Mails für Self-Assessment-Invites via existierender Outbox.
  - **PROJ-31** (Approval-Gates, deployed) — wiederverwendet HMAC-Token-Pattern (`approval-token.ts`) und Public-Page-Architektur (`/approve/[token]` analog `/self-assessment/[token]`).
  - **PROJ-1** (Auth/Tenants/RLS, deployed) — Multi-Tenant + RLS-Helpers + Tenant-Admin-Role für Catalog-Verwaltung.
- **Influences:**
  - **PROJ-34** (Stakeholder Communication-Tracking, geplant) — nutzt `attitude`/`conflict_potential`/`communication_need`-Felder als Sentiment-Anker.
  - **PROJ-35** (Critical-Path-Indikator, geplant) — kombiniert `influence × conflict_potential` mit Work-Item-Assignments.
  - **PROJ-36** (KI-Coaching-Purpose, geplant) — Persönlichkeitsprofil ist Eingabe für Tonalitäts-Matching der KI-Drafts. Braucht PROJ-32 Multi-Provider zwingend wegen Class-3-Routing.

## V2 Reference Material

- V2 hatte kein vergleichbares Stakeholder-Erweiterungsmodul. Die Anregung kommt aus dem Manus-AI-Material in `docs/Stakeholderwissen/` (Domain-Knowledge, kein V3-PROJ-X-vorgängig).
- V2-ADR `stakeholder-vs-user.md` (in V3 unter `docs/decisions/`) — Stakeholder ≠ User-Invariante bleibt absolut. Self-Assessment-Stakeholder bekommt **keinen** automatischen Plattform-Account. Magic-Link ist tokenbasiert, kein RLS-Identitätspunkt.

## User Stories

### US-1 — Projektmanager: qualitative Stakeholder-Bewertung
**Als** Projektmanager
**möchte ich** Stakeholder über die Basis-Stammdaten hinaus qualitativ einordnen — Begründung des Einflusses, Stakeholder-Typ (Promotor/Kritiker/...), Management-Ebene, Entscheidungsbefugnis, Haltung, Konflikt-Potenzial, Kommunikationsbedarf, bevorzugter Kanal —
**damit** ich nicht nur das "wer" sondern auch das "warum" und "wie ansprechen" dokumentiere und an spätere KI-Empfehlungen weitergebe.

### US-2 — Tenant-Admin: Stakeholder-Typen erweitern
**Als** Tenant-Admin
**möchte ich** das Default-Set der Stakeholder-Typen (Promotor/Supporter/Kritiker/Blockierer) um eigene Werte ergänzen können (z.B. "Champion", "Schweiger", "Fence-sitter")
**damit** unsere unternehmensspezifische Stakeholder-Sprache abbildbar ist.

### US-3 — Projektmanager: Skill-Profil radar-visualisieren
**Als** Projektmanager
**möchte ich** für jeden relevanten Stakeholder ein Skill-Profil mit 5 fachlichen Dimensionen (Domänenwissen / Methodenkompetenz / IT-Affinität / Verhandlungsgeschick / Entscheidungskraft) als Radar-Diagramm pflegen
**damit** ich Stakeholder gezielt für Aufgaben einsetzen kann (z.B. "wer hat genug IT-Affinität für die Migrations-Sessions").

### US-4 — Projektmanager: Persönlichkeitsprofil Big5 (OCEAN)
**Als** Projektmanager
**möchte ich** ein Persönlichkeitsprofil mit den 5 OCEAN-Dimensionen (Openness / Conscientiousness / Extraversion / Agreeableness / Emotional Stability) erfassen
**damit** spätere KI-Drafts (PROJ-36) den Kommunikations-Stil an die Person anpassen können (analytischer Text für hohe Conscientiousness, kürzer für niedrige Agreeableness, etc.).

### US-5 — Externer Stakeholder: Self-Assessment via Magic-Link
**Als** externer Stakeholder ohne Plattform-Account
**möchte ich** einen Email-Link bekommen, mit dem ich mein eigenes Skill- + Persönlichkeitsprofil ohne Login ausfüllen kann
**damit** der PM eine Selbsteinschätzung neben seiner Fremdeinschätzung hat.

### US-6 — Self vs Fremd Vergleich
**Als** Projektmanager
**möchte ich** im Stakeholder-Detail beide Profile (Self + Fremd) im selben Radar-Chart als zwei überlappende Polygone sehen
**damit** ich Wahrnehmungs-Differenzen erkenne (z.B. Stakeholder schätzt sich als "hohe IT-Affinität", PM bewertet "niedrig" → Trainingsbedarf oder Gesprächsbedarf).

### US-7 — Tenant-Admin: Self-Assessment-Invite revoken
**Als** Tenant-Admin oder PM
**möchte ich** ein bereits versendetes Self-Assessment-Invite zurückziehen können
**damit** wenn ein Stakeholder das Projekt verlässt, sein offener Token nicht weiter gültig ist.

### US-8 — Audit-Trail Stakeholder-Profile
**Als** Auditor
**möchte ich** sehen, wer wann welche Profil-Werte (Skill / Persönlichkeit / qualitative Felder) gesetzt hat
**damit** Stakeholder-Bewertungen nicht heimlich "geschönt" werden können (insbesondere `attitude` und `conflict_potential` sind sensibel).

## Acceptance Criteria

### Block A — Qualitative Stakeholder-Felder

- [ ] `stakeholders` erweitert um: `reasoning` (text, max 5000), `stakeholder_type_key` (text, FK-style auf Catalog), `management_level` (enum: top, upper, middle, lower, operational), `decision_authority` (enum: none, advisory, recommending, deciding), `attitude` (enum: supportive, neutral, critical, blocking), `conflict_potential` (text, reuses low/medium/high/critical scale), `communication_need` (enum: low, normal, high, critical), `preferred_channel` (enum: meeting, email, chat, report, dashboard).
- [ ] Alle neuen Felder sind **nullable** und haben sinnvolle Defaults für Backfill. Bestehende deployed Stakeholders bleiben unbeschadet (`attitude=neutral`, `decision_authority=none`, etc.).
- [ ] Stakeholder-Form (UI) zeigt diese Felder in einer eigenen Sektion "Qualitative Bewertung" — eingeklappt by default, damit das Formular nicht überfüllt wirkt.
- [ ] Stakeholder-Liste / Matrix-Ansichten zeigen `attitude` als farb-codiertes Icon (grün/gelb/rot/dunkelrot).

### Block B — Stakeholder-Typ-Catalog (tenant-erweiterbar)

- [ ] Neue Tabelle `stakeholder_type_catalog (id, tenant_id NULL=global, key, label_de, label_en, color, display_order, is_active, created_at)`.
- [ ] Default-Seeds: 4 globale Einträge (`tenant_id=NULL`) mit keys `promoter`, `supporter`, `critic`, `blocker`. Farben + Labels gepflegt.
- [ ] Tenant-Admin-UI in `/stammdaten/stakeholder-types` (oder Tab in Stammdaten): listet globale (read-only) + tenant-eigene (CRUD).
- [ ] `stakeholders.stakeholder_type_key` lookup-validiert beim Insert/Update gegen `(tenant_id IS NULL OR tenant_id = stakeholder.tenant_id)` UND `is_active = true`.
- [ ] RLS auf `stakeholder_type_catalog`: globale Einträge SELECT für alle (`is_tenant_member` OR `tenant_id IS NULL`), CRUD nur Tenant-Admin (`is_tenant_admin(tenant_id)`).

### Block C — Skill-Profil + Persönlichkeitsprofil (Big5 OCEAN)

- [ ] Neue Tabelle `stakeholder_skill_profiles (stakeholder_id PK, tenant_id, domain_knowledge int 0-100, method_competence int 0-100, it_affinity int 0-100, negotiation_skill int 0-100, decision_power int 0-100, self_assessed_at, self_*-Versionen für jede Dimension nullable, fremd_assessed_by, fremd_assessed_at, created_at, updated_at)`.
- [ ] Neue Tabelle `stakeholder_personality_profiles` analog mit 5 Big5-Dimensionen: `openness, conscientiousness, extraversion, agreeableness, emotional_stability` (alle 0-100).
- [ ] **Sprachregelung:** "Emotional Stability" statt Neuroticism (positives Framing für Business-Kontext, gleicher Wert invertiert).
- [ ] Wird **nicht** als DISG bezeichnet — kein Trademark-/Lizenz-Risiko. UI-Kopfzeile: "Persönlichkeitsprofil (Big5/OCEAN)".
- [ ] RLS: `is_tenant_member(tenant_id)` für SELECT. Edit-Rolle (project-editor, project-lead, tenant-admin) für UPSERT.

### Block D — Self-Assessment Magic-Link

- [ ] Neue Tabelle `stakeholder_self_assessment_invites (id, tenant_id, stakeholder_id, magic_link_token UNIQUE, magic_link_expires_at, status: pending|completed|expired|revoked, submitted_at, submitted_payload jsonb, created_by, created_at)`.
- [ ] PM kann pro Stakeholder einen Self-Assessment-Invite generieren (Button in Stakeholder-Detail). Token wird HMAC-SHA256 signiert (Server-Secret reuse von PROJ-31 `APPROVAL_TOKEN_SECRET`).
- [ ] Invite-Mail via PROJ-13 Outbox mit dedizierter `buildSelfAssessmentOutboxRow`-Funktion (analog `buildApprovalOutboxRow` Pattern). Mail enthält **keine** PII, nur Stakeholder-Vorname (sanitized) + Magic-Link.
- [ ] Public Route `/self-assessment/[token]` (kein Auth, server-rendered via VERCEL_URL-fallback). PUBLIC_ROUTES in middleware erweitert um `/self-assessment` und `/api/self-assessment`.
- [ ] Self-Assessment-Form rendert 5 Skill-Slider + 5 Big5-Slider, alle 0-100. Submit ist idempotent (zweiter Klick → "Bereits abgegeben").
- [ ] Token-Lebensdauer 14 Tage (länger als PROJ-31 weil Self-Assessment weniger zeitkritisch). Nach Submit → status='completed', payload persistiert.
- [ ] PM kann Invite revoken (status='revoked'), invalider Token gibt "Invite zurückgezogen" Page.

### Block E — Radar-Visualisierung (Self vs Fremd)

- [ ] Stakeholder-Detail-Page bekommt einen "Profil"-Tab.
- [ ] Tab zeigt 2 Radar-Charts: links Skill (5 Dimensionen), rechts Big5 (5 Dimensionen).
- [ ] Wenn Self-Assessment vorhanden: zwei überlappende Polygone (Fremd: solid, Self: dashed) mit unterschiedlichen Farben + Legend.
- [ ] Bei Differenz > 30% in einer Dimension: visueller Highlight (z.B. Stern oder Tooltip "Wahrnehmungs-Differenz: 45%").
- [ ] Alleinstehender Skill- + Personality-Edit-Modus für PM (Sliders ohne Self-Werte beeinflusst, Self-Werte nur read-only sichtbar).

### Block F — Audit + RBAC

- [ ] Alle CHANGES auf `stakeholders` (qualitative Felder) gehen durch das existing PROJ-10 Field-Audit-Pattern. Neue Felder ins `audit_tracked_columns`-Set aufnehmen.
- [ ] Skill + Personality Tables haben eigenen Audit-Pattern: `stakeholder_profile_audit_events` (append-only, analog PROJ-31 Audit-Trail) ODER existing PROJ-10 erweitern.
- [ ] Self-Assessment-Submit logged einen Audit-Event mit actor_stakeholder_id (stakeholder als Akteur, nicht User).
- [ ] PII-Schutz: Self-Assessment-Invite-Mail enthält keine Decision-/Projekt-Bodies, keine personenbezogenen Daten anderer Stakeholder. Nur Stakeholder-Vorname + Token-Link.

### Block G — Migration + Backfill

- [ ] Eine Migration legt alle 3 neuen Tabellen + 8 neue Spalten an.
- [ ] Backfill ist trivial: alle neuen Spalten nullable mit sicheren Defaults (`attitude=neutral` ist konservativste Annahme).
- [ ] Migration ist idempotent — `IF NOT EXISTS`-Pattern + `ADD COLUMN IF NOT EXISTS`.

## Edge Cases

### EC-1 — Stakeholder-Type löscht Tenant-Admin, ist aber noch von Stakeholdern referenziert
Tenant-Admin setzt `is_active=false` für einen Custom-Type, der noch verwendet wird. **Verhalten:** Soft-Delete via `is_active=false`; bestehende Stakeholders behalten den Key (read-only zeigt "Type X (deaktiviert)"); neue Stakeholders können den Type nicht mehr auswählen.

### EC-2 — Self-Assessment-Magic-Link nach Stakeholder-Deletion
Stakeholder wird gelöscht, während Self-Assessment-Invite offen ist. **Verhalten:** ON DELETE CASCADE → Invite wird mit-gelöscht. Token-Klick zeigt "Stakeholder nicht mehr im Projekt".

### EC-3 — Self-Assessment-Submit nach Token-Ablauf
Stakeholder klickt Link nach 14 Tagen. **Verhalten:** Token-Validierung schlägt fehl (analog PROJ-31 EC-4); Page zeigt "Link abgelaufen — bitte PM kontaktieren". PM kann neuen Invite generieren.

### EC-4 — Big5-Werte plausibel?
PM oder Stakeholder setzt extreme Werte (z.B. alles 0% oder alles 100%). **Verhalten:** keine Plausibilitätsprüfung — Werte sind subjektiv, das System urteilt nicht. UI kann optional Warnung "Sehr extremes Profil" anzeigen, aber kein Submit-Block.

### EC-5 — Self vs Fremd-Wert komplett gegensätzlich
PM bewertet Stakeholder mit Conscientiousness=20, Self-Assessment liefert 90. **Verhalten:** beide Werte gespeichert, UI highlightet die Differenz. Keine "Wahrheit" festgelegt — beides bleibt sichtbar.

### EC-6 — Stakeholder ist Plattform-User (linked_user_id gesetzt) UND macht Self-Assessment
Interner Stakeholder mit Plattform-Account klickt Magic-Link aus Versehen. **Verhalten:** Magic-Link-Page funktioniert normal (Token ist die Auth, nicht der Account). Submit-Logik gleich. Optional: Hinweis "Sie haben einen Plattform-Account — Sie können Self-Assessment auch direkt im UI machen."

### EC-7 — Migration trifft auf große bestehende stakeholders-Tabelle
Tenant hat 5000 Stakeholders. **Verhalten:** ADD COLUMN mit nullable + default = O(1)-Operation in PostgreSQL, kein full-table-lock. Migration läuft in Sekunden.

### EC-8 — Tenant-Type "Champion" mit gleichem Key wie globalem "champion" eines anderen Tenants
**Verhalten:** UNIQUE constraint auf `(tenant_id, key)` erlaubt das. Tenant A's "champion" und Tenant B's "champion" kollidieren nicht.

### EC-9 — Magic-Link-Versand schlägt fehl (Mail-Provider down)
**Verhalten:** Outbox-Insert ist non-fatal (Pattern aus PROJ-31 reused). Status = 'pending' bleibt. PM kann Invite manuell mit Token-Link teilen oder Mail später re-triggern.

### EC-10 — Self-Assessment beantwortet aber payload corrupt
Token-Validierung OK, aber JSON-Body fehlschlägt Zod-Schema. **Verhalten:** API gibt 400 zurück. UI zeigt "Daten konnten nicht gespeichert werden — bitte erneut versuchen". Token bleibt gültig (status=pending), kein silent-fail.

## Out of Scope (PROJ-34/35/36-Kandidaten)

- ❌ **Kommunikations-Tracking** (Tonalität / Kooperationsbereitschaft / Reaktionszeit pro Interaktion) — eigene PROJ-34-Spec.
- ❌ **Kritischer-Pfad-Indikator** mit dynamischer Risiko-Berechnung aus Matrix × Kommunikation — PROJ-35.
- ❌ **KI-Coaching** (Handlungsempfehlungen, persönlichkeitsangepasste Drafts, Eskalationsstrategien) — PROJ-36, braucht PROJ-32 Multi-Provider zwingend.
- ❌ **Stakeholder-Beziehungen** (Org-Chart, Reporting-Lines, Konflikt-Beziehungen) — separater Slice.
- ❌ **Erweiterte Stakeholder-Typen über 4 hinaus** (z.B. natürliche / juristische Person / Org-Einheit / Gruppe) — wäre eigener Type-Refactor; aktuelle 2-Werte-Enum (person/organization) bleibt erstmal unangetastet.
- ❌ **Velocity-/Skill-basiertes Auto-Matching** zu Work-Items — eigene Slice (touched: PROJ-9, PROJ-11).
- ❌ **Bulk-Self-Assessment-Versand** (eine Mail an N Stakeholder pro Klick) — UX-Convenience, nicht MVP.

## Technical Requirements

- **Performance:** Stakeholder-Detail-Page mit beiden Radar-Charts in <500ms.
- **Security:** Self-Assessment-Token via HMAC-SHA256, Reuse von `APPROVAL_TOKEN_SECRET`. Token enthält `stakeholder_id`, `tenant_id`, `exp` (analog PROJ-31). DB-persistierter Token als 2. Validierungs-Schicht.
- **Privacy:** Self-Assessment-Mail hat keinen PII-Body. Submit-Payload (Big5 + Skill-Werte) ist Class-2 (nicht-personenbezogen, weil Werte nicht zur Person hin identifizierend sind), aber Stakeholder-Name ist Class-3 — Mail-Builder sanitisiert Vorname-only.
- **Multi-Tenant:** Alle 3 neuen Tabellen tragen `tenant_id`, RLS via `is_tenant_member`. Catalog-Pattern: `tenant_id IS NULL` für globale Defaults.
- **Browser:** Self-Assessment-Page funktioniert auf mobilen Browsern (externe Stakeholder klicken oft am Handy).
- **Charts:** Radar-Component muss installiert werden (recharts oder shadcn-charts). Wenn shadcn-charts schon vorhanden → reuse.

## Empfohlene interne Phasierung (nicht-bindend für /architecture)

| Phase | Block | Bietet | Migration | Aufwand |
|---|---|---|---|---|
| 33-α | A + G | Qualitative Felder + Migration | 1 Migration | ~2 PT |
| 33-β | B + F | Stakeholder-Type-Catalog + Audit | 1 Migration + UI | ~2 PT |
| 33-γ | C + E | Skill + Big5-Profile + Radar-UI | 2 Migrations + Component | ~2 PT |
| 33-δ | D + Routes | Self-Assessment Magic-Link Flow | 1 Migration + Public Page + 2 Routes | ~2 PT |

Jede Phase ist deploybar + QA-bar. /architecture entscheidet ob 1 PROJ-X mit interner Phasierung oder 4 separate PROJ-Specs (33a/b/c/d).

## Success Verification (für /qa)

- [ ] Vitest: Catalog-Resolver, Big5-Validation, Self-Assessment-Token-Flow analog PROJ-31, Outbox-Builder.
- [ ] E2E (Playwright + Auth-Fixture): voller PM-Workflow (Stakeholder anlegen → qualitative Felder setzen → Skill-Profile → Big5 → Self-Assessment-Invite versenden → Magic-Link öffnen → Self-Assessment ausfüllen → PM sieht Self vs Fremd Vergleich).
- [ ] Red-Team: Token-Forgery, Cross-Tenant-Catalog-Leak, Self-Assessment-Replay, PII-Leak in Self-Assessment-Mail.
- [ ] Privacy: Class-3-Verifikation des Mail-Builders (Body enthält nur Vorname + Token, keine sonstigen PII).

---

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## Implementation Notes
_To be added by /frontend + /backend_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
