---
id: PROJ-130
title: "Lückenloser Audit-Trail (Cross-Cutting)"
issue_type: Story
epic_code: L
epic_title: "Vertraulichkeit, NDA & Audit"
priority: Highest
priority_source: "Must (MVP)"
labels: ["ma-platform", "epic-l", "mvp"]
dependencies: ["B4", "L2"]
roles: ["Compliance/Revision", "IT-Sicherheit", "Datenschutzbeauftragter", "PMO-Lead", "Externe Prüfer (lesend)"]
summary_for_jira: "[L3] Lückenloser Audit-Trail (Cross-Cutting)"
---

# PROJ-130: Lückenloser Audit-Trail (Cross-Cutting)

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic L — Vertraulichkeit, NDA & Audit)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **DUP→REUSE** · Andockpunkt: PROJ-10 Audit (vollständig vorhanden) — nur M&A-Objekte in `_tracked_audit_columns`. Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** L — Vertraulichkeit, NDA & Audit  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP)  
> **Labels:** `ma-platform` · `epic-l` · `mvp`  
> **Abhängigkeiten:** `B4`, `L2`

**User Story:**

Als Compliance/Audit-Verantwortlicher möchte ich für jedes M&A-Projekt eine unveränderbare, vollständige Aufzeichnung aller relevanten Aktionen (wer, wann, was, von welcher Quelle) abrufen können, damit die regulatorischen und internen Prüfanforderungen erfüllt sind.

**Beschreibung / Kontext:**

Ein M&A-Projekt ist regelmäßig Gegenstand interner und externer Prüfungen. Die Plattform muss durchgehend nachvollziehbar machen, welche Aktion welche Folge hatte. Audit-Trail ist in praktisch jeder anderen Story referenziert – diese Story definiert die zentrale Funktion.

**Akzeptanzkriterien:**

- [ ] Jede schreibende Aktion (Anlage, Änderung, Löschung, Statuswechsel, Klassifikationsänderung, Freigabe, Zugriff auf Strictly Confidential) wird mit Zeitstempel, Benutzer, betroffenem Objekt und Vor-/Nach-Wert protokolliert.
- [ ] Audit-Einträge sind nicht änderbar und nicht löschbar.
- [ ] Eine Suche nach Benutzer, Objekt, Zeitraum und Aktionstyp ist möglich.
- [ ] Ein Export der Audit-Daten ist für externe Audits möglich (z. B. CSV).
- [ ] Die Speicherdauer ist konfigurierbar (Mindestaufbewahrung muss DSGVO und intern definierte Compliance-Vorgaben erfüllen – offene Frage).

**Abgrenzungen (Out of Scope):**

- Keine SIEM-Anbindung in der Erst-Story (kann ergänzt werden).
- Keine echtzeitbasierte Anomalie-Erkennung.

**Offene Fragen:**

- Welche Aufbewahrungsfrist gilt organisationsweit (z. B. 10 Jahre für transaktionsbezogene Unterlagen)?
- Soll der Audit-Trail in eine WORM-Speicherlösung (write-once-read-many) exportiert werden?
- Wer darf den Audit-Trail einsehen (z. B. interne Revision, Compliance, externe Prüfer)?

**Definition of Ready:**

- [ ] Audit-Datenmodell ist mit Compliance, Security und Datenschutz abgestimmt.
- [ ] Liste der protokollpflichtigen Aktionen ist vollständig.

**Definition of Done:**

- [ ] Audit-Trail ist für alle protokollpflichtigen Aktionen aktiv.
- [ ] Unveränderbarkeit, Suche und Export funktionieren.
- [ ] Externer Audit-Testfall (mind. ein End-to-End-Szenario) ist erfolgreich durchlaufen.

**Abhängigkeiten:**

- B4
- L2

**Betroffene Rollen:**

- Compliance/Revision
- IT-Sicherheit
- Datenschutzbeauftragter
- PMO-Lead
- Externe Prüfer (lesend)

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · L — Vertraulichkeit, NDA & Audit_
