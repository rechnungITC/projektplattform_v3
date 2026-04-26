> **Inherited from V2** — Decision still applies to V3. Stack-specific references (FastAPI, Redis, etc.) are historical; Supabase/Next.js V3 implementations follow the same principle.

# Decision Record — Projekttyp-Katalog

**EP-04-ST-01 / PP-83** · Stand: 2026-04-23

---

## Kontext

EP-04-ST-01 fordert einen Katalog für die initialen Projekttypen **ERP** und **Generic Software**. Jeder Typ braucht laut AK:

- Standardrollen
- Standardmodule
- Pflichtinformationen im Anlagedialog

Das Datenmodell kennt schon eine `project_type`-Spalte (`general / erp / construction / software`). Der Katalog füllt diese Werte mit fachlicher Bedeutung.

## Entscheidung

### Ablageform

Der Katalog lebt als **Code-Registry** in `apps/api/src/projektplattform_api/domain/core/project_types/catalog.py`, nicht in der Datenbank. Begründung:

- Der Katalog ist Konfiguration (Vorgabe der Plattform), nicht mandantenspezifische Daten. Tenants dürfen *Instanzen* pro Projekt von den Vorgaben abweichen — aber die Vorgaben selbst sind platform-weit.
- Änderungen am Katalog sind Review-pflichtig (Code-Commit), nicht Ad-hoc über eine Admin-UI. Das passt zur Governance-Aussage in der Nicht-AK ("Keine Admin-Oberfläche für Regelpflege").
- Migrations-frei: Anpassungen kosten nur einen Deploy.

### Datenstruktur

```python
@dataclass
class ProjectTypeProfile:
    type: ProjectType
    label_de: str
    summary_de: str
    standard_roles: tuple[StandardRole, ...]
    standard_modules: tuple[str, ...]
    required_info: tuple[RequiredInfo, ...]
```

Rollen haben `key / label_de / description_de` und werden über Typen hinweg wiederverwendet (Projektleiter:in, Sponsor, Key-User, Product Owner, …).

### Initialbelegung

| Typ | Standardrollen | Standardmodule | Pflichtinfos |
|---|---|---|---|
| **ERP** | Projektleiter:in, Sponsor, Key-User, IT-Architekt:in, Datenschutzbeauftragte:r | backlog, planning, members, history, stakeholders, governance | Zielsysteme, Fachbereiche, Migrationsumfang |
| **Generic Software** | Projektleiter:in, Product Owner, Scrum Master, Developer, QA-Lead | backlog, planning, members, history, releases | Zielplattformen, Technologie-Stack |
| **Allgemein** | Projektleiter:in, Sponsor | backlog, planning, members, history | — |
| **Bau** | Projektleiter:in, Sponsor | backlog, planning, members, history | — (Nicht-AK: Bau-Fachlogik erst in späteren Stories) |

### Zugriff

- `GET /api/v1/project-types` — Read-only Liste aller Profile. Für den Wizard und künftige Regelfunktionen.
- Kein POST/PATCH/DELETE — Pflege über Code-Review.

### Was dieser Chunk bewusst **nicht** liefert

- Kein Scaffolding, das beim Projektanlegen automatisch Rollen/Module/Startobjekte erzeugt. Das ist EP-04-ST-04.
- Keine dynamische Pflichtfeldprüfung im Wizard — heute wird das Profil nur für den Anzeigepfad genutzt. Die wizard-Integration und serverseitige Validierung der Pflichtinfos folgt in EP-03-ST-03.
- Keine CRM/Finance/HR-Spezifik innerhalb ERP (AK-Nicht-AK).
- Keine Bau-LV-Fachlogik.

## Konsequenz

- EP-04-ST-04 (Regelwerk) kann den Katalog mit dem Methodenkatalog kreuzen (Projekttyp × Methode → aktive Module / Start-Struktur).
- EP-03-ST-03 (dynamische Rückfragen im Dialog) kann `required_info` als Quelle für typ-spezifische Wizard-Felder nutzen.
- EP-06 (Stakeholder) kann die Rollen aus `standard_roles` als Vorschlagsliste beim Stakeholder-Anlegen nehmen.

## Offene Punkte

- Rollenkatalog wird in EP-06-ST-01 nochmal angefasst (Stakeholder-Rollen vs. Projektrollen aus dem RBAC-Modell). Einheitliche Schlüssel würden dort helfen.
- `standard_modules` ist aktuell eine String-Liste. Sobald EP-05 die Moduldefinitionen formalisiert, wird das ein `Module`-Enum.
