# Offene Punkte und Risiken

Strategische Risiken und offene Produktfragen, die vor Go-Live der jeweiligen Epic-Bereiche entschieden sein müssen.

| ID | Thema | Kritikalität | Muss geklärt sein vor | Verantwortung |
|---|---|---|---|---|
| **R1** | DSGVO-Löschpflicht für Personendaten in Versionshistorie | Kritisch | EP-08 Go-Live | Produkt + Legal |
| **R2** | Undo-Scope: Darf PL Änderungen anderer rückgängig machen? | Hoch | F13.4 (PP-44) Umsetzung | Produkt |
| **R3** | Mehrsprachigkeit (i18n) — noch nicht entschieden | Mittel | Phase 2 UI-Finalisierung | Produkt |
| **R4** | Qualitätssicherung KI-Vorschläge langfristig (Feedback-Loop) | Mittel | Phase 4 Rollout | Produkt + KI |
| **R5** | SAFe-Fachkonzept Tiefe (Essential vs. Portfolio SAFe) | Mittel | EP-04-ST-03 Umsetzung | Produkt |
| **R6** | PMI: objektorientiert UND strukturbasiert — beide initial? | Mittel | EP-04-ST-03 Umsetzung | Produkt |
| **R7** | Bestehende Codebase (Framework, Datenmodell für Migration) | Hoch | Phase 1 Start | Technik |
| **R8** | Enterprise-Standalone Kundengröße/Preismodell | Offen | Phase 6 Start | Business |
| **R9** | Betriebsrat-Relevanz bei KI-Stakeholder-Analyse | Rechtlich prüfen | Phase 4 | Legal + Betriebsrat |
| **R10** | Aufbewahrungsfristen Versionshistorie | Rechtlich prüfen | F13.7 (PP-47) Umsetzung | Legal |

## Verhältnis zu Decisions

Während [`planning/decisions/`](decisions/) **getroffene** Entscheidungen festhält, sammelt dieses Dokument **noch nicht getroffene** — entweder mit definierter Deadline (z. B. „muss vor Phase 4 entschieden sein") oder weil externe Prüfung (Legal/Betriebsrat) aussteht.

Sobald ein Risiko entschieden ist, wandert er als ADR nach `planning/decisions/<slug>.md` und wird hier gestrichen.

## Abgrenzung

Dieses Dokument ist **kein Sprint-Risiko-Register**. Sprint-Risiken (technische Schulden, Delivery-Risiken) gehören in den jeweiligen Sprint-Kickoff/Retro unter `workspace/sprints/`.
