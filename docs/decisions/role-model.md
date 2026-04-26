> **Inherited from V2** — Decision still applies to V3. Stack-specific references (FastAPI, Redis, etc.) are historical; Supabase/Next.js V3 implementations follow the same principle.

# Decision — Rollenmodell: Plattform- und Projektrollen

Status: **accepted**
Jira: **PP-76 (EP-02-ST-03)**
Datum: 2026-04-23
Umsetzung: siehe [`planning/decisions/architecture-decisions-table.md`](architecture-decisions-table.md) und Commit, der EP-02-ST-04 (PP-77) abschließt.

## Decision

Die Plattform führt **zwei unabhängige Rollenebenen**:

1. **Plattformrollen** — auf Tenant-Ebene, gespeichert auf `user_tenant_memberships.role`
2. **Projektrollen** — auf Projekt-Ebene, gespeichert in einer neuen Tabelle `project_memberships`

## Plattformrollen (Tenant-Ebene)

| Rolle | Darf | Darf nicht |
|---|---|---|
| **`tenant_admin`** | alle Projekte im Tenant sehen/editieren/löschen; Tenant-Config ändern; Mitgliedschaften managen | — (Super-User innerhalb des Tenants) |
| **`tenant_member`** | Projekte anlegen (wird automatisch `project_lead` im eigenen Projekt); nur eigene Projektmitgliedschaften sehen | andere Projekte ohne Mitgliedschaft lesen; Tenant-Config ändern; andere Mitglieder verwalten |
| **`tenant_viewer`** | alle Projekte im Tenant lesen | Projekte anlegen; Projekte schreiben/löschen; Tenant-Config ändern |

## Projektrollen (Projekt-Ebene)

Rollen werden pro User pro Projekt vergeben. Ein User kann in einem Tenant `tenant_member` sein und in drei Projekten unterschiedliche Rollen haben.

| Rolle | Darf | Darf nicht |
|---|---|---|
| **`project_lead`** | Stammdaten editieren; Phasen/Meilensteine CRUD; Lifecycle-Transitionen (start, pause, resume, cancel); Projekt löschen; Projektmitglieder managen | — (Super-User innerhalb des Projekts) |
| **`project_editor`** | Stammdaten editieren; Phasen/Meilensteine CRUD; Projekttyp ändern | Projekt löschen; Lifecycle-Transitionen; Mitgliedschaften managen |
| **`project_viewer`** | Alles lesen | Alles schreiben |

## Kombinationslogik

Ein Request wird gegen Plattform- **und** Projektrolle geprüft. `tenant_admin` umgeht Projektrollen (sie darf alles im Tenant). Für alle anderen gilt:

- **Lesen eines Projekts**: `tenant_viewer` ODER Mitglied des Projekts (jede Projektrolle)
- **Schreiben eines Projekts**: Projektrolle ∈ {`project_lead`, `project_editor`}
- **Lifecycle-Übergänge, Projektlöschung**: `project_lead`
- **Projekt anlegen**: `tenant_admin` oder `tenant_member` (nicht `tenant_viewer`)

## Automatismen

- Wer ein Projekt anlegt, wird automatisch `project_lead` auf diesem Projekt.
- Ein `tenant_admin` braucht keine explizite Projektmitgliedschaft — der Platform-Role-Check reicht.

## API-Verhalten

- **403 Forbidden**: Nutzer ist authentifiziert, hat aber für diese Operation keine Rolle.
- **404 Not Found**: Projekt gehört zu einem anderen Tenant (Tenant-Isolation bleibt vorrangig).
- **401 Unauthorized**: Kein gültiger Auth-Kontext.

## Nicht-AK / Abgrenzungen

- **Keine Feldrechte** (pro Feld unterschiedliche Sichtbarkeit) — das ist explizit Nicht-AK von EP-02-ST-04.
- **Keine UI zur Rollenpflege** — Rollen werden per DB-Eintrag oder später via EP-02-ST-03-Erweiterung gepflegt. Aktuell: Dev-Seed/Script oder `user_tenant_memberships` direkt.
- **Keine Delegationslogik** — Rollen werden nicht an Kollegen „ausgeliehen".
- **Keine SSO-Anbindung** — Identity bleibt im Dev-Stub-Modus (siehe [`../../build/CONTEXT.md`](../../build/CONTEXT.md)).
- **Keine Freigabe-Workflows** — EP-Governance später in EP-04-ST-04-Folgestories.

## Offene Punkte (Risiken)

- **R2**: Darf ein `project_lead` Änderungen anderer `project_editor` rückgängig machen? → bleibt Offen, hängt an F13.4 (PP-44) Undo/Restore.
- **Tenant-Admin-Delegation**: Wer kann `tenant_admin` vergeben? Aktuell nur Direkt-DB; UI folgt in späterer Story.

## Migration / Bestandsdaten

- Alle bestehenden `user_tenant_memberships` (aus Migration 0004) tragen `role='member'`. In 0005 wird diese Spalte durch eine `CHECK`-Constraint auf `{admin, member, viewer}` geklemmt. Existing `member` bleibt gültig.
- **Bestandsdaten-Fix**: Die einzige bekannte Dev-Identität `partner@it-couch.de` bekommt in der Backfill-Step `tenant_admin`, damit bestehende Dev-Workflows nicht brechen.
- **`project_memberships`-Backfill**: Für jedes bestehende Projekt wird der `created_by`-User als `project_lead` eingetragen.

## Related

- [../../CLAUDE.md](../../CLAUDE.md) — Rollen-Regel ist Teil der Architektur
- [../stories/ep-02.md](../stories/ep-02.md) — Stories EP-02-ST-03 / ST-04
- [data-privacy-classification.md](data-privacy-classification.md) — Datenschutz-Klassen (orthogonal zur Rollenmatrix)
