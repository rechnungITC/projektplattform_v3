---
id: PROJ-Y-143k
title: "Stammdaten-Kacheln nach aktiven Modulen kennzeichnen"
issue_type: Bug
epic_code: HYGIENE
epic_title: "Hygiene & Supply-Chain"
priority: Low
priority_source: "Could"
labels: ["hygiene", "ui", "ux"]
dependencies: ["PROJ-17", "PROJ-64", "PROJ-51", "PROJ-Y-143f", "PROJ-Y-143g"]
roles: ["Platform"]
summary_for_jira: "[HYGIENE] Stammdaten-Kachelgitter kennzeichnet deaktivierte Module"
---

# PROJ-Y-143k: die Navigation bewirbt nicht mehr, was das Tor verschließt

## Status: Deployed
## Deployment Scope: full
**Created:** 2026-08-13
**Deployed:** 2026-08-13 (Code); Buchführung nachgezogen 2026-08-17
**Origin:** Fund F-3 aus PROJ-Y-143f.

## Der Befund

Der Projektraum kennt `requiresModule`-Gating für seine Tabs
(`src/lib/method-templates/*.ts`, ausgewertet in `project-sidebar.tsx`). Das
**Stammdaten-Kachelgitter filterte gar nicht**: `src/app/(app)/stammdaten/page.tsx`
rendert 14 Karten aus einem Literal, ohne die aktiven Module je anzusehen.

Konkret wird die Kachel „Ressourcen" auch dann angeboten, wenn das Modul
`resources` aus ist — und die Route dahinter antwortet dann bewusst mit 404
(`requireModuleActive`, Lese-Absicht). Die Navigation verkauft also eine Tür,
von der das System weiß, dass sie zu ist. Seit PROJ-Y-143f steht hinter dieser
Tür immerhin ein sauberer Hinweis statt eines roten Fehlers; die Sackgasse
selbst blieb.

## Die gelockte Richtung — und warum nicht die naheliegende

Gefolgt wird der Präzedenzfall aus **PROJ-Y-143f**, nicht ein zweiter daneben:
ein deaktiviertes Modul ist **ein Zustand**, kein Fehler und kein Nichts
(PROJ-64 AC-9, *„never imply green/safe"*).

Die Kacheln bleiben deshalb **sichtbar und werden gekennzeichnet**, statt
ausgeblendet zu werden. Ausblenden wäre die aufgeräumter aussehende und die
falsche Wahl: ein Tenant-Admin fände dann keinen Weg mehr zu der Erkenntnis,
*dass* es die Fläche gibt und wo man sie einschaltet — die Einstellung, die sie
zurückholt, wäre nur noch für den auffindbar, der schon von ihr weiß.

Die Kachel ist im inaktiven Zustand **kein Link mehr**. Ein Link auf eine
Fläche, von der wir sicher wissen, dass sie 404 antwortet, wäre genau die
Inkonsistenz, die diese Slice beseitigt.

Die Wortwahl ist die **gleiche wie in `ModuleUnavailableNotice`** — ein Begriff
für einen Sachverhalt, damit ein Nutzer, der beides sieht, es wiedererkennt:

> Das Modul „Ressourcen" ist für diesen Workspace nicht aktiv. Ein Tenant-Admin
> kann es unter Einstellungen → Workspace aktivieren.

Der Modulname kommt aus `MODULE_LABELS` (eine Quelle), nicht aus einem zweiten
Text.

## Welche Kacheln überhaupt modul-gebunden sind

Die Vorgabe rechnete mit „nicht alle 14 Kacheln haben einen `ModuleKey`". Die
Erhebung fällt schärfer aus als erwartet: **2 von 14** sind serverseitig
modul-gegatet. Erhoben über alle `requireModuleActive`-Aufrufstellen in
`src/app/api/**/route.ts`:

| Kachel | Route | Server-Gate |
|---|---|---|
| **Ressourcen** | `/api/resources` | ✅ `resources` |
| **Lieferanten** | `/api/vendors` | ✅ `vendor` |
| Stakeholder-Rollup, Stakeholder-Typen, Projekttypen, Methoden, Berechtigungsprofile, 4-Augen-Genehmigung, Revisionszugriff, DD-Stream-Vorlagen, Projekt-Vorlagen (M&A), Risikokategorien, Skills | `master-data`, `stakeholder-types`, `project-types`, `clearance-profiles`, `clearance-approval-policies`, `tenants/[id]/audit-readers`, `dd-stream-templates`, `ma-project-templates`, `risk-categories`, `skills` | — Kernstammdaten, kein Modul |
| **Organisation** | `organization-units`, `locations`, `organization-imports`, `organization-landscape` | ⚠️ **halb** — nur die fünf CSV-Import-Routen (siehe unten) |

### Die Abweichung, die die Vorgabe vorgesehen hat: „Organisation"

> **Korrektur 2026-08-19 (PROJ-Y-143n, AC-Y143n.4).** Dieser Abschnitt hat
> behauptet, **keine** der Organisations-Routen rufe `requireModuleActive` und
> der Schalter sei „vollständig wirkungslos". Die zweite Hälfte der Erhebung
> (Frontend liest den Schlüssel nirgends) war richtig, die erste **falsch**:
> `src/app/api/organization-imports/_helpers.ts:48-53` ruft das Tor, und **alle
> fünf** CSV-Import-Routen aus PROJ-63 gehen durch diesen Helfer. Der Schalter
> war also nicht wirkungslos, sondern **halb wirksam** — der schlechtere der
> beiden Zustände, weil er die Zusage nicht bloß nicht einlöste, sondern ihr
> widersprach: `/stammdaten/organisation` funktionierte, während
> `/stammdaten/organisation/import` in denselben vier Mandanten 404 antwortete
> und das als roten Fehlerkasten zeigte. Die *Entscheidung* dieser Slice bleibt
> richtig — ein UI-Kennzeichen ersetzt kein fehlendes Tor —, nur ihre
> Begründung war zu absolut. Der Ursprung liegt bei der Meß-Methode: „gibt es
> Aufrufstellen für den Schlüssel?" war die falsche Frage, weil eine gegatete
> von zwölf ungegateten Routen dabei wie Abdeckung aussieht. **PROJ-Y-143n hat
> alle zwölf Handler nachgerüstet; die Kachel trägt seither
> `requiresModule: "organization"`.**

`organization` **ist** ein `ModuleKey`, steht in `TOGGLEABLE_MODULES` und hat
ein Label — die naheliegende Zuordnung wäre also die Kachel „Organisation".
Sie wurde in dieser Slice bewusst **nicht** gemacht, weil sie eine Behauptung
gewesen wäre, die nichts trägt: die zwölf Handler der Kernfläche (`units`,
`tree`, `combobox`, `locations`, `landscape`, `move`) prüften den Schlüssel
nicht, und keine Stelle im Frontend fragte
`isModuleActive(settings, "organization")`. Hätte die Kachel ihn gelesen,
stünde dort „nicht aktiv", während die Seite dahinter einwandfrei funktioniert
— eine Falschaussage in die andere Richtung, und ein direkter Verstoß gegen die
Regel, an der sich 143f ausrichtet: *die Oberfläche sagt nur, was die
Aufrufstelle wirklich weiß.* Das Gate nachzurüsten war kein UI-Thema und
änderte API-Verhalten für Bestandsmandanten → **PROJ-Y-143n** (erledigt).

Der Unit-Test friert diese Zuordnung ein: er prüft die Liste der
`requiresModule`-Kacheln exakt, damit ein späterer Zusatz eine bewusste
Entscheidung erzwingt statt still zu driften.

## Umsetzung

| Datei | Rolle |
|---|---|
| `src/lib/master-data/stammdaten-sections.ts` | Kacheldaten + `requiresModule` + reiner Resolver `resolveStammdatenSections` |
| `src/components/master-data/stammdaten-grid.tsx` | Client-Grid, liest `useAuth().tenantSettings` |
| `src/app/(app)/stammdaten/page.tsx` | bleibt Server-Component (Metadata + Kopf), rendert das Grid |
| `src/lib/master-data/stammdaten-sections.test.ts` | 9 Fälle |

Der Resolver **entfernt nichts** — er annotiert. Er ist über `isModuleActive`
**fail-open**: solange die Settings noch laden oder fehlen, gilt jede Kachel als
aktiv. Das kurze Über-Versprechen ist harmlos (das Tor antwortet ohnehin), ein
kurzes „die halbe Fläche ist abgeschaltet" beim Laden wäre es nicht.

`adminOnly` bleibt orthogonal: eine Kachel kann beides tragen, und ein eigener
Testfall hält die zwei Flags auseinander.

## Acceptance Criteria

- **AC-Y143k.1** — Eine Kachel, deren Modul aus ist, ist als solche erkennbar
  und führt nicht mehr in die 404-Sackgasse. ✅ live im `[E2E]`-Mandanten
  (`resources` + `vendor` aus): beide Kacheln gestrichelt, Schloss statt
  Chevron, kein Link, Erklärsatz im Fuß.
- **AC-Y143k.2** — Keine Kachel verschwindet. ✅ Unit-Test über beide Extreme
  (alle Module an / alle aus) prüft Anzahl **und** Reihenfolge.
- **AC-Y143k.3** — Nur Kacheln mit echtem Server-Gate werden gekennzeichnet;
  keine UI-only-Behauptung. ✅ Unit-Test friert die Zuordnung exakt ein;
  `organization` bewusst ausgenommen (→ PROJ-Y-143n, das das Tor 2026-08-19
  nachgerüstet und die Kachel dabei ergänzt hat — der Test trägt seither vier
  Zeilen statt drei, genau wie vorgesehen).
- **AC-Y143k.4** — Kernstammdaten ohne Modul bleiben unangetastet und voll
  funktionsfähig. ✅ 12 von 14 Kacheln byte-identisch im Bild; eigener
  Testfall („alle Module aus" ⇒ kein Kern-Flag gesetzt").
- **AC-Y143k.5** — Kein Regress im Positivfall. ✅ **stärkster möglicher
  Nachweis**: mit `resources` + `vendor` aktiviert rendert die Seite
  **byte-identisch** zur Baseline vor dieser Slice (gleiche md5-Summe,
  `49e18b54…`, 1280×1574). Danach exakt auf den Ausgangswert zurückgesetzt.
- **AC-Y143k.6** — `adminOnly` bleibt orthogonal erhalten. ✅ Testfall + Bild.
- **AC-Y143k.7** — Die Baseline zeigt den neuen Zustand, im Bild geprüft statt
  angenommen. ✅ siehe unten.

## Die Baseline-Entscheidung

`stammdaten.png` **musste** neu gezogen werden: der Visual-Test-Mandant
(`e2e00000-…-0002`, in `global-setup` gepinnt) hat 4 aktive Module, `resources`
und `vendor` sind beide aus — also ändern **zwei** Kacheln ihr Aussehen. Der
Test fiel korrekt mit Größenunterschied 1574 → **1590 px** (+16 px = die
zusätzliche Erklärzeile in der jeweils höchsten Karte der beiden betroffenen
Zeilen), 84.188 abweichende Pixel.

Vor der Übernahme **im Bild angesehen** (Lehre F-2 aus PROJ-Y-143f: eine frisch
geschriebene Baseline ist kein Beweis):

- „Ressourcen" und „Lieferanten": gestrichelter Rahmen, gedämpfter Grund,
  Schloss statt Chevron, gedämpfter Titel, Erklärsatz im Fuß — und **kein**
  „Nur für Tenant-Admins.", was stimmt: beide sind nicht admin-only.
- Die anderen 12 Karten: unverändert, Chevron vorhanden, Admin-Hinweis dort wo
  er hingehört.
- Der magentafarbene Block ist die Maske des Mandanten-Umschalters aus
  PROJ-Y-143f, nicht ein Artefakt dieser Slice.

Die Schranke bleibt `maxDiffPixels: 20` aus PROJ-Y-143g. Sie wurde nicht
angefasst — und musste es auch nicht: Playwright scheitert bei abweichender
Bildhöhe unabhängig von jeder Toleranz.

Nicht mit `--update-snapshots` gezogen, sondern durch **Löschen der Datei**
(unter der Toleranz ist das Flag ein stiller No-op, PROJ-Y-143d/F-1).

## Gates

| Gate | Ergebnis |
|---|---|
| `npx eslint .` | **0** (Exit 0) |
| `npx tsc --noEmit` | **13** = Baseline, **0 neu** (keiner in den geänderten Dateien) |
| `npx vitest run` | **2931/2931**, 375 Dateien (+9 neu) |
| `npm run build` | clean, `/stammdaten` registriert |
| `npm run check:index-scope` | OK, 0 errors |
| Playwright Visual (chromium) | **7× 9/9** — 3 warm, 4 Kaltstart nach `rm -rf .next` |

Nach dem Rebase auf `main` (PROJ-Y-145b/145c mergten währenddessen) **vollständig
neu gemessen**, nicht übernommen: ESLint 0 · tsc 13 · vitest 2931/2931 · Build
clean · index-scope OK · Visual 9/9.

Der Konflikt lag ausschließlich in `features/INDEX.md` und war Block-gegen-Block:
`main` hat die fünf Nachbarzeilen 143d/e/m/f/g im Scope-Audit (PROJ-Y-145b)
umklassifiziert, mein Zweig trug deren alten Text. Aufgelöst durch **wörtliche
Übernahme der fünf `main`-Zeilen**; ersetzt wurde nur die eigene 143k-Zeile,
ergänzt nur die neue 143n-Zeile. Fremde Arbeit wurde nicht angefasst.

## Deviations

- **D-Y143k.1** — Kein CIA-Pass: UI-Bugfix ohne Architekturänderung, ohne neue
  Abhängigkeit, ohne Migration (`.claude/rules/continuous-improvement.md`,
  „When CIA is NOT needed"). Die Gitter-Daten werden verschoben, nicht das
  Muster.
- **D-Y143k.2** — Nur **2** der 14 Kacheln sind modul-gebunden; die Slice ist
  damit kleiner als der Titel „nach aktiven Modulen filtern" nahelegt. Der Wert
  liegt ebenso im festgehaltenen Befund, dass die übrigen 12 Kernstammdaten
  sind und keinen Modulschalter haben *sollen*.
- **D-Y143k.3** — „Organisation" bleibt in *dieser* Slice ungegatet
  (Begründung oben; von PROJ-Y-143n am 2026-08-19 aufgelöst) →
  **PROJ-Y-143n**.
- **D-Y143k.4** — Die Seite wird zur Server-Component mit Client-Grid statt
  serverseitig die Settings zu lesen. Grund: jede andere Fläche im Produkt
  liest den Modulzustand über `useAuth().tenantSettings`; ein zweiter,
  serverseitiger Auflösungsweg wäre eine zweite Autorität für dieselbe Frage.
- **D-Y143k.5** — Kein `aria-disabled` auf der inaktiven Karte: das Attribut
  gehört an Widgets, und die Karte ist jetzt reiner Inhalt. Die Bedeutung trägt
  der vorgelesene Satz im Fuß — dasselbe Vorgehen wie in
  `ModuleUnavailableNotice`.
- **D-Y143k.6** — Mobile Safari übersprungen (WebKit-Host-Libs, PROJ-67/F2).

## Beobachtung ohne Beweis

Zwei Läufe unmittelbar nach einem `rm -rf .next` meldeten je **einen**
Fehlschlag, dessen Identität ich nicht mitgeschrieben habe. In **sieben**
darauffolgenden Läufen — darunter vier bewusste Kaltstarts — war er nicht
reproduzierbar (9/9). Die Signatur (Fehlschlag beim `goto`, einmal alle neun
Tests gleichzeitig) passt auf den in **PROJ-138** beschriebenen
Turbopack-Wedge, nicht auf diese Änderung. Festgehalten statt weggelassen,
weil ich es nicht benennen kann.

## Followups

- **PROJ-Y-143n** (erledigt 2026-08-19) — der `organization`-Modulschalter ist
  nur halb wirksam (Korrektur oben): er
  steht in `TOGGLEABLE_MODULES`, wird aber weder von einer Route
  (`requireModuleActive`) noch von der Oberfläche (`isModuleActive`) gelesen.
  Ein Tenant-Admin schaltet ihn heute aus und nichts passiert. Zu entscheiden:
  Gate nachrüsten (ändert API-Verhalten für Bestandsmandanten, die ihn aus
  haben — der `[E2E]`-Altmandant ist so einer) oder den Schlüssel als
  „reserviert" kennzeichnen.
- Offen aus der Reihe: **PROJ-Y-143c** (Alt-Mandant), **PROJ-Y-143l**
  (geteilter E2E-Nutzer), **PROJ-Y-143m** (restliche englische Texte).
  — Stand 2026-08-17: alle drei inzwischen `Deployed`.

---

## Buchführungs-Nachtrag 2026-08-17 — `Deployed` / Scope `full`

Die Zeile stand auf `In Review` mit leerem Scope, obwohl der Code seit dem 2026-08-13 auf `main`
liegt. Nachgezogen wurde ausschließlich die Buchführung; **keine Code-Änderung**.

**Merge-Nachweis:** `45e0204` — *„feat(PROJ-Y-143k): Stammdaten-Kacheln kennzeichnen deaktivierte
Module"* (**PR #369**), verifiziert als Vorfahre von `origin/main`.

**Artefakte gegen `origin/main` geprüft, nicht aus der Spec übernommen:**
`src/lib/master-data/stammdaten-sections.ts` mit `STAMMDATEN_SECTIONS` und dem reinen Resolver
`resolveStammdatenSections` (Z. 192), `src/components/master-data/stammdaten-grid.tsx`,
`src/lib/master-data/stammdaten-sections.test.ts` mit **9** Fällen wie zugesagt,
`src/app/(app)/stammdaten/page.tsx` von **201 auf 27** Zeilen reduziert (nachgezählt am Blob vor
und nach dem Merge — die „184" aus `git diff --stat` ist die Zahl *geänderter* Zeilen
(5 Einfügungen + 179 Löschungen), nicht die vorherige Dateilänge; ein Zwischenstand dieses
Nachtrags hatte sie als Dateilänge missverstanden).

**Der eingefrorene Zuordnungs-Test hat inzwischen gewirkt — genau wie beabsichtigt.**
`requiresModule` trägt auf `main` jetzt **drei** Werte statt der zwei aus dieser Slice:
`resources`, `vendor` **und `construction`** (Zeile 92), eingebracht von PROJ-45 (`3732532`).
Das ist keine Drift, sondern der belegte Ertrag von AC-Y143k.3: der Test friert die Liste exakt
ein, also musste die Construction-Slice eine bewusste Entscheidung treffen statt stillschweigend
eine ungegatete Kachel zu ergänzen.

**Warum `full` und ausdrücklich nicht `tooling-only`:** der Merge liefert **vier Dateien unter
`src/`** aus und verändert damit, was in Produktion gerendert wird — eine Kachel mit
abgeschaltetem Modul ist gestrichelt, trägt ein Schloss statt des Chevrons, **ist kein Link mehr**
und erklärt den Zustand im Fuß. Das ist eine Produkt-Laufzeitfähigkeit, also ist
`tooling-only` („adds no product runtime capability") hier falsch; es gilt die in PROJ-Y-145b
Tranche 2 präzisierte Grenzregel: was Produktions-Laufzeit anfasst, ist nicht `tooling-only` —
wenn vollständig, dann `full`.

`full` ist kriterienweise erfüllt: alle **sieben** AC ✅ (AC-Y143k.5 mit dem stärksten möglichen
Nachweis — bei aktivierten Modulen rendert die Seite byte-identisch zur Vorher-Baseline, gleiche
md5), Definition of Done erfüllt, kein Critical/High-Befund, und das Produktionsverhalten ist über
UI/E2E belegt (Playwright Visual 7× 9/9 inklusive vier Kaltstarts, 9 Unit-Fälle, Build clean mit
registrierter `/stammdaten`-Route) — beides Nachweisarten, die die Regel ausdrücklich zulässt.
Der Code ist über den Merge in `main` und damit über den Vercel-Auto-Deploy live.

**Eine offene Auslassung — aber keine aus einem AC dieser Slice:** **PROJ-Y-143n** (der
`organization`-Modulschalter ist nur halb wirksam — Korrektur oben). Das ist wichtig für die Scope-Frage: AC-Y143k.3
verlangt, dass **nur** Kacheln mit echtem Server-Gate gekennzeichnet werden. „Organisation"
auszunehmen ist deshalb **Erfüllung** dieses Kriteriums, nicht seine Zurückstellung — der
Schalter wird von keiner Route (`requireModuleActive`) und keiner Oberfläche (`isModuleActive`)
gelesen, eine Kennzeichnung wäre eine Falschaussage in die Gegenrichtung gewesen. 143n stellt
also kein Kriterium dieser Slice zurück und widerspricht keinem, womit `full` unberührt bleibt;
registriert ist es trotzdem, weil es als D-Y143k.3 bewusst abgegeben wurde
(`features/OPEN-DEFERRED-STATUS.md`, Herkunft benannt).

D-Y143k.2 (nur 2 von 14 Kacheln modul-gebunden) ist eine Feststellung über den Bestand, keine
Verengung einer Anforderung. Die „Beobachtung ohne Beweis" (einzelner nicht reproduzierbarer
Fehlschlag nach `rm -rf .next`, Signatur PROJ-138-Turbopack-Wedge) bleibt als solche stehen und
wird nicht zu einem Befund erhoben.
