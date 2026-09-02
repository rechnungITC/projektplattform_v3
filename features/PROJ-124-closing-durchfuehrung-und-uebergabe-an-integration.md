---
id: PROJ-124
title: "Closing-Durchführung und Übergabe an Integration"
issue_type: Story
epic_code: J
epic_title: "Vertrag, Signing & Closing"
priority: Medium
priority_source: "Should"
labels: ["ma-platform", "epic-j", "should-have"]
dependencies: ["J2", "A2", "K1", "K2", "L3"]
roles: ["Deal Lead", "Legal Counsel", "CFO / Finance Lead", "PMO-Lead", "Integration Lead / IMO", "Executive Sponsor"]
summary_for_jira: "[J3] Closing-Durchführung und Übergabe an Integration"
---

# PROJ-124: Closing-Durchführung und Übergabe an Integration

## Status: Planned (blockiert)

> **Geerdet 2026-09-02 (PROJ-167): am tiefsten blockiert.** Wartet auf `J2` (PROJ-123, MVP-Pflicht)
> **und** auf `K1`/`K2` (PROJ-125/126), die ihrerseits in einem Abhängigkeitszyklus stehen. Die Folge
> 123 → 124 ist fachlich echt; die Blockade über `K1`/`K2` ist ein Struktur-Defekt der
> Abhängigkeitsangaben. Siehe Erdungsabschnitt.
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic J — Vertrag, Signing & Closing)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND** · Andockpunkt: neu (PMI-Brücke). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** J — Vertrag, Signing & Closing  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should  
> **Labels:** `ma-platform` · `epic-j` · `should-have`  
> **Abhängigkeiten:** `J2`, `A2`, `K1`, `K2`, `L3`

**User Story:**

Als Deal Lead möchte ich am Closing-Tag eine strukturierte Closing-Sicht (Agenda, Zahlungsanweisungen, Closing Accounts, Übergabeprotokolle, Closing-Memorandum) abrufen und nach erfolgreichem Closing die Übergabe an das IMO (K2/K3) auslösen können.

**Beschreibung / Kontext:**

Phase 8 endet mit dem Closing als rechtlich-wirtschaftlichem Vollzug, gefolgt vom Übergang in die Integration. Das Modell sieht eine 'Closing Agenda' und einen 'Closing Memorandum' vor. Die Plattform muss diesen Übergang sicherstellen und Wissen aus Deal-Team an Integrationsteam überführen.

**Akzeptanzkriterien:**

- [ ] Eine 'Closing-Day-Sicht' bündelt: Status aller Closing Conditions (J2), Closing-Agenda, Zahlungs- und Eigentumsschritte, Verantwortliche, Closing-Memorandum-Link.
- [ ] Nach erfolgreichem Closing wird das Projekt automatisch auf die Folgephase 'Integrationsplanung' (A2) gesetzt; das Deal Core Team kann eine Übergabe-Checkliste an das IMO abarbeiten.
- [ ] Die Übergabe-Checkliste umfasst mindestens: DD-Findings, Synergie-Hypothesen, offene Garantien/Freistellungen, kritische Schlüsselpersonen, IT-/Carve-out-Aufgaben, Kommunikationsstand.
- [ ] Eine 'Lessons-Learned-Vorlage' wird angelegt und auf die Phase 10 verschoben.
- [ ] Audit-Trail (L3) erfasst den Phasenwechsel und die Übergabe.

**Abgrenzungen (Out of Scope):**

- Keine Echtzeit-Banktransaktionsabwicklung.
- Keine elektronische Notariatsanbindung.

**Offene Fragen:**

- Soll am Closing-Tag eine 'War-Room-Sicht' (Live-Status) realisiert werden?
- Welche Daten werden in welcher Form an ein Linien-System (z. B. Konzern-Stammdaten) übergeben?

**Definition of Ready:**

- [ ] Closing-Day-Layout und Übergabe-Checkliste sind abgestimmt.
- [ ] Lessons-Learned-Vorlage ist definiert.

**Definition of Done:**

- [ ] Sicht und Übergabe-Workflow funktionieren End-to-End.
- [ ] Phasenwechsel ist automatisiert.
- [ ] Audit-Trail (L3) ist aktiv.

**Abhängigkeiten:**

- J2
- A2
- K1
- K2
- L3

**Betroffene Rollen:**

- Deal Lead
- Legal Counsel
- CFO / Finance Lead
- PMO-Lead
- Integration Lead / IMO
- Executive Sponsor

## Geerdet am 2026-09-02 (PROJ-167)

### Urteil: blockiert — und zwei der drei Blocker sitzen in einem Abhängigkeitszyklus

Abhängigkeiten aufgelöst (Epic-Codes über die Spec-Frontmatter):

| Epic-Code | PROJ | Stand |
|---|---|---|
| I1 | PROJ-120 Bewertungsmodell | `Deployed / mvp` |
| J1 | PROJ-122 SPA-Issues | `Deployed / mvp` |
| F1 | PROJ-110 Stage-Gates | `Deployed / mvp` |
| F2 | PROJ-111 Entscheidungslog | `Deployed / mvp` |
| G3 | PROJ-114 DD-Findings | `Deployed / mvp` |
| C1 | PROJ-101 Aufgaben | `Deployed / mvp` |
| E1 | PROJ-107 Risikoregister | `Deployed / mvp` |
| M1 | PROJ-131 Steering-Report | `Deployed / full` |
| L3 | PROJ-130 Audit-Trail | `Deployed / mvp` |
| A2 | PROJ-95 M&A-Phasenmodell | `Deployed / mvp` |
| J2 · J3 · K1 · K2 · K3 | PROJ-123 · 124 · 125 · 126 · 127 | **offen** |

`J2` (PROJ-123), `K1` (PROJ-125) und `K2` (PROJ-126) sind offen; `A2` (PROJ-95) und `L3` (PROJ-130)
sind ausgeliefert. **PROJ-125 und PROJ-126 sind ihrerseits nicht startbar** — siehe den Zyklus-Befund
in PROJ-167 und in den Erdungsabschnitten von 125/126/127.

Damit ist diese Story die **am tiefsten** blockierte der Tranche: sie wartet auf eine MVP-Story
(123) und auf zwei Stories, die sich gegenseitig blockieren.

### Was das praktisch heißt

Die Reihenfolge innerhalb von Epic J ist eindeutig — **123 vor 124**, und das ist kein Zyklus,
sondern eine echte fachliche Folge (ohne nachverfolgte Closing Conditions gibt es kein Closing
durchzuführen). Die Blockade über `K1`/`K2` ist dagegen ein **Struktur-Defekt der
Abhängigkeitsangaben**: ein Closing-Vollzug braucht keinen fertigen 100-Tage-Plan, sondern
höchstens eine Übergabestelle in ihn hinein. Ob die Angaben `K1`/`K2` hier zu streichen sind, ist
eine Entscheidung für `/requirements` — diese Erdung benennt sie, trifft sie nicht.

**Und die Zahl, die alles einordnet — live gegen Prod gemessen am 2026-09-02:** das M&A-Epic hat
**null Nutzung**. 0 Projekte mit `project_type = 'ma'` (auch keine weich gelöschten), 0 Profile,
0 Bewertungen, 0 SPA-Issues, 0 DD-Findings, 0 DD-Fragen, 0 Stage-Gates, 0 Phasen — bei 39
ausgelieferten M&A-Slices. Das macht keine dieser Stories falsch; es heißt, dass **heute niemand**
auf sie wartet, und dass die Reihenfolge frei wählbar ist statt von einem laufenden Deal erzwungen.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · J — Vertrag, Signing & Closing_
