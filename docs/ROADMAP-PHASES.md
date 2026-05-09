# Umsetzungsphasen

6-Phasen-Roadmap für den Plattformausbau. Jede Story ist einer Phase zugeordnet (siehe Epic- und Story-Dateien). Reihenfolge ist verbindlich: Phase N hängt von N−1 ab, **Phase 1 ist Pflichtvoraussetzung für alle KI-relevanten Entwicklungen**.

> Stand 2026-05-06: Dieses Dokument ist mit `features/INDEX.md` reconciled. Der fruehere Sprint-1-Status ist historisch und wurde durch den aktuellen PROJ-Status ersetzt.

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
| Phase 1 | ✅ Durch PROJ-1, PROJ-2, PROJ-3, PROJ-4, PROJ-12 umgesetzt. Multi-Tenant/RLS, Rollen, Projektkern, Operationsmodus und KI-Datenschutzpfade sind live. |
| Phase 2 | ✅ Durch PROJ-5, PROJ-6, PROJ-8, PROJ-16 umgesetzt. Wizard, Methoden-/Typenkatalog, Stakeholder-Grundmodell und Stammdaten-UI sind live. |
| Phase 3 | ✅ Weitgehend umgesetzt durch PROJ-7, PROJ-9, PROJ-10, PROJ-11, PROJ-18, PROJ-19, PROJ-20, PROJ-22, PROJ-24, PROJ-25, PROJ-25b, PROJ-28. Rest: PROJ-27 ist architected; PROJ-25b ist approved, aber E2E/Perf-Follow-ups sind deferred. PROJ-51 ist als cross-cutting UI/UX-Polish-Slice geplant. |
| Phase 4 | ✅ Grundschicht umgesetzt durch PROJ-12, PROJ-30, PROJ-31, PROJ-32, PROJ-33, PROJ-35. Offen: PROJ-34 Communication Tracking und PROJ-44 Context Ingestion als naechste KI-/Kontext-Ausbaustufen. |
| Phase 5 | 🟡 Plumbing umgesetzt durch PROJ-13 und PROJ-14. Echte Adapter sind jetzt als PROJ-47 Jira Export, PROJ-48 MCP Bridge, PROJ-49 Teams Adapter und PROJ-50 bidirektionaler Jira Sync angelegt. |
| Phase 6 | 🟡 Teilweise umgesetzt durch PROJ-3, PROJ-15 und PROJ-17. Weitere Enterprise-/Extension-Tiefe liegt in PROJ-45 Construction und PROJ-46 Software Extension. |

Detailliertes aktuelles Mapping: [features/INDEX.md](../features/INDEX.md) und [EPICS-TO-PROJS.md](EPICS-TO-PROJS.md).
