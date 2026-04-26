> **Inherited from V2** — Decision still applies to V3. Stack-specific references (FastAPI, Redis, etc.) are historical; Supabase/Next.js V3 implementations follow the same principle.

# Decision Record — Backlog Board-Ansicht (Kanban/Scrum)

**EP-05-ST-02 / PP-88, EP-05-ST-03 / PP-90** · Stand: 2026-04-23

---

## Kontext

EP-05-ST-02 (Kanban) und EP-05-ST-03 (Scrum) fordern eine interne Board-Struktur für Planungsobjekte. Das Datenmodell ist seit EP-07-ST-01 vorhanden (`work_items` mit `status`-Feld); es fehlte eine Board-Sicht.

## Entscheidung

### Umsetzung

Ein Ansichts-Toggle im Backlog-Tab (`Liste` / `Board`). Das Board rendert fünf Spalten — eine pro Status des `WorkItemStatus`-Enums:

`Offen → In Arbeit → Blockiert → Erledigt → Abgebrochen`

Das erfüllt AK EP-05-ST-02 "mindestens 3 Spalten".

### Kartenbewegung ohne Drag-Drop

Jede Karte hat ←/→-Buttons, die den Status auf den vorherigen/nächsten Enum-Wert setzen. Der PATCH läuft durch den normalen Work-Item-Update-Flow und erzeugt deshalb automatisch einen Audit-Eintrag für `status` — das erfüllt AK EP-05-ST-02 „Spaltenwechsel wird protokolliert" über den EP-08-ST-01-Hook.

Drag-Drop wird bewusst vertagt: Pfeiltasten sind barrierefrei, funktionieren auf Touch-Geräten und auf Tastatur gleich, und brauchen keine externe Bibliothek. Sobald Sortierung innerhalb einer Spalte gefragt ist (WIP-Priorität), wird DnD eingeführt.

### Kind-Filter

Ein Filter-Chipstreifen am Kopf des Boards zeigt nur die Kinds, die im aktuellen Projekt auch tatsächlich vorkommen — ein SAFe-Team sieht Epics + Features + Stories, ein Kanban-Team nur Stories + Tasks + Bugs. Damit ist auch EP-05-ST-03 AK "Epic-Story-Task-Beziehungen sichtbar" pragmatisch abgedeckt: die Hierarchie zeigt sich über den Parent-Hinweis auf jeder Karte (aus dem Liste-Modus übernommen), und der Filter fokussiert eine Ebene nach Bedarf.

### Was bewusst **nicht** passiert

- **Keine WIP-Limits** (EP-05-ST-02 Nicht-AK).
- **Keine Automatisierungsregeln** (Nicht-AK).
- **Kein echter Sprint-Bezug** (EP-05-ST-03 AK „Sprintbezug ist für Stories oder Tasks speicherbar"). Dafür müsste das Metamodell um eine Sprint-Entität erweitert werden. Wird in einer Folge-Story nachgezogen — bis dahin gilt das Feld als offen. Hinweis im Implementation-Mapping.
- **Keine Burndown / Velocity** (Nicht-AK).
- **Kein separates Scrum-Board-Modul** — der gleiche Board-Code funktioniert für beide Methoden; die Methode entscheidet über die sichtbaren Kinds, nicht über das Layout.

## Konsequenzen

- Die Board-Ansicht ist sofort nutzbar für Scrum, Kanban, Waterfall und SAFe-Projekte.
- Statusänderungen sind vollständig audit-nachvollziehbar; Undo funktioniert über `/api/v1/audit/{id}/undo`.
- EP-05-ST-03 Scrum-Sprint-Bezug bleibt als explizite Lücke offen und braucht ein neues Ticket.
- EP-05-ST-04 Gantt-Grundstruktur ist weiterhin eine separate Story; das Board deckt die Zeitachse nicht ab.
