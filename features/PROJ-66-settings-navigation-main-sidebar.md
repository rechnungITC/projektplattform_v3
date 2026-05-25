# PROJ-66: Settings Navigation in der linken Main Sidebar vereinheitlichen

## Status: Deployed
**Created:** 2026-05-23
**Last Updated:** 2026-05-25

## Summary
Aktuell werden die Einstellungen sowohl links in der Main Sidebar als auch rechts daneben erneut angezeigt. Diese doppelte Darstellung soll entfernt werden. Alle Einstellungsfunktionen werden einheitlich in der linken Main Sidebar gebuendelt.

Zusaetzlich wird der Bereich "Project Trash" aus der rechten Sidebar entfernt und als eigener Navigationspunkt in die linke Main Sidebar verschoben. Die rechte Sidebar bleibt damit auf kontextbezogene Inhalte beschraenkt und enthaelt keine globale Hauptnavigation mehr.

## Goal
Die Navigation soll konsistent, eindeutig und wartbar sein. Globale Navigationspunkte wie Settings und Project Trash duerfen nicht zwischen linker Main Sidebar und rechter Zusatz-Sidebar dupliziert werden.

## User Story
Als Nutzer moechte ich die Einstellungen ausschliesslich in der linken Main Sidebar finden, damit die Navigation eindeutig, konsistent und ohne doppelte Menueeintraege nutzbar ist.

## Acceptance Criteria

### AC-1: Settings nur in der linken Main Sidebar
- [ ] Der Menuepunkt "Settings" wird nur noch in der linken Main Sidebar angezeigt.
- [ ] Die doppelte Anzeige der Einstellungen rechts daneben ist vollstaendig entfernt.
- [ ] Bestehende Settings-Routen, Berechtigungen und Funktionen bleiben erhalten.
- [ ] Der aktive Settings-Menueeintrag wird in der linken Main Sidebar korrekt hervorgehoben.

### AC-2: Project Trash in die linke Main Sidebar verschieben
- [ ] "Project Trash" wird aus der rechten Sidebar entfernt.
- [ ] "Project Trash" wird als eigener Navigationspunkt in der linken Main Sidebar angezeigt.
- [ ] Bestehende Project-Trash-Routen, Berechtigungen und Funktionen bleiben erhalten.
- [ ] Der aktive Project-Trash-Menueeintrag wird in der linken Main Sidebar korrekt hervorgehoben.

### AC-3: Keine doppelte Hauptnavigation
- [ ] Es entstehen keine doppelten Navigationspunkte.
- [ ] Die rechte Sidebar enthaelt nur noch kontextbezogene Inhalte und keine globale Hauptnavigation.
- [ ] Settings darf nicht gleichzeitig links und rechts angezeigt werden.
- [ ] Project Trash darf nicht weiterhin in der rechten Sidebar als Hauptnavigation sichtbar sein.

### AC-4: Regression-Schutz
- [ ] Die Aenderung entfernt keine bestehenden Settings-Funktionen.
- [ ] Die Aenderung entfernt keine bestehenden Project-Trash-Funktionen.
- [ ] Es wird keine neue zweite Navigationslogik aufgebaut.
- [ ] Bestehende Tests werden angepasst oder ergaenzt.
- [ ] Desktop- und responsive Darstellung werden geprueft.

## Definition of Ready
- [ ] Bestehende Sidebar-Komponenten sind identifiziert.
- [ ] Settings-Route und Project-Trash-Route sind bekannt.
- [ ] Rechte Sidebar-Komponente ist identifiziert.
- [ ] Berechtigungslogik fuer Settings und Project Trash ist bekannt.
- [ ] Erwartetes Navigationsverhalten ist geklaert.

## Definition of Done
- [ ] Settings ist ausschliesslich in der linken Main Sidebar sichtbar.
- [ ] Project Trash ist in die linke Main Sidebar integriert.
- [ ] Rechte Sidebar ist bereinigt.
- [ ] Navigation funktioniert ohne Routing-Regression.
- [ ] Aktive Zustaende werden korrekt dargestellt.
- [ ] Bestehende Tests wurden angepasst oder ergaenzt.
- [ ] UI wurde auf Desktop und responsive Darstellung geprueft.

## Dependencies
- Requires: PROJ-4 (Platform Foundation - Navigation, Project Roles, RBAC Enforcement)
- Requires: PROJ-23 (Globale Sidebar-Navigation)
- Main Sidebar Component
- Right Sidebar Component
- Settings Route
- Project Trash Route
- Permission / Role Visibility Logic
- Navigation State Handling

## Risks
- Doppelte Navigation bleibt durch versteckte Komponenten erhalten.
- Rechte Sidebar wird an anderer Stelle erneut mit Settings gerendert.
- Berechtigungen fuer Project Trash werden beim Verschieben nicht korrekt uebernommen.
- Mobile Navigation uebernimmt alte Struktur.
- Aktive Navigationserkennung unterscheidet Settings und Project Trash nicht sauber.

## Technical Notes
- Settings und Project Trash sind als globale Navigationselemente zu behandeln.
- Die rechte Sidebar soll nur kontextuelle Inhalte enthalten.
- Navigationseintraege sollten moeglichst aus einer zentralen Navigationskonfiguration gerendert werden.
- Vor Umsetzung pruefen, ob Settings aktuell mehrfach ueber verschiedene Komponenten eingebunden wird.
- Falls eine zentrale Navigation-Config existiert, sollen beide Eintraege dort gepflegt werden.
- Project Trash muss die bestehende Berechtigungslogik unveraendert uebernehmen.

## Out of Scope
- Keine neue Settings-Informationsarchitektur.
- Kein Redesign der Sidebar-Optik ausser der notwendigen Navigationsbereinigung.
- Keine Aenderung an Datenmodell, RLS oder Project-Trash-Lifecycle.
- Keine neue zweite Navigationskonfiguration.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Scope-Entscheidung
PROJ-66 ist eine Frontend-Navigationsbereinigung. Es werden keine neuen Daten, keine neuen API-Endpunkte und keine neue Berechtigungslogik benoetigt.

### Komponentenstruktur
```text
AppShell
+-- GlobalSidebar
|   +-- Projekte
|   +-- Genehmigungen
|   +-- Stammdaten
|   +-- Konnektoren (admin-only)
|   +-- Reports
|   +-- Einstellungen
|       +-- Profil
|       +-- Workspace (admin-only)
|       +-- Tagessaetze (admin-only)
|       +-- FX-Raten (admin-only)
|       +-- Risk-Score (admin-only)
|       +-- AI-Provider (admin-only)
|       +-- Mitglieder
|       +-- Project Trash (admin-only)
+-- Page Content
```

Die bisherige Settings-Zusatznavigation rechts neben der Main Sidebar wird entfernt. Project-Room-Sidebars bleiben fuer projektbezogene Inhalte erhalten, rendern aber keinen generischen "Einstellungen"-Hauptpunkt mehr.

### Datenmodell
Keine Datenmodellaenderung. Project Trash nutzt weiterhin die bestehende Route `/settings/projects-trash`, den bestehenden `useProjects({ includeDeleted: true })`-Pfad und die bestehende Admin-Pruefung in der Page.

### Tech Decisions
- `GlobalSidebar` bleibt die zentrale Navigationsquelle.
- `Project Trash` wird als admin-only Unterpunkt von `Einstellungen` in der Main Sidebar gefuehrt.
- Settings bleibt ein kollabierbarer Hauptpunkt in der Main Sidebar und ist auch auf `/settings/projects-trash` aktiv, damit der Unterpunkt sichtbar und korrekt eingeordnet ist.
- Die rechte Settings-Tabs-Komponente wird entfernt, statt nur visuell versteckt, damit keine zweite Navigationslogik verbleibt.

### Dependencies
Keine neuen Packages.

## Backend Notes
Backend-Scope geprueft: keine Migration, kein API-Endpunkt und keine RLS-Aenderung notwendig. Die bestehenden Project-Trash-Funktionen bleiben unveraendert.

## Frontend Implementation Notes
- `src/components/app/global-sidebar.tsx`: Project Trash als admin-only Unterpunkt von Einstellungen in der Main Sidebar gefuehrt; Settings ist auf Project-Trash-Routen aktiv.
- `src/app/(app)/settings/layout.tsx`: rechte Settings-Navigation entfernt, Content rendert einspaltig neben der Main Sidebar.
- `src/app/(app)/settings/settings-tabs.tsx`: geloescht, da nicht mehr importiert und keine zweite Settings-Navigation bestehen bleiben soll.
- `src/components/projects/soft-delete-confirm-dialog.tsx`: Hinweistext auf den neuen Main-Sidebar-Ort von Project Trash aktualisiert.

## Verification Notes
- Manuelle Code-Suche bestaetigt: `SettingsTabs` wird nicht mehr importiert.
- Manuelle Code-Suche bestaetigt: `Project Trash` ist in `GlobalSidebar` unter Einstellungen vorhanden und aus der rechten Settings-Navigation entfernt.
- `git diff --check`: gruen.
- Gezieltes ESLint fuer global-sidebar.tsx, soft-delete-confirm-dialog.tsx und settings/layout.tsx: gruen.
- `npm run build`: gruen.
- GitNexus-MCP war in dieser Sitzung nicht geladen; `npx gitnexus status` schlug beim Paketstart fehl. `timeout 45s npx gitnexus detect-changes` lief in ein Timeout, daher konnte Detect-Changes nicht abgeschlossen werden.
