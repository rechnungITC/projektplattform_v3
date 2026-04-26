> **Inherited from V2** — Decision still applies to V3. Stack-specific references (FastAPI, Redis, etc.) are historical; Supabase/Next.js V3 implementations follow the same principle.

# Decision Record — Methodik-Katalog

**EP-04-ST-02 / PP-84** · Stand: 2026-04-23

---

## Kontext

Die Plattform soll klassische, agile und skalierte Arbeitsweisen unterstützen. Das Datenmodell muss die gewählte Methode persistent kennen, damit EP-04-ST-03 (methodenabhängige Objektlogik) und EP-04-ST-04 (Regelwerk für Module/Rollen) darauf aufbauen können.

Gleichzeitig gibt es in der Praxis Vorlagen-Frameworks (PMI, PRINCE2, VXT2.0), die keine eigenen Arbeitsparadigmen sind, sondern Strukturmuster und Governance-Vorgaben über eine gewählte Methode legen.

## Entscheidung

### Aktive Methoden (im Projekt gespeichert)

Ein Projekt wählt **eine** Methode aus dieser Liste:

| Methode | Technischer Wert | Führende Objekte |
|---|---|---|
| Scrum | `scrum` | Epic, Story, Task, Subtask, Bug |
| Kanban | `kanban` | Story, Task, Bug (ohne feste Iterationen) |
| Wasserfall | `waterfall` | Phase, Meilenstein, Arbeitspaket |
| SAFe | `safe` | Portfolio-Epic, Capability, Feature, Story, Task, Bug |

Die Methode ist als String-Spalte `projects.method` gespeichert, optional (nullable) bis zur expliziten Auswahl. Ein CHECK-Constraint hält die Menge geschlossen.

### Vorlagen (dokumentiert, nicht als Enum)

Vorlagen legen sich als Startstruktur und Governance-Muster über eine Methode:

- **PMI / PMBOK** — klassisch, strukturierte Startstruktur für `waterfall`; Ausbau in EP-04-ST-04.
- **PRINCE2** — klassisch mit starker Phasen- und Freigabelogik, Startstruktur für `waterfall`; Governance-Aspekte landen in EP-08 / EP-11.
- **VXT2.0** — hybrides Vorgehensmodell, Startstruktur wird bei der Methodenwahl (`scrum` oder `waterfall`) ausgewählt.

Vorlagen werden **nicht** als eigenes Projektfeld modelliert, solange der Startstrukturen-Mechanismus aus EP-04-ST-04 (Regelwerk Module/Rollen/Struktur) noch fehlt. Heute können sie in Stammdaten / Templates (EP-06) als Startvorlagen geführt werden; die Referenz ist dann pro Projekt ein optionaler `template_id`-Eintrag (nicht Teil dieser Story).

### Was EP-04-ST-02 konkret liefert

- `projects.method` Enum-Spalte mit CHECK-Constraint auf `{scrum, kanban, waterfall, safe}`.
- Pydantic/Typescript-Typen + Labels in DE.
- PATCH-Endpoint (über das bestehende `/projects/{id}` Update) setzt die Methode.
- UI: Methoden-Auswahl im Stammdaten-Formular.
- Audit-Log trackt Methodenänderungen (reuse F01 Hook).

### Was EP-04-ST-02 bewusst nicht tut

- Keine methodenabhängige Objektaktivierung (gehört zu EP-04-ST-03 / EP-07-ST-01).
- Keine Ableitung von Standardrollen oder Startstrukturen (EP-04-ST-04).
- Keine UI für Methodenverwaltung / Neuanlage weiterer Methoden.
- Keine Konvertierungslogik zwischen Methoden (Nicht-AK der Story).

## Konsequenz

- EP-04-ST-03 kann auf `projects.method` als klare Auswahl aufsetzen, um je Methode die führenden Objekttypen freizuschalten.
- EP-07-ST-01 kann im Metamodell bei der Definition eines Work-Items mit `visible_for_methods: set[Method]` arbeiten.
- Vorlagen (PMI/PRINCE2/VXT2.0) bleiben vorläufig Dokumentations-/Stammdaten-Artefakte; ihre technische Modellierung wird in EP-04-ST-04 entschieden.

## Offene Punkte

- Soll SAFe als "aktive Methode" heute schon in der UI auswählbar sein, wenn die führenden Objekte (Portfolio-Epic, Capability) in EP-07 noch fehlen? → **Ja**, im Datenmodell aktiv, in der UI mit Hinweis „Erweiterte Objekte folgen in EP-07".
- Sollte Wasserfall als `classic` statt `waterfall` heißen? → Entscheidung: `waterfall` — klarer, neutraler. "Klassisch" als UI-Label.
