---
id: PROJ-124
title: "Closing-Durchführung und Übergabe an Integration"
issue_type: Story
epic_code: J
epic_title: "Vertrag, Signing & Closing"
priority: Medium
priority_source: "Should"
labels: ["ma-platform", "epic-j", "should-have"]
dependencies: ["J2", "A2", "L3"]   # K1, K2 gestrichen (unbelegt) — PROJ-169
roles: ["Deal Lead", "Legal Counsel", "CFO / Finance Lead", "PMO-Lead", "Integration Lead / IMO", "Executive Sponsor"]
summary_for_jira: "[J3] Closing-Durchführung und Übergabe an Integration"
---

# PROJ-124: Closing-Durchführung und Übergabe an Integration

## Status: Planned (blockiert — nur noch durch PROJ-123)

> **Am 2026-09-02 aus dem Zyklus gelöst (PROJ-169) — und das war der größte Einzelgewinn der
> Auflösung.** Die Erdung hatte diese Story als „am tiefsten blockiert" geführt (drei Blocker, zwei
> davon zyklisch). Gemessen an den Kriterien: `K1` und `K2` haben **je 0 Bezüge** in den fünf
> Akzeptanzkriterien — beide **gestrichen**. Übrig bleibt **ein** Blocker, `J2` (PROJ-123), und der
> ist fachlich echt: ohne nachverfolgte Closing Conditions gibt es kein Closing durchzuführen.
>
> Aus „wartet auf drei, davon zwei in einer Sackgasse" wird damit „**wartet auf eine baubare
> MVP-Pflicht**". Siehe Erdungsabschnitt und PROJ-169.
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

> **Überholt seit dem 2026-09-02 (PROJ-169).** Das Urteil unten ist die Bestandsaufnahme der Erdung und bleibt lesbar; von den drei Blockern sind **zwei gestrichen** (`K1` und `K2` hatten **je 0** Bezüge in den fünf Kriterien dieser Story) — übrig bleibt **PROJ-123**. Siehe den Kopf dieser Spec.

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

> **Am 2026-09-02 berichtigt (PROJ-169), und zwar in beide Richtungen.** Erstens sind `K1` und `K2`
> **gestrichen**: sie haben in den fünf Kriterien dieser Story **je 0** Bezüge — ein Closing-Vollzug
> braucht keinen fertigen 100-Tage-Plan, höchstens eine Übergabestelle, und die ist AC-5 „Übergabe
> an die Integration" mit einem Bezug auf `A2`, nicht auf K. Zweitens ist der Zusatz „zwei Stories,
> die sich gegenseitig blockieren" **auch für sie nicht mehr wahr**: der Zyklus ist aufgelöst, beide
> starten nach PROJ-127-α. Diese Story ist damit **nicht** die am tiefsten blockierte der Tranche,
> sondern die mit **einem** Blocker.

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
