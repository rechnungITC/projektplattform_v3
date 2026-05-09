# Jira Import 2026-04-30 — Cross-Mapping gegen V3 PROJ-Katalog

**Quelle**: `features/Jira_30.04.2026.md` (Jira HTML-Export, 26 195 Zeilen, 115 PP-Issues + 12 logische Epics in zwei Nummern-Generationen).
**Stichtag**: 2026-04-30
**V3-Stand**: PROJ-1..PROJ-20 deployed, PROJ-21 als Spec angelegt.

> **Wichtige Einschränkung**: Im Jira-Export waren *alle* Description-Felder leer — die Cross-Mapping-Verdikte beruhen daher allein auf den Issue-Titeln. Wo der Titel mehrdeutig ist, ist das Verdikt mit ⚠ markiert; dort ist eine Re-Evaluation mit dem Jira-Owner sinnvoll, bevor PROJ-X-Specs entstehen.

## Wie das Dokument zu lesen ist

Pro Block:
1. **Mapping-Tabelle** Jira-Key → V3-Status. Status-Codes:
   - ✅ **COVERED** — voll abgedeckt durch existierenden PROJ-X.
   - 🔧 **EXTEND** — bestehender PROJ-X muss erweitert werden; konkrete Erweiterung im Hinweis.
   - 🆕 **NEW** — kein bestehender PROJ-X deckt das ab; neuer PROJ-X-Spec empfohlen.
   - ⚠ **RE-EVAL** — Titel zu unscharf / Doppelung mit anderem Jira-Item / unklarer Scope.

2. **Empfehlung** am Ende.

---

## Teil A — Jira-Epics (E1–E13 alte Nummerierung, EP-01–EP-12 neue Nummerierung)

Beide Nummern-Generationen sprechen denselben fachlichen Aufbau an, nur mit teilweise präziseren Titeln in EP-01..EP-12. Ich mappe pro Themenblock.

| Jira-Epic | Titel | V3-Mapping | Status |
|-----------|-------|------------|--------|
| E1 / EP-02 | Plattformfundament & Navigation / Plattformfundament, Navigation und Rollen | PROJ-4 (+PROJ-1 Auth-Anteil) | ✅ COVERED |
| EP-01 (neu) | Mandanten- und Betriebsarchitektur | PROJ-1 + PROJ-3 | ✅ COVERED |
| E2 / EP-03 | Dialoggestützte Projekterstellung / Stammdaten und dialoggestützte Projekterstellung | PROJ-2 + PROJ-5 + PROJ-16 | ✅ COVERED |
| E3 (alt) | Stammdaten & Projektstruktur | PROJ-2 + PROJ-16 | ✅ COVERED |
| E4 / EP-04 | Projektbezogene Module & Logik / Projekttypen, Methoden und Regelwerk | PROJ-6 + PROJ-7 | ✅ COVERED |
| E5 / EP-06 | Stakeholdermanagement / Stakeholder- und Organisationslogik | PROJ-8 | ✅ COVERED |
| E6 / EP-10 | KI-gestützte Inhaltsgenerierung / KI-Assistenz und Datenschutzpfade | PROJ-12 | ✅ COVERED |
| E7 / EP-09 | Ressourcen & Kapazitätsmanagement / Ressourcen, Kapazitäten und Terminlogik | PROJ-11 + PROJ-19 | ✅ COVERED |
| E8 | Kommunikation, Meetings & Präsentationen | PROJ-13 + PROJ-21 (Output-Rendering) | 🔧 EXTEND — „Meetings" sind in V3 nicht als Modul vorhanden (nur Communication + Reports) |
| E9 | Vendor & Beschaffung | PROJ-15 | ✅ COVERED |
| E10 | Flexible KI-Modellanbindung | PROJ-12 (Modell-Routing + Connector-Provider) | ✅ COVERED |
| E11 / EP-12 | Integrationen & Konnektoren / Integrationen, Vendoren und Ausbaupfade | PROJ-14 (+PROJ-15 Anteil) | 🔧 EXTEND — „Ausbaupfade" / Stand-alone-Deployment für Enterprise ist in PROJ-3 nur teil-abgedeckt |
| E12 / EP-08 | Governance & Compliance / Änderungsmanagement, Versionierung und Wiederherstellung | PROJ-10 + PROJ-18 + PROJ-20 | ✅ COVERED |
| E13 / EP-07 | Arbeitspaket-Verwaltung & Versionierung / Methodenobjekte, Arbeitspakete und Backlog-Struktur | PROJ-9 + PROJ-10 | ✅ COVERED |
| EP-05 (neu) | Projektraum und interne Module | PROJ-7 + PROJ-19 | ✅ COVERED |
| EP-11 (neu) | Kommunikation, Versand und interner Chat | PROJ-13 | ✅ COVERED |

**Zwischenergebnis Epic-Ebene**: 13 von 13 fachlichen Themen sind in V3 angelegt. Zwei Themen (E8 Meetings, E11 Stand-alone-Deployment-Tooling) haben Lücken, die als Extensions abzubilden sind.

---

## Teil B — Jira-Stories mit EP-Parent (PP-70..PP-115, 46 Stück)

### EP-01 — Mandanten- und Betriebsarchitektur

| Key | Titel | V3-Mapping | Status / Hinweis |
|-----|-------|------------|------------------|
| PP-70 | Multi-Tenant-Grundmodell definieren | PROJ-1 | ✅ COVERED |
| PP-71 | Tenant-Isolation technisch umsetzen | PROJ-1 (RLS-Helpers) | ✅ COVERED |
| PP-72 | Stand-alone-Betriebsmodus für Enterprise definieren | PROJ-3 (operation-mode) | ✅ COVERED |
| PP-73 | Update- und Betriebsstrategie für Stand-alone definieren | PROJ-3 | 🔧 EXTEND — Update-Strategie / Migrationspfad-Dokumentation fehlt; v.a. wenn ein Enterprise-Deployment Customizations hat. Neue Story unter PROJ-3 oder eigener PROJ-22-Vorschlag. |

### EP-02 — Plattformfundament, Navigation und Rollen

| Key | Titel | V3-Mapping | Status / Hinweis |
|-----|-------|------------|------------------|
| PP-74 | Globale Hauptnavigation definieren | PROJ-4 | ✅ COVERED |
| PP-75 | Projektbezogene Sekundärnavigation definieren | PROJ-4 + PROJ-7 (project-room-shell) | ✅ COVERED |
| PP-76 | Plattformrollen und Projektrollen definieren | PROJ-4 (RBAC-Matrix) | ✅ COVERED |
| PP-77 | Rollen- und Sichtbarkeitslogik umsetzen | PROJ-4 + PROJ-1 RLS-Helpers | ✅ COVERED |

### EP-03 — Stammdaten und dialoggestützte Projekterstellung

| Key | Titel | V3-Mapping | Status / Hinweis |
|-----|-------|------------|------------------|
| PP-78 | Projektdatenmodell definieren | PROJ-2 | ✅ COVERED |
| PP-79 | Geführten Projektdialog aufbauen | PROJ-5 (Wizard) | ✅ COVERED |
| PP-80 | Dynamische Rückfragen nach Typ und Methode anzeigen | PROJ-5 + PROJ-6 (Type/Method Catalog) | ✅ COVERED |
| PP-81 | Dialogdaten in Stammdaten überführen | PROJ-5 → projects, type_specific_data | ✅ COVERED |
| PP-82 | Stammdaten nachträglich bearbeiten | PROJ-16 (Master Data UI) | ✅ COVERED |

### EP-04 — Projekttypen, Methoden und Regelwerk

| Key | Titel | V3-Mapping | Status / Hinweis |
|-----|-------|------------|------------------|
| PP-83 | Projekttyp-Katalog für ERP und Generic Software definieren | PROJ-6 (catalog: erp + software + general + construction) | ✅ COVERED |
| PP-84 | Methodik-Katalog (Scrum, Kanban, Wasserfall, SAFe, PMI, PRINCE2, VXT2.0) | PROJ-6 | 🔧 EXTEND — V3 hat aktuell nur Scrum/Kanban/Wasserfall (PROJECT_METHODS Enum). **SAFe, PMI, PRINCE2, VXT2.0 fehlen** als gekapselte Methoden. Erweiterung des Katalogs nötig — neuer PROJ-X oder PROJ-6-Folgeslice. |
| PP-85 | Methodenabhängige Objektlogik definieren | PROJ-6 + PROJ-9 (WORK_ITEM_METHOD_VISIBILITY) | ✅ COVERED |
| PP-86 | Regelwerk für Module, Rollen und Standardstrukturen aufbauen | PROJ-6 (Rule Engine) | ✅ COVERED |

### EP-05 — Projektraum und interne Module

| Key | Titel | V3-Mapping | Status / Hinweis |
|-----|-------|------------|------------------|
| PP-87 | Projektraum-Grundgerüst erzeugen | PROJ-7 (project-room-shell + tabs) | ✅ COVERED |
| PP-88 | Interne Kanban-Struktur bereitstellen | PROJ-7 + PROJ-9 | ✅ COVERED |
| PP-89 | Interne Kanban-Struktur bereitstellen *(Duplikat von PP-88)* | PROJ-7 | ⚠ RE-EVAL — Duplikat in Jira; in V3 nicht zweimal anlegen. |
| PP-90 | Interne Scrum-Struktur bereitstellen | PROJ-7 + PROJ-9 + Sprints | ✅ COVERED |
| PP-91 | Interne Gantt-Grundstruktur bereitstellen | PROJ-7 (MVP-Slice deployed) + PROJ-19 (phases timeline) | 🔧 EXTEND — V3 hat eine MVP-Gantt-Struktur, aber „Grund­struktur" im Jira-Sinn (Drag-Resize, Dependencies-Kanten, kritischer Pfad) ist nicht voll umgesetzt. |

### EP-06 — Stakeholder- und Organisationslogik

| Key | Titel | V3-Mapping | Status / Hinweis |
|-----|-------|------------|------------------|
| PP-92 | Stakeholder-Datenmodell definieren | PROJ-8 | ✅ COVERED |
| PP-93 | Stakeholder manuell pflegen | PROJ-8 | ✅ COVERED |
| PP-94 | Stakeholder-Vorschläge je Projekttyp erzeugen | PROJ-6 (catalog.standard_roles) + PROJ-8 | 🔧 EXTEND — Catalog liefert Standard-Rollen, aber **automatische Stakeholder-Stub-Erzeugung beim Projekt-Setup** ist nicht implementiert. Klarer Erweiterungs-Scope. |

### EP-07 — Methodenobjekte, Arbeitspakete und Backlog-Struktur

| Key | Titel | V3-Mapping | Status / Hinweis |
|-----|-------|------------|------------------|
| PP-95 | Gemeinsames Metamodell für Planungsobjekte definieren | PROJ-9 (work-item Metamodell) | ✅ COVERED |
| PP-96 | Scrum-Objekte umsetzen (Epic/Story/Task/Subtask/Bug) | PROJ-9 (WORK_ITEM_KINDS) | ✅ COVERED |
| PP-97 | Klassische Phasen- und Arbeitspaketobjekte umsetzen (PMI/Wasserfall) | PROJ-19 + PROJ-9 (work_package kind) | ✅ COVERED |
| PP-98 | Bugs methodenübergreifend umsetzen | PROJ-9 (bug visibility = alle Methoden) | ✅ COVERED |

### EP-08 — Änderungsmanagement, Versionierung und Wiederherstellung

| Key | Titel | V3-Mapping | Status / Hinweis |
|-----|-------|------------|------------------|
| PP-99 | Feldweise Änderungsverfolgung einführen | PROJ-10 (audit_log_entries field-level) | ✅ COVERED |
| PP-100 | Versionsstände eines Objekts anzeigen und vergleichen | PROJ-10 (HistoryTab + Diff) | ✅ COVERED |
| PP-101 | Einzelne Feldänderungen rückgängig machen (selektiver Feld-Rollback) | PROJ-10 | 🔧 EXTEND — V3 PROJ-10 hat „undo last change" + „restore to version", aber **selektiver Single-Field-Rollback** ist nicht ausdrücklich implementiert. Bestätigen mit dem Code; sehr wahrscheinlich Erweiterung. |
| PP-102 | Objekte kopieren | PROJ-10 (copy work-item) | ✅ COVERED |

### EP-09 — Ressourcen, Kapazitäten und Terminlogik

| Key | Titel | V3-Mapping | Status / Hinweis |
|-----|-------|------------|------------------|
| PP-103 | Ressourcen aus Stakeholdern ableiten | PROJ-11 (source_stakeholder_id) | ✅ COVERED |
| PP-104 | Verfügbarkeiten und FTE manuell pflegen | PROJ-11 (resource_availabilities) | ✅ COVERED |

### EP-10 — KI-Assistenz und Datenschutzpfade

| Key | Titel | V3-Mapping | Status / Hinweis |
|-----|-------|------------|------------------|
| PP-105 | Modellrouting aufbauen (KI-Abstraktionsschicht) | PROJ-12 (provider abstraction) | ✅ COVERED |
| PP-106 | Externe KI für personenbezogene Daten technisch sperren | PROJ-12 (Klasse-3 Hard-Block via data-privacy-registry) | ✅ COVERED |
| PP-107 | KI-Vorschläge für Planungseinheiten generieren | PROJ-12 (ai_proposals) | ✅ COVERED |
| PP-108 | Review- und Freigabeflow für KI-Ergebnisse umsetzen | PROJ-12 (proposal accept/reject) | ✅ COVERED |

### EP-11 — Kommunikation, Versand und interner Chat

| Key | Titel | V3-Mapping | Status / Hinweis |
|-----|-------|------------|------------------|
| PP-109 | Kommunikationscenter bereitstellen | PROJ-13 (outbox) | ✅ COVERED |
| PP-110 | E-Mail-Versand integrieren | PROJ-13 (email channel) | ✅ COVERED |
| PP-111 | Slack- und Teams-Versand integrieren | PROJ-13 (slack + teams channels) | ✅ COVERED |
| PP-112 | Rudimentären internen Projektchat bereitstellen | PROJ-13 (project chat MVP) | ✅ COVERED |

### EP-12 — Integrationen, Vendoren und Ausbaupfade

| Key | Titel | V3-Mapping | Status / Hinweis |
|-----|-------|------------|------------------|
| PP-113 | Connector-Framework aufbauen | PROJ-14 (Plumbing-Slice deployed) | ✅ COVERED |
| PP-114 | Jira-Integration bereitstellen (Export/Import) | PROJ-14 | 🔧 EXTEND — PROJ-14 ist „Plumbing-Slice"; **eine konkrete Jira-Connector-Implementierung (Adapter + Mapping + bidirektionale Sync) fehlt**. Klassischer großer Folgeslice. |
| PP-115 | Stand-alone-Deployment für Enterprise vorbereiten | PROJ-3 (operation-mode) | 🔧 EXTEND — PROJ-3 deklariert Stand-alone-Modus; **Tooling/Installer/Migrationspfad** ist Folge-Story. |

---

## Teil C — Orphan-Stories mit F-Prefix (PP-21..PP-57, 37 Stück)

Diese 37 Issues sind die ältere Generation (F1.1, F2.1a, …). Sie überschneiden sich stark mit den EP-gegliederten Stories oben — viele sind nur eine Vorgängerversion derselben Idee. Ich liste hier nur die, die *zusätzliches* Material liefern oder Re-Evaluation brauchen.

| Key | Titel | Verdikt vs V3 |
|-----|-------|---------------|
| PP-21 | F1.1 — Hauptnavigation (Plattformebene) | ✅ COVERED (PROJ-4) |
| PP-22 | F1.2 — Projektbezogene Navigationsebene (2. Ebene) | ✅ COVERED (PROJ-4) |
| PP-23 | SPIKE — Rollen-, Berechtigungs- & Multi-Tenant-Konzept | ✅ COVERED (PROJ-1 + PROJ-4) |
| PP-24 | F2.1a — Regelbasierter Projekt-Setup-Wizard | ✅ COVERED (PROJ-5) |
| PP-25 | F2.3 — Review- & Bestätigungsansicht vor Projektgenerierung | ✅ COVERED (PROJ-5) |
| PP-26 | F3.1 — Projektdatenmodell (mit Tenant-ID) | ✅ COVERED (PROJ-2) |
| PP-27 | SPIKE — Projekttyp-Bibliothek & Methodenhierarchien (Scrum/SAFe/PMI/Kanban) | 🔧 EXTEND — siehe PP-84, SAFe + PMI + PRINCE2 + VXT2.0 nicht im V3-Catalog |
| PP-28 | F4.3 — Kanban Board (intern, mit Versionierung) | ✅ COVERED (PROJ-7 + PROJ-10) |
| PP-29 | F4.4 — Scrum Board mit Epic/Story/Task/Subtask/Bug-Hierarchie | ✅ COVERED (PROJ-7 + PROJ-9) |
| PP-30 | F5.1 — Stakeholdererfassung & -verwaltung (DSGVO-konform) | ✅ COVERED (PROJ-8) |
| PP-31 | F6.1 — KI-Story- & Arbeitspaket-Generierung mit Validierungspflicht | ✅ COVERED (PROJ-12) |
| PP-32 | SPIKE — KI-Abstraktionsschicht / Model Router Architektur | ✅ COVERED (PROJ-12) |
| PP-33 | F12.1 — Datenschutz-Grundkonfiguration & KI-Klassifizierung | ✅ COVERED (PROJ-12 data-privacy-registry) |
| PP-34 | SPIKE — Versionierungsarchitektur (feldweise, Delta/Diff) | ✅ COVERED (PROJ-10) |
| PP-35 | F13.2 — Arbeitspaket bearbeiten (mit automatischer Feldversionierung) | ✅ COVERED (PROJ-9 + PROJ-10) |
| PP-36 | F4.1 — Modulkonfiguration & regelbasierte Projektlogik je Typ und Methodik | ✅ COVERED (PROJ-6 Rule Engine + PROJ-17 Module-Toggles) |
| **PP-37** | **F4.2 — Risikoregister (mit Historisierung)** | ✅ COVERED (PROJ-20 risks + PROJ-10 audit) |
| **PP-38** | **F4.5 — Budget-Modul (mit Historisierung)** | 🆕 **NEW** — Budget ist im PRD als Teil von PROJ-7 erwähnt (`P0 (MVP) — Project Room with … Risks/Budget`), aber **NICHT implementiert**. Kein `budgets`-Tabelle, kein Budget-UI. Verdient einen eigenen PROJ-X-Spec. |
| PP-39 | F4.6 — Gantt / PMI-Phasenplanung (intern, objektorientiert & strukturbasiert) | 🔧 EXTEND — siehe PP-91, V3-Gantt ist MVP |
| PP-40 | F5.2 — Regelbasierte Stakeholder-Vorschlagslogik | 🔧 EXTEND — siehe PP-94 |
| **PP-41** | **F5.3 — Stakeholder-Matrix (Einfluss / Betroffenheit)** | 🆕 **NEW** — PROJ-8 hat die Felder `influence` + `impact`, aber **kein dediziertes Matrix-View / 2x2-Visualisierung**. Eigenständige Visualisierungs-Story. |
| PP-42 | F12.2 — KI-Nachvollziehbarkeit (Herkunft, Status, Audit-Log) | ✅ COVERED (PROJ-12 + PROJ-10) |
| PP-43 | F13.3 — Versionsstände abrufen & Diff-Vergleich (feldweise) | ✅ COVERED (PROJ-10 HistoryTab) |
| PP-44 | F13.4 — Undo (letzte Änderung) & Restore (beliebiger Versionsstand) | ✅ COVERED (PROJ-10) |
| PP-45 | F13.5 — Selektiver Feld-Undo | 🔧 EXTEND — siehe PP-101 |
| PP-46 | F13.6 — Arbeitspakete & Stories kopieren (innerhalb und projektübergreifend) | 🔧 EXTEND — V3-Copy ist projektintern; **projektübergreifender Copy** fehlt. |
| PP-47 | F13.7 — Versions-Governance: Aufbewahrungsfristen, DSGVO-Löschung, Export | ✅ COVERED (PROJ-10 retention + PROJ-17 export + DSGVO-Redact) |
| PP-48 | F6.2 — Validierungs- & Freigabemechanismus für KI-Inhalte | ✅ COVERED (PROJ-12 review flow) |
| PP-49 | F7.1 — Ressourcenobjekt & Kapazitätsplanung aus Stakeholdern | ✅ COVERED (PROJ-11) |
| PP-50 | F7.1 — Ressourcenobjekt & Kapazitätsplanung *(Duplikat von PP-49)* | ⚠ RE-EVAL — Duplikat |
| PP-51 | F8.1 — KI-generierte E-Mail-Entwürfe & Statusupdates | ✅ COVERED (PROJ-13 + PROJ-12) |
| PP-52 | F10.2 — Datenschutzbasierte Modellauswahl (Klasse 3 = technisch erzwungen lokal) | ✅ COVERED (PROJ-12 data-privacy-registry hard-block) |
| PP-53 | F11.1 — Konnektor-Framework (generische Integrationsarchitektur) | ✅ COVERED (PROJ-14) |
| PP-54 | F11.1 — Konnektor-Framework *(Duplikat von PP-53)* | ⚠ RE-EVAL — Duplikat |
| PP-55 | F11.2 — Jira-Integration (Export, Import, bidirektionale Sync) | 🔧 EXTEND — siehe PP-114 |
| PP-56 | F12.3 — Kontextabhängige Compliance-Hinweise je Projekttyp | 🔧 EXTEND — PROJ-18 hat `default_tag_keys` per Projekttyp (Stichwort PROJ-21 ST-05) — die **kontextabhängigen Hinweise (UI-Banner / Wizard-Hint)** fehlen aber als eigenes Surface. Klein, kann an PROJ-18b angehängt werden. |
| **PP-57** | **F2.1b — KI-geführter Projektdialog (Phase 4, nach Wizard)** | 🆕 **NEW** — V3-PROJ-5-Wizard ist regelbasiert (Static Forms). Eine **konversationelle KI-Phase nach Wizard-Abschluss** ist nicht im Scope. Eigenständige Erweiterung der Projekterstellung. |

---

## Teil D — Synthese: Was ist neu, was Erweiterung, was Re-Evaluation?

> Reconciliation 2026-05-06: Die urspruenglichen PROJ-Nummern in diesem Abschnitt waren Import-Vorschlaege vom 2026-04-30. Seitdem sind PROJ-22 bis PROJ-43 anderweitig belegt bzw. umgesetzt. Die aktuelle Nummerierung folgt `features/INDEX.md`.

### 🆕 Genuinely NEW — neue PROJ-X-Specs empfehlen

| Vorschlag | Quelle | Kurz-Scope | Priorität |
|-----------|--------|------------|-----------|
| **PROJ-34 — Stakeholder Communication Tracking** | PP-41 + Stakeholderwissen | Interaktionshistorie, Sentiment, Kooperationssignale, Reaktionsverhalten, Coaching-Kontext. | P1 |
| **PROJ-44 — Context Ingestion Pipeline** | PP-57 + target-picture | Dokumente, E-Mails und Meeting-Notizen als strukturierte Context Sources mit Proposal-Queue. | P1 |
| **PROJ-47 — Jira Export Connector** | PP-114 / PP-55 | Outbound Jira-Adapter mit Field-Mapping, Export-Jobs, Sync-Log und Retry. | P1 |

### 🔧 EXTENSIONS — Folge-Slices an bestehenden PROJ-X

| Erweiterung | Bestehender PROJ-X | Quelle | Kurz-Scope | Priorität |
|-------------|-------------------|--------|------------|-----------|
| Methoden-Katalog SAFe + PMI + PRINCE2 + VXT2.0 | PROJ-6 | PP-84, PP-27 | Catalog-Erweiterung um 4 weitere Methoden inkl. Method-Object-Visibility-Mapping. | P1 |
| Selektiver Feld-Undo | PROJ-10 | PP-101, PP-45 | Single-Field-Rollback-API + UI im HistoryTab. | P2 |
| Projektübergreifender Copy | PROJ-10 | PP-46 | Cross-project-Copy für Work-Items + Stories inkl. Tenant-Boundary-Check. | P2 |
| Stakeholder-Stub-Auto-Generierung | PROJ-8 + PROJ-6 | PP-94, PP-40 | Beim Projekt-Setup automatisch Stakeholder-Stubs aus catalog.standard_roles erzeugen. | P2 |
| Gantt-Module Vollausbau (Drag, Resize, Dependencies, kritischer Pfad) | PROJ-7 | PP-91, PP-39 | Erweiterung der MVP-Gantt-Slice um interaktive Features + Pfad-Berechnung. | P2 |
| Konkreter Jira-Connector | PROJ-14 | PP-114, PP-55 | Aufgeteilt in PROJ-47 Jira Export und PROJ-50 bidirektionaler Jira Sync. | P1 |
| Stand-alone-Deployment-Tooling | PROJ-3 | PP-115, PP-73 | Installer + Update-Strategie für Enterprise-Standalone-Deployments. | P2 |
| Compliance-Hinweise per Projekttyp im Wizard/Banner | PROJ-18 (b) | PP-56 | Kontextabhängige UI-Hints zu Compliance-Anforderungen. Klein, in PROJ-18b einbettbar. | P2 |
| Meeting-Modul | PROJ-13 / PROJ-44 | E8 (Jira-Epic) | Meeting-Termine + Agendapunkte + Beschluss-Verknüpfung; als Context Source in PROJ-44 vorgesehen, fachliches Meeting-Modul weiter mit Owner bestaetigen. | ⚠ Re-Eval |

### ⚠ RE-EVALUATION — Re-Eval mit Jira-Owner empfohlen

1. **Doppelte Jira-Items**: PP-89 (Kanban Duplikat), PP-50 (Ressource Duplikat), PP-54 (Konnektor Duplikat) → in Jira aufräumen, sonst fließen sie als doppelte Anforderungen ins Backlog.
2. **Leere Descriptions**: ALLE 115 Items haben leere Description-Felder. Die Cross-Mapping-Verdikte hier basieren ausschließlich auf Titeln. Empfehlung: vor Übernahme als V3-Stories die Descriptions aus dem Original-Tool nachziehen oder die Anforderungen nochmal mit dem fachlichen Owner durchgehen.
3. **Nummern-Generationen**: Es gibt zwei parallele Strukturen (E1..E13 + EP-01..EP-12 + F-prefix-Stories). Empfehlung: Jira aufräumen — eine Generation ist die aktuelle, die andere veraltet. Im Zweifel Vorrang für **EP-01..EP-12** (neuere Wording-Iteration mit klareren Titeln).
4. **„Meetings" in E8**: Im Jira-Epic-Titel auftaucht, aber keine konkrete Meeting-Story ist im Export. Klären: Ist „Meetings" geplant oder versehentlich im Epic-Titel?
5. **„Generic Software" in PP-83**: Klären, ob V3-`software` im project-type-catalog dies abdeckt oder ob ein neuer Untertyp gemeint ist.

### ✅ Voll abgedeckt (keine Aktion)

~93 von 115 PP-Items sind durch PROJ-1..PROJ-21 fachlich abgedeckt (siehe Verdikt-Spalten oben). Diese müssen **nicht** als neue V3-Stories übernommen werden — die V3-Specs sind die Source of Truth.

---

## Teil E — Empfohlene Aktionen

### Sofort (innerhalb der nächsten Iteration)

1. **Jira-Hygiene** — die drei Duplikate (PP-89, PP-50, PP-54) im Quell-Tool zusammenführen, alte Nummern-Generation E1..E13 archivieren.
2. **Descriptions nachziehen** — mit dem Jira-Owner die wichtigsten offenen Items klären (insbesondere PP-57 Context/KI-Dialog, PP-114 Jira-Connector, E8 Meeting-Begriff, Stakeholder-Kommunikationssignale).

### Geplant (nächste Slices, in Reihenfolge)

3. **PROJ-34 — Stakeholder Communication Tracking** an PROJ-33/35 andocken.
4. **PROJ-44 — Context Ingestion Pipeline** als Produktisierung der ContextSource-Anforderung anlegen.
5. **PROJ-47/50 — Jira Connector Split**: zuerst Export, danach bidirektionaler Sync.

### Optional (später)

6. **PROJ-45 — Construction Extension** sobald Bauprojekt-Tenant oder Demo-Pfad konkret wird.
7. **PROJ-46 — Software Extension** sobald Release-/Test-Traceability gebraucht wird.
8. Sammlung der kleinen Extensions (PP-101 Selektiver Undo, PP-46 Cross-Project-Copy, PP-94 Stakeholder-Stub-Auto-Gen) in separaten UX-/Hardening-Slices statt Nummern-Recycling.

### Nicht empfohlen

- **Keine Massen-Anlage von 115 PROJ-Specs.** Die meisten Jira-Items beschreiben den Bauplan, der in V3 schon umgesetzt ist. Weiteranlage würde Doppelarbeit verursachen und das INDEX verwässern.

---

## Teil F — Gesamtzahlen

| Kategorie | Anzahl | Anteil |
|-----------|--------|--------|
| ✅ COVERED | ~93 von 115 PP-Items | ~80 % |
| 🔧 EXTEND | 12 von 115 | ~10 % |
| 🆕 NEW | 8 nachtraeglich angelegte PROJ-X (PROJ-34, PROJ-44..50) | ~7 % |
| ⚠ RE-EVAL | 3 Duplikate + 4 inhaltliche Re-Evals | ~6 % |

**Bottom Line**: Der Jira-Import bestätigt im Wesentlichen die V3-Roadmap. Die 2026-05-06-Reconciliation hat die verbliebenen echten Lücken in konkrete Specs ueberfuehrt: PROJ-34, PROJ-44, PROJ-45, PROJ-46 und PROJ-47..50.
