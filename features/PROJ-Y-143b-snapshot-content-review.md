---
id: PROJ-Y-143b
title: "Inhaltliche Prüfung der neu baselineten Visual-Regression-Snapshots"
issue_type: Chore
epic_code: HYGIENE
epic_title: "Hygiene & Supply-Chain"
priority: Medium
priority_source: "Should"
labels: ["hygiene", "testing", "ui"]
dependencies: ["PROJ-143", "PROJ-51"]
roles: ["Platform", "Design"]
summary_for_jira: "[HYGIENE] Visual-Regression: eingefrorene UI inhaltlich prüfen statt nur stabil"
---

# PROJ-Y-143b: Inhaltliche Prüfung der neuen Snapshots

## Status: Deployed
## Deployment Scope: tooling-only
**Created:** 2026-08-11
**Reviewed:** 2026-08-11
**Deployed:** 2026-08-11 (Code); Buchführung nachgezogen 2026-08-17
**Origin:** Followup aus PROJ-143, Deviation D-1.

> **Ergebnis vorweg:** Die zwei Baselines, um die es laut Auftrag ging (`dashboard`,
> `stammdaten`), sind **inhaltlich korrekt** — die Aufnahme aus PROJ-143 hat den geladenen
> Zustand erwischt. Die Prüfung hat den Fehler aber bei **zwei anderen** Snapshots gefunden,
> die niemand im Verdacht hatte: `projects-list` und `project-room` waren auf **1280 × 720**
> eingefroren, exakt Viewport-Höhe, also `fullPage`-Aufnahmen von Seiten, die noch nicht
> gewachsen waren. `projects-list` zeigt fünf graue Skeleton-Zeilen an der Stelle der
> Projekttabelle. Diese Tests waren grün und verglichen eine Ladeanimation.

> **Hygiene-Slice.** Prüfung + ggf. Korrektur von Baselines. Kein Produktivcode erwartet — falls die Prüfung echte UI-Fehler findet, werden das eigene Slices.

## Problem

PROJ-143 hat `dashboard.png` und `stammdaten.png` neu baselinet. Beide waren **schon vorher rot** — dokumentierte Datendrift aus PROJ-88 F-3, die nie aufgearbeitet wurde. Die neue Baseline friert daher **zwei** Dinge gleichzeitig fest:

1. die beabsichtigte Folge des frischen, RFC-4122-konformen Tenants, und
2. die nie untersuchte UI-Drift.

Vor dem Baselining wurde ausschließlich **Stabilität** geprüft (zwei Läufe, identische Höhen 1554/1714 px; die zuvor beobachtete Schwankung war die Retry-Sequenz innerhalb eines Laufs), danach zweimal verifiziert (2× rc=0, 7/7).

Was **nicht** stattgefunden hat: ein Blick darauf, ob die eingefrorene Oberfläche inhaltlich richtig ist. Ein grüner Visual-Regression-Test beweist derzeit nur „unverändert gegenüber dem, was wir eingefroren haben" — nicht „korrekt".

## Acceptance Criteria

- **AC-Y143b.1** — Beide Baselines sind visuell durchgesehen und gegen die erwartete Soll-UI abgeglichen (Dashboard: My-Work/Approvals/Portfolio-Health-Regionen; Stammdaten: Karten-Inventar inkl. der seit PROJ-66/76/96 ergänzten Einträge).
- **AC-Y143b.2** — Jede Abweichung ist klassifiziert: **(a)** korrekt und erwartet · **(b)** Folge des frischen Tenants (leere Zustände) · **(c)** echter UI-Fehler.
- **AC-Y143b.3** — Für jeden (c)-Fund existiert ein eigener Eintrag (PROJ-Y oder Bug); die Baseline wird **nicht** stillschweigend „passend" gemacht.
- **AC-Y143b.4** — Das Ergebnis ist in dieser Spec dokumentiert, sodass die Baselines künftig als geprüft gelten und nicht erneut pauschal neu gezogen werden.

## Warum das nicht „nur Screenshots anschauen" ist

Der Wert liegt in der Klassifikation. Ein leerer Zustand nach frischem Tenant ist erwartet und darf eingefroren bleiben; eine fehlende Navigationskarte oder ein abgeschnittenes Panel ist ein Produktfehler, der sich hinter einem grünen Test versteckt. Ohne diese Trennung bleibt die Suite grün und sagt nichts aus.

## Kontext

Betroffen sind die authentifizierten PROJ-51-Snapshots (7/7 grün nach dem Re-Baseline). Die Höhen sind stabil, das Problem ist ausschließlich inhaltlicher Natur.

---

## Nachtrag 2026-08-11 — der Test kann den Ladezustand einfrieren (Fund aus dem E2E-Lauf gegen main)

Beim vollen E2E-Lauf gegen `main` (`61943e6`, nach der Merge-Kette #303/#304/#302/#301) fiel `dashboard.png` erneut aus — **stabil, zweimal isoliert reproduziert**, also kein Flake. Die Untersuchung hat aber keinen Inhalts-, sondern einen **Anker-Fehler** des Tests zutage gefördert. Er ist für diese Spec unmittelbar relevant, weil er die Verlässlichkeit jedes Re-Baselinings betrifft.

**Symptom:** kein Pixel-Diff, sondern ein Höhenunterschied — erwartet 1714 px, erhalten 1430 px. Das `-actual.png` zeigt das Dashboard vollständig im **Skeleton-Zustand**: KPI-Kacheln ohne Zahlen, My-Work-Badges auf `0`, Alerts/Genehmigungen/Deliverable-Freigaben/Project-Health/Reports als graue Platzhalter.

**Messung** (temporäre Probe, danach entfernt):

| Ereignis | Zeitpunkt |
|---|---|
| Sidebar sichtbar (= Warte-Anker des Tests) | 1061 ms |
| finale `scrollHeight` 1714 px erreicht (= Baseline-Höhe) | 2084 ms |
| `/api/dashboard/summary`, `…/approvals`, `…/deliverable-approvals` | alle **200** |

**Ursache:** `tests/PROJ-51-visual-regression-authenticated.spec.ts:43-47` wartet auf `[data-sidebar='sidebar']` — laut Kommentar „the most stable indicator of *fully loaded*". Das ist die **Shell-Hydration**, nicht die Datenverfügbarkeit. Die Panels laden danach asynchron nach. Sind die `/api/dashboard/*`-Routen im Dev-Server **kalt**, kostet deren Turbopack-Erstkompilierung mehr als das 5-s-Budget von `toHaveScreenshot`, und der Test vergleicht gegen Skeletons. Mit warmen Routen: **7/7 grün**, Baseline unverändert korrekt.

Der Warm-Compile aus PROJ-138 / PROJ-67 AC-9 (`warmCompileDeepLinkRoutes`) wärmt ausschließlich **Seiten**-Routen — `/api/**` ist nicht abgedeckt.

**Warum das hierher gehört:** Das Re-Baselining aus PROJ-143 hat den *geladenen* Zustand erwischt (1714 px), also gut ausgegangen. Unter kalten API-Routen hätte derselbe Vorgang jedoch **Skeletons** als Baseline eingefroren — und der Test wäre anschließend dauerhaft grün gewesen, während er nichts als eine Ladeanimation bewacht. Das ist exakt die Klasse „grün, sagt aber nichts aus", die diese Spec adressiert, nur eine Ebene tiefer: nicht der Inhalt war falsch, sondern der Zeitpunkt der Aufnahme ist nicht garantiert.

### Ergänzende Acceptance Criteria

- **AC-Y143b.5** — Der Snapshot-Test wartet auf einen **Daten**-Indikator statt auf die Shell (z. B. Verschwinden der Skeletons bzw. ein gerendertes Panel), sodass weder Vergleich noch Neuaufnahme den Ladezustand erwischen können.
- **AC-Y143b.6** — Entweder sind die `/api/dashboard/*`-Routen in den Warm-Compile aufgenommen, **oder** es ist belegt, dass der Daten-Anker aus AC-Y143b.5 den Kaltstart allein abfängt (ein Lauf mit frisch geleertem `.next/dev` ist grün).
- **AC-Y143b.7** — Für jede künftige Neuaufnahme ist festgehalten, dass sie nur im **verifiziert geladenen** Zustand erfolgen darf; ein Baseline-Bild im Skeleton-Zustand gilt als Fehler, nicht als neue Wahrheit.

### Reproduktion

```
rm -rf .next/dev   # API-Routen kalt erzwingen
npx playwright test tests/PROJ-51-visual-regression-authenticated.spec.ts --project=chromium
# → dashboard.png rot: "Expected an image 1280px by 1714px, received 1280px by 1430px"
# unmittelbar danach erneut (Routen jetzt warm) → 7/7 grün
```

---

## Ergebnis 2026-08-11

### AC-Y143b.1/2 — Klassifikation der geprüften Baselines

Beide Auftrags-Baselines wurden visuell durchgesehen und **gegen den Code** abgeglichen, nicht
nur gegen das Auge.

**`stammdaten.png` (1280 × 1554)**

| Beobachtung | Klasse | Belegt durch |
|---|---|---|
| 13 Karten sichtbar: Ressourcen · Stakeholder-Rollup · Stakeholder-Typen · Projekttypen · Methoden · Lieferanten · Berechtigungsprofile · 4-Augen-Genehmigung · Organisation · DD-Stream-Vorlagen · Projekt-Vorlagen (M&A) · Risikokategorien · Skills | **(a) korrekt** | `src/app/(app)/stammdaten/page.tsx` definiert genau diese 13 — Inventar vollständig, **keine Karte fehlt** |
| Die seit PROJ-66/76/96 ergänzten Einträge sind da (Skills, Projekt-Vorlagen (M&A), Einstellungen-Chevron in der Sidebar) | **(a) korrekt** | Abgleich gegen die Karten-Registry |
| Alle 13 mit „Nur für Tenant-Admins." | **(a) korrekt** | 13 × `adminOnly` in derselben Datei; Testnutzer ist Admin |

**`dashboard.png` (1280 × 1714)**

| Beobachtung | Klasse | Belegt durch |
|---|---|---|
| Werte gerendert („0 Items", „0 von 2 Projekten"), **keine** Skeletons | **(a) korrekt** | Die Aufnahme aus PROJ-143 traf den geladenen Zustand — genau das, was AC-Y143b.7 verlangt |
| Alle KPI/Panels auf Null bzw. Leerzustand („Keine offenen Items", „Keine aktiven Alerts", „Keine offenen Freigaben", „Alle Projekte im Plan", „Noch keine Snapshots") | **(b) frischer Tenant** | Erwartet und **darf** eingefroren bleiben |
| Sidebar-Hintergrund endet bei ~715 px, darunter weiß | **(a) Aufnahme-Artefakt, kein UI-Fehler** | `src/components/ui/sidebar.tsx:247` ist `fixed inset-y-0 h-svh` — bei `fullPage` malt eine viewport-hohe Sidebar nur ihre eigene Box. Folge: die Snapshots prüfen die Sidebar unterhalb der Falz **nicht** |
| My-Work/Approvals/Project-Health-Regionen vorhanden | **(a) korrekt** | Von AC-Y143b.1 gefordert, alle drei da |

### AC-Y143b.3 — (c)-Funde, jeweils mit eigenem Eintrag

Die Baseline wurde für **keinen** dieser Punkte stillschweigend passend gemacht.

**C-1 (hoch, der eigentliche Fund) — zwei Baselines waren im Ladezustand eingefroren.**
`projects-list-chromium-linux.png` und `project-room-chromium-linux.png` sind **1280 × 720**,
also genau der Viewport. Unter einem Daten-Anker rendern dieselben Seiten **1200 px** bzw.
**2423 px**. Die `projects-list`-Baseline zeigt fünf Skeleton-Zeilen statt der Tabelle. Beide
Tests waren dauerhaft grün, ohne etwas zu bewachen — dieselbe Klasse wie der Dashboard-Fund
aus dem Nachtrag, nur bereits *materialisiert* statt bloß drohend. Bei `project-room` hatte
der Datei-Header die Ursache sogar vorhergesagt („computed paths, work-item counts,
last-edit-times"); der eingefrorene Leer-Shell hat es verdeckt. → **stillgelegt via
`test.fixme`**, Wiederinbetriebnahme = **PROJ-Y-143d**.

**C-2 (mittel) — der geladene Zustand ist auf diesen Seiten nicht einfrierbar.**
`projects-table.tsx:129` rendert `formatRelative(project.updated_at)`, also „just now" /
„10m ago" / „5h ago" — ändert sich pro Lauf. Zusätzlich wächst die Zeilenzahl mit jedem
E2E-Lauf (beobachtet: 12 Zeilen, davon 11 akkumulierte `[E2E …]`-Fixtures, vgl.
**PROJ-Y-143c**). Damit variiert die Höhe, und ein `fullPage`-Baseline ist strukturell
unmöglich. Ein simples „neu aufnehmen" hätte den Test nur von *falsch-grün* auf
*dauerhaft-rot* gedreht. Auflösung braucht eine Coverage-Entscheidung (Clip auf die
deterministische Kopf-/Filter-Region **oder** gepinnte Seed-Daten) → **PROJ-Y-143d**.

**C-3 (niedrig) — Sprachmix auf einer Fläche.** Das Dashboard zeigt englische Titel
(`my-work-panel.tsx:108` „My Work", `project-health-exceptions-panel.tsx:77` „Project Health",
Tab „Approvals", Panel „Alerts") direkt neben deutschen Geschwister-Panels
(„Genehmigungen", „Deliverable-Freigaben", „Aktuelle Reports"). Schärfster Fall: der Tab
heißt **„Approvals"**, das Panel unmittelbar daneben **„Genehmigungen"** — dasselbe Konzept
zweisprachig auf einem Screen. Die Projektliste ist komplett englisch („Projects", „New
project", „Filters", „All statuses") bei deutscher Sidebar. Verstößt gegen die
Sprachkonvention in `CLAUDE.md` (fachliche Oberfläche = deutsch). Kein Testfehler, reine
Produktinkonsistenz → **PROJ-Y-143e**.

**C-4 (niedrig) — Kartenkopf bricht um.** „Project Health" umbricht im schmalen
rechten Spalten-Panel auf zwei Zeilen und drängt sich neben „0 von 2 Projekten". Rein
kosmetisch → mit **PROJ-Y-143e** gebündelt.

### Keine (c)-Klasse: `settings-tenant` ist echte Feature-Drift

Der Snapshot fiel nach dem Anker-Wechsel mit 4465 → **4505 px** aus. Ursache **nicht**
Ladezustand — die Tenant-Settings rendern gar keine Skeletons (0 Treffer in
`src/components/settings/`). Ursache ist `537f727` (**PROJ-130-α**, #321): in
`privacy-section.tsx` wurde eine 2-zeilige `FormDescription` durch eine 7-zeilige ersetzt
(„Ohne Wirkung: der Audit-Trail wird unbegrenzt aufbewahrt …"). Das sind die 40 px. Die
Baseline war lediglich **älter als das Feature** → **einmalig neu aufgenommen und hier
begründet**, nicht stillschweigend angepasst.

### AC-Y143b.5 — Daten-Anker statt Shell-Anker

`tests/PROJ-51-visual-regression-authenticated.spec.ts`: der Warte-Anker
`[data-sidebar='sidebar']` (Kommentar: „the most stable indicator of *fully loaded*") ist an
**allen 7** Aufrufstellen durch `waitForRenderedData()` ersetzt. Der Anker ist bewusst
**zweiseitig**, weil jede Hälfte allein unsauber ist:

- **positiv** `networkidle` — die Panel-Fetches sind zurück. *Nur* auf die Abwesenheit von
  Skeletons zu warten würde auf einem noch leeren DOM **sofort** durchlaufen (klassische
  Falle beim Warten auf Abwesenheit).
- **negativ** `.animate-pulse` → `toHaveCount(0)` — React hat die Daten geflusht. *Nur* auf
  das Netzwerk zu warten würde den Paint verpassen.

`.animate-pulse` ist das shadcn-`Skeleton`-Primitive. Die einzigen weiteren Nutzer in `src/`
sind Gantt-Submit-State, `sprint-card` und `trajectory-badges` — **keiner** rendert auf den
hier gesnapshotteten Seiten, auf diesen Routen bedeutet die Klasse also „Skeleton" und sonst
nichts. Eine Seite mit *dauerhaftem* Puls würde den Helper hängen lassen; das ist im
Doc-Kommentar als Prüfpflicht für neue Routen festgehalten.

### AC-Y143b.6 — Kaltstart belegt, kein Warm-Compile nötig

Erste Variante gewählt und **gemessen**: der Daten-Anker fängt den Kaltstart allein ab, die
`/api/dashboard/*`-Routen mussten **nicht** in `warmCompileDeepLinkRoutes` aufgenommen werden.

| Lauf | Bedingung | Ergebnis |
|---|---|---|
| 1 | frischer Worktree, **kein `.next` überhaupt** (kälter als `rm -rf .next/dev`) | Dashboard **grün** — vorher genau der Fehlschlag; 3 andere rot = die Funde C-1/Drift |
| 2 | `rm -rf .next/dev` nach dem Fix | **5 passed / 2 skipped** |
| 3 | Wiederholung | **5 passed / 2 skipped** |

### AC-Y143b.7 — Regel für künftige Neuaufnahmen

Im Doc-Kommentar des Helpers verankert: eine Neuaufnahme darf **nur** im verifiziert geladenen
Zustand erfolgen; ein Baseline-Bild im Skeleton-Zustand gilt als Fehler, nicht als neue
Wahrheit. Zusätzlich ein billiger Selbsttest, der C-1 sofort entlarvt hätte: **ist ein
`fullPage`-Snapshot exakt 720 px hoch, ist er verdächtig** — das ist die Viewport-Höhe, nicht
die Höhe einer echten Seite.

### AC-Status

| AC | Status |
|---|---|
| AC-Y143b.1 Baselines durchgesehen + gegen Soll-UI abgeglichen | ✅ (gegen die Code-Registry, nicht nur visuell) |
| AC-Y143b.2 jede Abweichung klassifiziert (a)/(b)/(c) | ✅ |
| AC-Y143b.3 (c)-Funde mit eigenem Eintrag, keine stille Anpassung | ✅ C-1/C-2 → PROJ-Y-143d, C-3/C-4 → PROJ-Y-143e |
| AC-Y143b.4 Ergebnis in dieser Spec dokumentiert | ✅ |
| AC-Y143b.5 Daten-Anker statt Shell | ✅ 7/7 Aufrufstellen |
| AC-Y143b.6 Kaltstart grün **oder** Warm-Compile erweitert | ✅ erste Variante, gemessen |
| AC-Y143b.7 Regel für Neuaufnahmen festgehalten | ✅ inkl. 720-px-Selbsttest |

### Gates

ESLint **0** · tsc **13 = Baseline, 0 in der geänderten Datei** · Playwright chromium
**2× 5 passed / 2 skipped** · kein Produktivcode angefasst (nur Testdatei + **eine** begründete
Baseline).

### Deviations

- **D-Y143b.1** — Der Auftrag erwartete Funde in `dashboard`/`stammdaten`; die sind sauber.
  Der Fehler saß in `projects-list`/`project-room`. Scope entsprechend erweitert, weil es
  exakt die Fehlerklasse ist, welche diese Spec adressiert.
- **D-Y143b.2** — Zwei Tests sind jetzt `test.fixme` statt grün. Das ist **Coverage-Gewinn
  an Ehrlichkeit, kein Verlust**: sie haben vorher Skeletons verglichen. Wiederinbetriebnahme
  = PROJ-Y-143d.
- **D-Y143b.3** — `settings-tenant` einmalig neu aufgenommen. Zulässig, weil als
  PROJ-130-α-Drift belegt (`537f727`) und hier begründet.
- **D-Y143b.4** — Mobile Safari übersprungen (WebKit-Host-Libs, PROJ-67/F2).

### Followups

- **PROJ-Y-143d** — `projects-list` + `project-room` wieder aktivieren: Clip auf die
  deterministische Region **oder** gepinnte Seed-Daten. Muss C-2 (relative Zeitstempel +
  wachsende Zeilenzahl) lösen, sonst dauerhaft rot.
- **PROJ-Y-143e** — Sprachmix Dashboard/Projektliste (C-3) + „Project Health"-Umbruch (C-4).

---

## Buchführungs-Nachtrag 2026-08-17 — `Deployed` / Scope `tooling-only`

Die Zeile stand auf `In Review` mit leerem Scope, obwohl der Code seit dem 2026-08-11 auf
`main` liegt. Nachgezogen wurde ausschließlich die Buchführung; **keine Code-Änderung**.

**Merge-Nachweis:** `68053bd` — *„chore(PROJ-Y-143b): review the frozen visual baselines, fix
the capture anchor"* (**PR #327**), verifiziert als Vorfahre von `origin/main`
(`git merge-base --is-ancestor` → ja). Vorläufer derselben Spur: `a5e8960` (#319, Anker-Risiko
ergänzt) und `f6d36e0` (#316, Registrierung der Zeile).

**Artefakte gegen `origin/main` geprüft, nicht aus der Spec übernommen:**

| Zusage | Befund auf `origin/main` |
|---|---|
| AC-Y143b.5 Daten-Anker statt Shell-Anker | `waitForRenderedData` definiert (Z. 135) + **8** Aufrufstellen; `[data-sidebar='sidebar']` als Warte-Anker verschwunden |
| AC-Y143b.7 720-px-Selbsttest festgehalten | im Datei-Kommentar mehrfach verankert (Z. 329/342/344/425/501/515) |
| C-1 stillgelegt via `test.fixme` | im eigenen Merge-Baum **2** Treffer — heute **0**, weil PROJ-Y-143d beide Tests wieder aktiviert hat |

Die achte Aufrufstelle ist kein Widerspruch zu den in der Spec genannten sieben: PROJ-Y-143h hat
danach den Fall „Dashboard mit gepinnter Nutzlast" ergänzt und den Anker mitbenutzt.

**Warum `tooling-only`:** der Merge berührt vier Dateien — `features/INDEX.md`, diese Spec,
`tests/PROJ-51-visual-regression-authenticated.spec.ts` und **eine** Baseline-PNG. **Kein
`src/**`**, keine Migration, keine Abhängigkeit. Damit greift die Definition „affects repository
tooling, CI, tests, or workflow and adds no product runtime capability" wörtlich, und die von der
Regel für diesen Wert verlangte Nachweisart („an executed repository tool, test, workflow, or CI
check") liegt vor: Playwright chromium 2× 5 passed / 2 skipped einschließlich eines Laufs aus
kaltem `.next` (AC-Y143b.6), ESLint 0, tsc 13 = Baseline.

**Keine offene Auslassung.** Alle sieben AC sind erfüllt; AC-Y143b.6 ist eine Disjunktion, deren
erster Zweig gemessen wurde. Die beiden abgegebenen Fundgruppen sind **geschlossen**, nicht
lediglich weitergereicht:

- C-1/C-2 → **PROJ-Y-143d**, `Deployed` / `tooling-only`. Unabhängig belegt: die zwei
  `test.fixme`-Markierungen existieren auf `main` nicht mehr, beide Tests laufen wieder.
- C-3/C-4 → **PROJ-Y-143e**, `Deployed` / `full`.

Die in D-Y143b.2 eingegangene Coverage-Schuld ist damit zurückgezahlt und nicht bloß umgebucht.
