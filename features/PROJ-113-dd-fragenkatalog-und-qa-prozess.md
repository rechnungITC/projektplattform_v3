---
id: PROJ-113
title: "DD-Fragenkatalog und Q&A-Prozess"
issue_type: Story
epic_code: G
epic_title: "Due Diligence"
priority: Highest
priority_source: "Must (MVP)"
labels: ["ma-platform", "epic-g", "mvp"]
dependencies: ["G1", "G3", "G4", "L2", "B4"]
roles: ["Stream Leads", "Deal Lead", "Externe Berater", "Target-Vertreter (indirekt, via Export)"]
summary_for_jira: "[G2] DD-Fragenkatalog und Q&A-Prozess"
---

# PROJ-113: DD-Fragenkatalog und Q&A-Prozess

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic G — Due Diligence)
**Priority:** P1

> **Epic:** G — Due Diligence  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP)  
> **Labels:** `ma-platform` · `epic-g` · `mvp`  
> **Abhängigkeiten:** `G1`, `G3`, `G4`, `L2`, `B4`

**User Story:**

Als Stream Lead möchte ich Fragen an die Verkäuferseite strukturiert stellen, deren Beantwortung verfolgen und Folgen ableiten können, damit der Q&A-Prozess transparent gesteuert wird und keine Frage verloren geht.

**Beschreibung / Kontext:**

Ein zentrales Element jeder DD ist der Q&A-Prozess. Die Plattform muss Fragen je Stream sammeln, an die Gegenseite (oder den Vermittler) weitergeben, Antworten erfassen und Status sowie Folgemaßnahmen verfolgen. Die Plattform muss dabei auch das im Modell geforderte Need-to-know-Prinzip respektieren (siehe L2).

**Akzeptanzkriterien:**

- [ ] Fragen können je Stream mit Titel, Detail, Frist, Priorität und Adressat erfasst werden.
- [ ] Eine Frage durchläuft die Stati: offen, in Beantwortung, beantwortet, nachgefragt, geschlossen.
- [ ] Eine Antwort kann inkl. Anlagen oder Verlinkungen (z. B. in den externen Datenraum) hinterlegt werden.
- [ ] Eine Frage kann zu einem Finding (G3) eskaliert werden; die Verknüpfung ist sichtbar.
- [ ] Q&A-Sichten sind nach Stream, Status, Frist und Owner filterbar; eine Export-Funktion liefert eine Frageliste für die Gegenseite.
- [ ] Sichtbarkeit der Q&A-Inhalte folgt dem Need-to-know-Prinzip (siehe L2).

**Abgrenzungen (Out of Scope):**

- Die Plattform stellt keine direkte VDR-Q&A-Integration bereit; Q&A wird parallel oder per Export gespiegelt (offene Frage).
- Automatische Klassifikation von Fragen ist nicht in Scope.

**Offene Fragen:**

- Soll eine Schnittstelle zu gängigen VDR-Q&A-Tools (z. B. Datasite, Intralinks, ansarada) realisiert werden?
- Wie wird mit vertraulichen 'Clean-Team'-Fragen umgegangen?

**Definition of Ready:**

- [ ] Q&A-Prozess (Verantwortlichkeiten, Eskalationswege) ist mit Legal/M&A abgestimmt.
- [ ] Sichtbarkeitsregeln (Need-to-know) sind dokumentiert.

**Definition of Done:**

- [ ] Erfassen, Beantworten, Eskalieren und Filtern funktionieren.
- [ ] Sichtbarkeit ist gemäß Berechtigungskonzept B4 durchgesetzt.
- [ ] Export-Funktion erzeugt eine externe Fragenliste.

**Abhängigkeiten:**

- G1
- G3
- G4
- L2
- B4

**Betroffene Rollen:**

- Stream Leads
- Deal Lead
- Externe Berater
- Target-Vertreter (indirekt, via Export)

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · G — Due Diligence_
