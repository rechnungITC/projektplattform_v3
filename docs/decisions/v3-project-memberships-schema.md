# Decision — V3 project_memberships: konkretes Supabase-Schema

Status: **accepted**
Datum: 2026-04-26
V3-Original (Gap-Filler — konkretisiert V2 ADR [`role-model.md`](role-model.md) für die Supabase-Implementierung)

## Kontext

V2 ADR `role-model.md` definiert zwei Rollen-Ebenen:

1. **Plattform-/Tenant-Rollen**: `tenant_admin`, `tenant_member`, `tenant_viewer` — bereits umgesetzt in V3 PROJ-1 (`tenant_memberships.role`).
2. **Projekt-Rollen**: `project_lead`, `project_editor`, `project_viewer` — **fehlt in V3**. PROJ-2 hat `responsible_user_id` (eine einzelne FK), aber keine Tabelle, die mehrere Personen pro Projekt mit verschiedenen Rollen abbildet.

Der Nutzer hat im Architecture Review 2026-04-26 das Bedürfnis bestätigt:
> „immer der super projektleiter, der kann sich für projekte selber eintragen oder andere bestimmen, die dann das recht auf ein projekt haben"

Der „Super Projektleiter" ist das `project_lead` aus `role-model.md`. Diese ADR liefert das konkrete Supabase-Schema, mit dem PROJ-4 (Platform Foundation) die Tabelle einführt.

## Decision

V3 ergänzt eine Tabelle `project_memberships` parallel zu `tenant_memberships`:

```
project_memberships
├── id              UUID PK DEFAULT gen_random_uuid()
├── project_id      UUID NOT NULL FK projects ON DELETE CASCADE
├── user_id         UUID NOT NULL FK profiles ON DELETE RESTRICT
├── role            TEXT NOT NULL CHECK (role IN ('lead','editor','viewer'))
├── created_by      UUID NOT NULL FK profiles ON DELETE RESTRICT
├── created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
├── UNIQUE (project_id, user_id)
```

Indexe:
- `(project_id)`
- `(user_id)`

## Cross-Tenant-Guard

Trigger BEFORE INSERT OR UPDATE OF user_id, project_id:
- `user_id` muss Mitglied desjenigen Tenants sein, zu dem `project_id` gehört.
- Sonst Exception (errcode `22023` invalid_parameter_value).

Implementiert analog zu `enforce_project_responsible_user_in_tenant` aus PROJ-2.

## Last-Lead-Invariante

Trigger BEFORE UPDATE OF role / DELETE:
- Wenn die zu ändernde Row aktuell `role='lead'` ist und das die letzte `lead`-Row im Projekt ist → exception.
- Ausnahme: wenn die zu ändernde Row gleichzeitig die letzte Membership überhaupt ist UND der `tenant_admin` des Projekt-Tenants über die `is_tenant_admin`-Helper-Funktion verfügbar bleibt — dann ist „kein Lead, aber Tenant-Admin springt ein" zulässig.

Praktisch: in der ersten Iteration **strikte Variante** — Projekt muss immer ≥1 `lead` haben; tenant_admin-Bypass nur per direkter Code-Logik. Spätere Verfeinerung möglich, wenn echtes Bedürfnis auftaucht.

## RLS-Policies (mit den PROJ-1-Helpern)

```
SELECT: tenant_member des Projekt-Tenants
   USING (
     EXISTS (
       SELECT 1 FROM projects p
       WHERE p.id = project_memberships.project_id
         AND public.is_tenant_member(p.tenant_id)
     )
   )

INSERT / UPDATE / DELETE:
   USING / WITH CHECK (
     EXISTS (
       SELECT 1 FROM projects p
       WHERE p.id = project_memberships.project_id
         AND (
           public.is_tenant_admin(p.tenant_id)        -- tenant-admin darf alles
           OR EXISTS (                                  -- ODER projekt-lead darf
             SELECT 1 FROM project_memberships m
             WHERE m.project_id = p.id
               AND m.user_id = (select auth.uid())
               AND m.role = 'lead'
           )
         )
     )
   )
```

## Automatik beim Projekt-Anlegen

Wenn ein User über `POST /api/projects` ein Projekt anlegt, wird in derselben Transaktion eine `project_memberships`-Row mit `role='lead'`, `user_id = auth.uid()`, `created_by = auth.uid()` eingetragen.

Implementierung: am sichersten als `BEFORE INSERT`-Trigger auf `projects`, der die zugehörige `project_memberships`-Row anlegt — oder als zweite SQL-Statement im API-Route-Handler unter `BEGIN; ... COMMIT;`. Empfehlung **Variante 2** (im API-Handler) wegen besserer Lesbarkeit und expliziter Reihenfolge; Trigger nur als Fallback-Defense.

## Verhältnis zu `projects.responsible_user_id`

`responsible_user_id` bleibt bestehen — es ist die **fachlich verantwortliche Person**, nicht der Berechtigungs-Marker. Beispiel:
- `project_lead` = Mark (kümmert sich um Mitgliedschaften)
- `responsible_user_id` = Sandra (CEO, hat Rechenschaft, aber Mark führt operativ)

Beim Projekt-Anlegen wird `responsible_user_id` per Default auf den Anleger gesetzt — kann aber sofort umgemünzt werden. **Constraint**: `responsible_user_id` muss Tenant-Mitglied sein (PROJ-2-Trigger) und sollte üblicherweise eine project_membership haben — letzteres wird **nicht** hart enforced, weil es legitime Cases gibt (CEO als Verantwortliche ohne tägliche Mitarbeit). UI warnt aber, wenn `responsible_user_id` nicht in `project_memberships` enthalten ist.

## Authorisierungs-Logik (kombiniert mit Tenant-Rollen)

`role-model.md` § Kombinationslogik bleibt verbindlich. Konkret bei Projekt-Operationen:

| Operation | `tenant_admin` | `tenant_member` mit `project_lead` | `tenant_member` mit `project_editor` | `tenant_member` mit `project_viewer` | `tenant_member` ohne Membership | `tenant_viewer` |
|---|---|---|---|---|---|---|
| SELECT | ✅ | ✅ | ✅ | ✅ | ✅ (sieht alle Projekte des Tenants) | ✅ |
| INSERT (Projekt anlegen) | ✅ → wird `lead` | ✅ → wird `lead` | n/a (Editor erbt das nicht; Anlegen ist Tenant-Recht) | n/a | ✅ → wird `lead` | ❌ |
| UPDATE Stammdaten | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Lifecycle-Transition | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Soft-Delete | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Hard-Delete | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Membership managen | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

Das **erweitert** die aktuelle PROJ-2-RLS, die nur Tenant-Rollen prüft. Konkret: PROJ-2 erlaubt JEDEM `tenant_member` Schreiben/Soft-Delete. Mit `project_memberships` wird das auf `project_lead`/`project_editor` eingeschränkt. **Migration nötig** (siehe unten).

## Migration-Plan

PROJ-4 (Platform Foundation) ist der Ort, an dem die Tabelle eingeführt wird. In derselben Migration:

1. Tabelle `project_memberships` anlegen.
2. Backfill: für jedes existierende Projekt eine Row `(project_id, responsible_user_id, 'lead', responsible_user_id)`.
3. RLS-Policies auf `projects` aktualisieren — die aktuellen `is_tenant_admin OR has_tenant_role('member')`-Checks werden ergänzt um den project-membership-Check.
4. Frontend-AuthContext erweitern um `useProjectRole(projectId)`-Hook für UI-Gating.

**Kein Schema-Bruch** auf existierenden Projekt-Daten — `responsible_user_id` bleibt, der Backfill stellt sicher dass jeder Eigentümer sofort `project_lead` ist.

## Out of Scope (deferred)

- **Delegationslogik** (Lead leiht seine Rechte aus) — explizit Nicht-AK in `role-model.md`.
- **Rollen-UI** (jenseits von API-Calls) — kommt in PROJ-4 oder später; aktuell Pflege via API.
- **Per-Field-Rechte** — ausgeschlossen pro `role-model.md`.
- **Externer Stakeholder als Projekt-Mitglied** — Stakeholder ohne `linked_user_id` haben keine `project_memberships`, weil sie keine Auth-Identität sind. Sie tauchen in `project_stakeholders` auf (Schicht 3 in [v3-master-data-and-global-catalogs.md](v3-master-data-and-global-catalogs.md)).

## Konsequenzen

**Vorteile:**
- Mehrere Personen pro Projekt mit differenzierten Rechten möglich.
- Kongruenz mit dem in V2 ADR `role-model.md` festgelegten Modell.
- Klare Trennung „wer hat operative Verantwortung" (`responsible_user_id`) vs. „wer darf was tun" (`project_memberships`).

**Trade-offs:**
- PROJ-2's RLS muss bei der Einführung erweitert werden — also eine Folge-Migration mit Policy-Update. Backfill macht es bruchfrei.
- Permission-Checks gehen von 1-Helper-Aufruf (`is_tenant_admin`) zu 2-3-Helper-Aufrufen (zusätzlich `is_project_lead` etc.). Performance-impact minimal bei normalen Tenant-Größen; bei sehr vielen Projekten pro Tenant Index auf `(project_id, user_id, role)` schon vorhanden.

## Related

- [role-model.md](role-model.md) — V2-Quelle der Rollen-Logik (verbindlich)
- [stakeholder-vs-user.md](stakeholder-vs-user.md) — User ≠ Stakeholder; nur User landet in `project_memberships`
- [v3-master-data-and-global-catalogs.md](v3-master-data-and-global-catalogs.md) — Projekt-Memberships als spezialisierte Schicht-3-Tabelle
- PROJ-4 (Platform Foundation, Navigation, RBAC) — Implementer
- PROJ-2 (Project CRUD) — RLS muss bei Einführung aktualisiert werden
