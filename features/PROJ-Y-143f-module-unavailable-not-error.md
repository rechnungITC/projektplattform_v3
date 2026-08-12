---
id: PROJ-Y-143f
title: "Deaktiviertes Modul ist ein Zustand, kein Fehler"
issue_type: Bug
epic_code: HYGIENE
epic_title: "Hygiene & Supply-Chain"
priority: Medium
priority_source: "Should"
labels: ["hygiene", "ui", "ux"]
dependencies: ["PROJ-64", "PROJ-51", "PROJ-Y-143d"]
roles: ["Platform"]
summary_for_jira: "[HYGIENE] 404 eines deaktivierten Moduls nicht als roten Fehler rendern"
---

# PROJ-Y-143f: deaktiviertes Modul ist ein Zustand, kein Fehler

## Status: Deployed
## Deployment Scope: full
**Created:** 2026-08-11
**Deployed:** 2026-08-12 — Tag `v2.52.0-PROJ-Y-143f`
**Origin:** Fund F-2 aus PROJ-Y-143d, aufgedeckt durch den 720-px-Selbsttest.

## Die Ausgangsfrage war falsch gestellt

Die Spec fragte: „liefert die API berechtigt 404 (dann muss die UI das als *nichts vorhanden*
rendern) oder ist der 404 selbst der Fehler?" Die Untersuchung ergibt: **weder noch.**

Der 404 kommt aus `requireModuleActive` (`src/lib/tenant-settings/server.ts:66`) und ist
bewusst generisch — bei Lese-Absicht wird 404 statt 403 geantwortet, um nicht zu verraten,
dass es die Fläche gibt. Er ist also korrektes Verhalten für ein **deaktiviertes Modul**.
Live belegt:

| Mandant | aktive Module |
|---|---|
| IT-Couch GmbH (Produktiv) | 11, inkl. `resources` und `output_rendering` |
| `[E2E]` (aus PROJ-143) | **4** — genau diese beiden fehlen |

Und die naheliegende Reparatur — „als Leerzustand rendern" — wäre ebenfalls falsch gewesen:
PROJ-64 hat das für das Dashboard bereits entschieden (`DashboardSectionUnavailable`, AC-9:
*„never imply green/safe"*). „Keine Ressourcen vorhanden" würde behaupten, die Liste sei leer,
obwohl wir gar nicht nachsehen durften.

Also braucht es einen **dritten Zustand** zwischen Fehler und Leere.

## Umsetzung

Neue `ModuleUnavailableNotice` (neutral, Schloss-Symbol, kein `destructive`), gespeist aus
einem neuen `unavailable`-Feld der beiden Hooks:

| Fläche | vorher | nachher |
|---|---|---|
| `/stammdaten/resources` | rotes **„Resource not found."** an der Stelle der Liste | „Das Modul „Ressourcen" ist für diesen Workspace nicht aktiv." + Admin-Hinweis |
| Projektraum → Reports | rotes „Snapshots konnten nicht geladen werden: HTTP 404" | „Reports sind für dieses Projekt nicht verfügbar." |

Zusätzlich werden die Aktionen ausgeblendet, die in diesem Zustand nur eine Fehlermeldung
erzeugen könnten (Anlegen-Button bzw. „Snapshot erzeugen" — der `POST` antwortet mit 403).

**Die Wortwahl richtet sich danach, was die Aufrufstelle wirklich wissen kann.** Die
Ressourcen-Liste hat genau einen 404-Pfad (das Modul-Tor), dort darf der Grund benannt werden.
Die Snapshot-Route hat zwei (`requireProjectAccess` **und** das Modul-Tor), dort nennt der Text
nur die Verfügbarkeit — keine Behauptung über den Grund.

**Die API bleibt unangetastet.** Beide Pfade antworten mit dem Code `not_found`; sie
unterscheidbar zu machen hieße, den Grund an jeden Aufrufer zu verraten — genau das, was der
404 verhindern soll. Auf Nachrichtentexte zu prüfen wäre das Anti-Muster aus der
PROJ-77-α-Abnahme. Stattdessen trägt der Client-Wrapper jetzt den **Status** mit
(`ApiRequestError`, neu in `src/lib/api-error.ts`) — bisher warf er nur die Nachricht und
verwarf den Status, was dieselbe Abnahme bereits als Followup notiert hatte.

## Was die Slice sonst noch aufgedeckt hat

### F-1 (hoch, in der Slice behoben) — eine fremde Session hat alle sieben Baselines gekippt

Mitten in der Arbeit wurden **sieben** Visual-Baselines rot, ~1.038 px je Bild. Ursache war
nicht diese Änderung: eine Parallel-Slice hat den **geteilten** E2E-Nutzer um 12:36 UTC als
Admin in einen zweiten Mandanten (`[E2E] Assistant Test`) aufgenommen. `tenant-switcher.tsx:34`
rendert unterhalb von zwei Mitgliedschaften ein Label und ab zwei einen Dropdown-**Button** mit
Chevron — der Mandantenname steht im Sidebar-Fuß, also auf jeder authentifizierten Seite.

Nicht durch Löschen fremder Testdaten behoben, sondern strukturell, zweifach:

1. **`global-setup` pinnt den aktiven Mandanten** über das `active_tenant_id`-Cookie. Ohne
   Cookie fällt `use-auth.tsx` auf `memberships[0]` zurück — die Suite hing damit an der
   *Reihenfolge* von Mitgliedschaften.
2. **Der Mandanten-Umschalter wird in allen sieben Aufnahmen maskiert.** Das eingefrorene
   Gegenteil wäre schlechter: die Baselines hingen dann daran, dass der fremde Mandant
   weiterexistiert.

### F-2 (mittel, in der Slice gefangen) — eine Baseline gegen veralteten Code

Beim Neuziehen enthielt die frisch geschriebene `stammdaten-resources.png` noch den **alten**
Zustand (roter Fehler + Anlegen-Button), obwohl der Code bereits geändert war — der Dev-Server
hatte die Änderung für diesen Worker noch nicht übernommen. Aufgefallen, weil die drei
Stabilitätsläufe danach **reproduzierbar** rot blieben und ich das Diff-Bild angesehen habe,
statt die Baseline zu akzeptieren. Neu gezogen nach `rm -rf .next` und **im Bild geprüft**.

Lehre, passend zur ganzen 143er-Reihe: eine frisch geschriebene Baseline ist kein Beweis. Sie
gehört angesehen — sonst friert man den Zustand ein, den man gerade beheben wollte.

### F-3 (niedrig, Followup) — die Navigation bewirbt Flächen, die das Tor verschließt

Der Projektraum kennt `requiresModule`-Gating für Tabs; das **Stammdaten-Kachelgitter filtert
gar nicht**. Die Kachel „Ressourcen" wird also unabhängig vom Modulzustand angeboten. Das ist
der Grund, warum ein „nicht aktiv"-Hinweis hier nichts verrät, was die Navigation nicht ohnehin
zeigt — und zugleich eine eigene Inkonsistenz → **PROJ-Y-143k**.

## Acceptance Criteria

- **AC-Y143f.1** — Kein roter Fehler mehr, wo ein Modul deaktiviert ist. ✅ beide Flächen live
  im `[E2E]`-Mandanten geprüft.
- **AC-Y143f.2** — Kein Leerzustand, der Vollständigkeit behauptet (PROJ-64 AC-9). ✅ eigener
  dritter Zustand.
- **AC-Y143f.3** — Aktionen, die im Zustand nur 403 erzeugen könnten, werden nicht angeboten. ✅
- **AC-Y143f.4** — Keine Regression im Positivfall. ✅ Module im Testmandanten kurz aktiviert:
  Liste + Anlegen-Button + **echter** Leerzustand („Keine Ressourcen. Lege eine an …"), Reports
  ohne Fehler; danach exakt auf den Ausgangswert zurückgesetzt.
- **AC-Y143f.5** — Echte Fehler bleiben Fehler. ✅ Unit-Test: 500 → `error`, nicht `unavailable`.
- **AC-Y143f.6** — Die API-Semantik ist unverändert. ✅ keine Route angefasst.
- **AC-Y143f.7** — Die Baselines zeigen den neuen Zustand, verifiziert statt angenommen. ✅

## Gates

vitest **2829/2829** (+7 neu) · ESLint **0** · tsc **13 = Baseline** · `npm run build` clean ·
Playwright chromium **3× 9/9** + Kaltstart **9/9**.

## Deviations

- **D-Y143f.1** — Kein CIA-Pass: Bugfix ohne Architekturänderung, keine neue Abhängigkeit
  (`.claude/rules/continuous-improvement.md`, „When CIA is NOT needed").
- **D-Y143f.2** — `ApiRequestError` wird nur dort eingeführt, wo diese Slice ihn braucht
  (`resources/api.ts`), nicht flächendeckend über alle Client-Wrapper.
- **D-Y143f.3** — Alle sieben Baselines neu gezogen. Ursache mehrheitlich fremd (F-1); die
  Höhen sind gegenüber vorher unverändert, nur `stammdaten-resources` ändert Inhalt.
- **D-Y143f.4** — Fremde Testdaten (zweiter Mandant) **nicht** gelöscht; eine Parallel-Session
  arbeitet damit.
- **D-Y143f.5** — Das lokal ergänzte Regelfeld „Deployment Scope" liegt weiterhin nicht auf
  `main`; hier vorwärtskompatibel als `full` gesetzt, die INDEX-Spalte bleibt der
  Portfolio-Migration überlassen.
- **D-Y143f.6** — Mobile Safari übersprungen (WebKit-Host-Libs, PROJ-67/F2).

## Followups

- **PROJ-Y-143k** (neu, aus F-3) — Stammdaten-Kachelgitter nach aktiven Modulen filtern,
  analog zum `requiresModule`-Gating im Projektraum.
- **PROJ-Y-143l** (neu, aus F-1) — der `[E2E]`-Nutzer ist geteilt: jede Slice, die einen
  eigenen Mandanten braucht, verändert damit den Kontostand aller anderen. Zu klären, ob
  Visual-Tests einen eigenen, ausschließlich ihnen gehörenden Nutzer bekommen.
- Offen aus der Reihe: **PROJ-Y-143c** (Alt-Mandant), **PROJ-Y-143e** (Sprachmix).
