---
id: PROJ-123
title: "Closing Conditions zwischen Signing und Closing nachverfolgen"
issue_type: Story
epic_code: J
epic_title: "Vertrag, Signing & Closing"
priority: Highest
priority_source: "Must (MVP)"
labels: ["ma-platform", "epic-j", "mvp"]
dependencies: ["J1", "F1", "C1", "L3"]
roles: ["PMO-Lead", "Legal Counsel", "Deal Lead", "CFO / Finance Lead", "Externe Berater"]
summary_for_jira: "[J2] Closing Conditions zwischen Signing und Closing nachverfolgen"
---

# PROJ-123: Closing Conditions zwischen Signing und Closing nachverfolgen

## Status: Planned (baubar — einzige MVP-Pflicht der Kette)

> **Geerdet 2026-09-02 (PROJ-167): nicht blockiert, und `dd_questions` ist ein fast deckungsgleiches
> Vorbild.** Alle vier Abhängigkeiten (`J1`, `F1`, `C1`, `L3`) sind ausgeliefert. Diese Story ist die
> **einzige** der sechs mit `Highest / Must (MVP)`. Ein Fallstrick: die Gate-Nummer in AC-4 ist zu
> prüfen, nicht zu übernehmen. Siehe Erdungsabschnitt.
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic J — Vertrag, Signing & Closing)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND** · Andockpunkt: neu (Checklisten-Pattern). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** J — Vertrag, Signing & Closing  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP)  
> **Labels:** `ma-platform` · `epic-j` · `mvp`  
> **Abhängigkeiten:** `J1`, `F1`, `C1`, `L3`

**User Story:**

Als PMO-Lead möchte ich die Closing Conditions (Kartellfreigaben, Gesellschafterbeschlüsse, Bankzustimmungen, Verzichte auf Vorkaufsrechte, Zustimmung Vertragspartner, MAC-Klausel, Nebenvereinbarungen, finale Finanzinformationen) zentral nachverfolgen, damit der Übergang von Signing zu Closing kontrolliert verläuft.

**Beschreibung / Kontext:**

Phase 8 verlangt eine 'Closing Checklist' als Pflichtartefakt. Zwischen Signing und Closing entstehen Verzögerungen häufig durch unklare Verantwortlichkeiten und unstrukturierte Nachverfolgung. Die Plattform muss diese Lücke schließen.

**Akzeptanzkriterien:**

- [ ] Pro Closing Condition können Titel, Typ (Kartell, Gesellschafter, Bank, Vertrag, MAC, sonstiges), Verantwortlicher, Frist, Status, Belegdokument-Verlinkung erfasst werden.
- [ ] Eine Übersicht zeigt den Erfüllungsgrad in Summe und je Typ.
- [ ] Bei Überschreitung der Frist wird automatisch eskaliert (Hinweis an Deal Lead und Sponsor).
- [ ] Eine Pre-Closing-Sicht zeigt alle nicht erfüllten Bedingungen vor Gate 7 (Closing).
- [ ] Status- und Belegwechsel werden im Audit-Trail (L3) protokolliert.

**Abgrenzungen (Out of Scope):**

- Keine Behörden-Schnittstelle (z. B. zum Bundeskartellamt) in der Erst-Story.
- Inhaltliche Prüfung der Belege ist nicht Aufgabe der Plattform.

**Offene Fragen:**

- Welche Standard-Conditions sollen als Vorlage angelegt sein?
- Sollen Behörden-Verfahren (Anmeldedaten, Eingangs-/Genehmigungsdatum) separat strukturiert werden?

**Definition of Ready:**

- [ ] Vorlage Closing Conditions ist abgestimmt.
- [ ] Eskalationspfade sind definiert.

**Definition of Done:**

- [ ] Erfassung, Status-Tracking und Eskalation funktionieren.
- [ ] Pre-Closing-Sicht ist getestet.
- [ ] Audit-Trail (L3) ist aktiv.

**Abhängigkeiten:**

- J1
- F1
- C1
- L3

**Betroffene Rollen:**

- PMO-Lead
- Legal Counsel
- Deal Lead
- CFO / Finance Lead
- Externe Berater

## Geerdet am 2026-09-02 (PROJ-167)

### Urteil: baubar, mit einem fast deckungsgleichen Vorbild — und die einzige MVP-Pflicht der Tranche

Diese Story ist die **einzige** der sechs mit `priority: Highest` und `priority_source: Must (MVP)`;
die anderen fünf sind `Medium / Should`. Ihre vier Abhängigkeiten (`J1`, `F1`, `C1`, `L3`) sind
**alle ausgeliefert** — Auflösung der Epic-Codes über die Spec-Frontmatter:

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

### `dd_questions` ist das Vorbild, nicht bloß ein ähnliches Muster

Gemessen an der Tabellendefinition aus PROJ-113 gegen die Akzeptanzkriterien hier:

| AC-1 verlangt | `dd_questions` hat |
|---|---|
| Titel | `title text not null` |
| Typ | `priority` + `addressee` (Typ-Spalte wäre neu) |
| Verantwortlicher | `responsible_user_id` |
| Frist | `due_date date` |
| Status | `status text not null default 'open'` |
| Belegdokument-Verlinkung | `answer_link` **und** `external_document_links` mit `entity_type='dd_question'` |
| Vertraulichkeit | `confidentiality_level` (Default `standard`) |

Neu wären die **Typ**-Spalte (Kartell · Gesellschafter · Bank · Vertrag · MAC · sonstiges) und der
Erfüllungsgrad je Typ. Alles andere ist ein bestehendes Rezept.

**Auch die Eskalation aus AC-3 hat ein Vorbild:** `dd_finding_escalations` (PROJ-114) eskaliert an
Deal Lead **und** Sponsor über `ma_project_profiles.sponsor_user_id`, sichtbar in der
PROJ-64-My-Work-Inbox. Und die Überfälligkeitslogik ist in PROJ-45-δ zweifach gepinnt (SQL für
Zähler, TS für Zeilen) — mit der dort gemessenen Lehre, dass „überfällig" je Fachlichkeit **anders**
definiert ist und kein dritter Begriff erfunden werden darf.

**Für AC-4 („Pre-Closing-Sicht vor Gate 7") ein Fallstrick:** die Spec schreibt „Gate 7 (Closing)".
Das deployte 9-Gate-Preset aus PROJ-110 ist copy-on-create und seine Schlüssel sind driftfähig —
PROJ-122 hat für genau diese Klasse gemessen, dass `gate_8` das Signing trägt, nicht `gate_6`. Die
Gate-Nummer ist also zu **prüfen**, nicht zu übernehmen.

**Und die Zahl, die alles einordnet — live gegen Prod gemessen am 2026-09-02:** das M&A-Epic hat
**null Nutzung**. 0 Projekte mit `project_type = 'ma'` (auch keine weich gelöschten), 0 Profile,
0 Bewertungen, 0 SPA-Issues, 0 DD-Findings, 0 DD-Fragen, 0 Stage-Gates, 0 Phasen — bei 39
ausgelieferten M&A-Slices. Das macht keine dieser Stories falsch; es heißt, dass **heute niemand**
auf sie wartet, und dass die Reihenfolge frei wählbar ist statt von einem laufenden Deal erzwungen.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · J — Vertrag, Signing & Closing_
