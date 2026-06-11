---
id: PROJ-94
title: "M&A-Projekt mit strategischer Grundlage anlegen"
issue_type: Story
epic_code: A
epic_title: "Projektgrundlagen & Phasenmodell"
priority: Highest
priority_source: "Must (MVP – ohne diese Story funktioniert keine weitere)"
labels: ["ma-platform", "epic-a", "mvp"]
dependencies: ["B1", "B4", "L3"]
roles: ["Deal Lead (Corporate Development)", "Executive Sponsor / Geschäftsführung", "PMO-Lead", "Legal Counsel (lesend)", "IT-Administration (technisch)"]
summary_for_jira: "[A1] M&A-Projekt mit strategischer Grundlage anlegen"
---

# PROJ-94: M&A-Projekt mit strategischer Grundlage anlegen

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic A — Projektgrundlagen & Phasenmodell)
**Priority:** P1

> **Epic:** A — Projektgrundlagen & Phasenmodell  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP – ohne diese Story funktioniert keine weitere)  
> **Labels:** `ma-platform` · `epic-a` · `mvp`  
> **Abhängigkeiten:** `B1`, `B4`, `L3`

**User Story:**

Als Deal Lead möchte ich ein neues M&A-Projekt mit den strategischen Grunddaten (Deal-Rationale, Zielbild, Suchprofil, Investitionsrahmen) anlegen können, damit alle Beteiligten von Anfang an dieselbe verbindliche Projektgrundlage verwenden.

**Beschreibung / Kontext:**

Phase 1 des M&A-Modells verlangt eine eindeutige strategische Ausgangslage. Die Plattform muss ein Projekt als Container für alle nachfolgenden Phasen bereitstellen und die kritischen Eckdaten (Mandat, Suchkriterien, Ausschlusskriterien, Investitionsrahmen, Governance-Modell) strukturiert hinterlegen.

**Akzeptanzkriterien:**

- [ ] Ein neues M&A-Projekt kann mit Pflichtfeldern Projektname, Sponsor, Deal Lead, Zielsetzung und Mandatsstand angelegt werden.
- [ ] Strategische Grunddaten können als strukturierte Felder UND als verlinkbares Dokument hinterlegt werden (Deal-Rationale, Suchprofil, Ausschlusskriterien, Investitionsrahmen).
- [ ] Das Projekt erhält eine eindeutige Projekt-ID, die in allen Folgeartefakten referenziert wird.
- [ ] Der Status 'Mandat freigegeben' kann gesetzt werden und schaltet Phase 2 ('Target-Screening') frei.
- [ ] Eine Änderungshistorie der strategischen Grunddaten wird automatisch geführt (Wer, Wann, Was).

**Abgrenzungen (Out of Scope):**

- Inhaltliche Bewertung der Deal-Rationale ist nicht Aufgabe der Plattform – sie speichert und versioniert nur.
- Erstellung eines vollständigen Business Case ist nicht Teil dieser Story (separate Story I1).
- Anbindung an ein externes Strategie-Tool (z. B. OKR-Tool) ist nicht in Scope.

**Offene Fragen:**

- Soll die Plattform mehrere Projektarten unterscheiden (Buy-Side, Sell-Side, Joint Venture)?
- Welche Pflichtfelder fordert die interne Governance verbindlich (z. B. durch Compliance)?
- Müssen Projektnummern aus einem ERP/Controlling-System übernommen werden?

**Definition of Ready:**

- [ ] Pflichtfelder sind mit Stakeholdern (M&A, Legal, Finance, Compliance) abgestimmt.
- [ ] Berechtigungskonzept liegt vor (siehe B4).
- [ ] Datenfeldlängen, Validierungen und Statuswerte sind dokumentiert.
- [ ] UI/UX-Designvorgaben liegen vor.

**Definition of Done:**

- [ ] Funktion ist in Test- und Produktivumgebung verfügbar.
- [ ] Automatisierte Tests decken Anlage, Bearbeitung, Pflichtfeldvalidierung und Statuswechsel ab.
- [ ] Audit-Trail für alle Änderungen funktioniert nachweislich.
- [ ] Anwenderdokumentation ist erstellt.
- [ ] Datenschutz- und IT-Sicherheits-Freigabe liegt vor.

**Abhängigkeiten:**

- B1 – Rollen und Verantwortlichkeiten
- B4 – Berechtigungskonzept
- L3 – Audit-Trail (übergreifend)

**Betroffene Rollen:**

- Deal Lead (Corporate Development)
- Executive Sponsor / Geschäftsführung
- PMO-Lead
- Legal Counsel (lesend)
- IT-Administration (technisch)

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · A — Projektgrundlagen & Phasenmodell_
