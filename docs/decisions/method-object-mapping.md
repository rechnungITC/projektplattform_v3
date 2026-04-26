> **Inherited from V2** — Decision still applies to V3. Stack-specific references (FastAPI, Redis, etc.) are historical; Supabase/Next.js V3 implementations follow the same principle.

# Decision Record — Methodenabhängige Objektlogik

**EP-04-ST-03 / PP-85** · Stand: 2026-04-23

Verweise: [Methodik-Katalog](method-catalog.md), [Work-Item-Metamodell](work-item-metamodel.md).

---

## Kontext

EP-04-ST-03 fordert, dass pro Methode die führenden Planungsobjekte festgelegt sind. Die AK nennt:

- Scrum: Epic, Story, Task, Subtask, Bug
- SAFe: alle freigegebenen SAFe-Ebenen
- Klassische/PMI-orientierte Modelle: Phase, Meilenstein, Arbeitspaket
- Bugs: methodenübergreifend

Die technische Grundlage existiert bereits durch:
- `projects.method` (EP-04-ST-02) — welche Methode ein Projekt nutzt
- `WORK_ITEM_METHOD_VISIBILITY` Registry (EP-07-ST-01) — welche Work-Item-Kinds pro Methode aktiv sind
- `phases` / `milestones` Welle-1-Tabellen — immer verfügbar

Dieser Record **bestätigt und dokumentiert** das Mapping, damit es als referenzierbare Entscheidung neben dem Code existiert.

## Entscheidung: das Mapping

| Methode | Aktive Work-Item-Kinds | Phasen/Meilensteine |
|---|---|---|
| **Scrum** | Epic, Story, Task, Subtask, Bug | Phasen/Meilensteine *technisch* nutzbar, *fachlich* nicht empfohlen — Scrum arbeitet in Sprints. |
| **Kanban** | Story, Task, Bug | Flow-basiert; Phasen/Meilensteine spielen meist keine Rolle. |
| **Wasserfall** | Task (als Aktivität), Bug, Arbeitspaket (`work_package`) | Phasen + Meilensteine sind das zentrale Gerüst. |
| **SAFe** | Epic, Feature, Story, Task, Subtask, Bug | Phasen/Meilensteine für PI-Planung optional nutzbar. |

**Bugs sind in allen Methoden aktiv** (bestätigt durch EP-07-ST-04).

Wird die Methode noch nicht gewählt (`method=NULL`), sind alle Kinds anlegbar. Der Filter greift erst nach Festlegung.

### Konflikte und Entscheidungen

- **SAFe Portfolio-Ebene**: Portfolio-Epic, Capability sind in der aktuellen Enum nicht enthalten. AK "SAFe nutzt alle freigegebenen SAFe-Ebenen" wird technisch durch die gleichen `epic` / `feature` Kinds bedient, mit Erweiterungspfad: falls mehrere SAFe-Ebenen unterscheidbar werden müssen, fügen wir Kinds `portfolio_epic` und `capability` hinzu. Entscheidung verschoben, bis ein echter SAFe-Use-Case das triggert.
- **Keine automatische Konvertierung** zwischen Methoden (Nicht-AK der Story). Wird eine Methode gewechselt, bleiben vorhandene Work-Items erhalten — der UI-Filter blendet nur die nicht mehr aktiven Kinds aus.

### Abgrenzung zur Nicht-AK

- Keine technische *Implementierung* neuer Objekte (ist in EP-07-ST-02 passiert).
- Keine Mischmethodik (Kanban-in-einem-Scrum-Projekt o.ä.).
- Keine Konvertierungslogik.

## Konsequenz

- Der Eintrag `WORK_ITEM_METHOD_VISIBILITY` in `domain/core/work_items/metamodel.py` ist die **einzige Quelle der Wahrheit** für dieses Mapping. Änderungen dort gehen einher mit einem Update dieses Records.
- `apps/api/tests/integration/test_method_object_mapping.py` pinnt die AK-konformen Sichtbarkeiten als Regressionsschutz.
- Frontend-Spiegel `workItemKindsFor(method)` in `apps/web/lib/types.ts` muss in Sync bleiben — ein eigener Test prüft das über die REST-Schnittstelle.
