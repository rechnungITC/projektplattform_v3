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

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic L — Vertraulichkeit, NDA & Audit)
**Priority:** P1

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
_Quelle: Backlog-Entwurf M&A-Projektplattform · L — Vertraulichkeit, NDA & Audit_
