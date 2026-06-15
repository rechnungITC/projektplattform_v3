---
id: PROJ-129
title: "Vertraulichkeits-Klassifikation und Need-to-know-Steuerung"
issue_type: Story
epic_code: L
epic_title: "Vertraulichkeit, NDA & Audit"
priority: Highest
priority_source: "Must (MVP)"
labels: ["ma-platform", "epic-l", "mvp"]
dependencies: ["B1", "B4", "L1", "L3"]
roles: ["Deal Lead", "Legal Counsel", "Executive Sponsor", "IT-Sicherheit", "PMO-Lead"]
summary_for_jira: "[L2] Vertraulichkeits-Klassifikation und Need-to-know-Steuerung"
---

# PROJ-129: Vertraulichkeits-Klassifikation und Need-to-know-Steuerung

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic L — Vertraulichkeit, NDA & Audit)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND-Foundation** · Andockpunkt: erweitert Class-3-Modell (ADR Fork 2/3). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** L — Vertraulichkeit, NDA & Audit  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP)  
> **Labels:** `ma-platform` · `epic-l` · `mvp`  
> **Abhängigkeiten:** `B1`, `B4`, `L1`, `L3`

**User Story:**

Als Deal Lead möchte ich für jedes Inhaltsobjekt eine Vertraulichkeitsstufe setzen (z. B. Public, Internal, Confidential, Strictly Confidential / Inner Circle) und damit die Sichtbarkeit projekt- und phasenabhängig steuern können, damit das Need-to-know-Prinzip technisch durchgesetzt wird.

**Beschreibung / Kontext:**

Das Modell betont Vertraulichkeit als kritischen Erfolgsfaktor. Die Plattform braucht eine durchgehende Klassifikation, die mit dem Berechtigungskonzept (B4) und mit NDA-Verwaltung (L1) zusammenspielt.

**Akzeptanzkriterien:**

- [ ] Pro Inhaltsobjekt (Projekt-Felder, Aufgaben, Deliverables, Risiken, Findings, Kommunikationsentwürfe, Bewertungen, SPA-Issues) kann eine Klassifikationsstufe gesetzt werden.
- [ ] Vier Stufen sind konfigurierbar (mindestens: Public, Internal, Confidential, Strictly Confidential / Inner Circle).
- [ ] Sichtbarkeit folgt der Klassifikation: höhere Stufen erfordern explizite Mitgliedschaft im Inner Circle, gültige NDA (L1) und entsprechende Rolle (B1/B4).
- [ ] Eine Klassifikation kann durch eine berechtigte Rolle geändert werden; jede Änderung wird im Audit-Trail (L3) protokolliert.
- [ ] Exporte tragen Sichtbarkeitsstufen (z. B. als Wasserzeichen – siehe H3 offene Frage).

**Abgrenzungen (Out of Scope):**

- Keine Inhaltsanalyse zur automatischen Klassifikation.
- Keine externe DLP-Anbindung (Data Loss Prevention) in der Erst-Story.

**Offene Fragen:**

- Welche Stufenbezeichnungen und welche Zahl an Stufen sollen organisationsweit gelten?
- Sollen Exporte aus 'Strictly Confidential' technisch verhindert oder nur protokolliert werden?

**Definition of Ready:**

- [ ] Klassifikationsmodell ist mit Legal, Compliance und Security abgestimmt.
- [ ] Verbindung zu B4 und L1 ist spezifiziert.

**Definition of Done:**

- [ ] Klassifikation kann gesetzt und geändert werden.
- [ ] Sichtbarkeit ist durchgesetzt und getestet (inkl. negativer Tests).
- [ ] Audit-Trail erfasst Klassifikationsänderungen und Zugriffsversuche.

**Abhängigkeiten:**

- B1
- B4
- L1
- L3

**Betroffene Rollen:**

- Deal Lead
- Legal Counsel
- Executive Sponsor
- IT-Sicherheit
- PMO-Lead

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · L — Vertraulichkeit, NDA & Audit_
