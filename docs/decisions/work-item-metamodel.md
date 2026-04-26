> **Inherited from V2** — Decision still applies to V3. Stack-specific references (FastAPI, Redis, etc.) are historical; Supabase/Next.js V3 implementations follow the same principle.

# Decision Record — Work-Item Metamodell

**EP-07-ST-01 / PP-95** · Stand: 2026-04-23

---

## Kontext

EP-07-ST-01 fordert ein „gemeinsames Metamodell für Planungsobjekte", das mindestens Epic, Feature, Story, Task, Subtask, Bug, Phase, Meilenstein und Arbeitspaket kennt. Jedes Objekt hat eine eindeutige ID, ist einem Projekt zugeordnet, unterstützt Über-/Unterordnung und wird methodenabhängig aktiviert.

Wir haben heute:
- `phases` und `milestones` als eigene Tabellen mit konkreten Feldern (`target_date`, `planned_start/end`, `sequence_number`, …). Diese sind Welle-1-Features mit UI, Audit und Copy.
- `projects.method ∈ {scrum, kanban, waterfall, safe}` (EP-04-ST-02).

## Entscheidung

### Datenmodell

Neue Tabelle **`work_items`** (Single-Table Inheritance über `kind`-Diskriminator) für die sechs neuen Objekttypen:

```
id              uuid pk
tenant_id       uuid fk tenants
project_id      uuid fk projects
kind            enum: epic | feature | story | task | subtask | bug | work_package
parent_id       uuid fk work_items (nullable) — Über-/Unterordnung
phase_id        uuid fk phases (nullable)     — klassische Anbindung
milestone_id    uuid fk milestones (nullable) — klassische Anbindung
title           varchar(255)  not null
description     text          nullable
status          enum: todo | in_progress | blocked | done | cancelled
priority        enum: low | medium | high | critical  (default medium)
responsible_user_id uuid fk users (nullable)
created_by      uuid fk users  not null
created_at / updated_at / is_deleted   wie üblich
```

**`phases` und `milestones` bleiben separat.** Sie haben zeit-spezifische Felder und produktreife Welle-1-Features (Kopie, Audit, Status-Kommentar, Phasen-Zuordnung). Ein Umbau in die gemeinsame Tabelle wäre eine Neuimplementierung ohne Zugewinn für die AK. Im Metamodell-Register tauchen sie daher als **externe Kinds** auf — mit eigenem Storage, aber gleichem Domain-Vokabular.

### Gesamtbild der Kinds

| Kind | Storage | Kommentar |
|---|---|---|
| epic | `work_items` | Scrum/SAFe |
| feature | `work_items` | SAFe |
| story | `work_items` | Scrum/Kanban/SAFe |
| task | `work_items` | Scrum/Kanban/SAFe/Waterfall |
| subtask | `work_items` | Scrum/SAFe |
| bug | `work_items` | Alle Methoden |
| work_package | `work_items` | Waterfall, PMI-orientiert |
| phase | `phases` (Welle-1) | Waterfall |
| milestone | `milestones` (Welle-1) | Waterfall |

### Methodenabhängige Aktivierung

Eine **serverseitige Registry** in `services/work_items/metamodel.py` hält `WORK_ITEM_METHOD_VISIBILITY: dict[WorkItemKind, set[ProjectMethod]]`.
Service-Layer rejected Create-Versuche für Kinds, die für die Projektmethode nicht aktiviert sind — **außer Bugs**: die sind methodenübergreifend (EP-07-ST-04 AK).

Ist die Methode `None` (noch nicht gewählt), sind **alle** Kinds erlaubt — der Projektanleger kann eine Struktur anlegen, bevor er die Methode festklopft. Sobald die Methode gesetzt ist, greift die Registry.

### Parent-Child-Regeln

Per-Kind-Registry `ALLOWED_PARENT_KINDS: dict[WorkItemKind, set[WorkItemKind | None]]`:

| Kind | Erlaubte Parents |
|---|---|
| epic | None (Top-Level) |
| feature | epic, None |
| story | epic, feature, None |
| task | story, None |
| subtask | task |
| bug | None oder beliebig (als "betrifft" verknüpfbar) |
| work_package | None (ordnet sich über phase_id/milestone_id zu) |

Die Regeln werden im Service validiert; Verstoß → HTTP 422 mit lesbarer Meldung.

### Klassische Anbindung (phase_id / milestone_id)

Nur sinnvoll für `work_package` und optional `bug`; Service validiert, dass die referenzierte Phase/Meilenstein zum gleichen Projekt gehört.

### RBAC + Tenant-Isolation

Wie bei Phasen/Milestones: Editor/Lead darf erstellen/ändern, Viewer nur lesen. Tenant-übergreifend → 404.

## Cross-method bugs (EP-07-ST-04 Nachweis)

AK-Nachweis über die Metamodell-Konfiguration:

- `WORK_ITEM_METHOD_VISIBILITY[WorkItemKind.BUG] = frozenset(ProjectMethod)` — also alle Methoden.
- `ALLOWED_PARENT_KINDS[WorkItemKind.BUG] = _ANY` — kann unter jedem Kind hängen (Epic/Feature/Story/Task/Subtask/Work-Package) oder standalone.
- Felder `status`, `priority`, `description`, `responsible_user_id` sind Bestandteil des gemeinsamen Work-Item-Schemas — kein Bug-Spezialmodell nötig.

Abgesichert durch `apps/api/tests/integration/test_bugs_cross_method.py`.

## Nicht-Ziele dieser Story

- **Kein UI** (Nicht-AK) — Endpoints existieren, damit EP-07-ST-02 sofort aufsetzen kann.
- **Keine Historisierung** (Nicht-AK) — Audit-Hook wird bewusst nicht aktiviert. Folge-Story zieht das nach.
- **Keine KI-Vorschläge** (Nicht-AK) — EP-10-ST-03.
- **Keine Konvertierung** zwischen Methoden (EP-04-ST-03 Nicht-AK).
- **Keine Portfolio-Ebene** (SAFe Portfolio-Epic / Capability) — die werden in EP-07-ST-02 als eigene Kinds oder als Attribut unter `epic` geklärt.

## Konsequenzen

- EP-07-ST-02 (Scrum-Objekte) kann direkt CRUD für Epic/Story/Task/Subtask/Bug aufsetzen und sich auf die Parent-Regeln verlassen.
- EP-07-ST-04 (Bugs methodenübergreifend) muss nichts am Modell ändern, nur die bestehende Liste-/Filter-Logik für Bugs anreichern.
- EP-10-ST-03 (KI-Vorschläge) kann Work-Items als Ziel- und Kontextobjekt verwenden.
- EP-08-ST-01 Folge-Chunk muss `work_item` in Audit-Tracking aufnehmen.

## Offene Punkte

- SAFe Portfolio-Epic / Capability als eigene Kinds — Entscheidung verschoben bis SAFe-Projekt echter Use-Case wird.
- `story_points`, `sprint_id`, `due_date` — kommen mit konkreten Scrum-/Kanban-Stories, nicht in dieser Story.
