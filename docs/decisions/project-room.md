> **Inherited from V2** — Decision still applies to V3. Stack-specific references (FastAPI, Redis, etc.) are historical; Supabase/Next.js V3 implementations follow the same principle.

# Decision Record — Projektraum-Grundgerüst

**EP-05-ST-01 / PP-87** · Stand: 2026-04-23

---

## Kontext

EP-05-ST-01 verlangt, dass nach Projektanlage automatisch ein Projektraum existiert — eine projektbezogene Arbeitsumgebung mit mindestens **Übersicht**, **Struktur/Backlog** und **Einstellungen**, nur für berechtigte Nutzer sichtbar.

## Entscheidung

### Der Projektraum ist die Detailseite

Es gibt **kein separates Projektraum-Objekt** in der DB. Der Raum entsteht implizit, sobald ein Projekt existiert: die Route `apps/web/app/projects/[id]/page.tsx` ist der Projektraum. Das hält das Datenmodell schlank und vermeidet künstliche 1:1-Objekte.

### Tab-Layout deckt die AK-Bereiche ab

| AK-Bereich | Tab | Inhalt |
|---|---|---|
| Übersicht | `Übersicht` | Stammdaten, Statusverlauf |
| Struktur/Backlog | `Planung` + `Backlog` | Phasen/Meilensteine (klassisch) + Work-Items mit Board-/Liste-Umschalter |
| Einstellungen | `Einstellungen` | Lifecycle-Aktionen, Projekttyp, Projekt-Kontext (ID, Timestamps, Methode) |
| (bonus) | `Stakeholder` | EP-06-Umsetzung |
| (bonus) | `Mitglieder` | EP-02-ST-03 RBAC |
| (bonus) | `Historie` | EP-08 Audit mit Compare + Undo |

Tab-Navigation ist URL-gebunden (`?tab=…`) — ein Tab-Kontext ist teil-/bookmarkbar.

### Sichtbarkeit

Zugriff auf den Raum läuft über die bestehenden RBAC-Checks:
- Cross-Tenant → 404 (kein Existenz-Leak).
- Kein Projektzugriff → 403 auf der Detailroute (durch `_require_read` im `projects`-Router).
- Lese- vs. Schreibrecht gating die Aktionen innerhalb der Tabs (keine „Rückgängig"-Buttons für Viewer, kein „Bearbeiten" für Nicht-Editor, etc.).

### Was bewusst **nicht** passiert

- **Keine fachlichen Module** als eigene Entität (Nicht-AK).
- **Keine KI-Vorschläge** (Nicht-AK — kommt in EP-10-ST-03).
- **Keine externen Integrationen** (Nicht-AK — EP-12).
- **Keine Löschaktion im Raum**. Archivieren / Löschen ist Tenant-Admin-Sache und wird in einer Folge-Story über einen Audit-nachvollziehbaren Endpunkt erledigt.

## Konsequenzen

- Neue Bereiche landen als Tabs, nicht als separate Seiten. Das hält das Mentalmodell stabil: ein Projekt = ein Raum = ein URL-Baum.
- EP-05-ST-02/03 (Kanban/Scrum-Board) und EP-05-ST-04 (Gantt) werden als weitere Sichten des Backlog-/Planung-Tabs eingebaut, nicht als eigene Tabs mit Fachlogik.
- EP-04-ST-04 (Regelwerk) kann bestimmen, welche Tabs für ein Projekt aktiv sind — im Moment sind alle Tabs generisch sichtbar; Modul-Aktivierung folgt nach.

## Offene Punkte

- „Einstellungen" kann bei wachsender Funktionalität (Retention-Fristen, Modulaktivierung, Export) in mehrere Unter-Sektionen aufgeteilt werden. Aktuell reicht eine Karte.
