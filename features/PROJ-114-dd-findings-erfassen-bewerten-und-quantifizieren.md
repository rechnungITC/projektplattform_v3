---
id: PROJ-114
title: "DD-Findings erfassen, bewerten und quantifizieren"
issue_type: Story
epic_code: G
epic_title: "Due Diligence"
priority: Highest
priority_source: "Must (MVP)"
labels: ["ma-platform", "epic-g", "mvp"]
dependencies: ["G1", "G2", "E1", "I1", "I2", "J1", "L3"]
roles: ["Stream Leads", "Deal Lead", "CFO / Finance Lead", "Legal Counsel", "Tax Advisor", "Externe Berater"]
summary_for_jira: "[G3] DD-Findings erfassen, bewerten und quantifizieren"
---

# PROJ-114: DD-Findings erfassen, bewerten und quantifizieren

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic G — Due Diligence)
**Priority:** P1

> **Epic:** G — Due Diligence  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP)  
> **Labels:** `ma-platform` · `epic-g` · `mvp`  
> **Abhängigkeiten:** `G1`, `G2`, `E1`, `I1`, `I2`, `J1`, `L3`

**User Story:**

Als Stream Lead möchte ich Findings strukturiert erfassen, nach Schwere bewerten und – wo möglich – wirtschaftlich quantifizieren können, damit die DD-Ergebnisse direkt in Kaufpreislogik (I2), Vertragsverhandlung (J1) und Integrationsplanung (K1) überführt werden können.

**Beschreibung / Kontext:**

Das Modell betont, dass DD-Findings konsequent in Bewertung, Vertrag und Integration einfließen müssen. Findings unterscheiden sich von Risiken (E1) darin, dass sie konkret aus der DD entstehen und meist quantifizierbar sind. Die Plattform muss diese Übersetzung der Erkenntnisse unterstützen.

**Akzeptanzkriterien:**

- [ ] Findings können je Stream erfasst werden mit: Titel, Sachverhalt, Schwere (niedrig, mittel, hoch, Deal Breaker), wirtschaftliche Auswirkung (geschätzt, in EUR), Eintrittswahrscheinlichkeit, empfohlene Behandlung (Kaufpreisanpassung, Garantie, Freistellung, Integrationsthema, akzeptiert).
- [ ] Findings können mit Risiken (E1), Q&A-Einträgen (G2), SPA-Punkten (J1) und Bewertungsmodell (I1) verknüpft werden.
- [ ] Ein als 'Deal Breaker' klassifiziertes Finding löst automatisch einen Eskalationshinweis an Deal Lead und Sponsor aus.
- [ ] Eine Findings-Übersicht je Stream, je Schwere und in Summe (Kaufpreis-Risiko in EUR) ist abrufbar.
- [ ] Findings sind exportierbar und werden im DD-Bericht (siehe G5) automatisch aggregiert.

**Abgrenzungen (Out of Scope):**

- Plattform berechnet keine automatische Kaufpreisanpassung – Findings werden zur Hand in die Kaufpreis-Bridge (I2) übernommen.
- Sensitivitätsanalysen sind nicht in Scope.

**Offene Fragen:**

- Soll die Quantifizierung in EUR Pflicht oder optional sein?
- Soll es eine Audit-Pflicht für Deal Breaker geben (Vier-Augen-Prinzip)?

**Definition of Ready:**

- [ ] Klassifikationsschema und Mindestattribute sind mit M&A/Finance/Legal abgestimmt.
- [ ] Eskalationspfad bei Deal Breaker ist definiert.

**Definition of Done:**

- [ ] Findings können erfasst, verknüpft, eskaliert und exportiert werden.
- [ ] Eskalationshinweis bei Deal Breaker ist getestet.
- [ ] Audit-Trail (L3) erfasst jede Statusänderung.

**Abhängigkeiten:**

- G1
- G2
- E1
- I1
- I2
- J1
- L3

**Betroffene Rollen:**

- Stream Leads
- Deal Lead
- CFO / Finance Lead
- Legal Counsel
- Tax Advisor
- Externe Berater

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · G — Due Diligence_
