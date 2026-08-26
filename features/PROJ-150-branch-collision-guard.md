# PROJ-150 — Branch-Kollisions-Guard

## Status: In Progress
## Deployment Scope: —

## Problem

Am 2026-08-26 haben **zwei Sessions PROJ-Y-45p gleichzeitig gebaut** und ihre Migrationen **27
Sekunden auseinander** nach Prod gebracht (`20260826110000` anweisungsweise Neuberechnung,
`20260826120000` zeilenweise Delta-Arithmetik). Prod trug damit kurzzeitig **zwei konkurrierende
Buchhaltungen auf derselben Spalte** — bei zwei Mechanismen entscheidet die Trigger-Reihenfolge,
welcher gewinnt. Das Aufräumen kostete drei PRs (#457 Rücknahme, #458 Umsetzung, #459 Deploy-Stempel).

Auslöser war eine Fehllesung, nicht Unachtsamkeit: die zweite Session **hat** den Branch
`proj-y-45p/quota-decrement` gesehen, seine **0 Commits** als „noch nicht angefangen" gelesen und
einen eigenen aufgemacht. Ein angelegter, commit-freier Branch ist in `git log` leer, in
`gh pr list` gar nicht vorhanden und auf dem Remote abwesend — und bedeutet trotzdem, dass die
Arbeit vergeben ist.

Die Gegenmaßnahme aus #457 war **ein Satz in CLAUDE.md**. Zeitgleich hat PROJ-Y-130f vorgeführt, was
mit einer Regel passiert, die niemand ausführen kann: die `moddatetime`-Regel stand dort seit Monaten
wörtlich, wurde zweimal verletzt, und **der Wächter hat es verschwiegen**, weil seine Warnung die
Ursache nicht nannte (883 nicht ausgeführte Zeilen). Diese Slice macht die Regel ausführbar.

## Locks (Nutzer-Entscheide und gemessene Zwänge)

- **L1 — Lokaler Vorab-Check, kein CI-Gate.** Zwei Gründe, beide gemessen. (a) Der Konflikt muss
  **vor** der Arbeit auffallen; zur PR-Zeit existieren beide Branches und die Doppelarbeit ist
  bezahlt. (b) Ein Required Check über die Remote-Branches wäre am ersten Tag rot: der Remote trägt
  **27 unmergte Branches**, darunter rund sechs Gruppen, die eine Slice-ID nur als monatealte
  Altlast teilen (`proj-34` allein vier, `proj-y-145`/`projy-145`/`proj-145` als drei Schreibweisen
  derselben Sache). Ein Gate, das dauerhaft rot steht, ist Dekoration — genau der Zustand, den
  PROJ-147 behoben hat.
- **L2 — Nur eindeutige Signale blockieren.** Mehrere Branches pro Slice sind hier der **Normalfall**:
  `proj-130` trägt 12, `proj-34` neun, `proj-80` fünf, fast alles eine Spur, die sequentiell arbeitet
  und den alten Kopf nie löscht. „Ein Branch mit dieser ID existiert" ist als Stoppsignal damit
  wertlos — es hätte fast immer angeschlagen, und ein Guard, der ständig schreit, wird weggehört.
- **L3 — Der lebende Anspruch ist der Worktree.** Zum Messzeitpunkt waren genau **sechs** Branches
  ausgecheckt, jeder andere inert. Der kollidierende Branch **war** in einem Worktree, als die zweite
  Session ihn ansah. Zweites Blocksignal: ein **Tag** mit der ID — die Slice ist dann schon deployed.
- **L4 — Der eigene Worktree ist keine Kollision.** Sonst schlägt der Guard bei jedem
  Wiederholungslauf mitten in der eigenen Slice an, und wird abtrainiert.

## Akzeptanzkriterien

- **AC-150.1** `npm run check:branch-collision -- <ID>` existiert, ist reine Leseabfrage auf git
  (kein Netz, keine DB, kein Secret) und beantwortet: hält gerade jemand diese Slice?
- **AC-150.2** Blockiert (exit 1), wenn ein Branch mit dieser ID in einem **fremden** Worktree
  ausgecheckt ist — nennt Branch **und** Pfad.
- **AC-150.3** Blockiert (exit 1), wenn ein **Tag** die ID trägt (Slice ist deployed).
- **AC-150.4** Blockiert **nicht** beim eigenen Worktree (L4) und nicht bei Altlast: gemergte oder
  Branches ohne Aktivität im Fenster sind Information, exit 0.
- **AC-150.5** Warnt (ohne zu blockieren) bei unmergten Branches mit Spitze **jünger als 7 Tage**.
- **AC-150.6** Erkennt jede Schreibweise, die im Repo real vorkommt: `proj-y-45p`, `projy-145`,
  `proj61`, `PROJ-45-delta`, die Griechen `PROJ-45-δ/ε`, sowie die ID **in jedem** Namenssegment
  (`docs/proj-y-143d-spec`). Tag-Versionen werden nicht als Slice gelesen.
- **AC-150.7** Hält Geschwister-Slices auseinander: `PROJ-45-δ` ≠ `PROJ-45-ε`, `PROJ-130` ≠
  `PROJ-Y-130h`. Gleiche Feature-Nummer erscheint als **Kontext**, nie blockierend.
- **AC-150.8** Auf dem Live-Bestand ausgeführt und still, wo er still sein muss: `PROJ-34` (neun
  Branches) → 0 blockierend, 0 Warnungen, exit 0.
- **AC-150.9** Der Vorfall selbst ist als Regressionstest festgehalten; Rot-Grün ausgeführt.
- **AC-150.10** Die CLAUDE.md-Regel verweist auf den Befehl statt auf `git branch -a | grep`, und
  benennt, warum die naive Form nicht taugt.

## Tech Design

Haus-Muster der Guards (`scripts/check-<name>/{analyze,analyze.test,index}.ts` + `npm run check:<name>`):

- `analyze.ts` — **reine** Funktionen, kein git, kein Dateisystem. `extractSliceIds` sucht die ID
  **überall** im Namen (positionsfrei, weil sie im ersten oder zweiten Segment stehen kann),
  `analyzeCollision` klassifiziert jeden Ref in `block` / `warn` / `info`. `nowIso` wird
  hineingegeben, damit das Aktualitätsfenster testbar ist.
- `index.ts` — dünner Treiber: `git worktree list --porcelain`, `for-each-ref` über lokale und
  Remote-Branches mit Spitzendatum, `git tag`, plus **je eine** `--merged`-Abfrage pro Namensraum
  statt einer Ahnenprüfung pro Ref. Fehlschlagende Abfragen degradieren den Scan, statt ihn zu töten:
  ein Guard, der nichts weiß, darf nicht blockieren.
- Exit-Codes: `0` frei/nur Kontext, `1` vergeben, `2` Bedienfehler.

## Bewusste Abweichungen und Grenzen (gemessen, nicht behauptet)

- **D-150.1 Kein GitHub-Workflow.** Begründung unter L1 mit Zahlen. Dies ist die einzige Guard-Slice
  ohne CI-Job; das ist Absicht und keine Auslassung.
- **D-150.2 Keine Automatik.** Es existiert in diesem Repo **kein** automatischer Vorab-Haken —
  weder git-Hooks (nur `.sample`) noch `hooks` in `.claude/settings*.json`. Der Guard bleibt damit
  ein Befehl, den die Regel vorschreibt: besser als eine Regel allein (ein Kommando, deterministisch,
  eindeutige Ausgabe), aber **nicht** erzwungen. Der einzige automatische Weg wäre ein Harness-Hook
  auf `git checkout -b` / `git worktree add`; das ändert Agentenverhalten für **alle** Sessions und
  ist eine eigene Entscheidung → **PROJ-Y-150a**.
- **D-150.3 Der Worktree-Anspruch ist eine Momentaufnahme.** Während dieser Slice ist genau das
  passiert: `proj-y-114a/deploy-closure` war um 15:5x in `/tmp/pv3-y45db` ausgecheckt, Minuten später
  stand derselbe Worktree wieder auf `main`. Der Guard antwortet also über **jetzt**, nicht über
  Absichten.
- **D-150.4 Nur `proj`-präfigierte IDs.** `fix/proj18-25b-28-36-deferred-qa` registriert PROJ-18 und
  nicht die nackten Zahlen danach — bewusst, weil lose Ziffern jedes `2` und `36` einsammeln würden.
- **D-150.5 Bare-ID ≠ Sub-Slice.** `proj-80` und `proj-80-alpha` gelten als verschiedene Slices; sie
  erscheinen einander nur als Kontext. Ein **Fehlalarm wäre schlimmer** als dieser Durchlässer, weil
  er den Guard abtrainiert (L2).
- **D-150.6 Nur diese Maschine.** Gelesen werden die Refs und Worktrees dieses Repos. Eine Session in
  einem anderen Klon oder in der Cloud ist unsichtbar.

## Nachweise

| AC | Nachweis |
|---|---|
| 150.1 | `scripts/check-branch-collision/`, `package.json` Skript; Treiber ruft ausschließlich `git` lesend |
| 150.2 | Live: `PROJ-Y-145b` → exit **1**, nennt `/tmp/pv3-t5`; Unit-Test „blocks on the PROJ-Y-45p collision" |
| 150.3 | Live: `PROJ-Y-45p` → **zwei** Blocker (fremder Worktree **und** `v2.75.0-PROJ-Y-45p`) |
| 150.4 | Live: `PROJ-150` (eigener Worktree) → exit **0**; Unit „does not block on your own checkout" |
| 150.5 | Unit „warns but does not block on recent unmerged work" |
| 150.6 | 11 tabellengetriebene Fälle + Griechen + Segment- + Tag-Version-Fälle |
| 150.7 | Unit „does not treat sibling sub-slices as the same slice", „keeps PROJ-N and PROJ-Y-N apart" |
| 150.8 | Live: `PROJ-34` → 0 blockierend / 0 Warnungen / 9 informational, exit **0** |
| 150.9 | Rot-Grün: Block-Regel entschärft → **3 von 30** Tests rot; per Dateikopie zurückgesetzt, byte-identisch |
| 150.10 | `CLAUDE.md` Z. 161 + 397 |
