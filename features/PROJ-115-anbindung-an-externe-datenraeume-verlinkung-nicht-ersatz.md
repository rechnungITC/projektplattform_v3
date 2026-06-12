---
id: PROJ-115
title: "Anbindung an externe Datenräume (Verlinkung, nicht Ersatz)"
issue_type: Story
epic_code: G
epic_title: "Due Diligence"
priority: Highest
priority_source: "Must (MVP) – manuelle Verlinkung; VDR-Schnittstelle: Could"
labels: ["ma-platform", "epic-g", "mvp"]
dependencies: ["G2", "G3", "C1", "D1", "B4", "L2"]
roles: ["Stream Leads", "PMO-Lead", "IT-Administration", "Externe Berater"]
summary_for_jira: "[G4] Anbindung an externe Datenräume (Verlinkung, nicht Ersatz)"
---

# PROJ-115: Anbindung an externe Datenräume (Verlinkung, nicht Ersatz)

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic G — Due Diligence)
**Priority:** P1

> **Epic:** G — Due Diligence  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP) – manuelle Verlinkung; VDR-Schnittstelle: Could  
> **Labels:** `ma-platform` · `epic-g` · `mvp`  
> **Abhängigkeiten:** `G2`, `G3`, `C1`, `D1`, `B4`, `L2`

**User Story:**

Als Stream Lead möchte ich aus jedem DD-Objekt (Frage, Finding, Aufgabe) auf den zugehörigen Dokumentenstand im externen Datenraum verlinken können, damit die Plattform der zentrale Steuerungsort bleibt, ohne den VDR zu ersetzen.

**Beschreibung / Kontext:**

Annahme A1 legt fest: Die Plattform ist kein VDR-Ersatz. Sie soll aber die Brücke zwischen Steuerungslogik und Dokumentensicht bilden. Das Modell macht klar, dass eine vollständige DD ohne Datenraumzugriff nicht funktioniert; eine saubere Verlinkung ist daher erfolgskritisch.

**Akzeptanzkriterien:**

- [ ] Pro Q&A-Eintrag (G2), Finding (G3), Aufgabe (C1) und Deliverable (D1) kann mindestens eine URL/Referenz zu einem externen Dokument hinterlegt werden.
- [ ] Die Plattform validiert das Linkformat und prüft beim Aufruf, ob der Link erreichbar ist (technischer Link-Check, keine inhaltliche Prüfung).
- [ ] Optional kann eine Schnittstelle zu mindestens einem führenden VDR-Anbieter konfiguriert werden (Auswahl: offene Frage).
- [ ] Sichtbarkeit von Links folgt dem Berechtigungskonzept (B4) und der Klassifikation (L2).

**Abgrenzungen (Out of Scope):**

- Keine Speicherung von DD-Originaldokumenten in der Plattform.
- Keine OCR, Texterkennung oder inhaltliche Auswertung von Dokumenten.

**Offene Fragen:**

- Mit welchem VDR-Anbieter wird zuerst integriert (Datasite, Intralinks, ansarada, andere)?
- Wird ein Single Sign-On in den VDR realisiert oder bleibt es bei Link-Sprung mit erneuter Anmeldung?

**Definition of Ready:**

- [ ] Linkmodell und Sichtbarkeitsregeln sind dokumentiert.
- [ ] Mindestens ein VDR-Anbieter für Pilot ist benannt (für optionale Schnittstelle).

**Definition of Done:**

- [ ] Manuelle Verlinkung funktioniert in allen relevanten Objekten.
- [ ] Link-Check meldet defekte Links.
- [ ] Berechtigungslogik ist getestet.

**Abhängigkeiten:**

- G2
- G3
- C1
- D1
- B4
- L2

**Betroffene Rollen:**

- Stream Leads
- PMO-Lead
- IT-Administration
- Externe Berater

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · G — Due Diligence_
