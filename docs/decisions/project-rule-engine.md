> **Inherited from V2** — Decision still applies to V3. Stack-specific references (FastAPI, Redis, etc.) are historical; Supabase/Next.js V3 implementations follow the same principle.

# Decision Record — Projekt-Regelwerk (Typ × Methode)

**EP-04-ST-04 / PP-86** · Stand: 2026-04-23

Verweise: [project-type-catalog.md](project-type-catalog.md), [method-catalog.md](method-catalog.md), [method-object-mapping.md](method-object-mapping.md), [work-item-metamodel.md](work-item-metamodel.md).

---

## Kontext

Der Projekttyp-Katalog (EP-04-ST-01) liefert Standardrollen, -module und Pflichtinfos. Der Methodenkatalog (EP-04-ST-02) legt die operative Arbeitsweise fest. EP-04-ST-04 verlangt, dass aus **beiden** zusammen automatisch abgeleitet wird:

- aktive Module
- vorgeschlagene Rollen
- Startstruktur für Planungseinheiten

## Entscheidung

### Rule Engine als reine Funktion

`domain/core/project_types/rule_engine.py::compute_rules(type, method) → ProjectRules`. Keine DB-Seiteneffekte; reine Komposition aus den beiden Katalogen + dem Work-Item-Metamodell.

### Ableitungsregeln

| Ableitungsziel | Quelle | Regel |
|---|---|---|
| `active_modules` | Type-Katalog | 1:1 aus `ProjectTypeProfile.standard_modules`. Keine Subtraktion durch Methode (heute keine Kollisionen bekannt). |
| `suggested_roles` | Type-Katalog | 1:1 aus `ProjectTypeProfile.standard_roles`. |
| `required_info` | Type-Katalog | 1:1 aus `ProjectTypeProfile.required_info`. |
| `starter_kinds` | Methode + Metamodell | Methoden-eigene Liste (Scrum: Epic/Story, Kanban: Story, Waterfall: Arbeitspaket, SAFe: Epic/Feature/Story), gefiltert gegen `WORK_ITEM_METHOD_VISIBILITY` — Konsistenz mit EP-04-ST-03 garantiert. |

Fehlt die Methode (`method=None`), sind `starter_kinds` leer — der Nutzer soll erst wählen, bevor wir eine Struktur vorschlagen. Module und Rollen bleiben trotzdem sichtbar.

### Endpoints

- `GET /api/v1/projects/{id}/rules` — projektbezogen (nach Anlage).
- `GET /api/v1/project-types/{type}/rules?method=…` — Preview für den Wizard, ohne dass ein Projekt existieren muss.

### Was bewusst **nicht** passiert

- **Kein Auto-Scaffolding**: Das Regelwerk erzeugt keine Objekte automatisch. AK „Nutzer können Vorschläge später anpassen" — die Anpassungslogik bleibt manuell; künftig kann ein „Starter-Struktur aus Regel anwenden"-Button die Vorschläge umsetzen.
- **Keine Admin-UI für Regelpflege** (Nicht-AK). Änderungen gehen über Code-Commits an die Kataloge.
- **Keine KI-Regelgenerierung** (Nicht-AK).

## Konsequenzen

- EP-03-ST-02 (Wizard) kann `rules-preview` nutzen, um bei der Methodenwahl passende Starter-Kinds und Rollenvorschläge zu zeigen.
- EP-06-ST-03 (Stakeholder-Rollenvorschläge) nutzt den gleichen `suggested_roles`-Pfad; Konsistenz über beide UIs garantiert.
- Ein späteres EP-05-Modul-Aktivierungsfeature kann `active_modules` konsumieren, um Tabs sichtbar/unsichtbar zu schalten.

## Offene Punkte

- Methoden-Überschreibungen an Rollen (z. B. SAFe → RTE): momentan nicht modelliert. Sobald benötigt, bekommt `rule_engine` einen zweiten Datensatz `method-role-delta`.
- `active_modules` ist aktuell nur ein String-Array. Nach EP-05-Moduldefinition wird das ein `Module`-Enum und pro Modul einen `activation_reason` (type vs. method).
