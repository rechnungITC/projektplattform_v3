---
id: PROJ-Y-143e
title: "Sprachmix im Dashboard und in der Projektliste"
issue_type: Bug
epic_code: HYGIENE
epic_title: "Hygiene & Supply-Chain"
priority: Medium
priority_source: "Should"
labels: ["hygiene", "ui", "ux", "i18n"]
dependencies: ["PROJ-64", "PROJ-51", "PROJ-Y-143h"]
roles: ["Platform"]
summary_for_jira: "[HYGIENE] Dashboard + Projektliste auf Deutsch vereinheitlichen"
---

# PROJ-Y-143e: Sprachmix im Dashboard und in der Projektliste

## Status: Deployed
## Deployment Scope: full
**Created:** 2026-08-11
**Deployed:** 2026-08-12 — Tag `v2.53.0-PROJ-Y-143e`
**Origin:** Funde C-3/C-4 aus PROJ-Y-143b.

## Befund

Der Sprachmix war kein Schönheitsfehler, sondern in **einer Datei** widersprüchlich:
`src/types/dashboard.ts` führt `MY_WORK_FILTER_LABELS` auf Deutsch („Alle", „Überfällig",
„Bald fällig") und direkt darüber `DASHBOARD_PRESET_LABELS` auf Englisch. Im Dashboard stand
„Aktuelle Reports" neben „My Work" und „Alerts", und der Reiter „Approvals" direkt neben dem
Panel „Genehmigungen" — dasselbe Konzept zweisprachig. Die Projektliste war vollständig
englisch bei deutscher Navigation. Zusätzlich behauptet die Tenant-Einstellungsseite, die
Oberfläche sei „heute fest auf Deutsch".

## Entscheidungen (vom Nutzer gelockt)

- **Umfang:** Dashboard + Projektliste. Einstellungen, Stammdaten-Reste, Auth-Formulare und
  Detail-Dialoge bleiben bewusst außen vor → **PROJ-Y-143m**.
- **Namen:** deutsch übersetzen; die **internen Schlüssel** (`my_work`, `project_health`,
  `approvals`) bleiben unberührt, ebenso die Spec-Begriffe aus PROJ-64.

| | vorher | nachher |
|---|---|---|
| Reiter | My Work · Project Health · Approvals | Meine Aufgaben · Projekt-Health · Genehmigungen |
| Panels | My Work · Project Health · Alerts | Meine Aufgaben · Projekt-Health · Warnungen |
| Zähler | „4 Items" | „4 Einträge" |
| Projektliste | Projects · New project · Filters · All statuses/types/members · Responsible · Updated · No projects yet · Previous/Next | durchgängig deutsch |

**C-4 (Umbruch) behoben:** „Projekt-Health" stand zweizeilig neben „1 von 2 Projekten". Ursache
war der `justify-between`-Header, in dem Titel und Zähler um die schmale Spalte konkurrieren.
Jetzt bricht der **Header als Ganzes** um (`flex-wrap` + `whitespace-nowrap` auf beiden
Kindern), statt Wörter zu zerreißen.

**Bewusst englisch geblieben:** die Schnellaktion „Work Item" — das ist der etablierte
Domänenbegriff des Produkts (`work_items`, PROJ-9 „Work Item Metamodel"), keine Beschriftung.

## Was die Umsetzung zusätzlich aufgedeckt hat

### F-1 (mittel, echter Produktfehler, hier behoben)

`approval-inbox-panel.tsx` keyte seine Zeilen mit `key={item.approver_id}`. Dieses Panel listet
die Entscheidungen, die auf **mich** warten — `approver_id` ist also in *jeder* Zeile derselbe
Wert. Jeder Nutzer mit zwei offenen Genehmigungen erzeugte damit doppelte React-Keys; React
warnt ausdrücklich, dass Kinder dabei „duplicated and/or omitted" werden können. Nie
aufgefallen, weil der `[E2E]`-Mandant keine Genehmigungen hat — die **gepinnte
Zwei-Zeilen-Fixture aus PROJ-Y-143h** hat es sichtbar gemacht. Korrekt ist `decision_id`.

Sichtbar wurde es als rotes **„2 Issues"**-Abzeichen des Next-Dev-Overlays, das beim Neuziehen
**in die Dashboard-Baseline gewandert war**. Also derselbe Werkzeug-Chrome-Fehler wie F-1 in
PROJ-Y-143d — nur trug er diesmal ein echtes Signal. Beides einzufrieren wäre falsch gewesen.

### Neuer Wächter: Laufzeitfehler brechen den Lauf

Damit so etwas nicht wieder stumm in ein Bild wandert, sammelt die Suite jetzt
`console.error` + `pageerror` und schlägt danach fehl. Zwei Anläufe, beide lehrreich:

1. **Erster Versuch** prüfte das Overlay-DOM (`nextjs-portal` + Text `/issue/i`) und war in der
   *anderen* Richtung nutzlos: er traf die immer vorhandene, unsichtbare Overlay-Struktur, also
   scheiterten **alle** Seiten bei blanker Konsole. Die Konsole zu beobachten ist enger und
   ehrlicher — sie beschreibt, was die App tut, nicht wie das Werkzeug rendert.
2. **Zweiter Versuch** war zu streng: Chromium protokolliert *jeden* Nicht-2xx als
   Konsolenfehler, also auch die **absichtlichen** Modul-Tor-404er aus PROJ-Y-143f. Ein Wächter,
   der bei korrektem Verhalten feuert, wird ignoriert — daher werden
   `Failed to load resource`-Meldungen ausgenommen. React-Fehler und unbehandelte Ausnahmen
   haben diese Form nie.

Rot-Grün belegt: mit wieder eingesetztem Fehler fängt der Wächter die zwei Duplicate-Key-Meldungen.

### F-2 (Korrektur meiner eigenen Aussage aus PROJ-Y-143d)

PROJ-Y-143d maskierte `table tbody` und behauptete, die **Kopfzeile** bleibe bewacht. Das ist
falsch: bei `table-layout: auto` werden die Spaltenbreiten aus dem **Rumpf** berechnet — ein
fremder Spec, der ein Projekt mit längerem Namen anlegt, verschiebt jede Kopf-Beschriftung
seitwärts. Der Test überlebte vier isolierte Läufe und fiel erst in der **vollen** Suite; das
Diff-Bild zeigte die Spaltentitel an zwei x-Positionen doppelt.

`table-layout: fixed` über das Screenshot-Stylesheet zu erzwingen hätte die Kopfzeile im Bild
gehalten — aber die Baseline würde dann ein Layout zeigen, das kein Nutzer je sieht. Die
ehrliche Wahl ist, die Kopfzeile aufzugeben: maskiert wird jetzt die **ganze** Tabelle. Bewacht
bleiben Shell, Sidebar, Seitenkopf und die Filter-Karte — Gegenprobe: „Filter" → „FilterZZ"
ergibt 94 px Diff und wird rot.

### Nebenbefund Messung — tsc log 2 statt 13

Ein Zwischenlauf meldete plötzlich **2** statt 13 Typfehler. Ursache war eine halb geschriebene,
vom Dev-Server generierte `.next/dev/types/validator.ts`: tsc brach dort mit Parse-Fehlern ab
und erreichte die echten Dateien nie. **Weniger Fehler sah wie eine Verbesserung aus.** Vor
einer tsc-Messung `.next` entfernen.

## Acceptance Criteria

- **AC-Y143e.1** — Kein englischer Oberflächentext mehr auf Dashboard und Projektliste. ✅ live
  gegen eine Wortliste geprüft, beide Flächen `[]`.
- **AC-Y143e.2** — Interne Schlüssel und Spec-Begriffe unberührt. ✅
- **AC-Y143e.3** — Der „Project Health"-Umbruch ist weg. ✅ „1 von 2 Projekten" einzeilig.
- **AC-Y143e.4** — Baselines zeigen den neuen Zustand, im Bild geprüft. ✅
- **AC-Y143e.5** — Keine Regression in der übrigen Suite. ✅ Playwright chromium **401 passed**
  (2 vorbestehende Flakes, s. Deviations), vitest **2904/2904**.

## Gates

vitest **2904/2904** · ESLint **0** · tsc **13 = Baseline** · `npm run build` clean · Playwright
Visual **3× 9/9** + Kaltstart **9/9** · volle E2E-Suite **401 passed**.

## Deviations

- **D-Y143e.1** — Der Platzhalter „All members" liegt in der **geteilten**
  `responsible-user-picker`-Komponente; die Übersetzung erreicht damit auch andere Flächen (M&A-
  Aufgaben, Work-Item-Dialoge). Dort ist die Umgebung längst deutsch, der Effekt also
  konsistenzsteigernd.
- **D-Y143e.2** — F-1 (React-Key) ist Produktcode außerhalb der Sprach-Aufgabe. Nicht optional:
  ohne den Fix wäre das „2 Issues"-Abzeichen in die Baseline eingefroren.
- **D-Y143e.3** — Die Tabellen-Kopfzeile der Projektliste ist nicht mehr bewacht (F-2).
- **D-Y143e.4** — Zwei vorbestehende Flakes in der Voll-Suite: `PROJ-1-2-live-closure`
  (Supabase-`email rate limit exceeded`, dokumentiert in PROJ-78 F-4) und ein PROJ-98-Auth-Gate
  unter Parallel-Last (isoliert 8/8).
- **D-Y143e.5** — „Work Item" bleibt englisch (Domänenbegriff, s. o.).
- **D-Y143e.6** — Mobile Safari übersprungen (WebKit-Host-Libs, PROJ-67/F2).

## Followups

- **PROJ-Y-143m** (neu) — restliche englische Oberflächentexte: `/settings` („Settings",
  „Manage your profile, workspace, and team.", „Profile", „Password", „Save changes"),
  Stammdaten-Reste („Master data", „Danger zone"), Projektraum („Back to projects",
  „Move to trash") sowie Auth-/Signup-Formulare. Vom Nutzer bewusst aus dieser Slice
  herausgehalten.
- Offen aus der Reihe: **PROJ-Y-143c** (Alt-Mandant), **PROJ-Y-143k** (Modul-Gating der
  Stammdaten-Kacheln), **PROJ-Y-143l** (eigener Visual-Test-Nutzer).
