---
id: PROJ-96
title: "Projekt-Templates für Standardphasen bereitstellen"
issue_type: Story
epic_code: A
epic_title: "Projektgrundlagen & Phasenmodell"
priority: Medium
priority_source: "Should (MVP-nahe; nicht zwingend Tag 1, aber für Skalierung wichtig)"
labels: ["ma-platform", "epic-a", "should-have"]
dependencies: ["A1", "A2", "C1", "D1", "B1"]
roles: ["Head of Corporate Development", "PMO-Lead", "Template-Admin"]
summary_for_jira: "[A3] Projekt-Templates für Standardphasen bereitstellen"
---

# PROJ-96: Projekt-Templates für Standardphasen bereitstellen

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic A — Projektgrundlagen & Phasenmodell)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND** · Andockpunkt: PROJ-6 Rule-Engine-Preset + Copy-on-create (echte Lücke: Core hat kein Template-System). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** A — Projektgrundlagen & Phasenmodell  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should (MVP-nahe; nicht zwingend Tag 1, aber für Skalierung wichtig)  
> **Labels:** `ma-platform` · `epic-a` · `should-have`  
> **Abhängigkeiten:** `A1`, `A2`, `C1`, `D1`, `B1`

**User Story:**

Als Head of Corporate Development möchte ich Projekt-Templates mit vordefinierten Phasen, Aufgaben, Deliverables und Rollen bereitstellen, damit neue M&A-Projekte methodisch konsistent und ohne Aufbauaufwand starten können.

**Beschreibung / Kontext:**

Die zehn M&A-Phasen folgen einem gleichbleibenden Best-Practice-Muster. Damit Projekte nicht jedes Mal neu aufgesetzt werden müssen, sollen Templates die Standardstruktur abbilden, die je Deal-Typ angepasst werden kann.

**Akzeptanzkriterien:**

- [ ] Mindestens ein Standard-Template 'Buy-Side M&A' ist als Default verfügbar (alle Phasen, Standard-Workstreams, Standard-Deliverables, Standard-Rollen).
- [ ] Templates können durch berechtigte Nutzer (Rolle 'Template-Admin') angelegt, kopiert und versioniert werden.
- [ ] Bei Projektanlage (A1) kann ein Template ausgewählt werden; alle Standardinhalte werden in das neue Projekt übernommen.
- [ ] Nach Übernahme können alle Inhalte projektindividuell angepasst werden, ohne das Template zu verändern.
- [ ] Eine Template-Änderung wirkt nicht rückwirkend auf bereits angelegte Projekte (Versionsstand wird festgehalten).

**Abgrenzungen (Out of Scope):**

- Künstliche Intelligenz zur Erzeugung individueller Templates ist nicht in Scope.
- Konkrete Vertrags- oder Bewertungsvorlagen werden nicht mitgeliefert – das bleibt fachliche Eigenleistung.

**Offene Fragen:**

- Welche Deal-Typen sollen als Template-Varianten existieren (Buy-Side, Sell-Side, Carve-out, JV, Minderheitsbeteiligung)?
- Wer ist organisatorisch für die Template-Pflege verantwortlich?
- Soll es Freigabesperren geben (z. B. 'Template nur durch Head of M&A freigebbar')?

**Definition of Ready:**

- [ ] Template-Inhalte (Phasen, Standard-Tasks, Standard-Deliverables) sind fachlich abgestimmt.
- [ ] Versionierungsmodell ist definiert.

**Definition of Done:**

- [ ] Mindestens ein produktives Template ist hinterlegt.
- [ ] Projektanlage mit Template-Auswahl funktioniert.
- [ ] Versionierung und Änderungs-Historie sind nachweisbar.

**Abhängigkeiten:**

- A1 – Projektanlage
- A2 – Phasenmodell
- C1, D1, B1 – Aufgaben, Deliverables, Rollen

**Betroffene Rollen:**

- Head of Corporate Development
- PMO-Lead
- Template-Admin

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · A — Projektgrundlagen & Phasenmodell_
