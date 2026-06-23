---
id: PROJ-128
title: "NDA-Verwaltung und Vertraulichkeitsverpflichtungen"
issue_type: Story
epic_code: L
epic_title: "Vertraulichkeit, NDA & Audit"
priority: Medium
priority_source: "Should"
labels: ["ma-platform", "epic-l", "should-have"]
dependencies: ["B1", "B4", "L2", "L3"]
roles: ["Legal Counsel", "Deal Lead", "PMO-Lead", "Externe Berater"]
summary_for_jira: "[L1] NDA-Verwaltung und Vertraulichkeitsverpflichtungen"
---

# PROJ-128: NDA-Verwaltung und Vertraulichkeitsverpflichtungen

## Status: In Progress (Backend gebaut 2026-06-24 — NDA-Register + Zuordnungen + hartes Gate; → /frontend NDA-Tab, dann /qa)
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic L — Vertraulichkeit, NDA & Audit)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND** · Andockpunkt: neu (Vertraulichkeits-Bündel mit PROJ-99/129). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** L — Vertraulichkeit, NDA & Audit  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should  
> **Labels:** `ma-platform` · `epic-l` · `should-have`  
> **Abhängigkeiten:** `B1`, `B4`, `L2`, `L3`

**User Story:**

Als Legal Counsel möchte ich NDAs (zwischen Käufer und Target, mit Beratern, mit Banken etc.) zentral erfassen, ihre Laufzeiten, Empfänger und Geltungsbereiche kennen und Ablaufmeldungen erhalten, damit Vertraulichkeit lückenlos sichergestellt ist.

**Beschreibung / Kontext:**

Phase 3 fordert NDAs als Pflichtartefakt und das Modell betont die laufende Vertraulichkeitspflicht. Die Plattform muss NDAs verwalten und mit der Sichtbarkeitssteuerung (L2) verknüpfen.

**Akzeptanzkriterien:**

- [ ] NDAs können mit Vertragspartner, Geltungsbereich, Unterzeichner, Datum, Laufzeit, Erweiterungen, Dokumenten-Link erfasst werden.
- [ ] Bei Ablauf wird automatisch eine Wiedervorlage erzeugt (z. B. 30 Tage vor Ablauf).
- [ ] Personen können einer NDA zugeordnet sein; Zugriff auf vertrauliche Inhalte (L2) ist nur möglich, wenn eine gültige NDA hinterlegt ist (Empfehlung, harte Durchsetzung als offene Frage).
- [ ] Eine Übersicht zeigt alle NDAs je Deal und je Person.
- [ ] Audit-Trail (L3) erfasst NDA-Anlage und Ablaufmeldungen.

**Abgrenzungen (Out of Scope):**

- Keine Vertragsklauselprüfung; NDA wird nur als Verwaltungsobjekt behandelt.
- Keine E-Signatur-Workflow in dieser Story (offene Frage).

**Offene Fragen:**

- Soll die Plattform den Zugriff auf vertrauliche Inhalte ohne gültige NDA hart blockieren oder nur warnen?
- Wird eine E-Signatur-Anbindung (z. B. DocuSign) für NDA-Abschluss erwartet?

**Definition of Ready:**

- [ ] NDA-Datenmodell ist mit Legal abgestimmt.
- [ ] Verbindung zu L2-Klassifikation ist spezifiziert.

**Definition of Done:**

- [ ] Anlage, Wiedervorlage und Übersicht funktionieren.
- [ ] Verknüpfung zu Personen und Zugriff (L2/B4) ist getestet.

**Abhängigkeiten:**

- B1
- B4
- L2
- L3

**Betroffene Rollen:**

- Legal Counsel
- Deal Lead
- PMO-Lead
- Externe Berater

---

## Tech Design (Solution Architect) — 2026-06-23

> **Bundle-Bindung:** Dieses Design ist Teil des gemeinsamen Advisor-/NDA-/Klassifikations-Bundles mit PROJ-99 und PROJ-129. NDA-Verwaltung ist kein isoliertes Legal-Archiv: Sie entscheidet im M&A-Pilot mit darueber, ob externe Berater Zugriff auf vertrauliche Inhalte bekommen.

### Grundidee in einem Satz

Eine NDA ist ein **Governance-Objekt** im M&A-Projekt: Legal erfasst Vertragspartner, Laufzeit, Geltungsbereich, Personen und Dokument-Link; die Plattform nutzt den gueltigen NDA-Status als Voraussetzung, bevor externe Berater auf vertrauliche oder streng vertrauliche Inhalte freigeschaltet werden.

### A) Komponenten-Struktur

```
M&A-Projektraum > Governance & Zugriff
+-- Tab "NDAs"
    +-- NDA-Liste
    |   +-- Vertragspartner
    |   +-- Status: Entwurf / in Pruefung / gueltig / abgelaufen / widerrufen
    |   +-- Gueltig von / bis
    |   +-- Scope: Projekt, Phase, DD-Stream oder Beratergruppe
    |   +-- Ampel fuer Ablauf/Wiedervorlage
    +-- NDA-Detail
    |   +-- Stammdaten
    |   +-- Zugeordnete Personen und Organisationen
    |   +-- Abgedeckte Vertraulichkeitsstufen
    |   +-- Dokument-Link
    |   +-- Historie
    +-- Aktion "NDA erfassen"
    +-- Aktion "Personen zuordnen"
```

Die NDA-UI wird im selben Governance-Bereich sichtbar wie Berater und Klassifikation. Ein Deal Lead sieht, ob Zugriff blockiert ist; Legal sieht, welche NDA fehlt oder ablaeuft.

### B) Datenmodell in Klartext

**NDA**

Jede NDA speichert:

- Projektbezug
- Vertragspartner oder Organisation
- verantwortliche interne Person
- Status: Entwurf, in Pruefung, gueltig, abgelaufen, widerrufen
- Unterzeichnungsdatum, Startdatum, Ablaufdatum
- Geltungsbereich: gesamtes Projekt, bestimmte Phase, DD-Stream, Beratergruppe oder Einzelpersonen
- abgedeckte Vertraulichkeitsstufe: `standard`, `confidential`, `strict`
- Dokument-Link
- Wiedervorlage-Datum

**NDA-Zuordnung**

Eine NDA kann mehreren Personen und Organisationen zugeordnet sein. Fuer echte Plattform-Zugriffe zaehlt die Zuordnung zu einem Nutzerkonto; reine Kontakt-/Signatory-Eintraege sind dokumentarisch sichtbar, erhalten aber keinen technischen Zugriff.

**NDA-Status als Gate**

Fuer externe Berater gilt: Nur eine gueltige, nicht abgelaufene und zum Scope passende NDA erlaubt eine Clearance oberhalb `standard`. Eine abgelaufene oder widerrufene NDA sperrt vertraulichen Zugriff wieder.

### C) Tech-Entscheidungen

- **NDA-Register statt Vertragsmanagement:** Die Plattform verwaltet Status, Laufzeit, Scope und Link. Sie prueft keine Klauseln und ersetzt keinen Contract-Lifecycle-Manager.
- **Dokument-Link zuerst:** Das bestehende Produkt hat noch kein M&A-DMS als Pflichtanker. Deshalb ist der Link MVP-faehig; PROJ-79 kann spaeter echte Dokumentablage und Download-Audit liefern.
- **Hartes Gate fuer externe Berater:** Die offene Frage wird fuer den Pilot entschieden. Ohne gueltige NDA kein vertraulicher Zugriff fuer Externe. Das reduziert Rechts-/Compliance-Risiko.
- **Scope-basiert, aber nicht ueberfein:** MVP-Scope reicht fuer Projekt, Phase, DD-Stream, Beratergruppe und Person. Feld-/Dokument-Feingranularitaet folgt erst, wenn die jeweiligen Objekte existieren.
- **Wiedervorlage plus Zugriffsgate:** Ablaufmeldungen sind UX. Die eigentliche Sicherheit entsteht dadurch, dass ein abgelaufener NDA-Status bei Zugriff und Clearance beruecksichtigt wird.
- **Audit ueber PROJ-10:** NDA-Anlage, Statuswechsel, Zuordnungen und Ablaufrelevante Aenderungen werden im vorhandenen Audit-Trail sichtbar.

### D) Abhaengigkeiten

- **Muss vorhanden sein:** PROJ-94, PROJ-100a.
- **Im Bundle:** PROJ-99 liefert Advisor-Profile; PROJ-129 liefert Klassifikations-/Clearance-UX.
- **Spaeter:** PROJ-79 fuer interne Dokumentablage; E-Signatur-Connector bleibt ein separates Integrationsprojekt.
- **Neue npm-Pakete:** keine.

### E) Akzeptanzkriterien-Zuordnung

| AC | Erfuellt durch |
|---|---|
| NDAs mit Vertragspartner, Scope, Unterzeichner, Laufzeit, Link | NDA-Stammdaten + NDA-Zuordnungen + Dokument-Link |
| Ablaufmeldung 30 Tage vorher | Wiedervorlage-Datum und Ablaufstatus in der NDA-Liste |
| Personen einer NDA zuordnen, Zugriff nur mit gueltiger NDA | NDA-Zuordnung + hartes Gate fuer externe Berater oberhalb `standard` |
| Uebersicht je Deal und Person | NDA-Liste im Projekt + Personenbezug im Detail |
| Audit-Trail | PROJ-10-Historie fuer Anlage, Status, Zuordnung und Ablaufrelevante Felder |

### F) Handoff

Backend zuerst: NDA-Register, Personen-/Organisation-Zuordnung, Status-/Ablaufmodell und Gate-Verknuepfung zu Advisor/Clearance. Frontend danach: NDA-Liste, Detail, Zuordnung und Ablaufhinweise im Governance-Bereich. QA muss fehlende/abgelaufene/widerrufene NDA als Negativpfad gegen externen Zugriff pruefen.

## Implementation Notes — Backend (2026-06-24)

Teil der gemeinsamen Bundle-Migration `20260623230548_proj99_128_129_advisor_nda_classification.sql` (siehe [[PROJ-99]]). **Kein neuer Dep, kein Contract-Lifecycle-Manager, keine E-Signatur — Dokument-Link zuerst.**

- **`ma_ndas`** — NDA-Register je Projekt: `counterparty`, `responsible_user_id`, `status` (draft/in_review/valid/expired/revoked), `signed_date`, `valid_from`, `valid_until`, `scope_kind` (project/phase/dd_stream/advisor_group/person), `scope_ref`, `covered_level` (`ma_confidentiality_level`, max. abgedeckte Stufe), `document_link`, `reminder_date`, `notes`. Tenant-RLS (Member SELECT, Manager Write), PROJ-10 UPDATE-Audit-Trigger (Statuswechsel/Ablaufdaten = sicherheitsrelevant).
- **`ma_nda_assignments`** — NDA ↔ Person/Org: `user_id` (nullable; nur ein echtes Konto verschafft Zugriff), `contact_name`/`contact_org` (rein dokumentarische Signatory-Einträge). CHECK „mindestens eine Identität", partielles Unique `(nda_id, user_id)`. Tenant-RLS Member SELECT / Manager INSERT/DELETE.
- **Hartes Gate** über `has_valid_nda(project, user, level)`: nur eine `valid`-NDA mit nicht überschrittenem `valid_until` und `covered_level >= level` und Zuordnung zum Nutzerkonto zählt. Greift in `can_access_classified` für externe Advisor (siehe [[PROJ-99]]) — fehlende/abgelaufene/widerrufene NDA sperrt vertraulichen Zugriff wieder.

**APIs:** `GET/POST /api/projects/[id]/ndas` + `PATCH/DELETE /api/projects/[id]/ndas/[ndaId]` + `GET/POST /api/projects/[id]/ndas/[ndaId]/assignments` + `DELETE …/assignments/[assignmentId]` (Manager-gated, RLS-defense-in-depth). Client-Wrapper `src/lib/ma-project/advisor-nda-api.ts`.

**Live-Smoke (Teil der Bundle-10/10):** NDA `expired` → Advisor verliert vertraulichen Zugriff; `has_valid_nda(strict)` bei nur `confidential`-Deckung → false. Quality-Gates wie [[PROJ-99]].

**Offen:** AC „Wiedervorlage 30 Tage vor Ablauf" — `reminder_date` ist als Feld vorhanden; ein Reminder-Cron-Job ist /frontend-/Followup-Sache (das Zugriffs-Gate hängt bewusst NICHT vom Reminder ab, sondern prüft `status`/`valid_until` direkt). NDA-Liste/Detail-UI + Zuordnungs-UI → /frontend; Negativpfade → /qa.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · L — Vertraulichkeit, NDA & Audit_
