> **Inherited from V2** — Decision still applies to V3. Stack-specific references (FastAPI, Redis, etc.) are historical; Supabase/Next.js V3 implementations follow the same principle.

# Decision — Architekturentscheidungen (konsolidiert)

Status: **accepted**
Stand: 2026-04-23

Konsolidierte Sicht auf die bereits getroffenen Architekturentscheidungen. Jeder Eintrag verweist auf den einschlägigen ADR, sofern eine Einzel-Entscheidung existiert, oder auf die Epic-/Story-Datei, die das Detail festhält.

| Entscheidung | Ergebnis | Verweis |
|---|---|---|
| **Betrieb** | Multi-Tenant SaaS als Standard; Enterprise-Stand-alone als Option | [EP-01](../epics/ep-01-mandanten-und-betriebsarchitektur.md) |
| **Dialog** | Regelbasierter Wizard (MVP Phase 2) **und** KI-Dialog (Phase 4) als Alternativen | [EP-03](../epics/ep-03-stammdaten-und-projektdialog.md), F2.1b (PP-57) |
| **Module** | Alle Module sind im Katalog; Aktivierung folgt aus Projekttyp + Methodik (Regelwerk) | [EP-04-ST-04](../stories/ep-04.md) |
| **Boards** | Intern gebaut (Kanban/Scrum/Gantt) in Phase 3; Jira + MS Project in Phase 5 | [EP-05](../epics/ep-05-projektraum-und-interne-module.md), [EP-12](../epics/ep-12-integrationen-und-vendoren.md) |
| **KI / Datenschutz** | Personenbezogene Daten (Klasse 3) werden ausschließlich lokal verarbeitet; externe KI technisch blockiert | [data-privacy-classification.md](data-privacy-classification.md), [EP-10](../epics/ep-10-ki-assistenz-und-datenschutz.md) |
| **Versionierung** | Feldweise (Delta/Diff auf Feldebene), nicht nur Objekt-Snapshots | [EP-08](../epics/ep-08-aenderungsmanagement-versionierung.md) |
| **Methodenhierarchien** | Scrum, SAFe, PMI/Klassisch (5 Phasen), Kanban — alle vier unterstützt | [EP-04-ST-02](../stories/ep-04.md), [EP-04-ST-03](../stories/ep-04.md) |
| **Architektur-Prinzipien** | Shared Core + Extensions, AI als Proposal-Layer, Orchestrator LangGraph-kompatibel aber nicht LangGraph-gebunden | [architecture-principles.md](architecture-principles.md) |
| **Stakeholder ≠ User** | Separation zwischen fachlicher Projektrolle und technischem RBAC-Account | [stakeholder-vs-user.md](stakeholder-vs-user.md) |
| **Metadata-Modell Kontextquellen** | Einheitliches Metadaten-Schema für context-ingest-Objekte | [metadata-model-context-sources.md](metadata-model-context-sources.md) |

## Nicht getroffen (siehe Risiken)

Siehe [../risks.md](../risks.md) für R1–R10 — insbesondere:
- **R2** Undo-Scope
- **R3** Mehrsprachigkeit
- **R5/R6** SAFe/PMI Tiefe
- **R8** Enterprise-Preismodell
- **R9/R10** Rechtliche Prüfungen Betriebsrat + Aufbewahrungsfristen

## Pflege-Regel

Neue Architekturentscheidungen bekommen einen eigenen ADR in diesem Ordner (Format: `<slug>.md`) und werden dann hier in der Tabelle referenziert. Bestehende ADRs werden nicht editiert, sondern bei Änderung durch einen neuen ADR mit Verweis abgelöst.
