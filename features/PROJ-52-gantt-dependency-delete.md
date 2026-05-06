# PROJ-52: Gantt — Abhängigkeiten löschen via Klick

## Status: Deployed (after manual Vercel redeploy)
**Created:** 2026-05-06
**Last Updated:** 2026-05-06

## Kontext

User-Befund (2026-05-06, ~02:30 lokal): „Abhängigkeiten in der Gantt-Ansicht können nicht wieder gelöscht werden."

Die Gantt-View (`src/components/phases/gantt-view.tsx`) erlaubt seit PROJ-25 das **Erstellen** polymorpher Dependencies per Drag (rechte Bar-Kante zur nächsten Bar ziehen → POST `/api/projects/[id]/dependencies`). Das **Löschen** dieser Pfeile war jedoch nicht möglich, weil die SVG-Pfade keine Click-Handler hatten — auch keine andere UI-Stelle (kein Kontextmenü, kein Detail-Drawer für Dependencies). Der Backend-Endpoint `DELETE /api/projects/[id]/dependencies/[did]` existierte zwar (PROJ-9, deployed), war aber aus dem Frontend nicht erreichbar.

Damit war die Gantt-Dependency-Funktion praktisch einseitig: anlegen ja, löschen nein → Pfeile häuften sich an, falsche Verknüpfungen ließen sich nur via DB direkt entfernen.

## Slice-Struktur

Reiner Hot-Fix-Slice, ein Commit, kein α/β/γ-Split nötig. Domain ist klar abgegrenzt (Gantt-View · Dependency-Edges). Schema unverändert.

## Dependencies

- Requires: **PROJ-9** (Work Item Metamodel, deployed) — `dependencies` Tabelle + DELETE-Endpoint
- Requires: **PROJ-25** (Drag-and-Drop Stack, Gantt half deployed) — Dependency-Anlage und Pfeil-Rendering im Gantt
- Requires: **PROJ-19** (Phases & Milestones, deployed) — Phase-zu-Phase-Edges
- Requires: **PROJ-7** (Project Room, deployed) — Edit-Permission-Modell, `canEdit`-Prop in der Gantt-View

## User Stories

1. **Als PM** möchte ich auf einen Dependency-Pfeil im Gantt klicken und die Verknüpfung über einen Bestätigungs-Dialog wieder entfernen können — damit ich falsch gezogene oder veraltete Abhängigkeiten ohne DB-Eingriff korrigieren kann.

2. **Als Read-only-Mitglied** möchte ich, dass mir das Löschen nicht angeboten wird (kein Cursor-Pointer, kein Click) — damit die UI nicht impliziert, ich könnte etwas verändern, was ich nicht darf.

3. **Als PM auf engem Display** möchte ich nicht den 1.5–2.5px-dünnen Pfeil exakt treffen müssen — der Klickbereich soll großzügig genug sein, dass ich ihn ohne Präzisions-Klick erwische.

## Acceptance Criteria

- [x] AC-1: Klick auf einen Dependency-Pfeil in der Gantt-View öffnet einen `window.confirm`-Dialog mit Text „Abhängigkeit „<constraint_type> <from_type> → <to_type>" löschen?".
- [x] AC-2: Nach Bestätigung wird `DELETE /api/projects/{id}/dependencies/{did}` aufgerufen und der Pfeil verschwindet nach erfolgreichem Refresh aus der Ansicht.
- [x] AC-3: Bei Fehlern (HTTP ≠ 2xx) wird ein Sonner-Toast mit der Server-Fehlermeldung angezeigt; der Pfeil bleibt sichtbar.
- [x] AC-4: Wenn `canEdit === false`, ist das `<g>`-Element nicht klickbar und zeigt keinen Pointer-Cursor.
- [x] AC-5: Der Klickbereich ist breiter als der sichtbare Pfeil (12px transparenter Hit-Path), sodass ein normaler Klick ausreicht; das visuelle Pfeil-Styling ist davon unberührt.
- [x] AC-6: Nach erfolgreichem Löschen wird `onChanged()` aufgerufen, sodass `dependencies`-State aus dem `useEffect` neu geladen wird.
- [x] AC-7: Tooltip (`<title>`-Element) bekommt im edit-Modus den Suffix „· klicken zum Löschen", damit die Affordance entdeckbar ist.
- [x] AC-8: Kein Schema-Change, keine Migration, keine neue Audit-Whitelist nötig.

## Edge Cases

- **EC-1: Klick während Drag** — Der Click-Handler ruft `e.stopPropagation()` auf, sodass ein laufender Drag nicht versehentlich beendet wird.
- **EC-2: Pfeil zu/von Element ohne Layout** (Phase ohne Datum, gelöschtes Work-Item) — Der Pfeil wird vorher per `barLayout`-Lookup gefiltert und gar nicht gerendert; somit gibt's kein klickbares Geist-Element.
- **EC-3: User cancelt Confirm-Dialog** — kein API-Call, kein State-Change.
- **EC-4: 404 (Dependency wurde parallel von anderem User gelöscht)** — Toast mit Fehlertext; nächstes `onChanged()` synchronisiert die Sicht.
- **EC-5: Nicht-Editor versucht via DevTools Klick zu erzwingen** — Click-Handler ist nicht installiert (`onClick` nur im edit-Modus); selbst wenn DOM manuell manipuliert: RLS auf `dependencies` lehnt das DELETE serverseitig mit 42501 → 403 ab.
- **EC-6: Critical-Path-Pfeil löschen** — keine Sonderbehandlung; das Critical-Path-Highlighting wird via `compute_critical_path_phases` neu berechnet, sobald `phases` und `dependencies` reloaded sind.

## Technical Requirements

- **Frontend only:** keine API-Änderung, kein Schema-Change.
- **Datei:** `src/components/phases/gantt-view.tsx` — neuer `handleDeleteDependency`-Callback (`useCallback`-stabilisiert) plus aktualisiertes `<g key="dep-…">` mit Click-Handler und transparentem Hit-Path.
- **UX:** `window.confirm` für MVP — bewusst kein Custom-Modal, weil der Aufwand nicht gerechtfertigt ist und das System-Confirm Tastatur-Cancel via Escape unterstützt.
- **Refresh:** `onChanged()`-Callback existiert bereits und wird von der Page-Component (`planung-client.tsx`) zu `refreshAll` verdrahtet → kein neuer State-Sync nötig.

## Out-of-Scope

- **Multi-Select / Bulk-Delete von Dependencies** — nicht angefragt; einzelnes Klick-Löschen reicht für MVP.
- **Custom-Modal mit Animation** — `window.confirm` genügt für die Use-Case-Häufigkeit (selten, einmalige Aktion).
- **Inline-Edit der `constraint_type`** (FS → SS / FF / SF) — separate Story, falls überhaupt benötigt.
- **Right-Click Context-Menü** — wäre Pattern-Bruch in der Codebase, die ausschließlich Left-Click + Confirm verwendet.

## V2 Reference Material

- Keine direkte V2-Entsprechung. V2 hatte keine SVG-Gantt-View; Dependency-Pflege erfolgte in V2 ausschließlich über Tabellen-Edit-Forms.

## Implementation Notes (2026-05-06)

**Geändert:** `src/components/phases/gantt-view.tsx`
- Neuer Callback `handleDeleteDependency(depId, label)` mit `useCallback` (Deps: `canEdit`, `projectId`, `onChanged`).
- `<g key={\`dep-${dep.id}\`}>` erweitert um:
  - `className={canEdit ? "cursor-pointer" : undefined}`
  - `onClick={canEdit ? (e) => { e.stopPropagation(); void handleDeleteDependency(...) } : undefined}`
  - Zusätzlicher transparenter `<path>` mit `strokeWidth={12}` und `pointerEvents={canEdit ? "stroke" : "none"}` als Hit-Area
  - Originaler sichtbarer `<path>` bekommt `pointerEvents="none"`, damit der Hit-Area-Path den Click empfängt
  - `<title>`-Suffix „· klicken zum Löschen" im edit-Modus

**Verifikation:**
- `npx tsc --noEmit` → 0 Fehler in `gantt-view.tsx`
- `npx eslint src/components/phases/gantt-view.tsx` → 0 Findings
- Live-Test (vom User bestätigt nach Vercel-Redeploy via `295c740`)

**Deploy-Trace:**
- Commit `295c740` (push 2026-05-06)
- Vercel-Auto-Webhook ist seit Repo-Transfer kaputt → Manual-Redeploy notwendig (siehe Folge-Item).

## Bekannte Folge-Items (out-of-scope, separat zu tracken)

1. **Vercel-Webhook-Reconnect** — Das Repo-Transfer-Issue blockiert Auto-Deploys. Entweder Settings → Git → Disconnect+Reconnect oder GitHub-Webhook-Verification.
2. **PROJ-25b Auflage B + C** — Playwright-E2E + Performance-Bench + Mikro-Cleanups, weiterhin offen.
3. **PROJ-43-β + γ** — Sprint-Pfad und Computed-Critical-Path, in Spec dokumentiert, deferred.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_Trivial UI-Hot-Fix, kein eigener Architektur-Pass nötig — Design ist im AC + Implementation Notes dokumentiert._

## QA Test Results
_Manuell verifiziert vom User nach Live-Deploy 2026-05-06. Keine automatisierten Tests, weil die Gantt-View aktuell noch keine Test-Coverage besitzt (siehe PROJ-25b Auflage B-Folge)._

## Deployment
- Commit: `295c740`
- Branch: `main`
- Vercel-Build: durch manuellen Redeploy ausgelöst (Webhook seit Repo-Transfer offline)
- Domain: `projektplattform-v3.vercel.app`
- Verifikation: User-bestätigt 2026-05-06
