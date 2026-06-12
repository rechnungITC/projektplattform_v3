---
id: PROJ-99
title: "Externe Berater kontrolliert einbinden"
issue_type: Story
epic_code: B
epic_title: "Rollen, Gremien & Governance"
priority: High
priority_source: "Must (für reale Deal-Arbeit zwingend; Berater sind die Mehrheit der aktiv Beteiligten)"
labels: ["ma-platform", "epic-b", "must-have"]
dependencies: ["B1", "B4", "L1", "L3"]
roles: ["Deal Lead", "PMO-Lead", "Legal Counsel", "IT-Sicherheitsverantwortlicher", "Externer Berater (Nutzer-Sicht)"]
summary_for_jira: "[B3] Externe Berater kontrolliert einbinden"
---

# PROJ-99: Externe Berater kontrolliert einbinden

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic B — Rollen, Gremien & Governance)
**Priority:** P1

> **Epic:** B — Rollen, Gremien & Governance  
> **Priorität (Jira):** High · **Quell-Priorität:** Must (für reale Deal-Arbeit zwingend; Berater sind die Mehrheit der aktiv Beteiligten)  
> **Labels:** `ma-platform` · `epic-b` · `must-have`  
> **Abhängigkeiten:** `B1`, `B4`, `L1`, `L3`

**User Story:**

Als Deal Lead möchte ich externe Berater (M&A-Advisor, Anwälte, Wirtschaftsprüfer, Steuerberater) mit klar abgegrenzten Zugriffsrechten und nachvollziehbarer Mandatslage einbinden, damit sie projektbezogen mitarbeiten können, ohne Zugang außerhalb ihres Mandats zu haben.

**Beschreibung / Kontext:**

M&A-Projekte sind ohne externe Berater nicht denkbar. Die Plattform muss externe Personen als separate Nutzerkategorie führen, die nur auf freigegebene Bereiche zugreifen, deren Aktivitäten besonders nachvollziehbar sind und deren Mandatsdauer technisch begrenzbar ist.

**Akzeptanzkriterien:**

- [ ] Externe Personen werden gesondert markiert (z. B. 'Extern / Kanzlei XYZ').
- [ ] Ein externer Nutzer sieht standardmäßig nichts; jeder Bereich muss explizit freigegeben werden.
- [ ] Pro externem Nutzer ist Mandatsbeginn und Mandatsende hinterlegbar; der Zugriff wird am Mandatsende automatisch entzogen.
- [ ] Externe Aktivitäten (Logins, Datenzugriffe, Downloads) werden im Audit-Trail (L3) separat markiert und ausfilterbar.
- [ ] Eine NDA muss vor Zugriffsgewährung als unterschrieben markiert sein (siehe L1).

**Abgrenzungen (Out of Scope):**

- Plattform liefert keine eigene NDA-Vorlage und keinen E-Signatur-Service – diese sind extern.
- Externe Beraterhonorare werden nicht in der Plattform abgerechnet.

**Offene Fragen:**

- Wie wird die Identität externer Berater verifiziert (Federation, Gast-Zugänge im IdP, eigener User-Pool)?
- Welche E-Signatur-Lösung wird für NDA-Abschluss eingebunden?
- Müssen externe Berater zwingend MFA nutzen, und wer entscheidet das verbindlich?

**Definition of Ready:**

- [ ] IT-Sicherheits-Konzept für Externe ist freigegeben.
- [ ] NDA-Workflow ist mit Legal abgestimmt.
- [ ] Datenschutzfolgenabschätzung liegt vor.

**Definition of Done:**

- [ ] Externe Nutzer können angelegt, mit NDA verknüpft, mit Mandatsende terminiert und granular berechtigt werden.
- [ ] Automatischer Mandatsablauf entzieht Zugriff (Testnachweis).
- [ ] Audit-Trail differenziert intern/extern.

**Abhängigkeiten:**

- B1 – Rollen
- B4 – Berechtigungskonzept
- L1 – NDA-Verwaltung
- L3 – Audit-Trail

**Betroffene Rollen:**

- Deal Lead
- PMO-Lead
- Legal Counsel
- IT-Sicherheitsverantwortlicher
- Externer Berater (Nutzer-Sicht)

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · B — Rollen, Gremien & Governance_
