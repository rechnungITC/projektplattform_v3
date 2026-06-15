---
id: PROJ-122
title: "SPA Issues List und Vertragsverhandlungspunkte"
issue_type: Story
epic_code: J
epic_title: "Vertrag, Signing & Closing"
priority: Highest
priority_source: "Must (MVP)"
labels: ["ma-platform", "epic-j", "mvp"]
dependencies: ["G3", "I2", "J2", "F1", "L2", "L3"]
roles: ["Legal Counsel", "Deal Lead", "CFO / Finance Lead", "Externe M&A-Berater", "Executive Sponsor"]
summary_for_jira: "[J1] SPA Issues List und Vertragsverhandlungspunkte"
---

# PROJ-122: SPA Issues List und Vertragsverhandlungspunkte

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic J — Vertrag, Signing & Closing)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND** · Andockpunkt: neu (an PROJ-20 Open-Items denkbar). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** J — Vertrag, Signing & Closing  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP)  
> **Labels:** `ma-platform` · `epic-j` · `mvp`  
> **Abhängigkeiten:** `G3`, `I2`, `J2`, `F1`, `L2`, `L3`

**User Story:**

Als Legal Counsel möchte ich offene Vertrags- und Verhandlungspunkte (SPA Issues List) strukturiert führen, Positionen beider Seiten dokumentieren und Verhandlungsfortschritte verfolgen, damit die Vertragsverhandlung diszipliniert und nachvollziehbar geführt wird.

**Beschreibung / Kontext:**

Phase 7 (Vertragsverhandlung) verlangt das Pflichtartefakt 'SPA Issues List'. Die Plattform muss diese Liste als strukturierten, versionierbaren Bestandteil führen, der mit Findings (G3), Kaufpreislogik (I2) und Closing Conditions (J2) verzahnt ist.

**Akzeptanzkriterien:**

- [ ] Pro Issue können Titel, Klauselbezug (SPA-Abschnitt), eigene Position, Gegenposition, Verhandlungsstand, Risiko bei Nichteinigung, empfohlene Lösung erfasst werden.
- [ ] Issues haben einen Status (offen, in Verhandlung, geeinigt, eskaliert, geschlossen).
- [ ] Issues können mit Findings (G3), Garantien/Freistellungen, Kaufpreis-Bridge (I2) und Closing Conditions (J2) verknüpft werden.
- [ ] Vor Stage-Gate 6 (Signing) wird automatisch ein Hinweis erzeugt, wenn noch Issues im Status 'offen' oder 'eskaliert' bestehen.
- [ ] Vertraulichkeit folgt L2 (typischerweise 'Inner Circle').

**Abgrenzungen (Out of Scope):**

- Keine Vertragstext-Bearbeitung; SPA selbst wird außerhalb der Plattform redigiert.
- Keine automatische Klauselgenerierung.

**Offene Fragen:**

- Sollen Issues auf Klausel-Ebene verlinkt werden (z. B. Verweis auf konkrete Klausel-ID im Vertragsentwurf)?
- Wird eine Schnittstelle zu Vertrags-Management-Tools (CLM) angestrebt?

**Definition of Ready:**

- [ ] Datenmodell und Statusmodell sind mit Legal abgestimmt.
- [ ] Inner-Circle-Sichtbarkeitsregeln sind dokumentiert.

**Definition of Done:**

- [ ] Issue-Liste kann erfasst, verknüpft, gefiltert und exportiert werden.
- [ ] Hinweis bei offenen Issues an Stage-Gate 6 ist getestet.
- [ ] Audit-Trail (L3) ist aktiv.

**Abhängigkeiten:**

- G3
- I2
- J2
- F1
- L2
- L3

**Betroffene Rollen:**

- Legal Counsel
- Deal Lead
- CFO / Finance Lead
- Externe M&A-Berater
- Executive Sponsor

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · J — Vertrag, Signing & Closing_
