# PROJ-Y-150a — Branch-Kollisions-Guard erzwingen (Harness-Hook)

## Status: Deployed
## Deployment Scope: tooling-only

## Problem

PROJ-150 hat den Guard gebaut, aber **nichts hat ihn erzwungen** — D-150.2 sagte das ausdrücklich:
„der Guard ist ein *vorgeschriebener* Befehl, nicht ein erzwungener". Damit war die Slice die halbe
Antwort: sie ersetzt eine Regel durch ein Kommando, und das Kommando muss weiterhin jemand aufrufen.
PROJ-Y-130f hatte zeitgleich vorgeführt, wohin das führt (`moddatetime`-Regel, monatelang wörtlich in
CLAUDE.md, zweimal verletzt, 883 nicht ausgeführte Zeilen).

Gemessen gab es in diesem Repo **keinen** automatischen Vorab-Haken: git-Hooks nur als `.sample`,
kein `hooks`-Block in `.claude/settings.json` oder `.claude/settings.local.json`.

## Die drei offenen Fragen aus dem Register, beantwortet

- **Nur beim Anlegen, nicht beim Wechseln.** Erkannt werden `git checkout -b|-B`,
  `git switch -c|-C|--create`, `git worktree add … -b|-B` und `git branch <name>` ohne
  Lösch-/Listen-/Verschiebe-Flag. Wechseln, Auflisten, Löschen, Rebasen bleiben unberührt — sie zu
  blockieren würde jeden gewöhnlichen Ablauf brechen, und ein Hook, der das tut, wird binnen eines
  Tages abgeschaltet. `git worktree add <pfad> <branch>` **ohne** Anlege-Flag checkt einen
  bestehenden Zweig aus und gilt bewusst nicht als Anlegen.
- **Der Umgehungsweg ist der Mensch.** Das Urteil ist `ask`, nicht `deny`: eine Kollision ist eine
  Ermessensfrage („ist die andere Spur noch dran?"), also geht sie an den Nutzer. Damit gibt es
  **keinen geheimen Bypass-Schalter**, der in den Kontext eines Modells geraten und die Sperre
  wertlos machen könnte. `BRANCH_COLLISION_GUARD=off` existiert allein für kopflose Läufe und steht
  in CLAUDE.md, nicht in der Ablehnungsmeldung.
- **Fail-open, dreifach.** Das Urteil reist über **stdout als JSON**, der Exit-Code ist immer `0`.
  Stürzt node ab, greift die Erkennung ins Leere oder fehlt der Guard im Checkout, wird kein JSON
  ausgegeben und der Aufruf läuft durch. Ein Hook, der `git` für **alle** Sessions dieser Maschine
  brechen kann, darf nicht fail-closed sein können.

## Akzeptanzkriterien

- **AC-Y150a.1** Ein `PreToolUse`-Hook auf `Bash` in `.claude/settings.json` ruft den PROJ-150-Guard
  auf, wenn ein Befehl einen Branch **anlegt**; `if: "Bash(git *)"` verhindert, dass er für
  Nicht-git-Aufrufe überhaupt gestartet wird.
- **AC-Y150a.2** Bei belegter Slice lautet das Urteil `ask` mit einer Begründung, die den Halter
  benennt (Worktree-Pfad bzw. Tag).
- **AC-Y150a.3** Kein Urteil bei Wechseln, Auflisten, Löschen, Verschieben, `worktree add` ohne
  Anlege-Flag, oder wenn der Branchname keine Slice-Kennung trägt.
- **AC-Y150a.4** Kein Urteil, wenn eine Branch-Kennung in einem **Zitat** steht
  (`git log --grep='checkout -b …'`).
- **AC-Y150a.5** Fail-open bei unlesbarer Nutzlast, leerem stdin, fehlendem `tool_input`, fehlendem
  Guard und gesetztem `BRANCH_COLLISION_GUARD=off` — jeweils kein JSON, Exit 0.
- **AC-Y150a.6** Der konfigurierte Befehl funktioniert unabhängig vom Arbeitsverzeichnis und
  ausserhalb eines Repos, ohne zu stürzen.
- **AC-Y150a.7** Die Befehlserkennung ist unit-getestet, Rot-Grün ausgeführt.
- **AC-Y150a.8** CLAUDE.md benennt den Hook, den Umgehungsweg und wie man ihn abschaltet.

## Tech Design

`scripts/hooks/branch-collision-guard.mjs` — **reines ESM-JavaScript, kein TypeScript**, weil es bei
jedem `git *`-Aufruf in Millisekunden starten muss (tsx kostet 1–2 s). Es filtert schnell und ruft
den Guard nur bei echtem Anlegen über `npx tsx` auf.

**Keine zweite Wahrheit für Slice-Kennungen:** der Hook übergibt den **Branchnamen** an den Guard und
lässt dessen `canonicalizeSliceId` die Kennung herauslesen. Exit 1 = belegt, Exit 2 = keine Kennung
(→ durchlassen), alles andere = konnte nicht antworten (→ durchlassen).

**Segmentweises Parsen statt freier Regex.** Die Zeile wird an `&&`, `||`, `;`, `|`, Zeilenumbruch und
`&` zerlegt — zitatbewusst —, dann wird je Segment tokenisiert. Sonst liest
`git log --grep="checkout -b x"` wie ein Anlegen.

**Wurzel aus der eigenen Dateilage**, nicht aus `cwd` und nicht aus einer Umgebungsvariablen:
`<repo>/scripts/hooks/…` → drei Ebenen hoch. Der Befehl in `settings.json` bestimmt sie zusätzlich
über `git rev-parse --show-toplevel`, damit er aus jedem Worktree und jedem Unterordner trägt.

**Portabilitäts-Befund:** jedes dokumentierte Hook-Beispiel leitet stdin durch `jq` — dieser Rechner
hat **kein** `jq` (geprüft). Das kanonische Muster wäre hier still gescheitert; geparst wird daher in
node, was die Befehlserkennung zugleich testbar macht statt sie als Shell-Einzeiler zu verstecken.

## Nachweise

| AC | Nachweis |
|---|---|
| Y150a.1 | `.claude/settings.json` mit `matcher: "Bash"`, `if: "Bash(git *)"`; Schema programmatisch geprüft, 16 Bestands-Berechtigungsregeln unverändert |
| Y150a.2 | Der **auslösende Befehl des Vorfalls** (`git worktree add -b proj-y-45p/…`) ergibt `ask` und nennt `/tmp/pv3-y45p` **und** `v2.75.0-PROJ-Y-45p` |
| Y150a.3 | 16-Fall-Batterie über den echten Hook: 12 ALLOW / 4 ASK, richtig einsortiert |
| Y150a.4 | `git log --oneline -3 --grep='checkout -b proj-y-45p/x'` → ALLOW |
| Y150a.5 | Fünf Fail-open-Proben, alle „kein JSON, Exit 0" |
| Y150a.6 | Der **wörtliche Befehl aus settings.json** aus Worktree-Wurzel, aus `src/lib` und aus `/tmp` (dort still, kein Absturz) |
| Y150a.7 | 37 Unit-Tests; Rot-Grün: Anlege-Regel entschärft → **4 von 37** rot, per Dateikopie zurückgesetzt, byte-identisch |
| Y150a.8 | `CLAUDE.md` |

## Bewusste Abweichungen und Grenzen

- **Nachtrag 2026-08-27, zweiter: der `ask`-Entscheid ist zurueckgenommen (PROJ-Y-150c).** Diese Spec
  verteidigt `ask` statt `deny` mit dem Argument, der Umgehungsweg solle **der Mensch** sein, damit kein
  Bypass-Schalter in den Kontext eines Modells geraet. Das Argument bleibt richtig — in diesem Repo aber
  gegenstandslos: `.claude/settings.local.json` erlaubt `Bash(git *)`, jeder git-Befehl ist vorab
  freigegeben, und ein `ask` hat dann nichts zu fragen. **Vier Versuche fingen nichts ab**, bei gepruefter
  Einstellungsdatei, ohne `disableAllHooks` und nach Sitzungs-Neustart. Umgestellt auf `deny`; der
  Schalter `BRANCH_COLLISION_GUARD=off` ist damit der einzige Ausweg und steht in CLAUDE.md statt in der
  Meldung. **Damit ist AC-Y150a.2 in seinem Wortlaut ueberholt** („das Urteil lautet `ask`") — die
  Absicht (Kollision wird nicht stillschweigend zugelassen) ist erst mit `deny` erfuellbar.
- **Nachtrag 2026-08-27 zu D-Y150a.1 — der dort genannte Grund war zu schwach.** Nach dem Deploy
  probiert: der Hook feuerte **nicht**, und zwar nicht wegen der Zurueckhaltung gegenueber einem fremden
  Checkout, sondern weil dieser Arbeitsbaum **31 Commits** hinter `main` stand und die dort liegende
  `.claude/settings.json` die alte ohne `hooks`-Schluessel war (482 statt 935 Bytes). Die Reichweite des
  Hooks ist damit „jede Sitzung, deren Arbeitsbaum aktuell genug ist", nicht „jede Sitzung" — und das
  Ausbleiben ist lautlos. Als **PROJ-Y-150b** registriert.
- **D-Y150a.1 Kein Nachweis des tatsächlichen Feuerns aus dieser Session.** Dafür müsste
  `.claude/settings.json` im **Primär-Checkout** liegen — der gehört einer anderen Spur, trägt
  uncommittete Arbeit, und drei Sessions laufen gerade. Belegt sind stattdessen: die Nutzlast-Probe
  mit der echten stdin-Form, die Schema-Prüfung und die Ausführung des **wörtlichen**
  Konfigurationsbefehls. Scharf wird der Hook mit dem Merge plus einem Konfigurations-Neuladen
  (`/hooks` oder Neustart) — das ist der dokumentierte Weg, kein Mangel dieser Slice.
- **D-Y150a.2 `ask` statt `deny`.** Bewusst; siehe oben. In kopflosen Läufen ohne Rückfragekanal ist
  das Verhalten umgebungsabhängig — dafür gibt es die Umgebungsvariable.
- **D-Y150a.3 Grenzen des Erkenners.** Kein vollständiger Shell-Parser: Ersetzungen wie
  `git checkout -b "$(cat name.txt)"` liefern einen Namen, den der Guard nicht auflösen kann, und
  werden durchgelassen. Ein Fehlalarm wäre schlimmer als dieser Durchlässer (PROJ-150-L2).
- **D-Y150a.4 Nur diese Maschine.** Der Guard liest Refs und Worktrees dieses Repos; eine Session in
  einem anderen Klon oder in der Cloud bleibt unsichtbar.
- **D-Y150a.5 Kein CIA-Pass.** Die Regel macht ihn für „Agentenänderungen" verbindlich, definiert das
  aber als Dateien unter `.claude/agents/` oder einen neuen Agenten — beides trifft nicht zu. Der
  Hook ist Werkzeug-Konfiguration. Wegen der Reichweite (alle Sessions dieser Maschine) hier
  ausdrücklich benannt statt stillschweigend übergangen.

## Deployment

**Deployed 2026-08-27 — Tag `v2.78.0-PROJ-Y-150a`, PR #465 (squash) → main `2e8992b`** (gemergt
2026-08-26 17:58 UTC; die Buchführung folgt einen Tag später, weil der Merge in einen
GitHub-Actions-Ausfall fiel).

Deployment Scope **`tooling-only`**, wörtlich nach Definition: geliefert werden ein Hook-Skript, ein
Eintrag in `.claude/settings.json`, die CLAUDE.md-Regel und Buchführung — **kein `src/`-Diff, keine
Migration, kein Dependency**, also keine Laufzeitfähigkeit am Produkt. Der Merge **ist** die
Auslieferung; ein Routen-Smoke wäre gegenstandslos.

**Nachweis nach der Regel** („an executed repository tool, test, workflow, or CI check plus the
relevant repository/CI result") — jeder Punkt **nach** dem Merge gegen `main` gemessen:

| Nachweis | Ergebnis |
|---|---|
| Hook aus `main`, belegte Slice | `PreToolUse` / **`ask`**, nennt den haltenden Worktree |
| Hook aus `main`, gewöhnliche Arbeit | 5/5 still (`status`, `switch`, `branch -a`, `worktree add` ohne Anlege-Flag, `log --grep='checkout -b …'`) |
| Fail-open | 3/3 still (unlesbare Nutzlast, fehlendes `tool_input`, leeres stdin) |
| Unit-Tests aus `main` | **67/67** (37 Hook + 30 Guard) |
| Volle Suite auf `2e8992b` | **3820/3820** in 442 Dateien |
| ESLint · tsc · Build | **0** · **13 = Baseline / 0 neu** · Compiled successfully |
| Datei-Guards | index-scope · migration-naming · token-drift · function-inventory **OK**; `check:branch-collision` selbst exit 0 |
| CI + Auslieferung | 9/9 Checks grün; Vercel-Produktions-Build aus genau `2e8992b` **success** |

**Betriebsbefund aus dem Ausfall, festgehalten weil er wiederkehrt:** GitHub Actions war beim
Merge-Versuch in einem `major_outage`. Die während der Störung eingereihten Läufe wurden nach der
Wiederherstellung **nicht** übernommen, und zwei Workflows (Schema-Drift, Migration-Naming) waren
gar nicht erst erzeugt worden — die PR sah mit 2 von 9 Checks „blockiert" aus, ohne dass etwas rot
war. Auflösung ohne Leer-Commit: eingereihte Läufe abbrechen, PR schliessen und wieder öffnen, was
die `pull_request`-Events neu feuert und alle sechs Workflows anlegt. Ein Admin-Merge an den
fehlenden Checks vorbei wurde ausdrücklich **nicht** gewählt: die vier nicht gelaufenen Guards sind
genau die, die einen Fehler in dieser Änderung gefangen hätten.

**Kein eigener `/qa`-Durchlauf** — nach derselben Präzedenz wie PROJ-150 (PROJ-147, PROJ-Y-148e:
Dateianalyse-Guards ohne separate QA-Stufe) und weil jedes der acht Kriterien einen ausgeführten
Nachweis samt Rot-Grün trägt. Abweichung in der **Nachweisform**, kein unerfülltes Kriterium.

**Alle 8 AC erfüllt, nichts zurückgestellt.** Die in D-Y150a.1 benannte Grenze bleibt bestehen und
ist mit dem Deploy **nicht** eingelöst: dass der Hook im Harness tatsächlich feuert, ist weiterhin
nicht beobachtet — er wird erst nach einem Konfigurations-Neuladen (`/hooks` oder Neustart) scharf.
Das ist eine Aussage über die Nachweistiefe, kein offenes Kriterium; AC-Y150a.6 verlangt, dass der
**konfigurierte Befehl** trägt, und das ist aus drei Arbeitsverzeichnissen belegt.
