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

## Status: Planned
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

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · J — Vertrag, Signing & Closing_
