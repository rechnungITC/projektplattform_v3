# V2 Epics → V3 Features Mapping

> Migration audit trail. Every V2 epic is accounted for here.

## Mapping Table

| V2 Epic | Title (DE) | V3 Feature(s) | V3 Status | V2 Story Count |
|---|---|---|---|---|
| EP-01 | Mandanten- und Betriebsarchitektur | PROJ-1 (auth/tenants/roles, ST-01/02 covered) + **PROJ-3** (ST-03/04 stand-alone, ops) | PROJ-1: In Progress; PROJ-3: Planned | 4 stories (ST-01..ST-04) |
| EP-02 | Plattformfundament, Navigation, Rollen | **PROJ-4** | Planned | 4 stories (ST-01..ST-04) |
| EP-03 | Stammdaten und Projektdialog | PROJ-2 (ST-01 datamodel, ST-04/05 master-data) + **PROJ-5** (ST-02 wizard, ST-03 dynamic Q&A, F2.1b KI-dialog) | PROJ-2: Planned; PROJ-5: Planned | 5 stories + F2.1b |
| EP-04 | Projekttypen, Methoden, Regelwerk | **PROJ-6** | Planned | 4 stories |
| EP-05 | Projektraum und interne Module | **PROJ-7** | Planned | 6 stories (ST-01..ST-06) + F4.2 + F4.5 |
| EP-06 | Stakeholder und Organisation | **PROJ-8** | Planned | 3 stories + F5.3 |
| EP-07 | Methodenobjekte und Backlog | **PROJ-9** | Planned | 4 stories |
| EP-08 | Änderungsmanagement, Versionierung | **PROJ-10** | Planned | 4 stories + F13.2 + F13.4 + F13.7 + ST-05 |
| EP-09 | Ressourcen, Kapazitäten, Terminlogik | **PROJ-11** | Planned | 3 stories (ST-01..ST-03) |
| EP-10 | KI-Assistenz und Datenschutz | **PROJ-12** | Planned | 4 stories + F12.1 + F12.2 + F10.2 + F12.3 |
| EP-11 | Kommunikation und Chat | **PROJ-13** | Planned | 4 stories |
| EP-12 | Integrationen und Vendoren | **PROJ-14** (and PROJ-3 for stand-alone deployment hooks) | Planned | 8 stories (ST-01..ST-08) |
| EP-13 | Vendor und Beschaffung | **PROJ-15** | Planned | 5 stories (ST-05 deferred — legal § 1 RDG) |
| EP-14 | Stammdaten-Pflege via UI | **PROJ-16** | Planned | 4 stories |
| EP-15 | Mandanten-Administration | **PROJ-17** | Planned | 5 stories |
| EP-16 | Compliance-Automatik | **PROJ-18** | Planned | 6 stories |
| (cross-cutting) | Phases & Milestones (V2 migrations 0003/0004; not a single epic) | **PROJ-19** | Planned | derived from EP-05/EP-07/EP-09 |
| (cross-cutting) | Risks & Decisions catalog (V2 migration 0013 referenced) | **PROJ-20** | Planned | derived from F4.2 + V2 term-boundaries.md |

## Coverage Notes

### Stories in PROJ-1 vs PROJ-3
- **PROJ-1** covers EP-01-ST-01 (multi-tenant grundmodell) and EP-01-ST-02 (tenant isolation), including the Supabase RLS implementation.
- **PROJ-3** covers EP-01-ST-03 (stand-alone betriebsmodus) and EP-01-ST-04 (update + ops strategy).

### Stories in PROJ-2 vs PROJ-5
- **PROJ-2** covers EP-03-ST-01 (project datamodel), EP-03-ST-04 (dialog data → master data), EP-03-ST-05 (master data editing).
- **PROJ-5** covers EP-03-ST-02 (wizard), EP-03-ST-03 (dynamic follow-ups), and F2.1b (KI-driven dialog).

### V2 Stories Beyond EP-16
V2 has 16 epics (EP-01..EP-16). Within those epics there are extra cross-cutting Fxx stories (F4.2, F4.5, F5.3, F10.2, F12.1, F12.2, F12.3, F13.2, F13.4, F13.7, F2.1b) — all mapped to existing PROJ-X above. Some epics also got late additions (e.g. EP-05-ST-05/ST-06 portfolio Gantt + health, EP-08-ST-05 audit report, EP-09-ST-03 utilization report, EP-12-ST-04..ST-08) — all included.

### Things NOT yet promoted to a PROJ-X
- Construction extension (V2 EP-13 fachliche Skizze hint) → still `_TBD_` in PRD; deferred to P2.
- Software project extension (sprints/releases-specific) → mostly covered by PROJ-9 Scrum kinds; deeper specialization → deferred to P2.
- Output rendering specifics (PowerPoint/Canva/Miro export) → deferred to P2 (V2 documents the concept in target-picture.md but no epic ships it).
- Governance workflows (approval gates, escalations) — V2 architecture target picture hints at it; deferred to a future PROJ-21+.
- Context ingestion pipeline (emails, meeting notes, documents → ContextSource → ProcessedContext) — V2 has `metadata-model-context-sources.md` ADR but no concrete epic; PROJ-12 owns the AI-routing side; the ingestion intake itself is deferred to a future PROJ.

These gaps are intentional for Phase 1; future migration phases can add PROJ-21+ as their epics get authored.

## Audit Reconciliation

V2 epic count: **16** (EP-01..EP-16) — confirmed by `ls planning/epics/`.
V2 story count (file headers): **89** stories (EP-XX-ST-YY format), plus **11** F-series cross-cutting features (F2.1b, F4.2, F4.5, F5.3, F10.2, F12.1, F12.2, F12.3, F13.2, F13.4, F13.7) = **100** total story-level items, matching V2 MAP.md's "45 EP-XX-ST-YY + 11 F-series" plus the late additions noted above.

V3 PROJ count after Phase 1 migration: **20** (PROJ-1..PROJ-20). This is the right granularity per V3's "one feature per spec" rule — V3 PROJs each cover a coherent feature area while V2 epics often bundle 4–8 stories of the same domain.
