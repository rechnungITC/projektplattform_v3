# PROJ-Y-150a — Branch-Kollisions-Guard erzwingen (Harness-Hook)

## Status: In Progress
## Deployment Scope: —

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
