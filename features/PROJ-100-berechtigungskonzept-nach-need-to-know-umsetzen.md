---
id: PROJ-100
title: "Berechtigungskonzept nach Need-to-know umsetzen"
issue_type: Story
epic_code: B
epic_title: "Rollen, Gremien & Governance"
priority: Highest
priority_source: "Must (MVP – ohne dieses Konzept ist die Plattform für reale M&A-Arbeit nicht einsetzbar)"
labels: ["ma-platform", "epic-b", "mvp"]
dependencies: ["A1", "B1", "L3"]
roles: ["IT-Sicherheitsverantwortlicher", "Datenschutzbeauftragter", "Compliance", "PMO-Lead", "Deal Lead"]
summary_for_jira: "[B4] Berechtigungskonzept nach Need-to-know umsetzen"
---

# PROJ-100: Berechtigungskonzept nach Need-to-know umsetzen

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic B — Rollen, Gremien & Governance)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND-Foundation** · Andockpunkt: Need-to-Know RLS-Sublayer (ADR Fork 2) — split 100a/100b; Pentest-Pflicht. Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** B — Rollen, Gremien & Governance  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP – ohne dieses Konzept ist die Plattform für reale M&A-Arbeit nicht einsetzbar)  
> **Labels:** `ma-platform` · `epic-b` · `mvp`  
> **Abhängigkeiten:** `A1`, `B1`, `L3`

**User Story:**

Als IT-Sicherheitsverantwortlicher möchte ich Berechtigungen auf Projekt-, Phasen-, Workstream-, Dokument- und Feldebene nach dem Need-to-know-Prinzip steuern können, damit Vertraulichkeit, Vorabinformationsverbote und regulatorische Pflichten eingehalten werden.

**Beschreibung / Kontext:**

Vertraulichkeit ist in M&A-Projekten essenziell. Das Modell nennt Need-to-know explizit als Kommunikationsprinzip. Die Plattform muss feingranulare Berechtigungen mit klarer Auditierbarkeit unterstützen.

**Akzeptanzkriterien:**

- [ ] Berechtigungen sind auf den Ebenen Projekt, Phase, Workstream, Deliverable und einzelnen Dokumenten setzbar.
- [ ] Vorgefertigte Berechtigungsprofile (z. B. 'SteerCo lesend', 'DD-Stream Legal voll', 'externer Berater Tax') sind verfügbar.
- [ ] Jede Berechtigungsänderung wird im Audit-Trail (L3) protokolliert.
- [ ] Eine Übersicht 'Wer darf was sehen?' pro Objekt ist verfügbar.
- [ ] Ein 4-Augen-Prinzip kann optional für besonders sensitive Rechte aktiviert werden.

**Abgrenzungen (Out of Scope):**

- Plattform implementiert kein eigenes IAM – Authentifizierung läuft über den Unternehmens-IdP.
- Keine automatische Klassifikation von Dokumenten.

**Offene Fragen:**

- Welche Vorab-Berechtigungsprofile sind aus Compliance-Sicht verbindlich?
- Müssen Berechtigungen mit Geheimhaltungsvermerken aus dem DMS automatisch verknüpft werden?
- Wie wird 'temporäre Berechtigung' (z. B. nur für die nächsten 5 Tage) abgebildet?

**Definition of Ready:**

- [ ] Berechtigungsmodell ist mit IT-Sicherheit, Datenschutz und Compliance abgestimmt.
- [ ] Rollen-Berechtigungs-Matrix ist dokumentiert.

**Definition of Done:**

- [ ] Berechtigungen sind auf allen genannten Ebenen technisch wirksam.
- [ ] Audit-Trail erfasst jede Vergabe und jeden Entzug.
- [ ] Penetrationstest auf Rechte-Eskalation bestanden.

**Abhängigkeiten:**

- A1 – Projektanlage
- B1 – Rollen
- L3 – Audit-Trail

**Betroffene Rollen:**

- IT-Sicherheitsverantwortlicher
- Datenschutzbeauftragter
- Compliance
- PMO-Lead
- Deal Lead

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · B — Rollen, Gremien & Governance_
