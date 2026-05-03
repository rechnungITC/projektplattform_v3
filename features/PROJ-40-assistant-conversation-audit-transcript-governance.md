# PROJ-40: Assistant Conversation Audit & Transcript Governance

## Status: Planned
**Created:** 2026-05-04
**Last Updated:** 2026-05-04

## Origin
Diese Spec ist die Governance- und Datenschutz-Fortsetzung zu PROJ-37/38/39. Sobald der Assistant Spracheingaben, Transkripte, Intent-Entscheidungen und Aktionsausführungen verarbeitet, braucht die Plattform ein explizites Modell für Audit, Retention, Redaction und Export — statt diese Daten implizit in Logs oder freien Chat-Verläufen zu verlieren.

## Summary
Builds the governance layer for the assistant: structured conversation/session records, transcript handling, action audit, privacy classification, retention, redaction, exportability, and tenant-level policy control. This slice defines what parts of an assistant interaction are stored, how sensitive content is treated, how long it lives, and how it is exposed to admins and auditors. It prevents the voice/text assistant from becoming an ungoverned shadow channel beside the existing audit and privacy architecture.

## Dependencies
- Requires: PROJ-10 (audit / retention / export patterns)
- Requires: PROJ-12 (privacy classification and routing)
- Requires: PROJ-17 (tenant settings / module / retention controls)
- Requires: PROJ-37 (assistant UX)
- Requires: PROJ-38 (orchestrator runtime)
- Requires: PROJ-39 (concrete action packs)
- Influences: PROJ-41 (speech infrastructure), PROJ-42 (future domain packs), future compliance/export slices

## User Stories

1. **Transparent assistant use** — Als Tenant-Admin möchte ich nachvollziehen können, wann und wie der Assistant genutzt wurde, damit Sprache/Text keine intransparente Nebenspur bildet.

2. **Sensitive transcript handling** — Als Datenschutzverantwortlicher möchte ich, dass Sprachtranskripte und Gesprächsinhalte klassifiziert, redigiert und nur kontrolliert gespeichert werden, damit class-3-Inhalte nicht unkontrolliert verbleiben.

3. **Action audit** — Als Auditor möchte ich sehen, welcher erkannte Intent zu welcher Aktion geführt hat, damit Assistant-Ausführungen prüfbar bleiben.

4. **Retention control** — Als Tenant-Admin möchte ich steuern können, ob Assistant-Gespräche gar nicht, kurzzeitig oder länger aufbewahrt werden, damit wir verschiedene Compliance-Anforderungen abbilden können.

5. **Export / deletion compatibility** — Als Betreiber möchte ich, dass Assistant-Daten in DSGVO-Export-/Redaktionskonzepte passen, damit Sprache kein Sonderfall außerhalb der Plattform-Governance ist.

## Acceptance Criteria

### A. Conversation / Session Model
- [ ] Es gibt ein strukturiertes Modell für Assistant-Sitzungen und Turns, z. B.:
  - `assistant_sessions`
  - `assistant_turns`
  - optional `assistant_action_events`
- [ ] Eine Session ist tenant- und user-scoped.
- [ ] Ein Turn kann mindestens erfassen:
  - Zeit
  - modality (`voice` | `text`)
  - transcript/input text
  - recognized_intent
  - confirmation_state
  - result_status
- [ ] Audio-Rohdaten werden in MVP nicht dauerhaft gespeichert, außer eine spätere explizite Slice führt das ein.

### B. Transcript Governance
- [ ] Transkripte und Assistant-Inputs werden per PROJ-12-Klassifikationslogik behandelt; im Zweifel Klasse 3.
- [ ] Tenant kann mindestens zwischen drei Modi wählen:
  - `no_persist`
  - `persist_metadata_only`
  - `persist_redacted_transcript`
- [ ] Bei `no_persist` bleiben nur minimale technische/audit-relevante Metadaten erhalten, kein Volltranskript.
- [ ] Bei `persist_redacted_transcript` werden class-3-Inhalte redigiert oder lokal-only behandelt.

### C. Action Audit
- [ ] Jede tatsächliche Assistant-Aktion erzeugt einen auditierbaren Datensatz mit:
  - user
  - tenant
  - project (falls vorhanden)
  - recognized intent
  - confirmation decision
  - ausgeführte Tools/APIs
  - Ergebnis
- [ ] Read-only-Turns und blockierte/abgebrochene Turns sind unterscheidbar.
- [ ] Assistant-Audit ergänzt PROJ-10, ersetzt es nicht.

### D. Tenant Policy Surface
- [ ] Tenant Settings bieten einen klaren Assistant-Governance-Bereich oder kompatible Erweiterung für:
  - Assistant aktiv/inaktiv
  - transcript retention mode
  - retention days
  - speech provider enablement
  - optional wake-word enablement (falls später vorhanden)
- [ ] Änderungen an diesen Policies sind auditierbar.

### E. Export / Redaction / Deletion
- [ ] Assistant-Daten sind in tenantweiten Export-/Deletion-Konzepten berücksichtigt.
- [ ] Redaction-Regeln für class-3-Inhalte gelten auch für gespeicherte Assistant-Turns.
- [ ] Offboarding / tenant deletion räumt Assistant-Daten konsistent mit auf.

## Edge Cases
- **Class-3-Inhalt in Voice-Input** → kein externer Leak; Persistenz richtet sich nach Policy und PROJ-12-Block.
- **User fragt rein lesend, aber mit sensiblen Personendaten** → Antwort möglich im erlaubten Pfad, Transcript-Persistenz bleibt dennoch restriktiv.
- **Assistant-Call abgebrochen vor Antwort** → Session/Turn-Status als `aborted`, keine halbe Action.
- **Tenant schaltet Retention von `persist` auf `no_persist` um** → bestehende Daten folgen definierter Aufräumstrategie oder bleiben bis Fristablauf; `/architecture` lockt.
- **Export eines Users/tenants** → Assistant-Daten erscheinen im Export in definierter Form oder redigiert.

## Technical Requirements
- **Storage discipline:** keine unkontrollierten Rohtranskripte in allgemeinen Serverlogs
- **Privacy:** default-konservativ; unknown fields -> class 3
- **Retention:** kompatibel mit PROJ-10/17 retention model
- **Audit:** Assistant-turn audit und domain-action audit müssen zusammen lesbar sein
- **RLS:** tenant- und user-scoped Zugriff

## Out of Scope
- Vollständige Audioarchivierung
- Sentiment- oder Emotionserkennung aus Sprache
- biometrische Sprecheridentifikation
- Wissensdatenbank-Aufbau aus allen Gesprächen ohne explizite spätere Freigabe-Slice

## Suggested Slice Plan
- **40-α Conversation schema + minimal metadata audit**
- **40-β transcript retention modes + redaction**
- **40-γ tenant governance UI + export/offboarding integration**

