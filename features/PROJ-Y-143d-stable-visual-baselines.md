---
id: PROJ-Y-143d
title: "projects-list + project-room Visual-Baselines deterministisch wieder aktivieren"
issue_type: Chore
epic_code: HYGIENE
epic_title: "Hygiene & Supply-Chain"
priority: Medium
priority_source: "Should"
labels: ["hygiene", "testing", "ui"]
dependencies: ["PROJ-Y-143b", "PROJ-51", "PROJ-143"]
roles: ["Platform"]
summary_for_jira: "[HYGIENE] Visual-Regression: zwei stillgelegte Baselines deterministisch reaktivieren"
---

# PROJ-Y-143d: deterministische Baselines für datentragende Seiten

## Status: Deployed
**Created:** 2026-08-11
**Deployed:** 2026-08-12 — Tag `v2.47.0-PROJ-Y-143d`
**Origin:** Followup aus PROJ-Y-143b (C-1/C-2).

## Problem

PROJ-Y-143b hat `projects-list` und `project-room` auf `test.fixme` gesetzt. Ihre committeten
Baselines waren **1280 × 720** — exakt Viewport-Höhe, also `fullPage`-Aufnahmen noch nicht
gewachsener Seiten; `projects-list` zeigte fünf Skeleton-Zeilen statt der Projekttabelle. Beide
Tests waren grün und verglichen eine Ladeanimation.

Ein bloßes Neuaufnehmen war ausgeschlossen: der geladene Zustand ist auf diesen Seiten
strukturell nicht einfrierbar (relative Zeitstempel, wachsende Zeilenzahl). Die
Wiederinbetriebnahme brauchte deshalb eine **Coverage-Entscheidung**, keine neue Aufnahme.

## Entscheidung: feste Viewport-Höhe + gezielte Maske

Statt Toleranzen hochzudrehen, wird die Nichtdeterminiertheit **strukturell** entfernt.

| Seite | Maßnahme | Begründung |
|---|---|---|
| `projects-list` | `fullPage: false` + `mask: [table tbody]` | Höhe kann nicht mit der Zeilenzahl driften; die volatilen Zellen (`formatRelative(updated_at)` → „just now" / „10m ago", `projects-table.tsx:129`) liegen unter der Maske |
| `project-room` | `fullPage: false` | Die volatilen Teile — absoluter `CREATED`-Zeitstempel, Master-data-Block — liegen **unterhalb** der Falz; alles darüber leitet sich aus dem Fixed-UUID-Seed-Projekt ab |

**Was weiter bewacht wird:** Shell, Sidebar, Seitenkopf, Filter-Karte, Tabellen*kopf*, bei
`project-room` Titel/Lifecycle-Badges/Budget-Risiken-Health-Kacheln/Setup-Zähler.
**Was bewusst nicht:** die Zeileninhalte. Dieser Tausch ist der Punkt — vorher wurde
*überhaupt nichts* bewacht, während der Test grün aussah.

`720 px` ist hier **per Konstruktion korrekt** und nicht das Symptom eines verpassten Ladens.
Der Selbsttest aus AC-Y143b.7 („ein `fullPage`-Shot mit exakt 720 px ist verdächtig") gilt
weiterhin — für `fullPage`-Aufnahmen. Diese zwei sind explizit viewport-fixiert.

## Zwei Funde, die dabei aufgefallen sind

### F-1 (mittel, behoben) — der Next-Dev-Indikator steckte in **allen** sieben Baselines

Beim ersten Neuziehen tauchte unten links eine dunkle „Compiling …"-Pille im Bild auf. Die
Untersuchung zeigte: es ist nicht ein transienter Badge, sondern der **permanent gemountete
Next-Dev-Tools-Button** — im Ruhezustand der dunkle Kreis, den man leicht für einen
Nutzer-Avatar hält (genau das hatte ich in PROJ-Y-143b getan), unter Last die breite Pille.
Er lag damit in **jeder** authentifizierten Baseline, und seine Form wechselt je nach
Kompilierungsaktivität.

Warum nie etwas aufgefallen ist: die Fläche ist ~0,4 % eines 1280 × 720-Bildes und bleibt
damit unter `maxDiffPixelRatio: 0.02`. Der Unterschied hat also nie einen Lauf rot gemacht
und sich auch nie gemeldet — er hätte einfach für immer in den Bildern gesessen.

Drei Wege wurden **empirisch ausgeschlossen**, nicht vermutet:

1. `nextjs-portal { display: none !important }` im bestehenden `screenshot-stabilize.css` →
   Badge blieb sichtbar.
2. Warten auf sein Verschwinden über `locator("nextjs-portal").getByText(/compil/i)` → traf
   0 Elemente, lief also sofort durch.
3. Rekursives Durchsuchen **aller offenen** Shadow-Roots nach dem Text während einer kalten
   Kompilierung → `NOT_FOUND`.

Der Button liegt in einem **geschlossenen** Shadow-Root und ist damit für CSS, `mask` und
Text-Waits unerreichbar. Die Konfiguration ist der einzige Hebel:

- `next.config.ts` — `devIndicators: false`, **env-gated** über `PW_DISABLE_DEV_INDICATOR`
- `playwright.config.ts` — `webServer.env` setzt das Flag

Damit behalten Menschen bei `npm run dev` ihren Indikator; nur der von Playwright gestartete
Server verliert ihn. **Caveat:** bei `reuseExistingServer` wird ein per Hand gestarteter
Server unverändert weiterbenutzt und zeigt den Indikator weiter.

Nachgewiesen: derselbe Bildbereich trug vorher 3233 von 4200 dunklen Pixeln, danach 5.

### F-2 (Nebenbefund, registriert als PROJ-Y-143f) — zwei Baselines frieren einen **Fehler** ein

Der eigene 720-px-Selbsttest hat `stammdaten-resources` überprüft — ein `fullPage`-Shot mit
exakt 720 px. Ergebnis: die Seite zeigt an der Stelle der Ressourcenliste ein rotes
**„Resource not found."**. Kein Leerzustand, ein Fehler, seit PROJ-51 als Soll-UI eingefroren.
Der String stammt aus `src/lib/tenant-settings/server.ts:66`
(`apiError("not_found", …, 404)`), ist also ein **Tenant-Settings**-404, das die Seite als
roten Fehler ausgibt.

Dieselbe Signatur im Projektraum: der Reports-Block zeigt „Snapshots konnten nicht geladen
werden: HTTP 404" (`snapshot-list.tsx:36`, gefüttert aus `use-snapshots.ts` → `HTTP ${status}`),
während das Dashboard für dieselbe Domäne einen sauberen Leerzustand („Noch keine Snapshots")
rendert. Zwei Flächen, die 404 als Fehler statt als „nichts vorhanden" behandeln.

Beide Baselines wurden **nicht** kosmetisch geglättet — sie zeigen den Ist-Zustand. Wird
PROJ-Y-143f behoben, müssen sie im geladenen Zustand neu aufgenommen werden.

## Nebenbefund zum Werkzeug: `--update-snapshots` ist kein verlässliches Neuziehen

Ein Zwischenschritt lief ins Leere: nach der Config-Änderung wurde mit `--update-snapshots`
neu gezogen, und die Bilddatei war **byte-identisch in der Badge-Region** (3233 dunkle Pixel
wie vorher). Ursache: Playwright schreibt die Baseline nur bei einer Abweichung **über** der
Toleranz neu. Da der Dev-Button darunter liegt, war das „Re-Baseline" ein stiller No-op.

Verlässlich neu ziehen heißt: **Baseline-Dateien löschen**, dann aufnehmen. Das ist derselbe
Mechanismus, über den Werkzeug-Zustand überhaupt in Bildern überdauert, und gehört zur
AC-Y143b.7-Regel dazu.

## Abnahme auf gemergtem `main` (2026-08-12) — und was sie noch gefunden hat

Der Merge (`cb28ecd`, #332) wurde in einer frischen Worktree von `origin/main` nachgeprüft,
mit leerem `.next`. Volle authentifizierte Suite **7/7 grün**.

Grün allein ist bei genau diesen Tests aber kein Beweis — das war der Ausgangsbefund der
ganzen 143er-Reihe. Also eine **Rot-Grün-Gegenprobe**, ob die zwei reaktivierten Aufnahmen
überhaupt etwas vergleichen:

| Kontrollfall (temporär injiziert) | Diff | Ergebnis |
|---|---|---|
| Tabellenkopfzeile der Projektliste rot eingefärbt | 45.394 px (5 %) | **rot** → Kopfzeile wird trotz `tbody`-Maske verglichen |
| „Projekt-Setup"-Karte im Projektraum rot eingefärbt | 113.214 px (13 %) | **rot** → Karte liegt oberhalb der Falz und wird verglichen |

Beide Regionen sind also echt bewacht. Danach zurückgebaut, Suite wieder grün.

### F-3 (in der Abnahme gefunden und behoben) — die Toleranz war ~440× zu grob

Der **erste** Kontrollfall war kleiner gewählt: „Name" → „NameZZ" im Tabellenkopf und
„Projekt-Setup" → „Projekt-SetupZZ" im Projektraum. Beide Tests blieben **grün**. Ursache ist
nicht die Aufnahme, sondern die von PROJ-51 geerbte Toleranz: `maxDiffPixelRatio: 0.02` sind
auf 1280 × 720 rund **18.400 Pixel**. Gemessen statt geschätzt:

| Größe | gemessen |
|---|---|
| Lauf-zu-Lauf-Rauschen (4 Läufe bei Toleranz 0) | **0 px** |
| Umbenannte Tabellen-Spaltenüberschrift | **42 px** |
| Zwei Zeichen mehr im Karten-Titel | **97 px** |
| erlaubt durch `0.02` / `0.03` | ~18.400 / ~27.600 px |

Damit hätte eine umbenannte Spalte, ein vertauschtes Label oder ein falscher Status-Text die
Tests **nie** rot gemacht. Es ist exakt derselbe blinde Fleck, durch den in dieser Slice schon
der Next-Dev-Indikator (F-1, ~0,4 %) unbemerkt in **allen sieben** Bildern saß — dort als
Zufallsfund, hier als Systemeigenschaft benannt.

Behoben, wo es jetzt belegbar tragfähig ist: die beiden viewport-fixierten Aufnahmen bekommen
eine **absolute** Schranke `maxDiffPixels: 20` statt der Verhältnis-Toleranz. Der Wert liegt
zwischen gemessenem Rauschen (0) und kleinster echter Änderung (42) — er ist wählbar, *weil*
die Aufnahme jetzt deterministisch ist; vor dieser Slice wäre er unmöglich gewesen. Gegenprobe:
derselbe Zwei-Zeichen-Wechsel, der bei `0.02` grün blieb, ist bei `20` rot (42 px bzw. 97 px).

Die Formulierung „Was weiter bewacht wird: … Tabellenkopf" aus dem Abschnitt oben war damit
bis zu diesem Fix **zu stark**: die Region wurde zwar verglichen, aber erst ab ~18.400
abweichenden Pixeln. Jetzt stimmt sie.

**Nicht mit angefasst:** die fünf `fullPage`-Baselines behalten `0.02`. Ihr Rauschen ist nicht
gemessen, und `fullPage`-Aufnahmen tragen mehr Layout-Varianz — dieselbe Behandlung dort ist
ein eigener Schritt (→ PROJ-Y-143g), kein Beifang.

### Nebenbefund Betrieb — der PROJ-138-Wedge ist real und trat hier auf

Während der Gegenprobe brach der Dev-Server mitten im Lauf weg (`page.goto:
net::ERR_ABORTED`, Port 3000 tot), begünstigt durch einen parallel laufenden `next build`
einer anderen Session. Kein Speicherproblem (kein OOM, 9,9 GB frei). Das in PROJ-138
dokumentierte Rezept — frischer Server nach `rm -rf .next` — hat es sofort behoben. Wichtig
für die Auswertung: der Fehlschlag sah aus wie ein Testfehler, war aber ein Werkzeugausfall;
ein Kontrollfall, der so scheitert, beweist **nichts** und musste wiederholt werden.

## Acceptance Criteria

- **AC-Y143d.1** — `projects-list` und `project-room` sind wieder aktiv (kein `test.fixme`). ✅
- **AC-Y143d.2** — Die Aufnahme ist deterministisch **per Konstruktion**, nicht per Toleranz:
  feste Viewport-Höhe, volatile Regionen maskiert. ✅
- **AC-Y143d.3** — Was nicht mehr bewacht wird, steht explizit im Test-Kommentar. ✅
- **AC-Y143d.4** — Stabilität belegt: mehrere aufeinanderfolgende Läufe grün, zusätzlich ein
  Kaltstart mit geleertem `.next/dev`. ✅ 3× **7/7** + Kaltstart **7/7**
- **AC-Y143d.5** — Keine Baseline enthält Werkzeug-Chrome. ✅ (F-1)
- **AC-Y143d.6** — Die in PROJ-Y-143b zertifizierten Baselines bleiben im geladenen Zustand. ✅
  Höhen nach dem Neuziehen deckungsgleich: Dashboard 1714, Stammdaten 1554,
  Tenant-Settings 4505, Settings 868.
- **AC-Y143d.7** (Abnahme ergänzt) — Beide reaktivierten Tests sind nachweislich **nicht
  leerlaufend**: eine Änderung in der bewachten Region macht sie rot. ✅ Großflächig
  45.394 px / 113.214 px; nach dem F-3-Fix auch auf Text-Ebene (42 px / 97 px).

## Gates

ESLint **0** · tsc **13 = Baseline, 0 in den geänderten Dateien** · `npm run build` **clean**
(`next.config.ts` angefasst) · Playwright chromium **3× 7/7** + Kaltstart **7/7**.

**Abnahme-Lauf auf gemergtem `main` (2026-08-12), frische Worktree, leeres `.next`:**
Playwright chromium **7/7** · Rot-Grün-Gegenprobe **2/2 rot** großflächig und **2/2 rot** auf
Text-Ebene nach dem F-3-Fix, danach **7/7** grün · 4 Läufe bei Toleranz 0 pixel-identisch ·
ESLint **0** · tsc **13 = Baseline, 0 in der geänderten Datei**.

## Deviations

- **D-Y143d.1** — `next.config.ts` angefasst, obwohl PROJ-Y-143b als reine Test-Slice
  angelegt war. Unvermeidlich: der Dev-Indikator ist von der Testseite aus nachweislich
  unerreichbar (drei Wege ausgeschlossen). Der Eingriff ist env-gated und dev-only, die
  menschliche Entwicklungsumgebung bleibt unverändert.
- **D-Y143d.2** — Alle **sieben** Baselines neu gezogen, nicht nur die zwei aus dem Auftrag.
  Folge von F-1: der Dev-Button lag in allen. Gegenprobe über die Höhen zeigt, dass die
  Inhalte unverändert sind.
- **D-Y143d.3** — `stammdaten-resources` und `project-room` frieren weiterhin einen
  Fehlerzustand ein (F-2). Bewusst nicht geglättet → PROJ-Y-143f.
- **D-Y143d.4** — Mobile Safari übersprungen (WebKit-Host-Libs, PROJ-67/F2).
- **D-Y143d.5** (Abnahme) — Die Toleranz-Verschärfung (F-3) betrifft **nur** die zwei
  viewport-fixierten Aufnahmen. Die fünf `fullPage`-Baselines behalten `0.02`, weil ihr
  Rauschen nicht gemessen ist → PROJ-Y-143g. Die Asymmetrie ist bewusst und im Test begründet.

## Followups

- **PROJ-Y-143f** — 404 als Leerzustand statt als Fehler: `stammdaten/resources`
  („Resource not found." aus `tenant-settings/server.ts:66`) und Projektraum-Reports
  („HTTP 404" aus `use-snapshots.ts`). Nach dem Fix beide Baselines neu ziehen.
- **PROJ-Y-143e** (bereits offen) — der Sprachmix betrifft auch diese Seiten:
  „Resource not found.", „Back to projects", „Master data", „Danger zone", „Move to trash"
  neben deutschen Abschnitten.
- **PROJ-Y-143g** (neu, aus F-3) — dieselbe gemessene Toleranz-Behandlung für die fünf
  `fullPage`-Baselines (Dashboard, Stammdaten, Resources, Settings, Tenant-Settings). Sie
  laufen weiter auf `maxDiffPixelRatio: 0.02`, also ~2 % der jeweiligen Bildfläche — bei
  `settings-tenant` (1280 × 4505) sind das über **115.000** Pixel Spielraum. Vorgehen wie
  hier: Rauschen über mehrere Läufe bei Toleranz 0 messen, kleinste sinnvolle Änderung
  messen, Schranke dazwischen legen. Ob `fullPage`-Aufnahmen dafür stabil genug sind, ist
  offen — genau das ist zu messen.
