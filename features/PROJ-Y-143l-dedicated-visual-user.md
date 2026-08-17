---
id: PROJ-Y-143l
title: "Eigener Nutzer für die Visual-Tests statt des geteilten [E2E]-Kontos"
issue_type: Chore
epic_code: HYGIENE
epic_title: "Hygiene & Supply-Chain"
priority: Medium
priority_source: "Should"
labels: ["hygiene", "testing", "visual-regression"]
dependencies: ["PROJ-143", "PROJ-Y-143f", "PROJ-Y-143d", "PROJ-Y-143g", "PROJ-Y-143h", "PROJ-Y-144d"]
roles: ["Platform"]
summary_for_jira: "[HYGIENE] Visual-Regression bekommt eine eigene Identität (Nutzer + Mandant + Projekt)"
---

# PROJ-Y-143l: eigene Identität für die Visual-Regression

## Status: Deployed
## Deployment Scope: tooling-only
**Erstellt:** 2026-08-12 · **Umgesetzt:** 2026-08-13
**Deployed:** 2026-08-13 (Code); Buchführung nachgezogen 2026-08-17
**Origin:** Fund F-1 aus PROJ-Y-143f.

## Problem

Der E2E-Nutzer `e2e00000-…-0001` gehört allen Slices gemeinsam. Als eine Parallel-Slice ihn
am 2026-08-12 in einen zweiten Mandanten aufnahm, kippten **alle sieben** authentifizierten
Visual-Baselines gleichzeitig: `tenant-switcher.tsx:34` rendert unterhalb von zwei
Mitgliedschaften ein Label und ab zwei einen Dropdown-**Button**, und der steht im
Sidebar-Fuß jeder eingeloggten Seite.

PROJ-Y-143f hat das **Symptom** strukturell entschärft (aktiven Mandanten per Cookie gepinnt,
Umschalter maskiert). Die **Ursache** blieb: Kontostand ist geteilter, veränderlicher Zustand.

Und die Kopplung reicht weiter als bis zur Mitgliedschaft — die Baselines fotografieren
Konto- und Mandanten-Zustand direkt:

| Baseline | zeigt | Quelle |
|---|---|---|
| alle sieben | Workspace-Label im Sidebar-Fuß | `tenants.name` + Anzahl Mitgliedschaften |
| `dashboard.png` | „Hallo, …" | `profiles.display_name` |
| `settings.png` | E-Mail + Anzeigename | `profiles` |
| `settings-tenant.png` | Name, Domain, Sprache, Branding, **alle Modul-Schalter** | `tenants` + `tenant_settings` |
| `stammdaten-resources.png` | `ModuleUnavailableNotice` bzw. echte Liste | `tenant_settings.active_modules` |

PROJ-Y-143f hat für seinen eigenen AC-Y143f.4 Module auf dem **geteilten** Mandanten
kurzzeitig aktiviert — völlig korrekt und trotzdem etwas, das unter einem geteilten Mandanten
zwei Baselines bewegt.

## Entscheidungen (gelockt)

**L1 — eigener Nutzer *und* eigener Mandant.** Nur ein eigener Nutzer hätte die Kopplung auf
die Mandanten-Achse verschoben (Name, Domain, Branding, `active_modules`), also genau dorthin,
wo PROJ-Y-143f legitim eingreifen musste. Preis: ein dritter Mandant und ein zweites
Seed-Projekt. Nutzen live gemessen, nicht behauptet (siehe Nachweis B).

**L2 — eigene E-Mail und eigene `tenants.domain`.** Beide sind UNIQUE, und `global-setup`
wertet „already registered" als Erfolg und meldet sich danach **per E-Mail** an. Wiederverwendung
hätte den Seed zu einem stillen No-op gemacht, der eine fremde Identität authentifiziert —
genau der Fehler, in den PROJ-143 gelaufen wäre.

**L3 — bewusst *andere* Namen.** Zwei Zeilen „[E2E] Test User" wären in der Datenbank nicht
unterscheidbar. Distinkte Namen machen eine versehentliche Über-Kreuz-Nutzung im Bild sichtbar:
Begrüßung und Workspace-Label unterscheiden sich, die Suite wird rot statt still zu driften.

**L4 — `active_modules` explizit geschrieben.** Gegenrichtung zur PROJ-Y-144d-Lehre: dort war
das Risiko ein Fail-open, hier ist es der Tabellen-Default. Zwei Baselines hängen daran; ein
später erweiterter Default würde sie stillschweigend umdeuten. Gewählt ist exakt der Satz, den
der geteilte Mandant beim Ziehen der bisherigen Baselines trug, damit jede Pixel-Differenz nach
der Migration den Identitäts-Strings zuzuordnen ist und nicht dem Modul-Zustand.

**L5 — aktiver Mandant weiterhin per Cookie gepinnt**, obwohl dieser Nutzer nur eine
Mitgliedschaft hat. Der Pin darf nicht von der Invariante abhängen, die er absichern soll.

**L6 — der Maskenfall wird umgedreht: der Workspace-Umschalter wird wieder *bewacht*.**
PROJ-Y-143f hat ihn maskiert, was richtig war, solange er fremdes Konto-Bookkeeping zeigte.
Er zeigt jetzt eigenen Zustand; ihn weiter zu maskieren hieße, die Spur blind zu machen für
eine echte Regression darin. Nebenbefund: Maskieren hat ohnehin nie ganz geschützt — die
Dropdown-Variante ist *breiter* als das Label, die umgebenden Pixel wandern mit. Statt eines
Pixel-Deltas gibt es jetzt eine lesbare Zusicherung (`expectSoleWorkspaceLabel`).

**L7 — Wechselwirkung mit PROJ-Y-143c (Alt-Mandant):** keine. Die Visual-Spur berührt weder
den Alt-Mandanten noch dessen 43 Testprojekte; PROJ-Y-143c bleibt unabhängig entscheidbar. Die
dort beschriebene Testdaten-Anhäufung trifft die Spur nicht mehr: fremde Specs legen keine
Projekte mehr in dem Mandanten an, den `projects-list.png` fotografiert.

## Akzeptanzkriterien

- **AC-Y143l.1** — Eigene, RFC-4122-v4-konforme Identität (Nutzer, Mandant, Projekt), vom
  harten Guard in `global-setup` mitgeprüft. ✅
- **AC-Y143l.2** — Eigene E-Mail und eigene Domain; der Seed ist idempotent und kein No-op. ✅
  live provisioniert und verifiziert.
- **AC-Y143l.3** — Der Visual-Nutzer hat **genau eine** Mitgliedschaft, und niemand sonst ist
  Mitglied des Visual-Mandanten. ✅ als Test, nicht als Annahme
  (`PROJ-Y-143l-visual-lane-isolation.spec.ts`, 6/6).
- **AC-Y143l.4** — `active_modules` und der aktive Mandant sind explizit gesetzt, nicht aus
  Default oder Mitgliedschafts-Reihenfolge abgeleitet. ✅
- **AC-Y143l.5** — Nur `PROJ-51-visual-regression-authenticated.spec.ts` nutzt die neue
  Identität; alle übrigen authentifizierten Specs bleiben unverändert auf `authenticatedPage`. ✅
- **AC-Y143l.6** — Die sieben Baselines wurden neu gezogen, **jede einzeln im Bild geprüft**
  (AC-Y143b.5–7: grün ≠ korrekt). ✅
- **AC-Y143l.7** — Keine gemessene Toleranz gelockert. ✅ alle sieben bleiben bei
  `maxDiffPixels: 20` aus PROJ-Y-143d/g/h.
- **AC-Y143l.8** — Die Isolation ist **belegt**, nicht behauptet: dieselbe Mutation trifft die
  Spur nicht, wenn sie am geteilten Konto passiert, und trifft sie sehr wohl, wenn sie am
  eigenen Mandanten passiert. ✅ siehe Nachweis.
- **AC-Y143l.9** — Null Rückstände in der Produktionsdatenbank aus den Experimenten,
  per Folgeabfrage geprüft. ⚠️ **abgeschriebenes Kriterium (Waiver, 2026-08-17)** — wörtlich
  unerfüllt, nichts offen. 6 Zeilen in `audit_log_entries` bleiben; sie sind strukturell nicht
  entfernbar (append-only seit PROJ-130-α, `42501` für **jede** Rolle inklusive `service_role`
  und `postgres`). Die vier kumulativen Bedingungen aus `.claude/rules/general.md`
  („Waived criterion") sind geprüft, Herleitung im Buchführungs-Nachtrag unten; zusätzlich als
  **geschlossener** Eintrag `PROJ-Y-143l-w1` in `features/OPEN-DEFERRED-STATUS.md`.
- **AC-Y143l.10** — Stabilität: ≥ 3 Läufe plus ein Lauf aus kaltem `.next`. ✅

## Nachweis der Isolation

Alle Experimente live gegen die Produktionsdatenbank, danach zurückgebaut.

**A — Mitgliedschafts-Achse.** Temporärer Mandant + Mitgliedschaft für den **geteilten**
Nutzer (2 → 3 Mitgliedschaften; genau der Zustand, der am 2026-08-12 sieben Baselines kippte).
Visual-Suite **15/15 grün**.

**B1 — Mandanten-Achse, fremd.** `resources` auf dem **geteilten** Mandanten aktiviert.
Visual-Suite unverändert **15/15 grün**.

**B2 — Gegenprobe, eigen.** Dieselbe Aktivierung auf dem **Visual**-Mandanten:
**2 rot** — `Resources page` (Modul-Hinweis → echte Liste) und `Tenant settings page`
(Schalter an), 13 grün. Nach Rücknahme wieder **15/15**.

B2 ist der eigentliche Beweis: die Bilder sind gegenüber Mandanten-Zustand **nicht blind**,
und die Trennlinie liegt exakt am Mandanten — dieselbe Änderung ist einmal unsichtbar (B1) und
einmal rot (B2).

**Ein Zwischenbefund aus B2, der die Sache ehrlicher macht:** der erste Versuch, den Modulsatz
per SQL zu ändern, blieb wirkungslos — `global-setup` schreibt `active_modules` bei **jedem**
Lauf zurück. Der Seed heilt sich selbst. Konsequenz für den Isolationstest: der Fall
„gepinnter Modulsatz" prüft, dass der Seed *gewirkt* hat, nicht dass niemand driftet — Drift
wird vor dem ersten Test repariert. Der wirkliche Wächter gegen Drift sind die beiden Bilder,
die den Modulsatz pixelweise abbilden. Im Test steht das jetzt so.

### Rückstandsprüfung

| Prüfung | Wert |
|---|---|
| Probe-Mandant (per ID und per Name) | 0 |
| Mitgliedschaften / Settings / Projekte des Probe-Mandanten | 0 / 0 / 0 |
| Mitgliedschaften des geteilten Nutzers | 2 (Ausgangswert) |
| Module geteilter Mandant / Visual-Mandant | je die vier Ausgangswerte |
| `tenant_memberships_admin_invariant_delete` scharf | ja (`O`) |

**Benannte Ausnahme:** 6 Zeilen in `audit_log_entries` (`__created`/`__deleted` je für
`tenants`, `tenant_memberships`, `tenant_settings` des Probe-Mandanten). Seit PROJ-130-α ist
der Trail append-only und kennt keinen Löschpfad — das ist genau das, wovor PROJ-Y-130h warnt
(„Test-Rauschen sammelt sich unwiderruflich"). Das Paar ist symmetrisch und selbsterklärend;
es wurde nicht per Trigger-Umgehung unterdrückt, weil ein `__created` ohne `__deleted` den
Trail schlechter hinterließe als sechs ehrliche Zeilen.

**Nebenbefund (kein Handlungsbedarf in dieser Slice):** ein Mandant lässt sich per normalem DML
**gar nicht** löschen. `tenant_memberships_admin_invariant_delete` verbietet das Entfernen der
letzten Admin-Mitgliedschaft, und die Kaskade aus `tenants` feuert denselben Trigger. Der
Probe-Mandant wurde deshalb entfernt, indem **genau dieser eine** Trigger innerhalb derselben
Transaktion abgeschaltet und wieder scharf gestellt wurde; die PROJ-130-Audit-Trigger blieben
an, deshalb ist die Löschung protokolliert. Das ist Kontext für **PROJ-Y-143c**, das eine
Mandanten-Löschung erwägt.

## Was unterwegs aufgefallen ist

### F-1 (hoch, in dieser Slice behoben) — die Suite lief gegen den Code einer fremden Worktree

Mitten in den Stabilitätsläufen war `stammdaten.png` intermittierend 1590 statt 1574 px hoch.
Das Diff-Bild zeigte Modul-Hinweise **in den Stammdaten-Kacheln** — also die Funktion der
parallel laufenden Slice **PROJ-Y-143k**, die auf diesem Branch gar nicht existiert.

Ursache: `playwright.config.ts` hatte Port 3000 dreifach hartkodiert, `reuseExistingServer` ist
außerhalb CI an, und `ps`/`ss` belegten, dass Port 3000 dem Worktree `pv3-y143k` gehörte. Wer
zuerst bindet, bedient die Tests der anderen Session — intermittierend, weil beide Server um
den Port rangen. Eine in diesem Zustand gezogene Baseline friert Code ein, der nicht auf dem
Branch liegt.

Dazu ein echter Konfigurationsdefekt: `PLAYWRIGHT_BASE_URL` wurde **nur** von `global-setup`
gelesen (das die Auth-Cookies auf diesen Host pinnt), während `use.baseURL` und `webServer.url`
konstant blieben. Wer die Variable setzte, bekam Cookies für den einen und Seiten vom anderen
Origin — was wie ein Produktfehler aussieht. Behoben: eine Quelle, von Runner, Dev-Server
(`PORT`) und Fixture gleichermaßen benutzt. Alle Baselines wurden danach auf einem eigenen Port
(3210) neu gezogen und geprüft.

Das ist dieselbe Klasse wie das Slice-Thema selbst — geteilter veränderlicher Zustand zwischen
parallelen Sessions —, nur eine Ebene tiefer: nicht das Konto, sondern der Port.

### F-2 (mittel) — der Isolationstest kann Modul-Drift nicht sehen

Siehe Nachweis B2. Im Test dokumentiert statt stillschweigend hingenommen.

## Bewegte Baselines

Alle sieben, jede im Bild geprüft. Die Höhen sind bis auf eine identisch zum Vorzustand:

| Bild | vorher | nachher | Grund |
|---|---|---|---|
| `dashboard` | 1545 | **1547** | längerer Anzeigename bricht die Begrüßung um |
| `settings` | 868 | 868 | E-Mail + Anzeigename der neuen Identität |
| `settings-tenant` | 4505 | 4505 | Workspace-Name + Domain |
| `stammdaten` | 1574 | **1590** | Sidebar-Fuß **+ PROJ-Y-143k**, siehe Rebase-Abschnitt |
| `stammdaten-resources` | 720 | 720 | nur Sidebar-Fuß; Modul-Hinweis unverändert (L4) |
| `projects-list` | 720 | 720 | nur Sidebar-Fuß; Tabelle bleibt maskiert |
| `project-room` | 720 | 720 | nur Sidebar-Fuß |

In allen sieben ersetzt der echte Workspace-Text die bisherige Maske (L6). Geprüft wurde
jeweils der **geladene** Zustand: keine Skelette, kein „Compiling …"-Badge, Dashboard mit der
gepinnten Fixture (4 offene Aufgaben), Projektraum mit gefüllten Kacheln, `settings-tenant` mit
genau vier aktiven Modul-Schaltern.

## Rebase auf `main` (2026-08-13) — `stammdaten.png` gehört keiner Seite allein

Zwischen Fertigstellung und Merge landete **PROJ-Y-143k** (`45e0204`): modul-gegatete
Stammdaten-Kacheln bleiben sichtbar, werden aber gekennzeichnet und sind **keine Links** mehr.
Beide Slices haben dieselbe Datei neu gezogen — 143k unter dem **geteilten**, 143l unter dem
**Visual**-Mandanten. **Keine der beiden Fassungen ist richtig:** die eine zeigt die neue
Funktion mit der alten Identität, die andere die neue Identität ohne die Funktion. Der Konflikt
wurde deshalb nicht durch Übernahme einer Seite aufgelöst, sondern durch **Löschen der Datei und
Neuzeichnen** nach dem Rebase (`--update-snapshots` ist unterhalb der Toleranz ein stiller
No-op, PROJ-Y-143d-Lehre).

**Welche Kacheln gekennzeichnet sind, folgt aus dem Code, nicht aus dem Bild:** genau 2 der 14
Kacheln in `stammdaten-sections.ts` tragen ein `requiresModule` — `resources` („Ressourcen")
und `vendor` („Lieferanten"). `E2E_VISUAL_ACTIVE_MODULES` (L4) ist
`["risks","decisions","ai_proposals","audit_reports"]` und enthält **keines von beiden**, also
sind im neuen Bild **genau diese zwei** gekennzeichnet: gestrichelter Rahmen, gedämpfter
Hintergrund, Schloss statt Chevron und der Satz „Das Modul „…" ist für diesen Workspace nicht
aktiv." Die übrigen zwölf behalten Chevron und Link. Nicht gekennzeichnet ist insbesondere
**„Organisation"** — 143k hat das bewusst so entschieden (der `organization`-Schalter ist
wirkungslos, → PROJ-Y-143n); das Bild bestätigt die Entscheidung, statt sie zu unterlaufen.

Im Bild geprüft (AC-Y143b.5–7, grün ≠ korrekt): geladener Zustand, keine Skelette, kein
Kompilier-Badge, alle 14 Kacheln mit echtem Inhalt, Sidebar-Fuß mit dem **unmaskierten**
Workspace-Text „[E2E] Visual-Regression Workspace" und ohne Dropdown-Chevron (= Label-Zweig,
also weiterhin genau eine Mitgliedschaft). Höhe **1590 px** — identisch zu 143ks Baseline auf
`main`, was zusammenpasst: beide Mandanten haben `resources` und `vendor` aus, die Kennzeichnung
kostet in beiden Fällen dieselben 16 px gegenüber 1574.

**Die übrigen sechs Baselines hat 143k nicht bewegt — geprüft, nicht angenommen:** im ersten
Lauf nach dem Rebase waren sie 8/8 grün gegen den gemergten Baum, während allein `stammdaten`
als fehlend gemeldet und geschrieben wurde; keine der sechs Dateien unterscheidet sich vom
Stand des Branch-Commits. **Keine Toleranz gelockert** (AC-Y143l.7 unverändert: alle sieben
`maxDiffPixels: 20`).

Textkonflikt nur in `features/INDEX.md` und dort nur in der eigenen Zeile: alle fremden Zeilen
wurden **wortgleich** von `main` übernommen (169 Zeilen, genau eine weicht ab — die eigene),
inklusive der neuen `PROJ-Y-143k`, `PROJ-Y-143n` und `PROJ-Y-143o`.
`features/OPEN-DEFERRED-STATUS.md` wird von dieser Slice gar nicht angefasst, hatte also keinen
Konflikt. Der parallel gemergte PROJ-Y-143c (`99ad059`, #373) berührt weder Fixtures noch
Quellcode und damit die Spur nicht.

## Gates

Nach dem Rebase auf `main` (`99ad059`) neu gemessen: ESLint **0** · tsc **13 = Baseline / 0 neu**
(gemessen mit gelöschtem `.next`, weil eine abgeschnittene `validator.ts` tsc früh abbrechen und
*weniger* Fehler melden lässt; alle 13 liegen in Dateien, die diese Slice nicht anfasst) ·
vitest **2931/2931** (375 Dateien) ·
`npm run build` clean (exit 0) · `check:index-scope` OK (169 Zeilen, 0 Fehler; die 120
unklassifizierten Alt-Zeilen sind die von PROJ-145 bewusst sichtbar gemachte Altschuld) ·
Playwright chromium: Visual **3× 9/9 + Kaltstart 9/9**, Isolation **6/6**.

## Deviations

- **D-Y143l.1** — Der Workspace-Umschalter wird entmaskiert (L6). Das *verschärft* die Prüfung
  und zieht deshalb alle sieben Baselines nach, obwohl inhaltlich nur drei Seiten neue
  Identitäts-Strings zeigen.
- **D-Y143l.2** — `playwright.config.ts` wird mit angefasst, obwohl die Slice nominell nur die
  Identität betrifft. Ohne den Fix ist keine der Messungen belastbar (F-1); mit ihm sind die
  Läufe reproduzierbar. Verhalten ohne gesetzte Variable ist unverändert (`localhost:3000`).
- **D-Y143l.3** — Der mutierende Isolationsbeweis läuft **nicht** als committeter Test. Ein
  Test, der das geteilte Konto verändert, wäre selbst das Problem und würde die Specs rennen,
  die er prüft. Committet ist die read-only Invariante; der mutierende Teil ist ein einmaliges,
  hier protokolliertes Experiment.
- **D-Y143l.4** — 6 Audit-Zeilen bleiben unwiderruflich (siehe Rückstandsprüfung).
- **D-Y143l.5** — Mobile Safari übersprungen (WebKit-Host-Libs, PROJ-67/F2).
- **D-Y143l.6** — `stammdaten.png` trägt jetzt das Ergebnis **zweier** Slices (eigene Identität
  + PROJ-Y-143ks Kennzeichnung). Das ist unvermeidbar — ein Bild kann nur einen Zustand zeigen —
  aber es heißt, dass ein späterer Revert einer der beiden Slices diese Baseline mitnehmen muss.
  Die Herleitung steht deshalb oben im Klartext (welche zwei Kacheln, aus welcher Konstante),
  damit sie ohne erneutes Ausprobieren nachvollziehbar ist.

## Followups

- **PROJ-Y-143c** unverändert offen und unabhängig; der Nebenbefund zur Mandanten-Löschung oben
  ist Eingangswissen dafür. — Stand 2026-08-17: inzwischen `Deployed` / `tooling-only`.
- Kandidat: `npm run test:e2e:fresh` tötet den `:3000`-Listener und kennt den neuen Port noch
  nicht — harmlos, aber inkonsistent, sobald jemand mit `PLAYWRIGHT_BASE_URL` arbeitet.

---

## Buchführungs-Nachtrag 2026-08-17 — `Deployed` / Scope `tooling-only`

Die Zeile stand auf `In Review` mit leerem Scope, obwohl der Code seit dem 2026-08-13 auf `main`
liegt. Nachgezogen wurde ausschließlich die Buchführung; **keine Code-Änderung**.

**Merge-Nachweis:** `102800c` — *„feat(PROJ-Y-143l): eigene Identität für die Visual-Regression"*
(**PR #371**), verifiziert als Vorfahre von `origin/main` (`git merge-base --is-ancestor` → ja).

**Artefakte gegen `origin/main` geprüft, nicht aus der Spec übernommen:**

| Zusage | Befund auf `origin/main` |
|---|---|
| AC-Y143l.1 eigene, v4-konforme Identität | `E2E_VISUAL_USER_ID`/`_TENANT_ID`/`_PROJECT_ID` = `…-4e2e-8e2e-…000006/7/8` — Versions-Nibble **4**, Varianten-Nibble **8**, also wirklich RFC-4122-v4 und nicht bloß „sieht aus wie eine UUID" (genau der Defekt, den PROJ-143 behoben hat) |
| AC-Y143l.2 eigene E-Mail + eigene Domain | `e2e-visual@…` und `e2e-visual.projektplattform-v3.test`, beide distinkt von der geteilten Identität |
| AC-Y143l.3 genau eine Mitgliedschaft, als Test | `tests/PROJ-Y-143l-visual-lane-isolation.spec.ts` mit **6** Fällen |
| AC-Y143l.4 `active_modules` explizit | `E2E_VISUAL_ACTIVE_MODULES` als eigene Konstante vorhanden |
| AC-Y143l.5 nur die Visual-Spur nutzt die Identität | `visualPage` wird außer in der Fixture und ihrer README von **genau einer** Spec-Datei benutzt: `PROJ-51-visual-regression-authenticated.spec.ts`; alle übrigen bleiben auf `authenticatedPage` |
| AC-Y143l.7 keine Toleranz gelockert | **7×** `maxDiffPixels: 20` — für jede der sieben Aufnahmen, keine auf eine Verhältniszahl zurückgedreht |

**Warum `tooling-only`:** der Merge liefert 16 Dateien aus — `playwright.config.ts`, vier Dateien
unter `tests/fixtures/`, zwei Spec-Dateien, sieben Baseline-PNGs, `features/INDEX.md` und diese
Spec. **Kein `src/**`**, keine Migration, keine Abhängigkeit. Damit greift die Definition
„affects repository tooling, CI, tests, or workflow and adds no product runtime capability"
wörtlich, ebenso die in PROJ-Y-145b Tranche 2 präzisierte Grenzregel (was Produktions-Laufzeit
nicht anfasst, ist `tooling-only`). Die für diesen Wert verlangte Nachweisart („an executed
repository tool, test, workflow, or CI check") liegt vor: Playwright chromium Visual
**3× 9/9 + Kaltstart 9/9** und Isolation **6/6**, ESLint 0, tsc 13 = Baseline, vitest 2931/2931,
Build clean.

Dass die Slice **Fixture-Zeilen in der Produktionsdatenbank** anlegt, ändert daran nichts: sie
ändern kein Produktverhalten, sondern sind Testdaten in einem eigenen `[E2E]`-Mandanten — dieselbe
Einordnung wie bei PROJ-143 und PROJ-Y-144d, die beide als `tooling-only` bzw. innerhalb ihrer
Elternslice gebucht sind.

### Die eine literal unerfüllte Zusage: AC-Y143l.9 (Waiver `PROJ-Y-143l-w1`)

AC-Y143l.9 verlangt **„Null Rückstände in der Produktionsdatenbank aus den Experimenten"**.
Wörtlich ist das nicht erfüllt: **6 Zeilen** in `audit_log_entries` bleiben stehen
(`__created`/`__deleted` je für `tenants`, `tenant_memberships`, `tenant_settings` des
Probe-Mandanten aus den Isolationsversuchen A/B1/B2). Das wird hier **nicht** zu „✅ mit
Ausnahme" gerundet — die Slice-Reihe PROJ-141-γ1 und PROJ-96 sind die Hausbelege dafür, wohin das
führt.

Eingeordnet wird es als **abgeschriebenes Kriterium** nach dem Muster `PROJ-Y-145f-w1/w2`. Eine
Ehrlichkeits-Anmerkung zur Regelanwendung: der Abschnitt „Waived criterion" in
`.claude/rules/general.md` ist ausdrücklich für **`full`** geschrieben, und `tooling-only` ist
nach seiner Definition eine Aussage über die **Lieferachse** samt Nachweisart, nicht über
AC-Vollständigkeit — die vier Bedingungen sind hier also **nicht** formal erzwungen. Sie werden
trotzdem angelegt, weil sie der strengste verfügbare Maßstab sind und weil Schritt 4 des
Buchführungs-Verfahrens jede akzeptierte Auslassung unabhängig vom Scope sichtbar verlangt:

1. **Nichts zurückgestellt.** Es gibt kein Folge-Ticket, das diese Zeilen entfernen würde, und es
   kann keines geben — siehe (2). PROJ-Y-130h und PROJ-Y-143o betreffen *künftiges* Test-Rauschen
   (Ausnahme-Flag bzw. Teardown an der Quelle), nicht diese sechs Bestandszeilen; PROJ-Y-143o
   stellt in seinem Nachtrag ausdrücklich fest, dass bereits entstandene Zeilen „nicht rückholbar"
   sind.
2. **Nachweislich unerreichbar, heute re-verifizierbar.** Seit PROJ-130-α ist der Trail
   append-only: die Wächter `audit_log_no_update`/`_no_delete`/`_no_truncate` liefern `42501` für
   **jede** Rolle einschließlich `service_role` und `postgres`, und der Mandanten-Fremdschlüssel
   wurde in derselben Migration entkoppelt, damit Zeilen das Löschen ihres Mandanten überleben.
   Die Zeilen sind also nicht „noch nicht aufgeräumt", sondern **strukturell unlöschbar** — und
   das ist gewollte Produkteigenschaft, nicht Defekt. Re-verifizierbar über den PROJ-130-α-Pentest
   (19/19), der genau diese Wächter prüft.
3. **Schriftliche Abnahme, die das Kriterium benennt.** `D-Y143l.4` („6 Audit-Zeilen bleiben
   unwiderruflich") plus der Abschnitt *Rückstandsprüfung*, der die Ausnahme als **benannte
   Ausnahme** führt und ihren Inhalt einzeln auflistet. Bewusst nicht behauptet wird ein
   QA-Verdikt: für diese Slice ist kein `/qa`-Durchlauf gefahren worden, die Abnahme ist der
   Deviation-Eintrag.
4. **Substanz durch andere Messung belegt.** Die Absicht des Kriteriums ist, dass die Experimente
   nichts hinterlassen, was Produktverhalten oder künftige Testergebnisse verändert. Genau das ist
   gemessen und in der Tabelle *Rückstandsprüfung* protokolliert: Probe-Mandant 0 (per ID **und**
   per Name), dessen Mitgliedschaften/Settings/Projekte 0/0/0, der geteilte Nutzer zurück auf
   seinen Ausgangswert von 2 Mitgliedschaften, beide Modulsätze auf den Ausgangswerten, und der
   für den Abriss kurzzeitig entschärfte `tenant_memberships_admin_invariant_delete` wieder scharf
   (`O`). Die verbleibenden sechs Zeilen sind ein Protokoll *über* das Experiment, kein Zustand,
   den das Experiment hinterlassen hat — sie sind zudem symmetrisch (`__created` **und**
   `__deleted`) und wurden bewusst nicht per Trigger-Umgehung unterdrückt, weil ein `__created`
   ohne Gegenstück den Trail schlechter hinterließe als sechs ehrliche Zeilen.

Der Waiver ist doppelt protokolliert: an AC-Y143l.9 oben und als **geschlossener** Eintrag
`PROJ-Y-143l-w1` in `features/OPEN-DEFERRED-STATUS.md` — geschlossen, weil nichts offen ist, aber
eingetragen, damit er greppbar bleibt.

**Sonst keine offene Auslassung.** Die übrigen neun AC sind erfüllt (oben gegen `origin/main`
nachgeprüft, nicht aus der Spec übernommen). Die sechs Deviations D-Y143l.1–.6 sind Abweichungen
in der *Vorgehensweise*, keine zurückgestellten Kriterien: D-Y143l.1 (Entmaskierung) **verschärft**
die Prüfung, D-Y143l.2 (`playwright.config.ts` mitgeändert) war Voraussetzung dafür, dass
überhaupt eine belastbare Messung möglich ist (F-1), D-Y143l.3 (mutierender Beweis nicht
committet) ist eine begründete Test-Design-Entscheidung, D-Y143l.4 ist der oben behandelte Waiver,
D-Y143l.5 ist die bekannte WebKit-Umgebungsgrenze (PROJ-67/F2), D-Y143l.6 dokumentiert die
Doppel-Herkunft von `stammdaten.png`.
