> **Inherited from V2** — Decision still applies to V3. Stack-specific references (FastAPI, Redis, etc.) are historical; Supabase/Next.js V3 implementations follow the same principle.

# Decision Record — Stakeholder-Datenmodell

**EP-06-ST-01 / PP-92** · Stand: 2026-04-23

---

## Kontext

EP-06 verlangt, dass Stakeholder als eigenständige Entität geführt werden — abgegrenzt von Plattformnutzern (`users`). Plattformnutzer loggen sich ein; Stakeholder werden beschrieben (können extern sein, reine Organisationen, oder Personen ohne Account).

AK (EP-06-ST-01):
- Intern vs. extern
- Person vs. Organisation
- Mindestens Rolle, Organisationseinheit, Einfluss, Betroffenheit
- Personenbezogene Felder technisch markiert (Datenschutzklasse)

## Entscheidung

### Tabelle `stakeholders`

Pro Projekt eine Liste von Stakeholdern. Schlüsselfelder:

| Feld | Typ | Semantik | Datenschutz |
|---|---|---|---|
| `kind` | enum `person / organization` | Ist dieser Stakeholder eine Person oder eine Organisation? | CLASS_1 |
| `origin` | enum `internal / external` | Gehört er zur eigenen Organisation oder nicht? | CLASS_1 |
| `name` | str(255) | Name der Person oder Organisation | **CLASS_3** (konservativ, siehe unten) |
| `role_key` | str(50), nullable | Referenz auf Rollenkatalog (sponsor, key_user, …) | CLASS_1 |
| `org_unit` | str(255), nullable | Fachbereich / Abteilung | CLASS_2 |
| `contact_email` | str, nullable | Kontakt | CLASS_3 |
| `contact_phone` | str(50), nullable | Kontakt | CLASS_3 |
| `influence` | enum `low / medium / high / critical` | Machtposition im Projekt | CLASS_1 |
| `impact` | enum `low / medium / high / critical` | Betroffenheit vom Projekterfolg | CLASS_1 |
| `user_id` | uuid, FK users, nullable | Optionaler Link auf Plattformnutzer | CLASS_3 |
| `notes` | text, nullable | Freitext-Anmerkungen | CLASS_3 |
| `is_active` | bool, default true | Soft-Deaktivierung (EP-06-ST-02) | CLASS_1 |

### `name` konservativ als CLASS_3

Die Spalte kann eine Person oder eine Organisation bezeichnen. `classify_field` arbeitet auf Tabellenebene, nicht pro Zeile. Entscheidung: **CLASS_3**, damit `name` nie unreflektiert an externe Modelle geht. Falls später tatsächlich benötigt, dass organization-Stakeholder-Namen class-2 behandelt werden, wird die Klassifizierung in `classify_payload` um einen Per-Zeilen-Pfad erweitert (bedingte Auswertung gegen `kind`) — das ist aber explizit **nicht** Bestandteil dieser Story oder von F12.1.

### API-Struktur

Endpoints unter `/api/v1/projects/{project_id}/stakeholders`:
- `GET` — liste aktive Stakeholder (optional `include_inactive=true`)
- `POST` — anlegen (Editor/Lead/Admin)
- `GET /{id}` — einzelner Stakeholder
- `PATCH /{id}` — ändern
- `POST /{id}/deactivate` — Soft-Deaktivierung (EP-06-ST-02 AK "deaktivieren")

### Was diese Story nicht liefert

- **Keine UI** — landet mit EP-06-ST-02.
- **Keine Audit-History** — AK EP-06-ST-02 verlangt sie; wird beim UI-Chunk über den bestehenden AuditLog-Hook nachgezogen (wie bei work_items).
- **Keine Rollen-Validierung** gegen den Projekttyp-Katalog — `role_key` ist aktuell frei. EP-04-ST-04 regelt die Kopplung.
- **Keine automatische Vorschlagslogik** (EP-06-ST-03 Nicht-AK).

## Konsequenzen

- EP-06-ST-02 (Pflege-UI) baut auf dem fertigen Backend auf — muss nur Frontend + Audit-Hook addieren.
- EP-06-ST-03 (Vorschläge je Typ) kann `role_key` mit dem Projekttyp-Katalog (`standard_roles`) kreuzen.
- EP-09 (Ressourcen aus Stakeholdern) nutzt das Modell als Quelle.
- KI-Routing erhält durch die konservative CLASS_3-Klassifizierung den Nachweis, dass Stakeholder-Daten die externe Grenze nicht passieren.
