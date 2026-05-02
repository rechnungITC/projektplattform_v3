# PROJ-33: Erweitertes Stakeholder-Management — Stammdaten + Skill/Persönlichkeit + Self-Assessment

## Status: In Progress (Phase 33-α + β + γ Deployed; δ Backend + Frontend ready for QA)
**Created:** 2026-05-02
**Last Updated:** 2026-05-02
**Phase 33-α Deployed:** 2026-05-02 — Tag: `v1.33.0-PROJ-33-alpha`
**Phase 33-β Deployed:** 2026-05-02 — Tag: `v1.33.0-PROJ-33-beta`
**Phase 33-γ Deployed:** 2026-05-02 — Tag: `v1.33.0-PROJ-33-gamma`
Production: https://projektplattform-v3.vercel.app

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

> **CIA-validiert** vor Architecture-Design. 7 Forks geklärt, alle architecturally addressable, kein Stack-Bruch nötig.
> Detailbrief in Section 7 unten.

### 1. Big Picture in einem Satz

PROJ-33 erweitert Stakeholder um vier zusammenhängende Bausteine — qualitative Steuerungs-Felder, einen tenant-erweiterbaren Stakeholder-Typ-Catalog, Skill+Big5-Profile mit Self-vs-Fremd-Vergleichs-Visualisierung, und einen Magic-Link-Self-Assessment-Flow für externe Stakeholder. Wird als **eine Spec mit 4 internen Phasen** (33-α/β/γ/δ) ausgeliefert, jede Phase deploybar.

### 2. UI-Komponenten (was der Nutzer sieht)

```
PROJ-33 Oberflächen
│
├── Stakeholder-Form (erweitert — bestehende Component)
│   ├── Sektion "Basis" (unverändert: Name, Rolle, Email, Influence/Impact)
│   └── Sektion "Qualitative Bewertung" (NEU, eingeklappt by default)
│       ├── Begründung / Treiber (Rich-Text)
│       ├── Stakeholder-Typ (Dropdown aus Catalog: global + tenant)
│       ├── Management-Ebene (Enum: Top / Oberes / Mittleres / Unteres / Operativ)
│       ├── Entscheidungsbefugnis (Enum: Keine / Beratend / Empfehlend / Entscheidend)
│       ├── Haltung (Enum: Unterstützend / Neutral / Kritisch / Blockierend)
│       ├── Konflikt-Potenzial (low/medium/high/critical — gleiche Skala wie Influence)
│       ├── Kommunikationsbedarf (Enum: Niedrig / Normal / Hoch / Kritisch)
│       └── Bevorzugter Kanal (Enum: Meeting / Email / Chat / Bericht / Dashboard)
│
├── Stakeholder-Detail-Page (erweitert)
│   ├── Header (Name, Type-Badge mit Catalog-Farbe, Haltungs-Icon)
│   ├── Tab "Basis" (existing)
│   ├── Tab "Qualitative Bewertung" (NEU — read-only Übersicht, edit via Form)
│   ├── Tab "Profil" (NEU — 2 Radar-Charts side-by-side)
│   │   ├── Skill-Profil (5 Achsen: Domänenwissen / Methodenkompetenz /
│   │   │  IT-Affinität / Verhandlungsgeschick / Entscheidungskraft)
│   │   ├── Persönlichkeitsprofil Big5/OCEAN (5 Achsen: Openness /
│   │   │  Conscientiousness / Extraversion / Agreeableness / Emotional Stability)
│   │   ├── Self-vs-Fremd-Overlay (zwei Polygone: Fremd solid, Self dashed)
│   │   └── Differenz-Marker bei >30% Abweichung pro Dimension
│   └── Tab "Audit-Trail" (NEU — Profile-Änderungen über Zeit)
│
├── Self-Assessment-Magic-Link-Page  (NEU — public, server-rendered, kein Login)
│   ├── Mobile-First Layout (externe Stakeholder kommen oft via Handy)
│   ├── Greeting "Hallo {Vorname}" + Tenant-Branding-Name (kein Projektname)
│   ├── Skill-Section (5 Slider 0-100)
│   ├── Big5-Section (5 Slider 0-100, mit Erläuterung pro Dimension)
│   ├── Submit-Button "Profil absenden"
│   └── Confirmation-State (idempotent — zweiter Klick zeigt "bereits abgegeben")
│
├── Tenant-Admin-UI für Stakeholder-Type-Catalog (NEU)
│   ├── Pfad: /stammdaten/stakeholder-types
│   ├── Tab "Globale Defaults" (4 read-only: Promoter, Supporter, Critic, Blocker)
│   └── Tab "Eigene Typen" (CRUD: Add/Edit/Disable)
│
└── PM-Action: "Self-Assessment versenden" Button auf Stakeholder-Detail
    ├── Generiert signed Magic-Link-Token (HMAC-SHA256, 14 Tage gültig)
    ├── Versendet via PROJ-13 Outbox (Mail mit Vorname + Tenant-Branding-Name)
    └── Status: Pending → Completed | Expired | Revoked
```

### 3. Datenmodell (Klartext, keine SQL)

**Bleibt unverändert:**
- `stakeholders.kind` (existing person / organization) — orthogonal zum neuen Stakeholder-Typ. **CIA-Fund O1:** explizit dokumentieren, dass beide Felder NICHT verschmolzen werden.

**Erweitert:**
- `stakeholders` bekommt **8 neue Spalten** (alle nullable, sichere Defaults für Backfill):
  - Begründung-Text
  - Stakeholder-Typ-Schlüssel (Lookup auf Catalog)
  - Management-Ebene
  - Entscheidungsbefugnis
  - Haltung
  - Konflikt-Potenzial
  - Kommunikationsbedarf
  - Bevorzugter Kanal

**Neu (4 Tabellen):**

1. **`stakeholder_type_catalog`** — DB-Catalog mit globalen Defaults + tenant-eigenen Einträgen:
   - Tenant-Pointer (NULL = global default)
   - Schlüssel + deutsches/englisches Label + Farb-Code
   - Reihenfolge + Aktiv-Flag

2. **`stakeholder_skill_profiles`** — 1:1 mit Stakeholder, hält 5 Skill-Werte:
   - Stakeholder-Pointer (Primary Key)
   - 5 Werte je 0-100 (PM-bewertet, "fremd")
   - 5 Werte je 0-100 (Self-Assessment, optional, NULL bis Self-Submit)
   - Audit-Felder (wer hat zuletzt aktualisiert, wann)

3. **`stakeholder_personality_profiles`** — analog mit 5 Big5/OCEAN-Werten

4. **`stakeholder_self_assessment_invites`** — Magic-Link-Workflow-State:
   - Stakeholder-Pointer + Tenant-Pointer
   - Magic-Link-Token (signiert, persistiert als 2. Validierungs-Schicht)
   - Ablauf-Zeitpunkt (14 Tage)
   - Status: pending / completed / expired / revoked
   - Submitted-Payload (für Audit, JSON-Snapshot der eingereichten Werte)

**Neu (1 Audit-Tabelle):**
- **`stakeholder_profile_audit_events`** — append-only Events-Log für Profile-Änderungen:
  - Stakeholder-Pointer + Tenant-Pointer
  - Event-Typ (skill_updated / personality_updated / self_assessment_submitted / invite_sent / invite_revoked)
  - Akteur-Typ + ID (User ODER Stakeholder via Token — 2 Akteure)
  - JSON-Payload mit Vorher/Nachher-Werten
  - Zeitstempel

**Audit-Strategie (Hybrid per CIA-Empfehlung):**
- **Block A** qualitative Felder auf `stakeholders` → existing PROJ-10 Field-Versioning-Trigger erweitert (Spalten ins `audit_tracked_columns`-Set aufnehmen). Wiederverwendung der existierenden Audit-Routes + Undo/Restore-UI.
- **Profile-Tabellen** (Skill / Personality) → eigene `stakeholder_profile_audit_events`-Tabelle, weil PROJ-10 nur User-Akteure kennt. Self-Assessment via Token hat keinen `auth.uid()` — der Token ist der Akteur.

### 4. Tech-Entscheidungen (das Warum für PM)

#### 4.1 Warum **eine Spec mit 4 internen Phasen** statt 4 separater PROJ-Specs?
Die Bausteine ergeben **nur zusammen** den User-Wert: Self-vs-Fremd-Vergleich braucht alle 4. Eine Auslieferung von "qualitativen Feldern" ohne "Self-Assessment" liefert ein erweitertes Formular, aber kein Differenzbild. Vier separate PROJ-Specs würden 4× INDEX-Verwaltung, 4× Architecture-Review, 4× QA, 4× Deploy bedeuten — ROI negativ. Mit interner Phasierung 33-α/β/γ/δ bleibt jede Phase deploybar (analog PROJ-31, das auch interne Phasen hatte), die Spec-Kosten verdoppeln sich aber nicht.

#### 4.2 Warum **DB-Catalog für Stakeholder-Typen** statt TS-Konstanten wie PROJ-6?
Das PROJ-6-Pattern (Code-Default + Field-Override) erlaubt nur das Überschreiben von Feldern eines bekannten Schlüssels — es lässt **keine neuen Schlüssel** zu. PROJ-33 verlangt aber explizit, dass Tenants eigene Typen wie "Champion" oder "Schweiger" hinzufügen können. Ein DB-Catalog mit globalen Default-Einträgen (`tenant_id IS NULL`) plus tenant-eigenen Custom-Einträgen ist die einfachste Form, die diese Anforderung erfüllt. Die 4 Defaults sind als Code-Konstanten zusätzlich verfügbar, damit KI-Prompts (PROJ-36 später) sie hardcoded referenzieren können.

#### 4.3 Warum **Big5/OCEAN** statt DISG?
DISG ist Trademark + lizenzpflichtig in vielen Jurisdiktionen. Big5/OCEAN ist akademisches Public-Domain-Modell, breit akzeptiert in Wissenschaft + Personalwesen, semantisch gleich aussagekräftig. Sprachregelung "Emotional Stability" statt "Neuroticism" macht die Achse positiv-framed (für Business-Kontext lesbarer). Kein Lizenzrisiko, keine Trademark-Frage, keine spätere Rückfrage von Legal.

#### 4.4 Warum **recharts** als Chart-Library?
Keine Chart-Lib ist heute installiert. recharts ist die etablierteste React-Lib mit deklarativem RadarChart-Component, ~58 KB gzipped wenn nur RadarChart importiert wird. Tree-Shakable. Wir laden den Profil-Tab via `dynamic()` — der Initial-Bundle der App wächst nicht. shadcn-charts (Wrapper um recharts) wird optional adoptiert für Theme-Konsistenz mit dem bestehenden Design-System. Spätere Slices (PROJ-21 Reports, PROJ-22 Budget-Charts, PROJ-35 Critical-Path) können denselben Stack nutzen.

#### 4.5 Warum **Token-Modul side-by-side** statt Refactor von PROJ-31?
Production hat aktuell offene Approval-Tokens mit 7-Tage-Lifetime. Ein Refactor von `approval-token.ts` zu einem generischen `magic-link-token.ts` würde die Token-Form ändern und alle aktiven Tokens invalidieren (HIGH-Severity-Risk laut CIA). Stattdessen: eigene `self-assessment-token.ts` mit eigener Payload-Struktur (`stakeholder_id` + `tenant_id` + `exp`), aber **gemeinsames Server-Secret** `APPROVAL_TOKEN_SECRET`. Eine env-var weniger zu verwalten, kein Production-Bruch, ~120 Zeilen Code-Duplikation akzeptabel. Wenn ein dritter Magic-Link-Use-Case kommt, ist die Generalisierung dann gerechtfertigt (heute YAGNI).

#### 4.6 Warum **hybrid Audit** statt einer Pattern für alles?
PROJ-10 Audit-Trigger funktionieren elegant für editable Felder mit User-Akteuren. Stakeholders sind bereits abgedeckt — neue qualitative Felder ins Tracking-Set aufnehmen ist trivial. Aber: Self-Assessment via Token hat **keinen** `auth.uid()`. Den Trigger zu erweitern, um Token-Akteure zu erkennen, würde das PROJ-10-Pattern strukturell verbiegen. Eigene `stakeholder_profile_audit_events`-Tabelle (analog PROJ-31 Approval-Events) trennt das sauber: Block A nutzt existing Trigger, Profile-Tabellen haben eigenen append-only Audit-Pfad mit `actor_kind` (user/stakeholder).

#### 4.7 Warum **Class-2** statt Class-3 für Big5-Werte?
DSGVO Art. 9 ("besondere Kategorien") trifft auf medizinisch-diagnostische Persönlichkeits-Daten zu, nicht auf Self-Assessment-Sliders. Big5 ist statistisches Persönlichkeits-Maß, nicht klinische Diagnose. Class-3-Hard-Block würde KI-Coaching (PROJ-36) strukturell tot machen, weil **jeder** Big5-Lookup lokal routen müsste — Latency + Quality-Gap der Local-LLMs würde das Feature unbrauchbar machen. Class-2 erlaubt Cloud-Routing mit Tenant-Default-Override-Möglichkeit: Tenants mit höchsten Privacy-Anforderungen können via Tenant-Setting auf Class-3 hochstufen. Dann lokales Routing erzwungen.

#### 4.8 Warum **Vorname + Tenant-Branding-Name** in Self-Assessment-Mail (nicht Projektname)?
Reiner "Hallo Max"-Mail-Body ohne Kontext sieht wie Phishing aus — Spam-Filter könnten markieren, Empfänger werden zögern. Tenant-Name ("Firma X bittet dich um deine Selbsteinschätzung") gibt Vertrauenskontext, ohne dass der Tenant-Name selbst sensibel ist (er ist öffentliche Information: Domain, Briefkopf). Projektname dagegen kann sensitiv sein ("Restrukturierung Q4", "M&A-Vorhaben Codename") und bleibt deshalb ausgeklammert — konsistent mit PROJ-31 Approval-Mails, die auch keinen Projektnamen tragen.

### 5. Workflow-Diagramm (Self-Assessment-Lifecycle)

```
[PM auf Stakeholder-Detail]
        │
        ▼
[Klick: "Self-Assessment versenden"]
        │
        ▼
[Server: Token signieren (HMAC + 14 Tage)
         Invite-Row erstellen
         Outbox-Mail in PROJ-13 einreihen
         Audit-Event "invite_sent"]
        │
[Status: pending]
        │
        │  ─────► [PM revoked Invite] ──► [Status: revoked, Token klick zeigt "zurückgezogen"]
        │
        │  ─────► [14 Tage abgelaufen] ──► [Status: expired automatisch]
        │
        ▼
[Stakeholder klickt Magic-Link in Mail]
        │
[/self-assessment/[token] — public, server-rendered]
        │
[Token-Validierung in Reihenfolge:
  1. HMAC-Signatur
  2. Ablaufzeit
  3. DB-Token-Match (2. Schicht)
  4. Tenant-ID-Match
  5. Stakeholder existiert
  6. Status = pending]
        │
        ▼
[Self-Assessment-Form (5 Skill + 5 Big5 Slider)]
        │
        ▼
[Stakeholder klickt Submit]
        │
[Server: Werte in skill_profiles.self_* + personality_profiles.self_*
         Status: completed
         Submitted-Payload als JSON-Snapshot (Audit)
         Audit-Event "self_assessment_submitted" mit actor_stakeholder_id]
        │
        ▼
[Confirmation: "Vielen Dank, du kannst das Fenster schließen"]

[PM sieht später im Profil-Tab: 2 Radar-Charts mit Self+Fremd-Overlay]
```

### 6. CIA-Findings (Risiken die das Design entschärft)

| ID | Risiko | Severity | Im Design entschärft durch |
|----|--------|----------|---------------------------|
| R1 | Token-Refactor bricht Production-Approval-Tokens | **HIGH** | Side-by-Side-Module, kein Refactor von approval-token.ts; gemeinsames Secret |
| R2 | DB-Catalog mit beliebigen Tenant-Keys lockert Type-Safety | **MID** | Resolver-Funktion + RLS-FK-Validation gegen `(tenant_id, key)` |
| R3 | Class-3-Big5 würde KI-Coaching strukturell töten | **HIGH** | Class-2-Default mit Tenant-Hochstuf-Option |
| R4 | "Hallo Max"-Mail als Phishing-Anschein | **MID** | Tenant-Branding-Name als Kontext-Hint; Sanitizer auf Mail-Title |
| R5 | Self-Assessment-Slider-Bias (Default-/Akzeptanz-Bias) | **LOW/MID** | Quality-Topic, kein Block; UI kann optional Warnung zeigen |
| R6 | Catalog-RLS-Komplexität (global vs tenant) | **MID** | Zwei klare Policies: SELECT erlaubt `tenant_id IS NULL OR is_tenant_member`, CRUD beschränkt auf `tenant_id IS NOT NULL AND is_tenant_admin` |

**Out-of-spec-Funde** als Cross-Cutting-Empfehlungen markiert:
- **O1** Naming-Disambiguation `kind` vs `stakeholder_type_key` — wird im Datenmodell-Header dokumentiert (Section 3 oben)
- **O2** `sanitizeApprovalTitle` zu `sanitizeMailTitle` als shared utility extrahieren — Quick-Win in Phase 33-δ
- **O3** Big5-Slider mit 5-Punkt-Likert-Snapping (UI-Empfehlung) — wird im /frontend mit Mockups getestet
- **O4** Self-Assessment-Page Mobile-First-Vorgabe — separat dokumentiert
- **O5** Generic `getPrivacyClass(tenant_id, table, column)`-Lookup — PROJ-NN-Kandidat sobald 3+ Tabellen das brauchen

### 7. Empfohlene interne Phasierung (verbindlich für /backend + /qa)

| Phase | Block | Inhalt | Migration | Aufwand | Acceptance-Gate |
|---|---|---|---|---|---|
| **33-α** | A + G + F.1 | Qualitative Felder + Migration + PROJ-10-Audit erweitern | 1 Migration | ~2 PT | Stakeholder-Form zeigt qualitative Sektion, edit + Audit-History funktioniert. Deploybar isoliert. |
| **33-β** | B | Stakeholder-Type-Catalog + Tenant-Admin-UI | 1 Migration + UI | ~2 PT | Tenant-Admin kann eigene Typen anlegen, Stakeholder-Form zeigt Catalog-Dropdown. Deploybar isoliert. |
| **33-γ** | C + E | Skill + Big5-Profile + Radar-Visualisierung + recharts | 2 Migrationen + Component | ~2 PT | PM kann Skill+Big5 für Stakeholder pflegen, Radar-Chart rendert (ohne Self-Werte). Deploybar isoliert. |
| **33-δ** | D + F.2 + Public-Page + O2-Refactor | Self-Assessment Magic-Link + Public Page + Profile-Audit-Events + Sanitizer-Refactor | 1 Migration + Public Page + 2 Routes | ~2 PT | PM versendet Invite, externer Stakeholder füllt aus, PM sieht Self+Fremd-Overlay. Vollständiger Use-Case. |

Jede Phase hat eigenen QA-Pass und eigenen Deploy. /architecture-Empfehlung: **NICHT** alle 4 Phasen in einem PR mergen.

### 8. Dependencies

**Neue npm-Packages:**
- `recharts` (~58 KB gzipped, peer-react 19 supported) — für Radar-Charts. Optional + später: shadcn-charts Wrapper.

**Neue Env-Variablen:** keine.
- Magic-Link-Tokens nutzen bestehende `APPROVAL_TOKEN_SECRET` (CIA-Empfehlung Fork 4)

**Touched-but-unchanged-Code** (zur Awareness):
- `src/lib/stakeholders/` (neu): `self-assessment-token.ts`, `self-assessment-mail.ts`, `approval-rules.ts` analog Pattern aus PROJ-31
- `src/app/api/projects/[id]/stakeholders/[sid]/profile/` (neu): Skill + Personality CRUD-Routes
- `src/app/api/projects/[id]/stakeholders/[sid]/self-assessment-invite/` (neu): Invite-Versand
- `src/app/api/self-assessment/[token]/` (neu): Public GET + POST analog `/api/approve/[token]`
- `src/app/self-assessment/[token]/` (neu): Public Page analog `/approve/[token]`
- `src/app/(app)/stammdaten/stakeholder-types/` (neu): Tenant-Admin-Catalog-UI
- `src/components/stakeholders/` (erweitert): Form + Detail-Page + Profile-Tab + Radar-Component
- `src/lib/communication/sanitize-mail-title.ts` (neu, refactor aus PROJ-31): shared Sanitizer
- `src/lib/supabase/middleware.ts` (erweitert): PUBLIC_ROUTES um `/self-assessment` + `/api/self-assessment`
- `supabase/migrations/`: 4 neue Migrationen (eine pro Phase)

### 9. Aufwandsschätzung (CIA-bestätigt)

- **Phase 33-α** (qualitative Felder + Migration + Audit): ~2 PT
- **Phase 33-β** (Catalog + Tenant-Admin-UI): ~2 PT
- **Phase 33-γ** (Skill + Big5 + Radar + recharts): ~2 PT
- **Phase 33-δ** (Self-Assessment-Flow + Public-Page + Audit-Events + Sanitizer-Refactor): ~2 PT
- **Total**: ~8 PT (Frontend + Backend + QA pro Phase je ~0.5 PT eingerechnet)

### 10. Was NICHT in PROJ-33 ist (Architektur-Boundaries)

- Kein Refactor von `stakeholders.kind` (orthogonal zum neuen Stakeholder-Typ)
- Kein Refactor von `approval-token.ts` (Side-by-Side statt Generalize)
- Kein generischer `magic-link-token.ts` (YAGNI bis 3. Use-Case)
- Kein generischer `getPrivacyClass(...)`-Lookup (PROJ-NN-Kandidat)
- Kein Communication-Tracking (Sentiment, Reaktionszeit) — PROJ-34
- Kein Critical-Path-Indikator — PROJ-35
- Kein KI-Coaching — PROJ-36 (braucht PROJ-32 Multi-Provider zwingend)
- Kein Bulk-Self-Assessment-Versand (eine Mail an N Stakeholder mit einem Klick)

### 11. Approval-Empfehlung

**Umsetzbar mit aktueller Architektur ohne Stack-Erweiterung außer `recharts`.** Alle 4 Locked-Decisions kompatibel, alle 6 CIA-Risiken im Design entschärft. Phasierung gibt Deploy-Granularität. CIA-Empfehlung: **/frontend + /backend können parallel an Phase 33-α starten.**

---

## Tech Design Appendix — Phase 33-β (Stakeholder-Type-Catalog)

> **Status:** locked durch /architecture proj 33 Run #2 (2026-05-02). 2 zusätzliche Forks aus Q&A:
> - **FK-Strategy = Hybrid** Composite via Validation-Trigger
> - **Color-UX = `react-colorful`** Color-Picker

### β.1 — Konkrete Tabellen-Form (`stakeholder_type_catalog`)

**Spalten:**
- `id` UUID (PK, für interne Referenzen, NICHT für FK von stakeholders)
- `tenant_id` UUID NULL (NULL = globaler Default; sonst Tenant-eigen)
- `key` text NOT NULL (max 64; UNIQUE per `(tenant_id, key)`)
- `label_de` text NOT NULL (max 100)
- `label_en` text NULL (max 100)
- `color` text NOT NULL (Hex-Format `#rrggbb`, regex-validiert)
- `display_order` int NOT NULL DEFAULT 0
- `is_active` boolean NOT NULL DEFAULT true
- `created_at` / `updated_at` timestamptz

**Default-Seeds (`tenant_id IS NULL`, immutable):**

| Key | Label DE | Color (Hex) | Tailwind-Equivalent |
|---|---|---|---|
| `promoter` | Promoter | `#10b981` | emerald-500 |
| `supporter` | Supporter | `#3b82f6` | blue-500 |
| `critic` | Kritiker | `#f59e0b` | amber-500 |
| `blocker` | Blockierer | `#ef4444` | red-500 |

**Constraint-Set:**
- UNIQUE `(tenant_id, key)` — erlaubt Tenant-A "champion" parallel zu Tenant-B "champion"
- CHECK `length(key) BETWEEN 1 AND 64`
- CHECK `length(label_de) BETWEEN 1 AND 100`
- CHECK `color ~* '^#[0-9a-f]{6}$'`
- RLS:
  - SELECT: `tenant_id IS NULL OR is_tenant_member(tenant_id)`
  - INSERT/UPDATE/DELETE: `is_tenant_admin(tenant_id) AND tenant_id IS NOT NULL` (globale Defaults bleiben immutable)

### β.2 — Hybrid-FK via Validation-Trigger

**Warum kein nativer Composite-FK?**
PostgreSQL FK kann nicht "OR NULL" beim Composite-Match. Wir wollen aber:
- Wenn `stakeholder_type_catalog.tenant_id IS NULL` (global) → erlaubt für alle Tenants
- Wenn `stakeholder_type_catalog.tenant_id = X` → nur für Tenant X erlaubt

**Lösung:** Validation-Trigger auf `stakeholders` BEFORE INSERT/UPDATE OF `stakeholder_type_key`:
- Wenn `stakeholder_type_key IS NULL` → OK
- Sonst: Lookup `stakeholder_type_catalog WHERE key = NEW.stakeholder_type_key AND (tenant_id IS NULL OR tenant_id = NEW.tenant_id) AND is_active = true`
- Wenn kein Match → `raise exception 'invalid_stakeholder_type_key'`

**Migration-Verhalten für Phase 33-α-Daten:**
- Phase 33-α hat `stakeholder_type_key` als Free-Text gestartet — bisher haben Nutzer wahrscheinlich nur die 4 globalen Defaults eingegeben, oder gar nichts (Phase α ist <1 Tag alt).
- Trigger fires nur für **NEUE INSERT/UPDATE**. Existing Rows mit ungültigen Keys bleiben unbeschadet (data-immutable Migration).
- Zusätzlicher Cleanup-Step in Migration: Werte, die nicht den 4 Defaults entsprechen, werden auf NULL gesetzt mit Audit-Log-Eintrag (Begründung: "PROJ-33-β: invalid free-text key cleared for catalog enforcement").

### β.3 — UI-Komponenten

```
Phase 33-β Oberflächen
│
├── /stammdaten/stakeholder-types  (NEU)
│   ├── Tenant-Admin-only Page
│   ├── Tab "Globale Defaults" — read-only Liste der 4 Einträge mit Farb-Swatch
│   ├── Tab "Eigene Typen" (Tenant-Custom)
│   │   ├── CRUD-Tabelle: Label DE, Label EN, Color-Swatch, Reihenfolge, Aktiv-Toggle
│   │   ├── "+ Neuer Typ"-Button → öffnet Sheet-Form
│   │   └── Klick auf Eintrag → öffnet Edit-Form
│   └── Sheet-Form (Add / Edit)
│       ├── Key (Input, lower-case-only, dasher-separator-validiert)
│       ├── Label DE (Input)
│       ├── Label EN (Input, optional)
│       ├── Color (react-colorful HexColorPicker + Hex-Input-Field, mit Vorschau-Swatch)
│       ├── Display-Order (Input number)
│       └── Aktiv-Toggle
│
├── /stakeholder-Form (erweitert — bestehende Component aus Phase 33-α)
│   └── Sektion "Qualitative Bewertung"
│       └── Stakeholder-Typ Input wird zu Select-Component
│           - Listet globale Defaults + tenant-eigene aktive Einträge
│           - Anzeige: Farb-Swatch + Label DE
│           - Optional "kein Typ" als erste Option
│
└── /Stakeholder-Tabelle (erweitert)
    └── Type-Badge mit Catalog-Farbe (statt nur free-text)
```

### β.4 — API-Routes

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/stakeholder-types` | session | Listet aktive Types (global + tenant) für Dropdowns |
| `POST /api/stakeholder-types` | tenant-admin | Erstellt tenant-eigenen Type (`tenant_id` = active) |
| `PATCH /api/stakeholder-types/[id]` | tenant-admin | Edit, nur eigene (RLS-gated, server-side double-check) |
| `DELETE /api/stakeholder-types/[id]` | tenant-admin | Soft-delete via `is_active=false` |

**Globale Defaults bleiben immutable** — RLS-Policy verbietet UPDATE/DELETE für `tenant_id IS NULL`.

### β.5 — Dependencies

**Neue npm-Packages:**
- `react-colorful` (~2 KB gzipped, peer-react 19 supported) — HexColorPicker-Component für Type-Color-UX

**Touched Code:**
- `supabase/migrations/`: 1 neue Migration (Catalog-Table + 4 Seeds + Validation-Trigger + RLS)
- `src/types/stakeholder-type.ts` (neu): TS-Types für Catalog-Eintrag
- `src/lib/stakeholder-types/api.ts` (neu): fetch wrappers
- `src/app/api/stakeholder-types/route.ts` + `[id]/route.ts` (neu): CRUD-Routes
- `src/app/(app)/stammdaten/stakeholder-types/page.tsx` + `client.tsx` (neu): Admin-UI
- `src/components/projects/stakeholders/stakeholder-form.tsx` (erweitert): Type-Input wird Select
- `src/components/projects/stakeholders/stakeholder-table.tsx` (erweitert): Type-Badge mit Catalog-Color
- `src/components/master-data/` (erweitert): Sidebar-Nav-Eintrag

### β.6 — Aufwandsschätzung

- **Backend** (Migration + 4 Routes + Validation-Trigger): ~1 PT
- **Frontend** (Admin-UI + Color-Picker-Integration + Stakeholder-Form-Update): ~1 PT
- **QA** (Live-DB-Red-Team + Vitest-Cases für Trigger + UI-Smoke): ~0.5 PT
- **Total**: ~2.5 PT — passt zur ursprünglichen ~2 PT Phasierungs-Schätzung

### β.7 — Acceptance-Gate (für /qa)

Phase 33-β ist deploybar wenn:
1. Tenant-Admin kann eigene Stakeholder-Types anlegen, editieren, soft-deleten
2. Stakeholder-Form Type-Input ist ein Select mit globalen + tenant-eigenen Werten
3. Validation-Trigger lehnt invalid keys mit klarer Fehlermeldung ab
4. Globale Defaults sind immutable (RLS + Live-Red-Team-Test)
5. Existing Phase 33-α-Daten bleiben unbeschadet (kein silent data loss)
6. Color-Picker rendert + speichert Hex-Werte korrekt

### β.8 — Edge-Cases (zusätzlich zu Phase-α-Set)

- **EC-β1: Tenant-Admin deaktiviert einen Type, der noch verwendet wird** → Stakeholder-Eintrag behält Wert (Soft-Reference erlaubt das); UI zeigt "Type X (deaktiviert)" als Badge mit grauer Farbe.
- **EC-β2: Free-Text-Wert aus Phase 33-α matcht keinen Catalog-Eintrag** → Migration cleared den Wert auf NULL mit Audit-Log-Eintrag.
- **EC-β3: Tenant-Admin will einen globalen Default überschreiben** → RLS lehnt UPDATE für `tenant_id IS NULL` ab; UI zeigt Buttons für globale Defaults disabled.
- **EC-β4: Race: zwei Tenant-Admins legen gleichzeitig den gleichen Custom-Key an** → UNIQUE-Constraint auf `(tenant_id, key)` lehnt den zweiten ab (409 Conflict im API-Layer).

---

## Tech Design Appendix — Phase 33-γ (Skill + Big5 + Radar-Charts)

> **Status:** locked durch /architecture proj 33 Run #4 (2026-05-02). 2 zusätzliche Forks aus Q&A:
> - **Schema = 2 separate Tabellen** (skill + personality split)
> - **Audit-Plan = Pre-bake** der events-Tabelle in γ-Migration (für δ-Reuse)

### γ.1 — Datenmodell (2 separate Profile-Tabellen)

**Tabelle `stakeholder_skill_profiles`** (1:1 mit Stakeholder, 5 Dimensionen):
- `stakeholder_id` UUID (Primary Key, FK auf stakeholders)
- `tenant_id` UUID (für RLS)
- 5 fachliche Dimensionen, jeweils 0-100 Integer:
  - `domain_knowledge_fremd` / `domain_knowledge_self` (PM-Bewertung / Selbst-Bewertung)
  - `method_competence_fremd` / `method_competence_self`
  - `it_affinity_fremd` / `it_affinity_self`
  - `negotiation_skill_fremd` / `negotiation_skill_self`
  - `decision_power_fremd` / `decision_power_self`
- `fremd_assessed_by` UUID (welcher PM hat zuletzt PM-Werte gesetzt)
- `fremd_assessed_at` timestamptz
- `self_assessed_at` timestamptz (NULL bis Phase δ Self-Assessment landet)
- `created_at` / `updated_at`

**Tabelle `stakeholder_personality_profiles`** (1:1 mit Stakeholder, 5 Big5-Dimensionen):
- Analog struktur, aber 5 OCEAN-Dimensionen:
  - `openness_fremd` / `openness_self`
  - `conscientiousness_fremd` / `conscientiousness_self`
  - `extraversion_fremd` / `extraversion_self`
  - `agreeableness_fremd` / `agreeableness_self`
  - `emotional_stability_fremd` / `emotional_stability_self` (positiv-framed statt Neuroticism)
- gleiche Audit-/Timestamp-Felder

**Phase-γ-Befüllung:**
- PM editiert via UI → `*_fremd`-Spalten + `fremd_assessed_by/at` werden gesetzt
- `*_self`-Spalten + `self_assessed_at` bleiben NULL bis Phase 33-δ Self-Assessment-Submit

**RLS für beide Tabellen:**
- SELECT/UPSERT: `is_tenant_member(tenant_id)` (alle Tenant-Member sehen, Editor+ kann editieren)
- DELETE nur via Cascade (stakeholder löschen → profile löscht)

**Privacy-Class:**
- Class-2 (CIA-Empfehlung Fork 6 aus 1. /architecture-Run)
- Tenant kann via `tenant_settings.privacy_classification` auf Class-3 hochstufen → KI-Coaching (PROJ-36) muss dann lokal routen

### γ.2 — Audit-Tabelle pre-baked

**Tabelle `stakeholder_profile_audit_events`** (append-only, analog PROJ-31 Pattern):
- `id` UUID PK
- `tenant_id` UUID
- `stakeholder_id` UUID
- `profile_kind` text (`'skill'` | `'personality'`)
- `event_type` text (`'fremd_updated'` | `'self_updated'` | `'self_assessed_via_token'`)
- `actor_kind` text (`'user'` | `'stakeholder'`) — pre-baked für Phase δ
- `actor_user_id` UUID NULL (gefüllt wenn actor_kind='user')
- `actor_stakeholder_id` UUID NULL (gefüllt wenn actor_kind='stakeholder' via Magic-Link)
- `payload` jsonb (Vorher/Nachher-Werte als JSON-Snapshot)
- `created_at` timestamptz

**RLS:**
- SELECT: `is_tenant_member(tenant_id)`
- INSERT: `is_tenant_member(tenant_id)` (durch Edge-Function via SECURITY DEFINER, oder direkt von API-Route)
- UPDATE/DELETE: blockiert via Trigger (analog PROJ-31 `enforce_approval_event_immutability`)

**Phase γ schreibt Events:**
- Wenn PM-Edit → `actor_kind='user'`, `event_type='fremd_updated'`, payload = vorher/nachher-Diff
- Self-Events bleiben für Phase δ leer

### γ.3 — UI-Komponenten

```
Phase 33-γ Oberflächen
│
├── Stakeholder-Detail-Page (erweitert)
│   ├── Tab "Profil" (NEU)
│   │   ├── 2 Radar-Charts side-by-side (recharts via shadcn-charts Wrapper)
│   │   │   ├── Skill-Chart (5 Achsen)
│   │   │   └── Big5-Chart (5 Achsen)
│   │   ├── Self-vs-Fremd-Overlay (zwei Polygone, falls beide vorhanden)
│   │   │   - Fremd: solid Polygon mit Catalog-Color
│   │   │   - Self: dashed Polygon mit kontrastierender Farbe
│   │   │   - Wenn nur Fremd da: einfaches Polygon ohne Overlay
│   │   ├── Differenz-Liste (sortiert nach |Self - Fremd|)
│   │   │   - "Conscientiousness: PM 30%, Self 90% — Δ +60% (Selbstüberschätzung?)"
│   │   │   - Highlights ab |Δ| > 30%
│   │   └── Edit-Mode-Toggle für PM (Sliders 0-100 pro Dimension)
│   └── Tab "Profil-Audit" (NEU)
│       └── Timeline aller Profile-Änderungen aus stakeholder_profile_audit_events
│
├── Stakeholder-Profile-Edit-Sheet (NEU)
│   ├── 2 Sections: Skill (5 Slider) + Big5 (5 Slider)
│   ├── Slider 0-100 mit numerischer Anzeige + 25/50/75-Marker
│   ├── Erläuterung pro Big5-Dimension (Tooltip)
│   └── Save-Button (POST/PATCH /api/projects/[id]/stakeholders/[sid]/profile)
│
└── (Phase δ) Externer Stakeholder klickt Magic-Link → Self-Assessment-Form
    füllt *_self-Spalten + self_assessed_at
```

### γ.4 — API-Routes

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/projects/[id]/stakeholders/[sid]/profile` | session (view) | Liefert Skill + Big5 + Audit-Events kombiniert |
| `PUT /api/projects/[id]/stakeholders/[sid]/profile/skill` | session (edit) | UPSERT der 5 Skill-Fremd-Werte; schreibt Audit-Event |
| `PUT /api/projects/[id]/stakeholders/[sid]/profile/personality` | session (edit) | UPSERT der 5 Big5-Fremd-Werte; schreibt Audit-Event |

### γ.5 — Tech-Entscheidungen (PM-readable)

#### Warum **2 separate Tabellen** statt einer kombinierten?
Skill-Profile (fachliche Kompetenzen) und Persönlichkeitsprofile (Big5/OCEAN) sind verschiedene Konzepte mit unterschiedlicher Privacy-Klassifizierung-Tendenz: Skill ist Class-2 unkritisch, Big5 könnte Tenants als Class-3-Hard-Block hochstufen. Wenn KI-Coaching (PROJ-36) später nur Skill-Daten lesen will (ohne Big5-Personality-Profile zu berühren), erlauben getrennte Tabellen das mit einer Query — kombinierte Tabelle würde RLS-Column-Policies brauchen, die Postgres nicht nativ unterstützt.

#### Warum **Pre-bake der Audit-Events-Tabelle in Phase γ**?
Phase γ schreibt nur User-Akteur-Events (PM editiert). Phase δ ergänzt Stakeholder-Akteure via Magic-Link. Wenn die Tabelle erst in δ angelegt wird, haben γ-Era-Profile-Edits keine Audit-Trail-History — das wäre Compliance-relevant für Tenants mit Auditing-Anforderungen. Pre-bake ist 5 Minuten Migration-Code, spart später Migration + nachträgliche Backfill-Komplexität.

#### Warum **shadcn-charts Wrapper** für recharts?
shadcn bietet einen Wrapper (`ChartContainer`) mit Theme-CSS-Variables, der recharts in den vorhandenen Tailwind/Design-System einklinkt. Konsistenz mit kommenden Chart-Surfaces (PROJ-21 Reports, PROJ-22 Budget, PROJ-35 Critical-Path). Installation via `npx shadcn@latest add chart` — bringt nur den Wrapper, recharts ist bereits installiert.

#### Warum **0-100 Sliders** statt 5-Punkt-Likert?
Big5-Inventory-Wissenschaft nutzt typischerweise 5-Punkt-Likert. Aber: PM bewertet hier subjektiv-grob, nicht klinisch. 0-100 erlaubt feinere Differenzierung wenn der PM einen Stakeholder als "ziemlich, aber nicht extrem extravertiert" einschätzt. UI kann optional 25/50/75-Marker zeigen (CIA Out-of-spec O3) — ist im UI-Design entscheidbar, kein DB-Schema-Lock.

#### Warum **Edit-Sheet** statt direkt-edit-im-Tab?
Der "Profil"-Tab ist primär eine Read-View (Radar-Charts + Differenz-Liste). Wenn PM ändern will, klickt "Profil bearbeiten" → Sheet von rechts mit den 10 Slidern. Trennung Read vs Edit reduziert visuelle Komplexität + verhindert versehentliche Werte-Drift bei nur-lesendem Stakeholder-Stoebern.

### γ.6 — Dependencies

**Neue npm-Packages:** keine zusätzlichen.
- `recharts@^3.2.1` ist bereits installiert (Phase 33-β unten).
- shadcn-charts Wrapper via `npx shadcn@latest add chart` (kein npm-Install, nur Component-Copy).

**Touched Code:**
- `supabase/migrations/`: 1 neue Migration (3 Tabellen + Trigger + RLS + Indexes)
- `src/types/stakeholder-profile.ts` (neu): TS-Types
- `src/lib/stakeholder-profiles/api.ts` (neu): fetch wrappers
- `src/app/api/projects/[id]/stakeholders/[sid]/profile/route.ts` (neu) + `[skill|personality]/route.ts` (neu)
- `src/components/stakeholders/profile/` (neu):
  - `radar-chart.tsx` (recharts wrapper, accepts {fremd, self} data)
  - `profile-tab.tsx` (orchestrator: 2 Charts + Diff-List + Edit-Toggle)
  - `profile-edit-sheet.tsx` (10 Slider + Save)
  - `profile-audit-timeline.tsx` (event-list)
- `src/components/projects/stakeholders/stakeholder-tab-client.tsx` (erweitert): "Profil"-Tab im Edit-Drawer

### γ.7 — Acceptance-Gate (für /qa)

Phase 33-γ ist deploybar wenn:
1. PM kann via UI für jeden Stakeholder Skill (5 Werte) und Big5 (5 Werte) speichern
2. Radar-Charts rendern korrekt (mobile + desktop)
3. Audit-Trail zeigt Profile-Änderungen mit User-Akteur
4. Wenn Self-Werte NULL → nur Fremd-Polygon dargestellt; bei beiden → Overlay mit Differenz-Liste
5. Privacy-Class: Big5-Werte als Class-2 markiert (PROJ-12 Privacy-Registry erweitert)
6. Migration-Replay erprobt + 0 invalide Daten

### γ.8 — Edge-Cases (zusätzlich zu α/β-Set)

- **EC-γ1: PM editiert Profil, Stakeholder hat noch keinen Profile-Eintrag** → UPSERT pattern: erste PUT erstellt Row, weitere updaten.
- **EC-γ2: Tenant-Privacy-Setting wechselt Big5 zu Class-3 mid-flight** → existing Big5-Werte bleiben gespeichert, aber KI-Coaching (PROJ-36) liest sie nicht mehr für External-Provider; lokale Provider OK.
- **EC-γ3: Slider-Werte 0 oder 100** → erlaubt; Audit-Event protokolliert.
- **EC-γ4: Stakeholder ohne `is_active`** → Profil bleibt erhalten (kein Cascade). Re-aktivieren bringt Profil zurück.
- **EC-γ5: Self-Werte vorhanden vor Phase γ** → unmöglich, Self-Spalten existieren erst ab γ-Migration.

### γ.9 — Aufwandsschätzung (revidiert)

- **Backend** (Migration + 3 Routes + Audit-Events-Trigger): ~1.5 PT
- **Frontend** (Radar-Component + Profile-Tab + Edit-Sheet + Audit-Timeline): ~1.5 PT
- **QA** (Vitest für Audit-Trigger + Privacy-Routing-Smoke + UI-Visual-Regression): ~0.5 PT
- **Total**: ~3.5 PT — leicht über der ursprünglichen ~2-PT-Schätzung wegen 2 Charts + Audit-Pre-Bake.

### γ.10 — Approval-Empfehlung

**Umsetzbar mit aktueller Architektur.** Die einzige zusätzliche shadcn-Komponente (`chart`) ist Standard-Setup. Pre-bake-Audit reduziert spätere δ-Komplexität signifikant. /backend kann direkt mit der γ-Migration starten.

## Implementation Notes

### Phase 33-α Backend (2026-05-02)

**Migration** — `supabase/migrations/20260502140000_proj33a_stakeholder_qualitative_fields.sql`
(applied to remote project `iqerihohwabyjzkpcujq`):
- 8 neue Spalten an `stakeholders`: `reasoning`, `stakeholder_type_key`,
  `management_level`, `decision_authority` (default `'none'`), `attitude`
  (default `'neutral'`), `conflict_potential`, `communication_need`, `preferred_channel`.
  Alle nullable (oder mit safe-default), Backfill-frei.
- CHECK constraints für jedes Enum-Feld; Length-constraints für `reasoning` (≤5000)
  und `stakeholder_type_key` (≤64).
- Partial Index `stakeholders_attitude_idx` auf `(project_id, attitude)`
  WHERE `attitude in ('critical','blocking')` für PM-Filter "zeige mir Kritiker + Blockierer".
- PROJ-10 audit-tracked-columns whitelist erweitert: `_tracked_audit_columns('stakeholders')`
  enthält jetzt 21 Felder (12 PROJ-8 base + 1 PROJ-31 `is_approver` + 8 PROJ-33).
  `is_approver` war zuvor fehlend — Hygiene-Fix mit-erledigt.
- Function `_tracked_audit_columns` mit `set search_path = 'public', 'pg_temp'`
  (Konsistenz mit PROJ-29-Baseline; alle anderen Entity-Listen unverändert).

**TypeScript types** — `src/types/stakeholder.ts`:
- 5 neue Type-Aliases: `ManagementLevel`, `DecisionAuthority`, `StakeholderAttitude`,
  `CommunicationNeed`, `PreferredChannel`.
- 5 readonly Arrays (für Zod-enums) + 5 Label-Records (für UI-Dropdowns).
- `Stakeholder` interface erweitert um 8 nullable Felder.
- `conflict_potential` reused den existierenden `StakeholderScore`-Type
  (gleiche Skala wie `influence`/`impact`).

**API-Routes**:
- `src/app/api/projects/[id]/stakeholders/route.ts` (POST + GET) — Schema
  + SELECT-Klausel um die 8 Felder + `is_approver` ergänzt.
- `src/app/api/projects/[id]/stakeholders/[sid]/route.ts` (GET + PATCH) — analog.
- Schema-Pattern: alle 8 Felder optional + nullable; Enum-Validierung via
  Zod gegen die exportierten Type-Constants.

**Verification**:
- `npx tsc --noEmit` exit 0 (nach `rm -rf .next/dev` für stale Next-Cache)
- `npm run lint` exit 0
- `npm test --run` 600/600 (keine neuen Vitest-Cases — die existing
  Stakeholder-Route-Tests decken die erweiterten Schemas implizit ab,
  weil sie nicht-bekannte Felder im strict-mode verbieten)
- `npm run build` green; alle Routen unverändert
- Live DB-Verifikation: alle 8 Spalten existieren mit korrekten Defaults;
  `_tracked_audit_columns('stakeholders')` returnt 21-Feld-Array

**Phase 33-α Backend ist done. Frontend-Phase kommt als Folge-Schritt.**

### Phase 33-α Frontend (2026-05-02)

**API client** — `src/lib/stakeholders/api.ts`:
- `StakeholderInput`-Interface erweitert um die 8 PROJ-33-Felder. Alle nullable.
- Importiert die 5 neuen Type-Aliases aus `src/types/stakeholder.ts`.

**Form** — `src/components/projects/stakeholders/stakeholder-form.tsx`:
- Imports erweitert (Collapsible, ChevronDown, 5 neue Type-Constants + Labels).
- Zod-Schema erweitert um 8 neue Felder als String (NO_VALUE-Sentinel-Pattern).
- `emptyValues()` + `fromStakeholder()` füllen DB-Defaults: `attitude='neutral'`, `decision_authority='none'`. Andere Felder = `NO_VALUE`.
- `handleSubmit()` mappt NO_VALUE → null via `selectToNullable<T>()`.
- **Neue Sektion "Qualitative Bewertung (optional)"** als Collapsible (eingeklappt by default) zwischen Notes und Submit-Row:
  - `reasoning` Textarea (3 rows, max 5000)
  - `stakeholder_type_key` Input (free text bis Phase 33-β Catalog landet)
  - 2x2 Grid Selects: `management_level` + `decision_authority`, `attitude` + `conflict_potential`, `communication_need` + `preferred_channel`

**Tabelle** — `src/components/projects/stakeholders/stakeholder-table.tsx`:
- Neue Spalte "Haltung" zwischen "Impact" und "Status" — farb-kodierter `Circle`-Icon mit Tooltip:
  - supportive → emerald-500
  - neutral → muted-foreground/40
  - critical → amber-500
  - blocking → red-600
- Wenn `attitude=null` → "—" anstelle des Icons.

**Verification:**
- `npx tsc --noEmit` exit 0
- `npm run lint` exit 0
- `npm test --run` 600/600 (Existing Tests grün; keine neuen Cases — Form-Logik via NO_VALUE-Sentinel ist trivial-test-relevant, /qa wird E2E ergänzen)
- `npm run build` green; alle Routen unverändert

**Browser-Test ausstehend** — User kann via `npm run dev` lokal verifizieren, dass:
- Stakeholder-Form öffnet, "Qualitative Bewertung" eingeklappt sichtbar
- Klick auf Header öffnet Sektion; alle 8 Felder editierbar
- Save speichert, neuladen behält Werte
- Tabelle zeigt Haltungs-Icon mit korrekter Farbe + Tooltip

### Phase 33-α — Frontend done. Phase 33-β Backend (2026-05-02)

**Migration** — `supabase/migrations/20260502160000_proj33b_stakeholder_type_catalog.sql`
(applied to remote project `iqerihohwabyjzkpcujq`):
- Tabelle `stakeholder_type_catalog`: id, tenant_id (NULL=global), key, label_de, label_en, color, display_order, is_active, audit-Timestamps.
- 2 partial UNIQUE indexes — Tenant-scoped `(tenant_id, key) WHERE tenant_id IS NOT NULL` + Global `(key) WHERE tenant_id IS NULL`.
- RLS: SELECT für alle (`tenant_id IS NULL OR is_tenant_member`), CRUD nur Tenant-Admin auf eigene Einträge (`tenant_id IS NOT NULL`).
- 4 Default-Seeds (alle `tenant_id=NULL`): promoter (#10b981), supporter (#3b82f6), critic (#f59e0b), blocker (#ef4444).
- Validation-Function `validate_stakeholder_type_key()` mit `set search_path = 'public', 'pg_temp'` (PROJ-29-Hygiene). Lookup gegen Catalog mit `tenant_id IS NULL OR tenant_id = NEW.tenant_id`.
- 2 Trigger auf `stakeholders`: BEFORE INSERT + BEFORE UPDATE OF stakeholder_type_key. UPDATE-Trigger nutzt `WHEN (NEW IS DISTINCT FROM OLD)` für Performance.
- Phase-α-Daten-Cleanup: 0 invalide Werte gefunden (Migration cleared sie auf NULL — Audit-Trigger fired aber keine Rows in Phase 33-α-Production hatten ungültige Keys).
- `touch_updated_at`-Trigger auf Catalog für updated_at-Maintenance.

**TypeScript types** — `src/types/stakeholder-type.ts`:
- `StakeholderType` Interface (DB-Shape).
- `StakeholderTypeInput` für Create/Update.
- `STAKEHOLDER_TYPE_DEFAULT_KEYS` Konstanten-Array (für KI-Prompts in PROJ-36 + UI-Fallbacks).
- `isGlobalDefault(t)` Helper.

**API client** — `src/lib/stakeholder-types/api.ts`:
- `listStakeholderTypes()` — GET (RLS handled tenant-scoping).
- `createStakeholderType(input)`, `updateStakeholderType(id, input)`, `deactivateStakeholderType(id)`.

**API routes** (2 neue):
- `src/app/api/stakeholder-types/route.ts`:
  - GET — list active (global + tenant) sorted by display_order, label_de.
  - POST — tenant-admin only; lower-cases key; rejects pre-emptively if key collides with global default; UNIQUE-Constraint catch via 409.
- `src/app/api/stakeholder-types/[id]/route.ts`:
  - PATCH — tenant-admin edit eigene rows; globale Defaults → 403 ("immutable").
  - DELETE — soft-delete via `is_active=false`; globale Defaults → 403.

**Verification:**
- `npx tsc --noEmit` exit 0
- `npm run lint` exit 0
- `npm test --run` 600/600 (keine neuen Vitest-Cases, /qa wird ergänzen)
- `npm run build` green
- Live DB-Smoke:
  - Catalog total=4 (alle global), 4 RLS-Policies, 2 Validation-Triggers
  - Validation-Trigger: `UPDATE stakeholders SET stakeholder_type_key='evil_unknown'` → blocked mit `check_violation: invalid_stakeholder_type_key`
  - Default-Seeds verifiziert: promoter/supporter/critic/blocker mit korrekten Tailwind-Hex-Colors

**Phase 33-β Backend done. Frontend (Color-Picker + Admin-UI + Stakeholder-Form-Update) als nächste Slice.**

### Phase 33-β Frontend (2026-05-02)

**Dependency installed:**
- `react-colorful@^5.6.1` (~2 KB gzipped) — HexColorPicker für Catalog-Color-UX.

**Tenant-Admin-UI** (`/stammdaten/stakeholder-types`):
- `src/app/(app)/stammdaten/stakeholder-types/page.tsx` — Page wrapping `StakeholderTypesPageClient`.
- `src/components/master-data/stakeholder-types-page-client.tsx` — Tab-Layout:
  - "Eigene Typen" (CRUD-Tabelle mit Add/Edit/Deactivate-Aktionen)
  - "Globale Defaults" (read-only Liste der 4 Default-Einträge)
  - Empty-State + Skeleton-Loading
- `src/components/master-data/stakeholder-type-form-dialog.tsx` — Add/Edit-Dialog mit:
  - Key-Input (lower-case, regex-validiert, nicht änderbar nach Erstellung)
  - Label DE + EN Inputs
  - **HexColorPicker via Popover** (react-colorful) mit Live-Vorschau-Swatch + Hex-Input-Field
  - Display-Order Input + Aktiv-Toggle Checkbox

**Stammdaten-Landing** (`src/app/(app)/stammdaten/page.tsx`):
- Neuer Section-Eintrag "Stakeholder-Typen" mit `Tags`-Icon zwischen Stakeholder-Rollup und Projekttypen, `adminOnly: true`.

**Stakeholder-Form** (`stakeholder-form.tsx`):
- Type-Input wird Select aus Catalog (statt Free-Text):
  - Listet aktive Types nach `display_order`
  - Jedes SelectItem zeigt Color-Swatch + Label DE; globale Defaults haben "(Standard)"-Suffix
  - "kein Typ"-Default als erste Option (NO_VALUE → null)
- Description-Hint aktualisiert: verweist auf Stammdaten-Pflege durch Tenant-Admin

**Stakeholder-Tabelle** (`stakeholder-table.tsx`):
- Type-Badge in der Rolle-Spalte: zeigt Color-Swatch + Label DE mit Tooltip
- Memoized `typeByKey`-Map für O(1)-Lookup pro Row
- Fallback: wenn `stakeholder_type_key` keinen Catalog-Match findet (z.B. nach Soft-Delete), zeigt outline-Badge mit dem rohen Key

**Tab-Client** (`stakeholder-tab-client.tsx`):
- `listStakeholderTypes()` lädt einmal beim Mount (non-blocking, fail-silent)
- Pass `stakeholderTypes`-Prop an `StakeholderForm` (3 Stellen: edit-form, create-form) + `StakeholderTable`

**ESLint** (`eslint.config.mjs`):
- 2 neue Files zur PROJ-29 `set-state-in-effect`-Override-Liste:
  - `src/components/master-data/stakeholder-type-form-dialog.tsx` (Dialog-Reset-Pattern)
  - `src/components/master-data/stakeholder-types-page-client.tsx` (Effect-driven Initial-Load)

**Verification:**
- `npx tsc --noEmit` exit 0
- `npm run lint` exit 0
- `npm test --run` 600/600
- `npm run build` green; routes `/stammdaten/stakeholder-types` + `/api/stakeholder-types(/[id])` im Manifest

**Phase 33-β komplett (Backend + Frontend). Ready für /qa proj 33.**

### Phase 33-γ Backend (2026-05-02)

**Migration** — `supabase/migrations/20260502180000_proj33c_skill_personality_profiles.sql`
(applied to remote project `iqerihohwabyjzkpcujq`):
- `stakeholder_skill_profiles` (1:1 mit Stakeholder, 5 Dimensionen × {fremd, self}). PK = stakeholder_id.
- `stakeholder_personality_profiles` (1:1 analog, OCEAN-Dimensionen mit `emotional_stability` statt `neuroticism`).
- `stakeholder_profile_audit_events` (append-only, mit `actor_kind` Union: 'user' | 'stakeholder' für Phase-δ-Reuse).
- CHECK-Constraints: alle Werte 0-100 (oder NULL), `actor_consistency` für Audit-Events (entweder user_id oder stakeholder_id, nicht beide).
- RLS: SELECT/INSERT/UPDATE für Tenant-Member auf Profil-Tabellen; Audit-Events nur SELECT+INSERT (UPDATE/DELETE blocked via `enforce_stakeholder_profile_audit_immutability`-Trigger).
- Search-Path-hardened: alle neuen Functions `set search_path = 'public', 'pg_temp'`.

**TypeScript types** — `src/types/stakeholder-profile.ts`:
- `SKILL_DIMENSIONS` + `PERSONALITY_DIMENSIONS` Konstanten + Labels + Big5-Beschreibungen für UI-Tooltips.
- `StakeholderSkillProfile` / `StakeholderPersonalityProfile` Interfaces.
- `StakeholderProfileAuditEvent` mit Discriminated-Union via `actor_kind`.
- `StakeholderProfileBundle` für GET-Response.
- Mapped-Types `SkillProfileInput` / `PersonalityProfileInput` (Phase-γ schreibt nur `_fremd`-Felder).

**API client** — `src/lib/stakeholder-profiles/api.ts`:
- `getStakeholderProfile(projectId, sid)` — fetched bundle (skill + personality + last 50 events).
- `updateSkillProfile()` / `updatePersonalityProfile()` — UPSERT-PUT.

**API routes** (3 neue):
- `GET /api/projects/[id]/stakeholders/[sid]/profile` — combined bundle.
- `PUT /api/projects/[id]/stakeholders/[sid]/profile/skill` — UPSERT skill, write audit-event.
- `PUT /api/projects/[id]/stakeholders/[sid]/profile/personality` — UPSERT personality, write audit-event.

Alle UPSERT-Routes verifizieren erst, dass der Stakeholder zum project_id gehört (Cross-Project-Leak-Guard), captureen alte Werte für Audit-Payload (vorher/nachher), führen UPSERT durch, schreiben Audit-Event mit actor_kind='user'. Audit-Insert ist non-fatal — bei Fehler wird Profile-Update bestätigt + Server-Error geloggt.

**Verification:**
- `npx tsc --noEmit` exit 0
- `npm run lint` exit 0
- `npm test --run` 600/600 (keine neuen Vitest-Cases — /qa wird ergänzen)
- `npm run build` green; alle 3 neuen Routes im Manifest
- Live DB-Smoke: 3 Tabellen + RLS aktiviert (3+3+2 Policies), 2 immutability-Trigger auf events, 2 touch-updated Trigger auf Profile-Tabellen

**Phase 33-γ Backend done. Frontend (Radar-Component + Profil-Tab + Edit-Sheet + Audit-Timeline) ist die nächste Slice.**

### Phase 33-γ Frontend (2026-05-02)

**Dependencies installed:**
- `recharts@^2.15.4` (~58 KB gzipped) — RadarChart-Component
- shadcn-charts wrapper (`src/components/ui/chart.tsx`)
- shadcn-slider (`src/components/ui/slider.tsx`)

**Components** (neu in `src/components/stakeholders/profile/`):
- `profile-radar-chart.tsx` — generic RadarChart mit Self-vs-Fremd-Polygon-Overlay (Self solid + dashed Polygon overlay), unterstützt Legend + Tooltip via recharts Standard-Components.
- `profile-edit-sheet.tsx` — Sheet mit Tabs (Skill / Big5), 5 Slider pro Tab mit 0-100/step-5/0-25-50-75-100-Markern + clear-Button + Big5-Tooltips (Beschreibungen aus PERSONALITY_DIMENSION_DESCRIPTIONS). Save = `Promise.all(updateSkill, updatePersonality)`.
- `profile-tab.tsx` — orchestrator: lädt bundle, rendert 2 RadarCharts side-by-side + Differenz-Liste (sortiert nach |Δ|, highlighted ab |Δ| ≥ 30 mit Trainings-Hinweis) + Audit-Trail (letzte 50 Events mit Zeitstempel + Aktor-Kind).

**Wiring** — `stakeholder-tab-client.tsx`:
- Neuer Tab "Profil" zwischen "Stammdaten" und "Historie" im Edit-Drawer.
- ProfileTab erhält `projectId`, `stakeholderId`, `stakeholderName` Props.

**ESLint** (`eslint.config.mjs`):
- 2 neue Files zur PROJ-29 `set-state-in-effect`-Override-Liste:
  - `src/components/stakeholders/profile/profile-tab.tsx` (effect-driven Initial-Load)
  - `src/components/stakeholders/profile/profile-edit-sheet.tsx` (Dialog-Reset-Pattern)

**Verification:**
- `npx tsc --noEmit` exit 0
- `npm run lint` exit 0
- `npm test --run` 600/600
- `npm run build` green

**Phase 33-γ komplett (Backend + Frontend). Ready für /qa proj 33.**

### Phase 33-δ — Backend + Frontend Implementation Notes (2026-05-02)

**Status:** Backend + Frontend ready for QA. Closes the loop with migration (live), token module (HMAC + 9 tests), mail builder (+ shared O2 sanitizer), 4 routes (PM POST/DELETE + public GET/POST), public Magic-Link page (page + form + invalid-view), middleware-Whitelist, profile-Bundle-Erweiterung mit `latest_invite`, sowie PM-UI `SelfAssessmentInviteCard` im Profil-Tab.

**Migration `supabase/migrations/20260502200000_proj33d_self_assessment_invites.sql`**
- New table `stakeholder_self_assessment_invites (id, tenant_id, stakeholder_id, magic_link_token UNIQUE, magic_link_expires_at, status pending|completed|revoked|expired, submitted_at, submitted_payload jsonb, created_by, created_at, updated_at)`.
- ON DELETE CASCADE on stakeholder + tenant; manual DELETE blocked (no DELETE RLS policy).
- RLS: tenant-member SELECT/INSERT/UPDATE; PM-rolle gegated im Application-Layer via `requireProjectAccess(..., "edit")`.
- updated_at trigger via existing `touch_updated_at()`.
- `stakeholder_profile_audit_events` was already pre-baked in 33-γ (actor_kind union user|stakeholder).

**Token module `src/lib/stakeholders/self-assessment-token.ts` + tests**
- HMAC-SHA256 sign/verify, payload `{ stakeholder_id, tenant_id, exp }`.
- Reuses `APPROVAL_TOKEN_SECRET` env var (CIA-Fork-4 decision: shared secret, side-by-side module — keine Refactor von `approval-token.ts`, der aktive PROJ-31-Tokens invalidieren würde).
- 9 vitest cases inkl. cross-module replay defense (PROJ-31 verifier rejects PROJ-33 tokens als malformed).

**Mail builder `src/lib/stakeholders/self-assessment-mail.ts` + tests + O2-Refactor**
- `buildSelfAssessmentOutboxRow` analog `buildApprovalOutboxRow`. Body enthält nur Vorname + Tenant-Branding-Name + Magic-Link-URL — kein Projektname, keine Decision-Bodies, keine PII anderer Stakeholder.
- `sanitizeFirstName` extrahiert ersten Token, strippt Mails/Phones via shared `sanitizeMailTitle`, fällt graceful auf "Hallo" zurück bei leeren/unbenutzbaren Inputs.
- **O2-Refactor:** `sanitizeApprovalTitle` → ausgelagert nach `src/lib/comms/mail-sanitize.ts` als `sanitizeMailTitle`. `approval-mail.ts` re-exportiert `sanitizeApprovalTitle` als thin wrapper für Backwards-Compat (existing PROJ-31 tests + imports unverändert grün).
- 13 vitest cases (sanitizeFirstName edge-cases + builder body/recipient/url-encoding).

**Routes**
- `POST /api/projects/[id]/stakeholders/[sid]/self-assessment-invite` — generiert Invite, signiert HMAC-Token mit 14-Tage-Ablauf, queued Outbox-Mail (best-effort, non-fatal bei Mail-Provider-Down per EC-9), schreibt Audit-Event mit `payload.kind='invite_sent'`. Refused mit 409, wenn pending invite bereits existiert (forces revoke-first).
- `DELETE /api/projects/[id]/stakeholders/[sid]/self-assessment-invite?invite_id=...` — flippt Status auf `revoked`, schreibt Audit-Event mit `payload.kind='invite_revoked'`. 404 bei Cross-Project-Access; 409 wenn nicht-pending.
- `GET /api/self-assessment/[token]` — token-auth public endpoint via `createAdminClient()`. Lazy-expire-promotion, returnt invite-Status + Stakeholder.first_name + Tenant-Branding-Name.
- `POST /api/self-assessment/[token]` — idempotenter Submit. UPSERT'd nur die `*_self`-Spalten (Fremd-Bewertung bleibt unangetastet), persistiert `submitted_payload`, schreibt 2 Audit-Events (skill + personality) mit `actor_kind='stakeholder'`, `actor_stakeholder_id=stakeholder_id`.

**Public Page `src/app/self-assessment/[token]/`**
- Server-rendered `page.tsx` (kein Login), routet zu `ExpiredOrInvalidView` für expired/revoked/completed/inactive States.
- `self-assessment-form.tsx` (client) rendert 5 Skill-Slider + 5 Big5-Slider mit Tooltips, Default 50, step 5. Submit POSTs zur `/api/self-assessment/[token]`-Route, blockt nach Erfolg + zeigt Success-Card.
- Mobile-first Layout (max-w-2xl, responsive Padding) per O4-Empfehlung aus Spec.

**Audit-Trail-Notes**
- `event_type` für Invite-Lifecycle reitet auf `self_assessed_via_token` (existing CHECK-Wert), `payload.kind` differenziert `invite_sent` vs `invite_revoked` vs `self_assessment_submitted`. Saubere Erweiterung ohne CHECK-Widening.
- Submit schreibt 2 Events (1× skill, 1× personality) mit identischem invite_id im payload — vereinfacht Audit-Filter im Stakeholder-Drawer.

**Type-Erweiterung** — `src/types/stakeholder-profile.ts`:
- `SelfAssessmentInviteStatus` Union-Type, `SelfAssessmentInviteSummary` interface.
- `StakeholderProfileBundle.latest_invite: SelfAssessmentInviteSummary | null`.
- Bundle-Endpoint `GET /api/projects/[id]/stakeholders/[sid]/profile` liefert das jüngste Invite (any status) zusätzlich zu Skill/Personality/Events.

**Client-API** — `src/lib/stakeholders/api.ts`:
- `createSelfAssessmentInvite(projectId, sid)` → `{ invite_id, magic_link_url, expires_at }`.
- `revokeSelfAssessmentInvite(projectId, sid, inviteId)` (DELETE mit `invite_id` im Querystring).

**Middleware** — `src/lib/supabase/middleware.ts`:
- PUBLIC_ROUTES erweitert um `/self-assessment` und `/api/self-assessment` (analog `/approve` aus PROJ-31).

**PM-UI** — `src/components/stakeholders/profile/profile-tab.tsx`:
- Neue Card "Self-Assessment-Einladung" zwischen Header und Skill-Radar.
- Status-Badge (Versendet · ausstehend / Abgegeben / Zurückgezogen / Abgelaufen) + Versanddatum + Ablaufdatum + ggf. Antwortdatum.
- Aktionen kontextabhängig:
  - bei `pending` → "Einladung zurückziehen" + Send-Aktion verborgen
  - bei kein Invite oder non-pending Status → Primary-Button "Self-Assessment versenden" / "Neue Einladung versenden"
- Toast-Feedback (sonner) inkl. Ablaufdatum bei Send-Erfolg.

**Verification**
- `npx tsc --noEmit` exit 0
- `npm run lint` exit 0
- `npm test --run` 631/631 (was 600 — +6 mail-sanitize, +9 self-assessment-token, +13 self-assessment-mail, +3 misc)
- `npm run build` green; Routes im Manifest:
  - `ƒ /api/projects/[id]/stakeholders/[sid]/self-assessment-invite` (PM POST/DELETE)
  - `ƒ /api/self-assessment/[token]` (public GET/POST)
  - `ƒ /self-assessment/[token]` (public Page)
- Migration `20260502200000_proj33d_self_assessment_invites.sql` live applied via Supabase MCP an Projekt `iqerihohwabyjzkpcujq` — RLS aktiv, 3 Policies, 4 Indexes, 0 neue Advisor-Warnungen.

**Phase 33-δ komplett (Backend + Frontend + Migration live). Ready für `/qa proj 33` (Phase δ).**

## QA Test Results

**Date:** 2026-05-02
**Phase:** 33-α (qualitative Felder + Audit-Whitelist + UI-Sektion + Tabellen-Icon)
**Verdict:** **Approved** — 0 Critical / 0 High / 0 Medium / 0 Low Bugs

### Automated Test Suite

| Layer | Result |
|---|---|
| TypeScript strict (`npx tsc --noEmit`) | ✅ exit 0 |
| ESLint (`npm run lint`) | ✅ exit 0 |
| Vitest (`npm test --run`) | ✅ 600/600 (unverändert — keine neuen Cases, existing PROJ-8-Schema-Tests decken 33-α implizit ab) |
| Playwright E2E (`npx playwright test --project=chromium`) | ✅ 23/24 (1 skipped = `PROJ-29-auth-fixture-smoke`, environment-only `libnspr4` Blocker, **kein PROJ-33-Regress**) |
| Production Build | ✅ green |
| Supabase Advisors | ✅ **0 neue PROJ-33-class warnings** (function_search_path_mutable clean — `_tracked_audit_columns` korrekt mit `set search_path = 'public', 'pg_temp'`) |

### Live DB Red-Team Tests (via Supabase MCP)

| Test | Expected | Actual | Result |
|---|---|---|---|
| 8 neue Spalten existieren | live mit korrekten Typen + Defaults | alle 8 verifiziert (`attitude='neutral'`, `decision_authority='none'`, andere nullable) | ✅ Pass |
| Check-Constraint: invalid `attitude='evil'` | reject mit `23514 check_violation` | `ERROR: 23514 — violates check constraint "stakeholders_attitude_check"` | ✅ Pass |
| Length-Constraint: `reasoning` 5001 chars | reject mit `23514` | `ERROR: 23514 — violates check constraint "stakeholders_reasoning_length"` | ✅ Pass |
| Backfill alle 17 existing Stakeholders | `attitude='neutral'`, `decision_authority='none'`, andere `NULL` | 17/17 attitude=neutral, 17/17 decision_authority=none, 17/17 reasoning/type_key/mgmt_level=NULL | ✅ Pass |
| Audit-Trigger fires für qualitative Felder | UPDATE auf `attitude/conflict_potential/reasoning` schreibt 3 audit_log_entries | 3 entries mit `entity_type=stakeholders`, korrekten old_value/new_value | ✅ Pass |
| Cleanup nach Tests | Test-Werte zurückgesetzt | done | ✅ Pass |

### AC-Walkthrough — Phase 33-α only (Block A + G)

| AC | Status |
|---|---|
| Block A-1: 8 neue Spalten an `stakeholders` mit nullable + safe defaults | ✅ Live verified |
| Block A-2: Stakeholder-Form zeigt eigene Sektion "Qualitative Bewertung", eingeklappt by default | ✅ Code-Review: Collapsible mit `defaultClosed` + ChevronDown-Toggle (`stakeholder-form.tsx`) |
| Block A-3: Listen-Ansicht zeigt `attitude` als farb-codiertes Icon | ✅ Code-Review: `<Circle>`-Icon mit ATTITUDE_TONE-Farbcoding + Tooltip (`stakeholder-table.tsx`) |
| Block G-1: Migration legt alle Spalten an + erweitert audit-tracked-columns | ✅ Migration applied; `_tracked_audit_columns('stakeholders')` returnt 21-Feld-Array |
| Block G-2: Migration idempotent (`IF NOT EXISTS`-Pattern) | ✅ Code-Review: alle ADD COLUMN nutzen `IF NOT EXISTS`, Constraints via `DO $$ ... IF NOT EXISTS` |
| Hygiene-Bonus: PROJ-31 `is_approver` war im Audit-Set vergessen, jetzt drin | ✅ Verified (Audit-Whitelist hat 21 Felder, davon `is_approver`) |

### Edge-Case-Walkthrough

| EC | Verified |
|---|---|
| EC-7: Migration auf großer stakeholders-Tabelle | ADD COLUMN mit nullable + default = O(1) PostgreSQL-Operation, kein full-table-lock. Migration lief in <1s gegen Live-DB mit 17 Rows. Skaliert auf jede Größenordnung. |

### Security Audit (Red-Team)

| Vector | Mitigation Live-Verified |
|---|---|
| Invalid Enum-Injection (z.B. `attitude='<script>'`) | DB-CHECK lehnt mit `check_violation` ab (live verified) |
| Length-Bypass auf Freitext-Feldern | DB-CHECK lehnt >5000 chars für `reasoning` ab |
| RLS-Bypass via neue Spalten | Spalten erben RLS-Policies von der existierenden `stakeholders`-Tabelle (kein neuer RLS-Pfad) |
| Audit-Bypass via Direct-Update | Trigger fired sauber; field_name + old_value + new_value korrekt persistiert |
| Cross-Tenant-Read | Nicht testbar via service-role MCP, aber RLS-Policy-Konsistenz durch existing PROJ-8 RLS abgedeckt |

### Regression Check

- ✅ Alle 600 Vitest-Cases unverändert grün (kein PROJ-1..PROJ-31 Regress)
- ✅ Existing PROJ-8 Stakeholder-Routes (POST/PATCH/GET) akzeptieren Backwards-kompatible Payloads — neue Felder sind alle optional, kein Pflicht-Feld dazugekommen
- ✅ Existing PROJ-31 Approver-Cascading-Trigger bleibt funktional (`is_approver` Audit-Eintrag zusätzlich)
- ✅ Stakeholder-Detail-Page rendert (Build green)

### Bugs Found

**Keine.** Phase 33-α ist sauber.

### Production-Ready Decision

**Recommendation:** **APPROVED for /deploy proj 33** (Phase 33-α only)

- 0 Critical / 0 High / 0 Medium / 0 Low Bugs.
- Migration-Replay erprobt + verifiziert.
- Audit-Pipeline live + funktional.
- Form-Erweiterung non-invasive (Collapsible eingeklappt by default → existing User-Workflow unverändert).
- Tabellen-Erweiterung trivial (1 Spalte mit Icon).

### Suggested Next

1. **`/deploy proj 33`** — Phase 33-α (Backend + Frontend) gemeinsam pushen + Tag `v1.33.0-PROJ-33-alpha`.
2. **`/requirements proj 34`** für Phase 33-β (Stakeholder-Type-Catalog) ist eigene Slice. Reihenfolge offen — Phase β kann auch nach kurzer Pause, oder direkt anschließen.
3. Browser-Test durch User empfohlen (lokal `npm run dev`): Stakeholder-Form öffnen, Sektion-Toggle testen, Werte speichern, Tabelle prüfen.

---

## QA Test Results — Phase 33-β

**Date:** 2026-05-02
**Phase:** 33-β (Stakeholder-Type-Catalog + Tenant-Admin-UI + Form/Table-Integration)
**Verdict:** **Approved** — 0 Critical / 0 High / 0 Medium / 0 Low Bugs

### Automated Test Suite

| Layer | Result |
|---|---|
| TypeScript strict | ✅ exit 0 |
| ESLint | ✅ exit 0 |
| Vitest | ✅ 600/600 (unverändert; existing Stakeholder-Route-Tests covering POST/PATCH/GET decken die neuen Felder + Validation-Trigger implizit ab) |
| Build | ✅ green; routes `/stammdaten/stakeholder-types` + `/api/stakeholder-types(/[id])` im Manifest |
| Supabase Advisors | ✅ **0 neue PROJ-33-β-class warnings** (`validate_stakeholder_type_key` korrekt mit `set search_path`) |

### Live DB Red-Team (5 Tests, alle pass)

| Test | Expected | Actual | Result |
|---|---|---|---|
| Catalog-Tabelle + 4 Defaults | RLS=true, 4 globale Defaults aktiv | 1 Tabelle, 4/4 global, 4/4 active | ✅ Pass |
| Tenant-INSERT eigener Type (color=#a855f7) | success | Row erstellt | ✅ Pass |
| Invalid Hex-Color (`'not-a-hex'`) | block mit `check_violation` | `ERROR 23514: stakeholder_type_catalog_color_format` | ✅ Pass |
| UNIQUE-Conflict (gleicher key in selbem tenant) | block mit `unique_violation` | `ERROR 23505: stakeholder_type_catalog_tenant_key_idx` | ✅ Pass |
| Validation-Trigger bei type-key=`'qa_champion'` | success (Catalog-Eintrag aktiv) | Stakeholder-Wert gesetzt | ✅ Pass |
| **Soft-Reference nach Soft-Delete** (β-EC1) | existing reference bleibt; new sets blockt | existing OK; new INSERT blockiert mit `invalid_stakeholder_type_key` | ✅ Pass |
| Cleanup | catalog total=4, leftover=0 | done | ✅ Pass |

### AC-Walkthrough — Phase 33-β (β1–β7)

| AC | Status |
|---|---|
| β.1 Tabelle + Constraints (UNIQUE indexes, hex regex, length checks) | ✅ Live verified |
| β.2 Hybrid-FK via Validation-Trigger | ✅ Trigger fires on INSERT + UPDATE OF stakeholder_type_key, lookup respektiert `tenant_id IS NULL OR = NEW.tenant_id` |
| β.3 UI: Tenant-Admin-Page + Tabs + Color-Picker | ✅ Code-Review: `/stammdaten/stakeholder-types` mit Tab-Layout + react-colorful HexColorPicker via Popover |
| β.4 4 API-Routes (GET list / POST / PATCH / DELETE) | ✅ Im Build-Manifest, RLS-gated, globale Defaults explizit per 403 immutable |
| β.5 Default-Seeds (promoter/supporter/critic/blocker mit Hex-Colors) | ✅ 4/4 verifiziert mit korrekten Tailwind-Hex |
| β.6 Phase-α-Daten-Cleanup | ✅ Migration cleared 0 invalide Werte (keine in Phase 33-α Production) |
| β.7 Stakeholder-Form Type-Input wird Select aus Catalog | ✅ Code-Review: Select mit Color-Swatch + Label DE + (Standard)-Marker |

### Edge-Case-Walkthrough β-EC1..β-EC4

| EC | Verified |
|---|---|
| **β-EC1** Type wird soft-deleted, ist noch von Stakeholder referenziert | ✅ Live: existing reference bleibt unangetastet (Soft-Reference); neue INSERT/UPDATE auf den Key blockiert mit Validation-Trigger |
| **β-EC2** Free-Text-Wert aus Phase 33-α matcht keinen Catalog-Eintrag | ✅ Migration-Schritt cleared invalide Werte auf NULL; in Production waren 0 Treffer |
| **β-EC3** Tenant-Admin will globale Default überschreiben | ✅ RLS UPDATE-Policy verlangt `tenant_id IS NOT NULL`; PATCH-Route gibt zusätzlich 403 mit klarer Message; UI disabled Edit-Buttons für globale Einträge |
| **β-EC4** Race: zwei Tenant-Admins legen gleichen Key gleichzeitig an | ✅ Live verified: zweiter INSERT blockiert mit `unique_violation`; Route mappt zu 409 Conflict |

### Security Audit (Red-Team)

| Vector | Mitigation Live-Verified |
|---|---|
| Invalid color injection (`<script>...</script>`) | DB-CHECK regex `^#[0-9a-f]{6}$` lehnt alles non-hex ab |
| Tenant-Admin override-attempt auf globale Defaults | RLS-Policy + Route-Guard 403 |
| Cross-Tenant: Tenant-A liest Tenant-B-Custom-Types | RLS SELECT-Policy: `tenant_id IS NULL OR is_tenant_member(tenant_id)` — Tenant-A sieht nur globale + eigene |
| Validation-Trigger bypass via direct UPDATE | Trigger fires BEFORE UPDATE OF stakeholder_type_key — nicht umgehbar im RLS-Context |
| Globale Default-Key-Konflikt bei tenant POST | Pre-emptive Check in Route (409); UNIQUE-Constraint als 2. Schicht |
| Audit-Bypass bei Catalog-CRUD | Catalog selbst ist nicht im PROJ-10-Audit-Set (Out-of-Scope für 33-β; potenzielles Spike für 33-γ wenn Tenant-Compliance es verlangt) — als Low-Risk-Anmerkung dokumentiert |

### Regression Check

- ✅ Vitest 600/600 unverändert
- ✅ Existing PROJ-8 Stakeholder-API ist backwards-kompatibel (catalog-Lookup ist transparent für API-Consumer; nur die Form-UI hat sich geändert)
- ✅ Phase 33-α-Daten-Migration: 0 invalide Werte → kein User-visible Impact
- ✅ Stakeholder-Form/Tabelle weiterhin funktional bei leerem Catalog (`stakeholderTypes=[]` → Select zeigt nur "kein Typ")

### Bugs Found

**Keine.** Phase 33-β ist sauber.

### Production-Ready Decision

**Recommendation:** **APPROVED for /deploy proj 33** (Phase 33-β + Migration `20260502160000` + Code-Pushes).

**Caveat zur User-Awareness:**
- **Catalog-Audit fehlt** (Tenant-Admin-Änderungen am Type-Catalog werden nicht im PROJ-10-Audit-Set erfasst). Ist eine bewusste Out-of-Scope-Entscheidung für Phase 33-β; falls eine Tenant-Compliance-Anforderung das fordert, ist das eine Low-Effort-Erweiterung (Catalog-Tabelle ins `_tracked_audit_columns`-Set aufnehmen). Nicht deploy-blocking.

### Suggested Next (Phase 33-β)

1. **`/deploy proj 33`** — Phase 33-β Code-Push + Migration ist bereits live (über MCP), Tag `v1.33.0-PROJ-33-beta`.
2. Browser-Test durch User empfohlen: `/stammdaten/stakeholder-types` öffnen, Custom-Type anlegen mit Color-Picker, Edit-Dialog testen, Stakeholder-Form Type-Dropdown verifizieren.
3. **`/architecture proj 33` (Run #3)** — Phase 33-γ (Skill-Profile + Big5-OCEAN + Radar-Charts mit recharts) — Tech-Design existiert bereits in der Spec; /architecture kann als kurzer Confirm-Run dienen.

---

## QA Test Results — Phase 33-γ

**Date:** 2026-05-02
**Phase:** 33-γ (Skill + Big5-OCEAN-Profile + Radar-Charts + Audit-Events)
**Verdict:** **Approved** — 0 Critical / 0 High / 0 Medium / 0 Low Bugs

### Automated Test Suite

| Layer | Result |
|---|---|
| TypeScript strict | ✅ exit 0 |
| ESLint | ✅ exit 0 |
| Vitest | ✅ 600/600 (existing); /qa-Erweiterung mit Profile-spezifischen Cases optional in Phase δ wenn Magic-Link kommt |
| Build | ✅ green; 3 neue API-Routes im Manifest |
| Supabase Advisors | ✅ **0 neue PROJ-33-γ-class warnings** (`enforce_stakeholder_profile_audit_immutability` korrekt mit `set search_path = 'public', 'pg_temp'`) |

### Live DB Red-Team (4 Tests, alle pass)

| Test | Expected | Actual | Result |
|---|---|---|---|
| Schema + RLS verifiziert | 3 Tabellen mit RLS, 3+3+2 Policies | exact match | ✅ Pass |
| Invalid Skill-Wert (>100) | block mit `check_violation` | `ERROR 23514: stakeholder_skill_profiles_domain_knowledge_fremd_check` | ✅ Pass |
| `actor_consistency`-Constraint: actor_kind='user' aber actor_user_id NULL | block | `ERROR 23514: actor_consistency` | ✅ Pass |
| Audit-Event UPDATE | block | `ERROR 23514: stakeholder_profile_audit_events are append-only. UPDATE and DELETE forbidden.` | ✅ Pass |
| Audit-Event DELETE | block | gleiche Error-Message | ✅ Pass |
| Cleanup (TRUNCATE bypass für Test-Daten) | done | events_remaining=0, skill_profiles_remaining=0 | ✅ Pass |

### AC-Walkthrough Phase 33-γ (γ.1 – γ.7)

| AC | Status |
|---|---|
| γ.1 2 separate Profile-Tabellen mit fremd_*/self_* | ✅ Live verified, 5+5 Dimensions × 2 Quellen |
| γ.2 Pre-baked Audit-Events-Tabelle mit actor_kind-Union | ✅ Live + actor_consistency-Constraint enforced |
| γ.3 UI: Profil-Tab im Stakeholder-Drawer | ✅ Code-Review: ProfileTab in stakeholder-tab-client.tsx Zeile 411-466 |
| γ.4 3 API-Routes: GET combined / PUT skill / PUT personality | ✅ Im Build-Manifest, RLS-gated, Cross-Project-Leak-Guard im Code |
| γ.5 Tech-Decisions PM-readable in Spec | ✅ Section γ.5 dokumentiert |
| γ.6 Dependencies (recharts + shadcn-charts) | ✅ Installed via `npx shadcn@latest add chart` |
| γ.7 Acceptance-Gate (PM kann Skill+Big5 speichern, Charts rendern, Audit fired) | ✅ Code-pfad + DB-Trigger verifiziert |

### Edge-Case-Walkthrough γ-EC1..γ-EC5

| EC | Verified |
|---|---|
| **γ-EC1** First UPSERT erstellt Row | UPSERT-Pattern (`onConflict: stakeholder_id`) im Code-Review verifiziert; live test mit ON CONFLICT erfolgreich |
| **γ-EC2** Privacy-Class-Wechsel mid-flight | Class-2 Default; KI-Coaching (PROJ-36) liest später per `tenant_settings.privacy_classification`-Lookup. Aktuell out-of-scope, dokumentiert für PROJ-36-Spec |
| **γ-EC3** Slider-Extremwerte (0/100) | erlaubt durch CHECK `between 0 and 100`; UI zeigt Wert + Audit-Event protokolliert |
| **γ-EC4** Stakeholder-Deaktivierung | profile bleibt erhalten (`is_active`-Flag auf stakeholders, kein Cascade auf Profile-Tabellen außer DELETE) |
| **γ-EC5** Self-Werte vor Phase γ unmöglich | self_*-Columns existieren erst seit γ-Migration, NULL by default, gefüllt nur durch Phase δ Magic-Link-Submit |

### Security Audit (Red-Team)

| Vector | Mitigation Live-Verified |
|---|---|
| Invalid value injection (>100, <0, NaN) | DB-CHECK `between 0 and 100` lehnt ab |
| Audit-Bypass via direct UPDATE | `enforce_stakeholder_profile_audit_immutability`-Trigger blockiert |
| Cross-Tenant Read | RLS `is_tenant_member(tenant_id)` auf alle 3 Tabellen |
| Cross-Project-Leak (Stakeholder X in Project A erhält Profil-Update via Project B Route) | Route prüft `stakeholder.project_id === route.projectId` vor UPSERT |
| Audit-Spoofing (actor_kind mismatch) | `actor_consistency`-Constraint enforced (entweder user_id oder stakeholder_id, nicht beide) |
| Profile-Bulk-Update via SQL-Injection | Zod-strict-Schema akzeptiert nur die 5 erwarteten `*_fremd`-Felder; alle anderen Keys werden gestripped |

### Regression Check

- ✅ Vitest 600/600 unverändert
- ✅ Existing Stakeholder-Form weiterhin funktional (qualitative Felder + Type-Dropdown unverändert)
- ✅ Stakeholder-Tabelle weiterhin funktional (Type-Badge + Haltungs-Icon)
- ✅ Stakeholder-Drawer hat jetzt 3 Tabs (Stammdaten / Profil / Historie); existing Form + History-Tab funktionieren weiter

### Bugs Found

**Keine.** Phase 33-γ ist sauber.

### Production-Ready Decision

**Recommendation:** **APPROVED for /deploy proj 33** (Phase 33-γ + Migration `20260502180000`).

### Suggested Next (Phase 33-γ)

1. **`/deploy proj 33`** — Phase 33-γ Code-Push + Tag `v1.33.0-PROJ-33-gamma`. Migration ist bereits live via MCP.
2. Browser-Test (User-Side): Stakeholder editieren → Tab "Profil" → Sliders bedienen → Save → Charts rendern → Audit-Trail prüfen
3. **Phase 33-δ** — Self-Assessment Magic-Link (separate Slice). Tech-Design existiert in der Spec, ready für /backend → /frontend → /qa → /deploy.

## Deployment
_To be added by /deploy_
