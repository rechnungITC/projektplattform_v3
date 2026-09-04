# PROJ-172 — Supply-Chain-Remediation `fflate`

## Status: Deployed
## Deployment Scope: full

Der Required Check `OSV scan of the dependency lockfile` ist auf **`main` selbst**
rot, und aufgefallen ist es an einer **fremden PR ohne `package.json`-Diff**
(#548, die PROJ-171-Spec) — dasselbe Muster, das CLAUDE.md als „`npm audit`
breaks unrelated PRs" führt und das PROJ-140 · 142 · 146 · 149 · 160 · 170 schon
sechsmal gekostet hat. Weil das `main`-Ruleset `strict: true` setzt, sperrt der
rote Lauf **jede** offene PR, nicht nur die eigene.

## Der Befund — und diesmal widersprechen sich die beiden Quellen

`fflate@0.6.10` trägt **GHSA-px8p-9vwx-vf98**: `unzipSync` kann bei einem
fehlerhaften ZIP64-Archiv in eine **Endlosschleife** laufen.

| Quelle | Bewertung | Gate | Ergebnis |
|---|---|---|---|
| OSV-Scanner v2.5.0 | **CVSS 7.5** | `check:osv-gate` (Schwelle ≥ 7.0) | **exit 1 — rot** |
| `npm audit --omit=dev` | **moderate** | `--audit-level=high` | exit 0 — grün |

Das ist **der erste Fall, in dem die zweite Meinung allein den Ausschlag gibt**.
PROJ-170 hatte ebenfalls Divergenz, aber dort war die Wurzel in *beiden* Quellen
über der Schwelle und der Unterschied betraf nur Nebenfunde. Hier bewertet npm
dasselbe Advisory **eine Stufe niedriger**, und ohne den OSV-Job aus PROJ-147
wäre das Advisory unbemerkt im Produktionsbaum geblieben. Der Wert des Jobs ist
damit erstmals nicht theoretisch, sondern gemessen.

**Vorzustand, direkt an `main`s Lockfile gemessen** (nicht am eigenen Branch, damit
belegt ist, dass `main` selbst rot ist und #548 an etwas hängt, das ihr nicht
gehört):

```
osv-gate: 1 finding(s) below the HIGH threshold (informational):
  · GHSA-w9m9-85wc-3x92 — postcss-selector-parser@6.1.2 (CVSS 4.3)
osv-gate: 1 finding(s) at HIGH or above:
  ✗ GHSA-px8p-9vwx-vf98 — fflate@0.6.10 (CVSS 7.5)
GATE exit=1
```

Der Fund unterhalb der Schwelle ist Bestand und **keine Regression** — er ist seit
PROJ-160 registriert und hat weiterhin keinen In-Range-Weg.

**Warum das Paket im Produktionsbaum liegt** (gemessen, nicht vermutet):

```
@react-three/drei@10.7.7 → three-stdlib@2.36.1 → fflate@0.6.10   <-- verwundbar
@types/three@0.184.1                           → fflate@0.8.3    <-- nicht verwundbar
```

Beide Zweige liegen im `--omit=dev`-Baum. Der Baum enthält also **zwei**
`fflate`-Instanzen, und nur die unter `three-stdlib` ist betroffen — die
Advisory-Spanne endet bei `0.6.10`.

## Der Fix: reiner Lockfile-Bump auf `0.6.11`, kein `overrides`

Die OSV-Antwort führt **fünf** betroffene Spannen mit je eigenem Fix:

| eingeführt | gepatcht ab |
|---|---|
| 0.4.5 | 0.4.9 |
| 0.5.0 | 0.5.4 |
| **0.6.0** | **0.6.11** |
| 0.7.0 | 0.7.5 |
| 0.8.0 | 0.8.3 |

Es gibt also eine gepatchte **0.6.x**, und `three-stdlib@2.36.1` verlangt
`^0.6.9` — `0.6.11` liegt **in** dieser Spanne. Damit ist die Lage exakt
**PROJ-160 / PROJ-Y-142a** (`nanoid`) und **nicht PROJ-149**, wo der Elternrange
deckelte und ein Override der einzige vorwärtsgerichtete Weg war. Die Hausnorm
lautet „Override nur, wenn der Range deckelt"; hier wäre einer gegen die eigene
Begründung.

Ein `three-stdlib`-Sprung ist zusätzlich **gegenstandslos**: `2.36.1` ist bereits
die neueste Version (2.36.2–2.36.8 antworten mit E404), und
`@react-three/drei@10.7.7` verlangt `^2.35.6`, ist also erfüllt.

Umgesetzt über **`npm update fflate --package-lock-only`**, nicht über
`npm install fflate@…` — letzteres hätte das Paket fälschlich als **direkte**
Abhängigkeit eingetragen (der eigene Fehler aus PROJ-170).

## Kein API-Bruchrisiko, an den Signaturen belegt

Die Exportlisten von `0.6.10` und `0.6.11` sind **identisch**. Der Bundle-Diff
umfasst **17 Zeilen** und trifft genau die Advisory-Stelle — die interne
`z64e`-Funktion begrenzt jetzt die Extra-Feld-Länge:

```
- var z64e = function (d, b) {
-     for (; b2(d, b) != 1; b += 4 + b2(d, b + 2)) ;
+ var z64e = function (d, b, l) {
+     var e = b + l;
+     for (; b2(d, b) != 1; b += 4 + b2(d, b + 2)) {
+         if (b + 4 > e) throw 'invalid zip file';
+     }
```

**Keine öffentliche Signatur ändert sich**, und `three-stdlib` benutzt ohnehin nur
`unzipSync`, `gunzipSync`, `unzlibSync`, `zipSync`, `strToU8`, `strFromU8`.

## Erreichbarkeit — gemessen, und in der ehrlichen Richtung eingeordnet

`three-stdlib` zieht `fflate` in **neun** Modulen (USDZExporter, 3MFLoader,
AMFLoader, EXRLoader, FBXLoader, KMZLoader, NRRDLoader, TiltLoader, VTKLoader).
`src/` enthält aber **genau eine** 3D-Datei — `project-graph-3d-canvas.tsx`, lazy
geladen aus `project-graph-view.tsx:57` —, und ihr einziger `three-stdlib`-Bezug
ist ein **`import type`**, der zur Laufzeit verschwindet. Grep über `src/` nach
`FBXLoader|useFBX|useGLTF|GLTFLoader|DRACO|KTX2|unzipSync` → **null Treffer**.

`unzipSync` hat in dieser Anwendung also **keinen Aufrufpfad**, und der Angriff
bräuchte zusätzlich ein vom Angreifer gestelltes ZIP-Archiv.

Das ist ausdrücklich **kein Grund, das Gate zu umgehen.** Die Hausnorm zieht die
Linie bei CVSS ≥ 7.0 und zieht sie **vor** der Einzelfallbewertung, genau damit
niemand pro Advisory neu verhandelt. Begründung des Bumps ist **Hygiene und das
rote Gate**, nicht Erreichbarkeit — gleiche Einordnung wie `qs` in PROJ-170.

## Gemessene Nachweise

| Was | Vorher | Nachher |
|---|---|---|
| `check:osv-gate` (osv-scanner v2.5.0, gepinnt + `sha256sum -c`) | **exit 1** — `✗ fflate@0.6.10 (CVSS 7.5)` | **exit 0** — `none at HIGH or above` |
| `npm run audit:prod` | exit 0, „1 moderate" | exit 0, **`found 0 vulnerabilities`** |
| Lockfile-Pakete | 1186 | 1186 |
| `package.json` | — | **unberührt** |
| Lockfile-Diff | — | **3 Zeilen**, genau ein Eintrag |
| `three-stdlib/node_modules/fflate` (aus `node_modules` gelesen) | 0.6.10 | **0.6.11** |
| `@types/three` → `fflate` (nie betroffen) | 0.8.3 | 0.8.3 |

Der Vorzustand ist **direkt an `main`s Lockfile** gemessen, nicht am eigenen
Branch. Die Versionen sind nach `rm -rf node_modules && npm ci` **aus
`node_modules`** gelesen statt aus dem Lockfile geglaubt — eine alte
`node_modules` misst den Zustand *vor* dem Fix (PROJ-149-Lehre).

## Abgrenzungen

- `npm audit fix --force` ist **verboten**: es hat in diesem Repo schon Next.js,
  `pdfjs-dist` und `mailparser` in ältere, verwundbarere Stände zurückdrehen
  wollen (PROJ-140 · 142 · 149).
- Kein Produktivcode, keine Migration, kein neues Paket.

## Eigener Messfehler, festgehalten

Der **erste** `audit:prod`-Lauf meldete `exit=1` und hätte die Lage als „beide
Gates rot" erscheinen lassen. Der Wiederholungslauf mit derselben Befehlszeile
meldet `exit=0` bei identischer Ausgabe — der erste Lauf war ein
Registry-Aussetzer (er lief vorher in ein 120-s-Zeitlimit). **Der Mechanismus ist
inzwischen belegt statt vermutet:** derselbe Fehlschlag trat am selben Tag in CI
auf und zeigt dort seinen Grund — `npm warn audit 503 Service Unavailable` vom
Advisory-Endpunkt, gefolgt von `npm error audit endpoint returned an error` und
exit 1. `npm audit` unterscheidet also **nicht** zwischen „Advisory gefunden" und
„Endpunkt nicht erreichbar"; ein Netzausfall meldet sich als
Sicherheitsfehlschlag. Belastbar ist
erst die zweite Messung, und sie deckt sich mit CI: auf #548 ist
`npm audit production dependencies` **pass** und nur `OSV scan` **fail**.

Und im Recherche-Lauf meldete ein erster Bundle-Vergleich „unterschiedlich",
obwohl **beide** verglichenen Pfade gar nicht existierten und `cmp` schlicht
scheiterte — der Exit-Code hätte als Beleg gedient. Das ist wörtlich die
PROJ-149-Falle („identische Ausgabe bei exit 1 auf beiden Seiten"); erst nach
`find` auf die echten Dateinamen (`esm/index.mjs`, nicht `lib/index.js`) trägt
der Vergleich.

## Gates

| Gate | Ergebnis |
|---|---|
| `npm run check:osv-gate` | **exit 0** (vorher exit 1) |
| `npm run audit:prod` | **exit 0** — `found 0 vulnerabilities` (vorher „1 moderate") |
| vitest | **4235/4235** in 477 Dateien |
| ESLint | **0 Fehler** (4 Warnungen, alle in einer fremden PROJ-153-Datei, stehen ebenso auf `main`) |
| tsc | **11 = Baseline**, keiner in einer Datei dieser Slice |
| `npm run build` | exit 0 |
| `check:migration-naming` · `check:index-scope` · `check:register-consistency` · `check:token-drift` · `check:function-inventory` | je OK |

`tsc` wurde **nach `rm -rf .next`** gemessen: eine halb geschriebene
`.next/dev/types/validator.ts` lässt `tsc` früh abbrechen, und *weniger* Fehler
sähen dann wie *besser* aus (PROJ-Y-143e-Falle).

## Akzeptanzkriterien

- **AC-172.1** `npm run check:osv-gate` gegen einen frisch erzeugten Scanner-Bericht
  endet **exit 0**, gemessen mit demselben gepinnten Werkzeug wie CI (v2.5.0,
  per `sha256sum -c` verifiziert).
- **AC-172.2** Der verbleibende Fund unterhalb der Schwelle ist **benannt** und als
  vor **und** nach dem Fix vorliegend belegt.
- **AC-172.3** `npm run audit:prod` bleibt **exit 0**; der Fix verschlechtert die
  npm-Seite nicht.
- **AC-172.4** Rot-Grün mit demselben Werkzeug: der Vorzustand (`main`s Lockfile)
  ist nachweislich rot, der Fixzustand grün.
- **AC-172.5** Kein Paket wird in einen älteren Stand gedrückt; die Zahl der
  Lockfile-Pakete ist vor und nach dem Fix belegt (keine stillen Zugänge).
- **AC-172.6** Funktionaler Nachweis gegen eine **frisch aus dem Lockfile
  aufgelöste** Installation (`rm -rf node_modules && npm ci`) — eine alte
  `node_modules` misst den Zustand *vor* dem Fix (PROJ-149-Lehre).
- **AC-172.7** `package.json` trägt genau die Änderung, die der gewählte Weg
  verlangt, mit Begründung in dieser Spec; kein `src/`-Diff, keine Migration.

## Auslieferung

**Ausgeliefert 2026-09-04: Tag `v3.3.0-PROJ-172` auf dem Merge-Commit `36def36`
(PR #549, squash), alle zehn CI-Checks grün.**

Der Merge **ist** die Auslieferung. Der tragende Nachweis ist **das Gate selbst
in der Umgebung, in der es sperrt**: `OSV scan of the dependency lockfile` meldete
auf #549 **pass**, unmittelbar nachdem derselbe Job auf `main` rot war — damit ist
die Blockade aller offenen PRs aufgehoben, was der Zweck der Slice war. Ein
HTTP-Smoke wäre gegenstandslos (keine Route, keine Zeile Produktivcode); dass der
Bump **baut**, belegt der grüne Vercel-Check aus dem Stand **mit** dem neuen
Lockfile.

**Ein Betriebsbefund unterwegs, der nicht dieser Slice gehört:** zwei der fünf
Datei-Wächter meldeten auf #549 zunächst `fail` — nachgelesen waren sie
**`cancelled`**, abgebrochen im Schritt `Install dependencies` nach gut fünf
Minuten, bei einem Job-Limit von `timeout-minutes: 5`. Alle fünf Wächter sind
identisch konfiguriert, und `token-drift` kam im selben Lauf mit **4m24s** durch
(auf #548 traf es vier, auf #545 zwei).

**Die naheliegende Erklärung „das Budget ist aufgebraucht" ist dabei genau das,
was PROJ-173 erst messen muss** — denn am selben Tag scheiterte auf #544 der
`npm audit`-Job mit `503 Service Unavailable` von npms Advisory-Endpunkt und
brauchte dafür **fünf Minuten** (08:50:20 → 08:55:21). Eine gestörte
npm-Registry erklärt beide Symptome auf einmal: langsame Installationen, die
gegen die Fünf-Minuten-Wand laufen, **und** einen Netzausfall, der sich als
Sicherheitsfehlschlag liest. Ob das Limit strukturell zu knapp ist oder heute
nur das Gegenüber langsam war, ist damit offen und gehört gemessen, nicht
behauptet. Weil GitHub ein `cancelled` als **fail** meldet,
sperrt das Ruleset dann eine PR, an der nichts falsch ist. Hier per Neustart
gelöst, die Ursache als eigene Slice **PROJ-173** aufgesetzt — sie gehört nicht in
einen Supply-Chain-Fix.

**Präzisierung, am Ruleset nachgelesen statt angenommen:** von den fünf Wächtern
sind nur **drei** Required Checks (`index-scope`, `migration-naming`,
`register-consistency`); `token-drift` und `function-inventory` laufen auf jeder
PR, sind aber **nicht enrolled** — die Auslieferungsnotizen von PROJ-Y-51d und
PROJ-Y-148e sagen das ausdrücklich. Ein Abbruch dieser beiden **sperrt** also
nicht, er zeigt nur rot. Das mindert die Dringlichkeit, nicht den Befund: ein
Required Check, der ohne Sachgrund rot wird, sperrt; und ein nicht-enrollter, der
ohne Sachgrund rot wird, erzieht dazu, rote Wächter zu übersehen — die andere
Richtung desselben Schadens.

## Scope-Begründung

**`full`.** Alle sieben Kriterien sind erfüllt, **nichts** ist zurückgestellt.
`tooling-only` trifft **nicht** zu — es verlangt einen Ausgang in „repository
tooling, CI, tests, or workflow", hier wechselt eine **Produktions**-Laufzeit-
Abhängigkeit (`@react-three/drei` steht in `dependencies`); gleiche Einordnung wie
PROJ-140 · 146 · 149 · 160 · 170. `mvp` und `alpha` behaupten zurückgestellte,
namentlich geführte Arbeit, die es nicht gibt. Der Fund **unterhalb** der Schwelle
(`postcss-selector-parser`) ist **kein** zurückgestelltes Kriterium: AC-172.2
verlangt nur seine **Benennung**, und die ist erfolgt — samt der Messung, dass er
vor **und** nach dem Fix vorlag. Die Waiver-Ausnahme wurde nicht in Anspruch
genommen und war nicht nötig.
