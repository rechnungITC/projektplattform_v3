# Decision — V3 Master-Data-Registries und Global-Katalog-Pattern

Status: **accepted**
Datum: 2026-04-26
V3-Original (konkretisiert V2 ADRs `stakeholder-data-model.md`, `project-type-catalog.md`, `master-data-editing.md`)

## Kontext

Mehrere Domänen brauchen „nachschlagbare" Entitäten, die NICHT pro Projekt neu angelegt werden:

| Entität | Beispielnutzung |
|---|---|
| Stakeholder | mehrere Projekte teilen denselben Geschäftsführer / Vorstand |
| User | derselbe Mensch ist in mehreren Projekten Mitglied |
| Project Types | „erp", „construction", „software", „general" — global gleich |
| Methoden | Scrum, Kanban, SAFe — global gleich, optional pro Tenant overridden |
| Compliance Tags | ISO-9001, DSGVO — global gleich, pro Tenant erweiterbar |
| Vendor (ERP) | derselbe Anbieter taucht in mehreren ERP-Projekten auf |

V2 ADR `project-type-catalog.md` legt fest: **Projekt-Typen sind Code-Registry, nicht DB**. V2 ADR `stakeholder-data-model.md` legt fest: **Stakeholder per project**. Und Methoden sind in V2 als Enum behandelt.

**Der Nutzer hat klargestellt** (Architecture Review 2026-04-26): „Stakeholder bzw. Nutzer müssen in den Stammdaten hinterlegt werden — gesamt oder aber nur pro Projekt." Das verfeinert V2's „per project"-Decision: Stakeholder leben **erst** als Tenant-Stammdaten, **dann** werden sie projekten zugeordnet.

## Decision

V3 etabliert **drei Schichten** für nachschlagbare Daten:

### Schicht 1 — Globale Code-Registries (kein DB-Eintrag)

Werte, die **plattformweit gleich** sind und sich nur per Code-Release ändern: Project Types, Method-Konstanten, Lifecycle-States, Datenklassen.

- Leben als TypeScript-Konstanten (`src/types/project.ts`, später `src/types/method.ts` etc.)
- DB enforced über `CHECK (col IN (...))`
- **Kein** Tenant-Override für globale Werte (entsprechend V2 ADR `project-type-catalog.md`)
- Erweiterung = neuer App-Release

### Schicht 2 — Tenant-Stammdaten (DB, tenant-scoped, RLS-isoliert)

Werte, die **innerhalb eines Tenants** wiederverwendet werden, aber zwischen Tenants verschieden sein können: Stakeholder, Vendors, Method-Overrides, Compliance-Tag-Overrides.

Konvention pro Stammdaten-Tabelle:
```
<entity>                         z.B. stakeholders, erp_vendors
├── id                  UUID PK
├── tenant_id           UUID NOT NULL FK tenants ON DELETE CASCADE
├── ... entity-specific fields ...
├── created_by          UUID FK profiles
├── created_at, updated_at, is_deleted
```

Pflicht-RLS:
- SELECT: `is_tenant_member(tenant_id)` — alle Tenant-Mitglieder sehen die Stammdaten.
- INSERT/UPDATE/DELETE: `is_tenant_admin(tenant_id) OR has_tenant_role(tenant_id, 'member')` — Members und Admins pflegen, Viewer lesen.

Diese Stammdaten sind **NICHT projekt-scoped**. Sie gehören dem Tenant.

### Schicht 3 — Projekt-Verknüpfungen (Junction-Tables)

Werte aus Schicht 2 werden **explizit pro Projekt** verlinkt — über schmale Junction-Tabellen:

```
project_<entity>                 z.B. project_stakeholders, project_erp_vendors
├── id                  UUID PK
├── project_id          UUID NOT NULL FK projects ON DELETE CASCADE
├── <entity>_id         UUID NOT NULL FK <entity> ON DELETE CASCADE
├── role / kind / ...   project-specific role of this entity in THIS project
├── created_at
├── UNIQUE (project_id, <entity>_id)
```

Pflicht-RLS:
- SELECT: über `EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND is_tenant_member(p.tenant_id))`
- INSERT/UPDATE/DELETE: `EXISTS (project p) AND (is_tenant_admin(p.tenant_id) OR has_tenant_role(p.tenant_id, 'member'))` — wer Projekt editieren darf, darf Stakeholder zuordnen.

**Cross-Tenant-Guard via Trigger** (analog `enforce_project_responsible_user_in_tenant` aus PROJ-2): das verlinkte `<entity>_id` muss zum **selben Tenant** gehören wie das `project_id`. Sonst exception.

## Anwendung auf konkrete Entitäten

| Entität | Schicht 1 | Schicht 2 | Schicht 3 |
|---|---|---|---|
| Project Types | ✅ (Code-Registry) | — | — |
| Methoden | ✅ (Enum) | optional `tenant_method_overrides` (PROJ-6, V2 Migration 0024) | — |
| Lifecycle States | ✅ (Code) | — | — |
| Compliance Tags | ✅ (Code-Registry-Default) | `compliance_tag_overrides` (PROJ-18) | implizit über Tag-Anwendung an Domain-Rows |
| **Stakeholder** | — | `stakeholders` (PROJ-8) | `project_stakeholders` (PROJ-8) |
| **Vendor (ERP)** | — | `erp_vendors` (PROJ-15) | `project_erp_vendors` (PROJ-15) |
| **User-im-Projekt** | — | `profiles` (existiert, PROJ-1) | `project_memberships` (PROJ-2/4, siehe ADR `v3-project-memberships-schema.md`) |

## Verhältnis zu existierenden V2-ADRs

- **`stakeholder-data-model.md`** sagte „Stakeholder pro Projekt". V3 verfeinert: **Stakeholder pro Tenant** in `stakeholders` (Schicht 2), **Verknüpfung pro Projekt** in `project_stakeholders` (Schicht 3). Vorteil: derselbe Stakeholder-Eintrag taucht in mehreren Projekten auf, ohne Duplikation. V2-Datenmodell ist nicht widersprochen, nur normalisierter.
- **`stakeholder-vs-user.md`** bleibt vollständig gültig: ein Stakeholder kann optional einen `linked_user_id` zu einem `profiles`-Eintrag haben. Beide leben in Schicht 2.
- **`project-type-catalog.md`** bleibt unverändert: Schicht 1.
- **`method-catalog.md`** bleibt unverändert: Schicht 1 mit optionalem Override in Schicht 2.

## Konsequenzen

**Vorteile:**
- Stakeholder/User-Stammdaten redundanzfrei zwischen Projekten geteilt.
- Klare Mental-Model: „Existiert die Entität im Tenant?" → Schicht 2. „Ist die Entität in DIESEM Projekt aktiv?" → Schicht 3.
- RLS-Pattern ist mechanisch: Schicht 2 = `is_tenant_member`, Schicht 3 = `EXISTS (project + tenant)`.
- Cross-Tenant-Guard-Trigger generalisierbar: ein Helper für „X muss zum selben Tenant gehören wie Y".

**Trade-offs:**
- Manche Frontend-Reads brauchen einen Doppel-Join (Junction → Master-Data → Projekt-Daten). Pragmatisch lösbar via Supabase named-FK-Joins; nicht teuer bei normaler Tenant-Größe.
- Stakeholder-spezifische Daten („Influence-Score in DIESEM Projekt") leben in der Junction (Schicht 3), nicht in Schicht 2. Mental-Model muss klar bleiben: Schicht 2 = „wer ist diese Person allgemein", Schicht 3 = „welche Rolle spielt sie hier".

## Konkrete Migrationen (für später)

PROJ-8 (Stakeholders): zwei Migrationen — `stakeholders` + `project_stakeholders` mit Cross-Tenant-Guard-Trigger.
PROJ-15 (Vendor): analog `erp_vendors` + `project_erp_vendors`.

## Related

- [stakeholder-data-model.md](stakeholder-data-model.md) — V2-Vorgänger; verfeinert
- [stakeholder-vs-user.md](stakeholder-vs-user.md) — bleibt unverändert gültig
- [project-type-catalog.md](project-type-catalog.md) — Schicht 1
- [method-catalog.md](method-catalog.md) — Schicht 1
- [v3-code-extension-pattern.md](v3-code-extension-pattern.md) — `erp_*`-Präfix-Konvention
- [v3-project-memberships-schema.md](v3-project-memberships-schema.md) — `project_memberships` als spezialisierte Schicht-3-Tabelle
- PROJ-8 (Stakeholders), PROJ-15 (Vendor) — Implementer
