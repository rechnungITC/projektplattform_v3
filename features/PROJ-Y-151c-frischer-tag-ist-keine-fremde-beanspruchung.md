# PROJ-Y-151c — Ein frischer eigener Tag ist keine fremde Beanspruchung

## Status: Approved
## Deployment Scope: —

Followup zu **PROJ-150** / **PROJ-Y-150a**. Der Branch-Kollisions-Guard wertete
den Tag der eigenen, gerade abgeschlossenen Slice als „schon deployed — nicht
neu bauen" und verweigerte damit **jede** Buchführung nach dem Taggen.

## Der Vorfall

Beim `/deploy` von PROJ-151 blockierte der Guard die Buchführung, weil
`v2.80.0-PROJ-151` existierte — gesetzt zwei Minuten zuvor **von derselben
Spur**. Beim Abschluss von PROJ-Y-151b wiederholte es sich: eine Korrektur an
einer eigenen Testdatei brauchte einen Zweig, der Tag war Minuten alt, der
Guard verweigerte.

Seit **PROJ-Y-150c** urteilt der Hook hart mit `deny` (weil `ask` von der
pauschalen `Bash(git *)`-Erlaubnis geschluckt wird). Damit ist auch der vom
Guard selbst vorgeschlagene Ausweg — *„If the claim is stale, say so and re-run
deliberately"* — wirkungslos: ein erneuter Anlauf ändert nichts. Der einzige
verbleibende Weg war `BRANCH_COLLISION_GUARD=off`, und der wirkt **nur** in der
Sitzungsumgebung: der Hook liest `process.env` seines eigenen Prozesses
(`branch-collision-guard.mjs:200`), ein vorangestelltes `VAR=off git …` erreicht
ihn nicht. Aus dem Modell heraus war die Sperre also gar nicht auflösbar.

## Warum die naheliegende Lösung nicht ging

Der Registereintrag schlug zwei Formen vor. Die präzisere — **Tags der
laufenden Sitzung ausnehmen** — ist **nicht umsetzbar**, und das ist gemessen,
nicht vermutet: git führt für Tags kein Reflog. `core.logAllRefUpdates` deckt
`refs/heads`, `refs/remotes` und `HEAD` ab; `.git/logs/refs/` enthält in diesem
Klon `heads`, `remotes` und `stash` — **kein** `tags`. Ein lokal erzeugter Tag
ist damit von einem geholten nicht unterscheidbar.

Bleibt das Zeitfenster.

## Was gebaut wurde

Ein Tag stuft von `block` auf `warn` herab, wenn **beides** zutrifft:

1. er ist jünger als `FRESH_TAG_HOURS` (24 h), und
2. sein Commit ist **von HEAD aus erreichbar**.

Zusammen heißt das: diese Spur steht auf der Arbeit, die der Tag markiert — das
Tag-Gegenstück zu dem `isSelf`-Zweig, den der Guard für den **eigenen Worktree**
längst hat, mit derselben Begründung im Quelltext: *„Blocking here would make
the guard fire every time a session re-ran it mid-slice, which is how a check
earns the right to be ignored."*

Der Befund wird weiterhin **laut** ausgegeben — mit Tag-Name und Alter. Der Fix
nimmt dem Guard das Verweigern, nicht das Sagen.

## Warum 24 Stunden

Zwei Stunden waren die erste Wahl und haben **genau diesen Fall verfehlt**: die
Sitzung überdauerte den Tageswechsel, der eigene Tag war beim zweiten Versuch
zehn Stunden alt. Ein Abschlusslauf — mergen, auf die Produktions-Auslieferung
warten, messen, buchen — braucht den besseren Teil einer Stunde, und Korrekturen
kommen über denselben Arbeitstag nach.

## Der Preis, ausgesprochen statt versteckt

Innerhalb des Fensters blockiert auch der Tag einer **anderen** Spur nicht mehr,
sobald man ihn gezogen hat. Zwei Dinge halten das vertretbar:

* Der Befund wird weiterhin gedruckt, mit Name und Alter.
* Das Signal, das eine **gleichzeitige** Spur wirklich fängt, ist der fremde
  **Worktree** — unangetastet, blockiert weiter. Genau dieses Signal hat den
  Vorfall PROJ-Y-45p erkannt, nicht der Tag.

Dazu ein Argument über die Rangfolge: ein Tag sagt, die Arbeit ist **fertig**;
ein unmergter Zweig-Tip sagt, sie ist womöglich **in Arbeit** — und dieser
stärkere Nebenläufigkeitshinweis warnt seit PROJ-150 nur. Härter auf das
schwächere Signal zu blockieren war die Verdrehung, die dieser Fix behebt.

## Akzeptanzkriterien

| # | Kriterium | Nachweis |
|---|---|---|
| AC-Y151c.1 | Der eigene frische Tag verweigert keinen Zweig mehr | Guard gegen `PROJ-Y-151b`: exit 1 → **exit 0** |
| AC-Y151c.2 | Der Befund bleibt sichtbar | `warn` mit Tag-Name und Alter |
| AC-Y151c.3 | Ein frischer Tag **ohne** Erreichbarkeit blockiert weiter | Unit-Test |
| AC-Y151c.4 | Ein Tag **älter** als das Fenster blockiert weiter | Unit-Test + live `PROJ-Y-45p` |
| AC-Y151c.5 | Ein Tag **ohne Datum** blockiert (fail-closed) | Unit-Test |
| AC-Y151c.6 | Das Worktree-Signal ist unberührt | live `PROJ-Y-45p` blockiert weiter über den Worktree |
| AC-Y151c.7 | Die Wirkung ist begrenzt und gemessen | Vorher/Nachher über den Live-Bestand |
| AC-Y151c.8 | Der **Hook** lässt den zuvor verweigerten Zweig zu | Ende-zu-Ende-Probe |

## Ergebnis

**Vorher/Nachher am Live-Bestand gemessen** (Fenster 0 = altes Verhalten):

| Slice | vorher | nachher |
|---|---|---|
| PROJ-Y-151b | blockiert | **frei** (eigener Tag, 10 h) |
| PROJ-151 | blockiert | **frei** (Tag < 24 h) |
| PROJ-Y-150d | blockiert | **frei** (Tag < 24 h) |
| PROJ-Y-45p | blockiert | **blockiert** (fremder Worktree + alter Tag) |
| PROJ-45 | frei | frei (unverändert) |
| PROJ-130 | frei | frei (unverändert) |

Genau drei Slices ändern ihr Urteil — die, deren Tag in den letzten 24 Stunden
liegt. Kein Urteil kippt in die andere Richtung.

**Ende-zu-Ende durch den Hook:** derselbe Zweigname, der eine Stunde zuvor mit
`deny` abgewiesen wurde, ließ sich anlegen (Probe-Zweig danach entfernt).

**Rot-Grün ausgeführt:** mit ausgehängter Ausnahme fällt **genau** der neue
Positivfall; die drei Grenzfälle bleiben grün, weil sie das alte Verhalten
festhalten. Guard-Tests **34/34**, tsc 13 = Baseline / 0 neu.

## Abweichungen

* **D-Y151c.1** — Kein CIA-Pass. Die Regel nennt Agentendateien und
  Refactorings über ≥ 5 Dateien; hier sind es drei Dateien in einem Werkzeug,
  und die Richtung war im Register bereits festgelegt. Dass der Eingriff eine
  **Schutzwirkung abschwächt**, ist dennoch ausdrücklich benannt statt
  nebenbei mitgenommen.
* **D-Y151c.2** — Die präzisere Variante („Tags der laufenden Sitzung") ist
  gemessen unmöglich (kein Tag-Reflog), nicht bloß aufwendig.
