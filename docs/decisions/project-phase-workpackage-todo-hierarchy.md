# ADR-004: Explizite Projekt → Phase → Arbeitspaket → To-do Hierarchie mit kontrollierten polymorphen Dependencies

> **Status:** accepted
> **Author:** Sven (rechnung@it-couch.de)
> **Date:** 2026-05-03
> **Context:** Planungstool für Projekte, Phasen, Arbeitspakete und To-dos mit kritischem Pfad und Abhängigkeiten zwischen Projekten.

---

## 1. Kontext

- Wir bauen ein System, in dem Projekte in Phasen unterteilt sind, Phasen haben Arbeitspakete, und Arbeitspakete bestehen aus To-dos.
- Jede Ebene hat Stakeholder, Ressourcen, Budget, Risiken und Kommunikation.
- Es gibt Wechselwirkungen zwischen Projekten und Pfaden, die wir im Netzplan sichtbar machen müssen.
- Ziel ist, den **kritischen Pfad** (inkl. Abhängigkeiten über mehrere Projekte/Phasen hinweg) automatisiert erkennen und visualisieren zu können.

---

## 2. Zustand jetzt

- Die Domäne ist klar:
  - `projects` → `phases` → `work_packages` → `todos`.
- Es gibt unterschiedliche Arten von Abhängigkeiten:
  - innerhalb einer Phase,
  - zwischen Phasen,
  - zwischen Projekten.
- Ohne eine saubere Struktur drohen:
  - Unklare oder inkonsistente Abhängigkeitsmodellierung.
  - Unfähigkeit, den kritischen Pfad über mehrere Projekte zu berechnen.

---

## 3. Entscheidung

Wir verwenden:

- Eine **explizite hierarchische Struktur**:
  - `projects` → `phases` → `work_packages` → `todos`.
- Eine **typ-spezifische Referenzierung** für Owner der meisten Entitäten (FK, nicht generische `entity_kind`).
- Eine **einzige, aber typ-gesteuerte `dependencies`-Tabelle** mit:
  - `from_type` (`project`, `phase`, `work_package`, `todo`),
  - `from_id`,
  - `to_type` (`project`, `phase`, `work_package`, `todo`),
  - `to_id`,
  - `constraint_type` (`FS`, `SS`, `FF`, `SF`),
  - `lag_days` (signed integer, default 0).
- Polymorphe Dependencies **nur dort**, wo sie für den Netzplan/kritischen Pfad nötig sind, nicht für allgemeine Business-Entities.

### Konsequenzen

1. Die heute deployed `dependencies`-Tabelle aus PROJ-9 (nur work-item-zu-work-item) wird auf das polymorphe Modell migriert.
2. Die in PROJ-25 ST-04 geplante separate `phase_dependencies`-Tabelle entfällt — Phasen-Dependencies laufen über die polymorphe Tabelle.
3. Critical-Path-Berechnung (Forward/Backward-Pass) wird als Postgres recursive-CTE über die polymorphe `dependencies`-Tabelle implementiert.
4. Cycle-Prevention muss polymorph erweitert werden (heute self-FK-Check auf `work_items.parent_id` reicht nicht mehr für ebenen-übergreifende Zyklen).

---

## 4. Alternativen, die wir geprüft haben

### Alternative A — Vollständig polymorphe Abhängigkeiten für alles

- Hohe Flexibilität: jede Tabelle kann referenzieren.
- **Verworfen:** untergräbt Datenintegrität (FK-Constraint nicht mehr DB-erzwungen), erschwert Reporting, verleitet zu Missbrauch (z. B. Stakeholder-Dependencies).

### Alternative B — Vier separate Dependency-Tabellen (`project_deps`, `phase_deps`, `wp_deps`, `todo_deps`)

- Maximale Typ-Sicherheit pro Tabelle.
- **Verworfen:** Critical-Path-CTE müsste vier Tabellen UNIONen, jede Cross-Level-Dependency würde einen weiteren Bridge-Tabellen-Wuchs erzwingen.

### Alternative C — Phasen als `work_items.kind='phase'`-Variante modellieren

- Vorteil: eine `dependencies`-Tabelle reicht ohne Polymorphie.
- **Verworfen:** Phasen haben fundamental andere Lifecycle-Semantik (planned_start/end vs. work-item-Schedule), eigene RLS-Pfade, und bestehen bereits als deployed Entity in PROJ-19. Reverse-Migration zu hoch.

---

## 5. Mapping auf V3-Codebase

Der ADR spricht in Domain-Begriffen (`work_packages`, `todos`); die V3-Codebase implementiert das so:

| ADR-Begriff | V3-Tabelle / Kind | Quelle |
|---|---|---|
| `projects` | `projects` | PROJ-2 |
| `phases` | `phases` | PROJ-19 |
| `work_packages` | `work_items` mit `kind='work_package'` | PROJ-9 |
| `todos` | `work_items` mit `kind IN ('task','subtask')` | PROJ-9 |
| `dependencies` (polymorph) | neue `dependencies`-Tabelle (ersetzt PROJ-9 `dependencies` und PROJ-25-geplante `phase_dependencies`) | **PROJ-36** |

`work_items.parent_id` bleibt für die Hierarchie innerhalb der Work-Item-Welt (`work_package → work_package → task → subtask`). Cross-Level-Hierarchie (Phase → Work-Item) läuft über `work_items.phase_id`.

---

## 6. Folgewirkungen

- **PROJ-36** (neu) implementiert die Hierarchie-Erweiterung + WBS-Codes + Roll-up.
- **PROJ-25** (Planned) wird in `/architecture` an dieses ADR angepasst: `phase_dependencies` entfällt, Gantt verwendet die polymorphe `dependencies`-Tabelle.
- **PROJ-9** wird durch die Migration der `dependencies`-Tabelle berührt (additive Erweiterung von `(predecessor_id, successor_id)` zu `(from_type, from_id, to_type, to_id)`); Datenmigration mit `from_type='todo', to_type='todo'` als Default.
- **PROJ-26** (Method-Gating) wird **nicht** verschärft: WBS-Hierarchie ist cross-method erlaubt, Method-Visibility regelt nur die zulässigen Kinds.

---

## 7. Related

- [work-item-metamodel.md](work-item-metamodel.md) — V2-ADR zu Work-Item-STI (kompatibel).
- [method-object-mapping.md](method-object-mapping.md) — wird durch PROJ-36 erweitert (`task → ['work_package','story',null]`).
- `features/PROJ-9-work-item-metamodel-backlog.md`
- `features/PROJ-19-phases-milestones-cross-cutting.md`
- `features/PROJ-25-dnd-stack.md`
