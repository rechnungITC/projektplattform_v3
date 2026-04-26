# Umsetzungsphasen

6-Phasen-Roadmap für den Plattformausbau. Jede Story ist einer Phase zugeordnet (siehe Epic- und Story-Dateien). Reihenfolge ist verbindlich: Phase N hängt von N−1 ab, **Phase 1 ist Pflichtvoraussetzung für alle KI-relevanten Entwicklungen**.

## Phase-Übersicht

| Phase | Fokus | Enthaltene Epics / Kernstories |
|---|---|---|
| **Phase 1** | Fundament | EP-01-ST-01/02 (Multi-Tenant), EP-02-ST-01/03/04 (Navigation + Rollen), EP-03-ST-01 (Datenmodell), EP-10-ST-01 (Model-Routing), F12.1 (Datenschutz-Grundkonfig) |
| **Phase 2** | Regelbasierter Wizard + Stammdaten | EP-03-ST-02/03/04/05 (Dialog + Stammdaten), EP-04-ST-01/02/03/04 (Typen + Methoden), EP-05-ST-01 (Projektraum), EP-06-ST-01/02 (Stakeholder) |
| **Phase 3** | Module + Versionierung | EP-05-ST-02/03/04 (Kanban/Scrum/Gantt intern), F4.2 (Risiken), F4.5 (Budget), EP-07-ST-01..04 (Metamodell + Scrum/Klassisch/Bug), EP-08-ST-01..04 (Versionierung), F13.2/F13.4/F13.7 (Feldversionierung/Undo/Governance), EP-09-ST-01/02 (Ressourcen), F10.2 (Modellauswahl), EP-06-ST-03 (Stakeholder-Vorschläge), F5.3 (Stakeholder-Matrix) |
| **Phase 4** | KI-Assistenz | EP-10-ST-02/03/04 (Datenschutz-Sperre, Vorschläge, Review), F2.1b (KI-Dialog als Wizard-Alternative), F12.2 (KI-Nachvollziehbarkeit), F12.3 (Compliance-Hinweise), EP-11-ST-02 (E-Mail-Versand) |
| **Phase 5** | Externe Konnektoren | EP-12-ST-01 (Connector-Framework), EP-12-ST-02 (Jira), EP-11-ST-03 (Slack/Teams), EP-02-ST-02 (projektbezogene Sekundärnavigation, wenn bis dahin nicht abgedeckt), MS-Project-Integration |
| **Phase 6** | Enterprise + Vendor | EP-01-ST-03/04 (Stand-alone-Betrieb), EP-12-ST-03 (Stand-alone-Deployment), **EP-13/E9** (Vendor & Beschaffung) |

## Phase-1-Pflichten (MUSS vor KI-Entwicklung)

Ohne diese Stories darf keine Phase-4-Arbeit (KI) beginnen:

- **PP-33 (F12.1)** Datenschutz-Grundkonfiguration & Klassifizierung
- **PP-70 (EP-01-ST-01)** Multi-Tenant-Grundmodell
- **PP-71 (EP-01-ST-02)** Tenant-Isolation technisch
- **PP-76 (EP-02-ST-03)** Rollen-Katalog
- **PP-77 (EP-02-ST-04)** Rollen-/Sichtbarkeitslogik
- **PP-78 (EP-03-ST-01)** Projektdatenmodell (inkl. Tenant-ID als Pflichtfeld)
- **PP-105 (EP-10-ST-01)** Modellrouting
- **PP-74 (EP-02-ST-01)** Globale Hauptnavigation

## Phase-Status gegen aktuellen Code

| Phase | Stand |
|---|---|
| Phase 1 | ❌ Keine der Pflicht-Stories vollständig umgesetzt. Aktuelle `projects`-Tabelle hat keine `tenant_id`; Identity-Stub ist kein Rollenmodell; kein Model-Routing. |
| Phase 2 | 🟡 Teile implementiert: `projects` CRUD + Lifecycle (Sprint 1), Projekttyp-Enum. Wizard + Methoden fehlen. |
| Phase 3 | 🟡 Phasen + Meilensteine (Sprint 2) decken EP-07-ST-03 weitgehend. Versionierung/Rollback/Budget/Risiken/Ressourcen offen. |
| Phase 4 | ❌ Komplett offen. |
| Phase 5 | ❌ Komplett offen. |
| Phase 6 | ❌ Komplett offen. |

Detailliertes Mapping auf Stories: [implementation-mapping.md](implementation-mapping.md).
