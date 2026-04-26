# Decision — V3 Code-Extension-Pattern (Core vs ERP / Construction / Software)

Status: **accepted**
Datum: 2026-04-26
V3-Original (kein V2-Erbe; neu für die Next.js-+-Supabase-Codebase)

## Kontext

V2 ADR [`architecture-principles.md`](architecture-principles.md) postuliert: **shared core + projekttyp-spezifische Erweiterungen**. ERP-, Bau- und Software-Spezialitäten leben in Extensions, der Core bleibt typ-agnostisch.

V2 hatte das in der Code-Struktur ausgedrückt durch `apps/api/src/domain/{core,erp,construction,software}/` mit klaren Import-Regeln.

**V3 hat aktuell keine entsprechende Struktur.** `src/components/projects/` und `src/app/api/projects/` sind generisch, aber sobald PROJ-15 (Vendor — ERP-only), PROJ-7 (Project Room mit Gantt — Bau-spezifisch), PROJ-9 (Backlog mit Sprints — Software-spezifisch) gebaut werden, **droht Vermischung** in den generischen Ordnern.

## Decision

V3 führt eine **Extension-Codestruktur** ein, die parallel zum Core-Layer lebt:

```
src/
├── app/
│   ├── (app)/
│   │   ├── projects/                  ← Core: Projekt-CRUD, Lifecycle (typ-agnostisch)
│   │   └── projects/[id]/
│   │       └── extensions/            ← Container, der je nach project_type einen Extension-Tab lädt
│   ├── api/
│   │   └── projects/                  ← Core API
│   └── extensions/                    ← Extension-spezifische Pages + APIs
│       ├── erp/
│       │   ├── api/
│       │   │   └── vendors/...
│       │   └── components/
│       ├── construction/
│       └── software/
├── components/
│   ├── projects/                      ← Core-Komponenten (LifecycleBadge, ProjectsTable, ...)
│   └── extensions/                    ← Extension-Komponenten
│       ├── erp/
│       ├── construction/
│       └── software/
├── hooks/                             ← Core-Hooks
└── lib/extensions/                    ← Extension-spezifische Helpers, gruppiert wie oben
```

## Import-Regeln (eslint-konfigurierbar)

1. **Core darf NICHT aus Extensions importieren.** Symmetrisch: Extensions dürfen voneinander NICHT importieren (`erp` darf nichts aus `construction`).
2. **Extensions dürfen aus Core importieren** (z.B. `useProjects`, `LifecycleBadge`). Core ist die einzige geteilte Ressource.
3. **Extensions dürfen voneinander nicht importieren** — wenn etwas zwischen ERP und Construction geteilt werden muss, gehört es in Core.
4. Ausnahme: Eine Extension darf eine **eigene** Sub-Domain haben (`extensions/erp/vendors/`, `extensions/erp/migrations/`); innerhalb derselben Extension sind Imports frei.

Wenn die Codebase größer wird, wird Regel 1 + 3 per ESLint-`import/no-restricted-paths` durchgesetzt.

## Datenbank-Spiegel

Auch DB-Tabellen folgen dem Muster, ohne ein eigenes Schema zu eröffnen (Supabase ist auf `public` ausgerichtet):

- **Core-Tabellen**: `projects`, `phases`, `milestones`, `tasks`, `risks`, `stakeholders`, `decisions`, `tenant_memberships`, `project_memberships`, `tenants`, `profiles`
- **ERP-Extension-Tabellen**: `erp_vendors`, `erp_vendor_evaluations`, `erp_modules`, ... (Präfix `erp_`)
- **Construction-Extension-Tabellen**: `construction_trades`, `construction_sections`, ... (Präfix `construction_`)
- **Software-Extension-Tabellen**: `software_sprints`, `software_releases`, ... (Präfix `software_`)

Präfix statt Schema, weil Supabase RLS-Helpers und PostgREST am natürlichsten mit `public.*` arbeiten. Präfix macht Origin in jeder SQL-Query sofort sichtbar.

## Aktivierung & Sichtbarkeit

Welche Extensions ein Tenant nutzt, wird nicht hart codiert — sondern dynamisch geprüft:

- Eine Extension ist „aktiv", wenn **mindestens ein Projekt** im Tenant den entsprechenden `project_type` hat.
- UI-Routen unter `/extensions/<name>/` rendern eine 404-Seite, wenn keine Aktivierung vorliegt.
- Pro-Tenant-Disable wird über die existierende V2-ADR-Logik (`tenant_disabled_modules`-Tabelle aus Migration 0022) später möglich; aktuell vorgemerkt für PROJ-17.

## Konsequenzen

**Vorteile:**
- Zukünftige PROJ-X-Specs (15 Vendor, 7 Project Room mit Gantt, 9 Backlog mit Sprints) haben einen klaren Heim-Pfad — keine architektonische Diskussion pro Feature.
- Code-Reviews können „lebt das hier richtig?" mit einem Lint-Check durchsetzen.
- Stand-alone-Customer (PROJ-3) kann Extensions deaktivieren, ohne Core-Code zu fassen.

**Trade-offs:**
- Geringfügig mehr Boilerplate beim Anlegen einer neuen Extension (Ordner, Test-Setup).
- Manche Komponenten könnten zwischen Extensions geteilt werden wollen — die Regel zwingt sie in Core, was Core langsam aufbläht. Akzeptabel: Core bleibt klein, weil ungewolltes Sharing eh selten ist.

## Migration

PROJ-1 + PROJ-2 sind reines Core. Kein Refactor nötig. Erste Extension-Strukturen entstehen bei **PROJ-15** (ERP-Vendor) — dort wird die Konvention erstmals praktisch validiert.

## Related

- [architecture-principles.md](architecture-principles.md) — V2-Prinzip, das hier konkretisiert wird
- [project-type-catalog.md](project-type-catalog.md) — Code-Registry für Projekttypen (Code, nicht DB)
- `CLAUDE.md` § Multi-tenant invariant — Extensions müssen die Multi-Tenant-Regel auch befolgen
