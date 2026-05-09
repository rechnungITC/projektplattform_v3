# V2 Epics → V3 Features Mapping

> Migration audit trail. Every V2 epic is accounted for here.

## Mapping Table

| V2 Epic | Title (DE) | V3 Feature(s) | V3 Status | V2 Story Count |
|---|---|---|---|---|
| EP-01 | Mandanten- und Betriebsarchitektur | PROJ-1 (auth/tenants/roles, ST-01/02 covered) + **PROJ-3** (ST-03/04 stand-alone, ops) | Deployed | 4 stories (ST-01..ST-04) |
| EP-02 | Plattformfundament, Navigation, Rollen | **PROJ-4** + PROJ-23 + PROJ-28 | Deployed | 4 stories (ST-01..ST-04) |
| EP-03 | Stammdaten und Projektdialog | PROJ-2 (ST-01 datamodel, ST-04/05 master-data) + **PROJ-5** (ST-02 wizard, ST-03 dynamic Q&A) + PROJ-39 dialogic creation | Deployed / PROJ-39 Planned | 5 stories + F2.1b |
| EP-04 | Projekttypen, Methoden, Regelwerk | **PROJ-6** + PROJ-26 + PROJ-28 | Deployed | 4 stories |
| EP-05 | Projektraum und interne Module | **PROJ-7** + PROJ-21 + PROJ-22 + PROJ-24 + PROJ-25 + PROJ-25b | Deployed / PROJ-25b Approved | 6 stories (ST-01..ST-06) + F4.2 + F4.5 |
| EP-06 | Stakeholder und Organisation | **PROJ-8** + PROJ-33 + PROJ-34 + PROJ-35 + PROJ-43 | Mostly Deployed; PROJ-34 Planned; PROJ-43 In Review | 3 stories + F5.3 + later stakeholder knowledge |
| EP-07 | Methodenobjekte und Backlog | **PROJ-9** + PROJ-27 + PROJ-36 | Deployed / PROJ-27 Architected | 4 stories |
| EP-08 | Änderungsmanagement, Versionierung | **PROJ-10** + PROJ-31 + PROJ-40 | Deployed / PROJ-40 Planned | 4 stories + F13.2 + F13.4 + F13.7 + ST-05 |
| EP-09 | Ressourcen, Kapazitäten, Terminlogik | **PROJ-11** + PROJ-24 + PROJ-36 | Deployed | 3 stories (ST-01..ST-03) |
| EP-10 | KI-Assistenz und Datenschutz | **PROJ-12** + PROJ-30 + PROJ-32 + PROJ-38 + PROJ-41 + PROJ-44 | Deployed / Assistant + ingestion Planned | 4 stories + F12.1 + F12.2 + F10.2 + F12.3 |
| EP-11 | Kommunikation und Chat | **PROJ-13** + PROJ-34 + PROJ-49 | Deployed / PROJ-34 and PROJ-49 Planned | 4 stories |
| EP-12 | Integrationen und Vendoren | **PROJ-14** + PROJ-47 + PROJ-48 + PROJ-50 (and PROJ-3 for stand-alone deployment hooks) | Plumbing Deployed; real adapters Planned | 8 stories (ST-01..ST-08) |
| EP-13 | Vendor und Beschaffung | **PROJ-15** | Deployed (ST-05 legal KI contract pre-screening still deferred) | 5 stories |
| EP-14 | Stammdaten-Pflege via UI | **PROJ-16** | Deployed | 4 stories |
| EP-15 | Mandanten-Administration | **PROJ-17** | Deployed | 5 stories |
| EP-16 | Compliance-Automatik | **PROJ-18** | Deployed | 6 stories |
| (cross-cutting) | Phases & Milestones (V2 migrations 0003/0004; not a single epic) | **PROJ-19** | Deployed | derived from EP-05/EP-07/EP-09 |
| (cross-cutting) | Risks & Decisions catalog (V2 migration 0013 referenced) | **PROJ-20** + PROJ-31 | Deployed | derived from F4.2 + V2 term-boundaries.md |

## Coverage Notes

### Stories in PROJ-1 vs PROJ-3
- **PROJ-1** covers EP-01-ST-01 (multi-tenant grundmodell) and EP-01-ST-02 (tenant isolation), including the Supabase RLS implementation.
- **PROJ-3** covers EP-01-ST-03 (stand-alone betriebsmodus) and EP-01-ST-04 (update + ops strategy).

### Stories in PROJ-2 vs PROJ-5
- **PROJ-2** covers EP-03-ST-01 (project datamodel), EP-03-ST-04 (dialog data → master data), EP-03-ST-05 (master data editing).
- **PROJ-5** covers EP-03-ST-02 (wizard), EP-03-ST-03 (dynamic follow-ups), and F2.1b (KI-driven dialog).

### V2 Stories Beyond EP-16
V2 has 16 epics (EP-01..EP-16). Within those epics there are extra cross-cutting Fxx stories (F4.2, F4.5, F5.3, F10.2, F12.1, F12.2, F12.3, F13.2, F13.4, F13.7, F2.1b) — all mapped to existing PROJ-X above. Some epics also got late additions (e.g. EP-05-ST-05/ST-06 portfolio Gantt + health, EP-08-ST-05 audit report, EP-09-ST-03 utilization report, EP-12-ST-04..ST-08) — all included.

### Post-Reconciliation PROJ-X Promotions

The former `_TBD_` and deferred buckets are now tracked as explicit V3 specs:

| Gap / deferred bucket | Promoted V3 Feature |
|---|---|
| Stakeholder communication tracking / sentiment / response behavior | PROJ-34 |
| Context ingestion pipeline (emails, meeting notes, documents -> ContextSource -> ProcessedContext) | PROJ-44 |
| Construction extension (trades, sections, inspections, defects, construction schedule logic) | PROJ-45 |
| Software project extension (releases, technical dependencies, test and acceptance traceability) | PROJ-46 |
| Jira export adapter on PROJ-14 plumbing | PROJ-47 |
| Tenant-scoped MCP bridge on PROJ-14 plumbing | PROJ-48 |
| Real Microsoft Teams adapter on PROJ-13/14 plumbing | PROJ-49 |
| Bidirectional Jira sync with webhooks and conflict resolution | PROJ-50 |
| Modern UI/UX and motion system for refreshed workflows | PROJ-51 |

Still deferred without a dedicated spec after this reconciliation: PROJ-21b/c output variants (Gantt export, PPTX/Markdown/public links), PROJ-25c/d interaction polish beyond the shared PROJ-51 motion/design foundation, and legal-gated vendor contract pre-screening.

## Audit Reconciliation

V2 epic count: **16** (EP-01..EP-16) — confirmed by `ls planning/epics/`.
V2 story count (file headers): **89** stories (EP-XX-ST-YY format), plus **11** F-series cross-cutting features (F2.1b, F4.2, F4.5, F5.3, F10.2, F12.1, F12.2, F12.3, F13.2, F13.4, F13.7) = **100** total story-level items, matching V2 MAP.md's "45 EP-XX-ST-YY + 11 F-series" plus the late additions noted above.

V3 PROJ count after the 2026-05-06 reconciliation: **51 tracked feature specs** (PROJ-1..PROJ-51 with PROJ-34 backfilled and PROJ-44..51 added). This is the current planning granularity per V3's "one feature per spec" rule — V3 PROJs each cover a coherent feature area while V2 epics often bundle 4–8 stories of the same domain.
