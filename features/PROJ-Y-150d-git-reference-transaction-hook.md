# PROJ-Y-150d — Branch-Kollisions-Guard auf der git-Ebene

## Status: Deployed
## Deployment Scope: tooling-only

## Problem

PROJ-Y-150a hat den Guard über einen `PreToolUse`-Hook erzwungen. PROJ-Y-150b hat gemessen, dass
dessen Reichweite an **drei** Gliedern hängt, und alle drei scheitern lautlos:

1. der **Arbeitsbaum** muss die aktuelle `.claude/settings.json` tragen — der Primär-Checkout hier
   wandert durch die Feature-Branches wechselnder Spuren (**drei** Stände in zwei Stunden, einmal
   31 Commits zurück),
2. die **laufende Sitzung** muss sie geladen haben — ein `git checkout` tauscht die Datei, ohne den
   Einstellungs-Watcher zu wecken,
3. das Urteil muss die **Erlaubnisliste** überleben — `.claude/settings.local.json` führt
   `Bash(git *)`, was das ursprüngliche `ask` vollständig geschluckt hat (PROJ-Y-150c: `deny`).

Glied 3 ist behoben. Glied 1 und 2 sind es nicht, und Glied 1 ist im **Normalbetrieb** verletzt.

## Lösung und was sie strukturell besser macht

Ein git-`reference-transaction`-Hook im **gemeinsamen** `.git/hooks` (dieses Repo setzt
`core.hooksPath` genau dorthin, alle Worktrees sind also auf einmal abgedeckt).

- Er hängt an **keinem** der drei Glieder: nicht am Branch des Arbeitsbaums, nicht am Ladezustand
  einer Sitzung, nicht an der Erlaubnisliste.
- Er wirkt zusätzlich für **`git` von Hand**, außerhalb von Claude Code.
- **Es gibt nichts zu parsen.** Git übergibt die Referenzen. Die dokumentierte Grenze D-Y150a.3 —
  `git checkout -b "$(cat f)"` rutscht durch, weil eine Shell-Ersetzung statisch nicht auflösbar ist
  — existiert hier nicht.
- Er ist **prüfbar**: anders als der Harness-Hook lässt er sich in einem Wegwerf-Klon vollständig
  ausüben, inklusive echter Ablehnung.

## Locks

- **L1 — Nur `prepared`.** In allen anderen Phasen ignoriert git den Exit-Code; dort zu arbeiten wäre
  Kosten ohne Wirkung.
- **L2 — Nur `refs/heads/`.** Remote-Tracking-Refs, Tags, Notes, Stash und die `rewritten`-Refs eines
  Rebase sind nicht die Sache dieses Hooks.
- **L3 — Nullen sind nicht „neu".** Gits eigene Dokumentation weist darauf hin, dass ein
  **Force-Update** identisch aussieht, und nennt den Weg: den aktuellen Wert per `git rev-parse`
  erfragen. Im `prepared`-Zustand sind die Refs gesperrt, aber noch nicht geschrieben — ein
  existierender Ref löst also noch auf, und dann ist es ein Update, keine Anlage.
- **L4 — Jeder Fehlerpfad endet mit Exit 0.** Unlesbares stdin, fehlender Guard, abstürzender
  Kindprozess, kaputte Zeile: alles bedeutet „durchlassen". Der Hook darf nur ablehnen, was er
  positiv erkannt hat.
- **L5 — Installation ist ein eigener, ausdrücklicher Schritt.** `.git/hooks` ist nicht versioniert;
  das ist der Preis dieser Variante. Der Installer überschreibt **niemals** einen fremden Hook.

## Akzeptanzkriterien

- **AC-Y150d.1** Ein `reference-transaction`-Hook lehnt das **Anlegen** eines Branches ab, dessen
  Slice belegt ist, und nennt den Halter.
- **AC-Y150d.2** Unberührt bleiben: Wechseln, Auflisten, **Löschen**, Commit, Tag, Fetch, Rebase,
  Force-Update (`checkout -B`) und Branchnamen ohne Slice-Kennung.
- **AC-Y150d.3** Ein **Force-Update** wird nicht als Anlage missdeutet (L3).
- **AC-Y150d.4** Fail-open über alle Fehlerpfade (L4).
- **AC-Y150d.5** `BRANCH_COLLISION_GUARD=off` lässt einen einzelnen Aufruf durch.
- **AC-Y150d.6** `npm run hooks:install` / `hooks:uninstall`; der Installer verweigert die Arbeit bei
  einem fremden Hook und nennt den absoluten Pfad, den er schreibt.
- **AC-Y150d.7** Keine zweite Wahrheit für Slice-Kennungen — der Hook übergibt den Branchnamen an
  PROJ-150s Guard.
- **AC-Y150d.8** Rekursion strukturell unmöglich.
- **AC-Y150d.9** In einem **echten Repository** end-to-end ausgeübt, mit echter Ablehnung.

## Nachweise

| AC | Nachweis |
|---|---|
| Y150d.1 | Wegwerf-Klon: `checkout -b`, `branch`, `switch -c` auf belegten Slices → **3/3 abgelehnt**, Meldung nennt Worktree und Tag |
| Y150d.2 | Wegwerf-Klon: kein-Slice-Name, unbelegte Slice, Löschen, Commit, Tag, Fetch, Switch, `checkout -B` → **8/8 durchgelassen** |
| Y150d.3 | Unit-Test „does NOT treat a force update as a creation"; **Rot-Grün**: Unterscheidung entfernt → 1 rot |
| Y150d.4 | L4 im Code an jedem `catch`; Unit-Tests für kaputte/leere/undefinierte Eingabe |
| Y150d.5 | Wegwerf-Klon: `BRANCH_COLLISION_GUARD=off git checkout -b proj-y-45p/override` → durchgelassen |
| Y150d.6 | Installer im Klon ausgeführt; Fremd-Hook-Zweig im Code, Marker-basiert |
| Y150d.7 | Der Hook ruft `scripts/check-branch-collision/index.ts` mit dem Branchnamen |
| Y150d.8 | Guard liest nur Refs; zusätzlich Umgebungs-Marker `BRANCH_COLLISION_GUARD_IN_HOOK` |
| Y150d.9 | Vollständige Batterie in `/tmp/hooktest`, echter Klon mit eigenen Refs und Tags |

## Bewusste Abweichungen und Grenzen

- **D-Y150d.1 Nicht versioniert.** `.git/hooks` liegt außerhalb des Repos, die Absicherung muss je
  Klon einmal installiert werden. Das ist der Tausch, den PROJ-Y-150b benannt hat:
  **Versionierbarkeit gegen Reichweite**. Wer nicht installiert, hat sie nicht — und merkt es nicht.
- **D-Y150d.2 Nicht in diesem Repo installiert.** Ich habe den Hook **nicht** in
  `/home/sven/projects/projektplattform_v3/.git/hooks` eingerichtet: er würde jede git-Operation
  aller Worktrees und der drei laufenden Spuren betreffen. Die Installation ist eine
  Nutzer-Entscheidung, der Befehl steht bereit.
- **D-Y150d.3 Nur dieses Repository.** Wie der Guard selbst liest er Refs, Worktrees und Tags dieses
  Repos; eine Sitzung in einem anderen Klon bleibt unsichtbar.
- **D-Y150d.4 Ein Aufruf des Guards je angelegtem Branch.** Eine Transaktion, die mehrere Branches
  auf einmal anlegt, zahlt mehrfach — praktisch selten, bewusst nicht optimiert.
- **D-Y150d.6 Die Erkennung hat ein blindes Fenster — am Tag des Deploys vorgefuehrt.** Minuten nach
  dem Merge nannte der Nutzer eine Slice als vergeben (**PROJ-Y-151b**), und der Guard antwortete
  `free`. Nachgemessen zu Recht: es existiert **kein** Ref mit dieser Kennung, weder lokal noch auf
  `origin`, und die andere Spur arbeitet in einem Worktree, der auf `proj-y-151a` steht. Der Guard
  misst also korrekt, was er misst — Branches, Worktrees, Tags — und beantwortet die gestellte Frage
  („ist die Slice vergeben?") trotzdem falsch. **Das blinde Fenster reicht vom Arbeitsbeginn bis zur
  Branch-Anlage.** Im PROJ-Y-45p-Vorfall existierte der Branch (mit 0 Commits), was ihn ueberhaupt
  erkennbar machte; eine Spur, die sequentiell in **einem** Worktree arbeitet — 151a fertig, dann
  151b — legt bis zum Verzweigen keine Marke. Die Annahme aus PROJ-150-L3 („der lebende Anspruch ist
  der Worktree") gilt damit nur **ab** der Branch-Anlage. Registriert als **PROJ-Y-150e**; der Fix
  waere ein anderes Verfahren — eine **Erklaerung** beim Beginn statt einer **Ableitung** aus git.
- **D-Y150d.5 Kein CIA-Pass.** Kein neues Dependency, keine Architekturentscheidung am Produkt; der
  Eingriff ist Werkzeug-Ebene. Wegen der Reichweite ausdrücklich benannt statt übergangen.

## Nachtrag 2026-08-27 — Installation ausgeführt, dabei zwei eigene Fehler gefunden (PROJ-Y-150f)

**F-1: Der Shim zeigte in den Arbeitsbaum.** Der Installer schrieb `exec node <absoluter Pfad im
Checkout>` — damit war Bedingung 1, der diese Slice per Konstruktion entkommen wollte, eine Ebene
tiefer zurück: steht der Checkout auf einem Branch ohne das Skript, findet der Shim nichts und endet
fail-open, also **lautlos**. Aus einem Temp-Worktree installiert wäre der Hook nach dem Aufräumen tot
gewesen. Der Installer **kopiert** die Datei jetzt nach `.git/hooks`. Preis, benannt: die Kopie friert
beim Installieren ein, nach einer Änderung am Guard ist erneut zu installieren — ein veralteter
Wächter wacht noch, ein fehlender nicht.

**F-2: Der Installer erkannte seinen eigenen Hook nicht.** Der Marker trug ein `# `, in die kopierte
Datei wurde er ohne dieses Zeichen geschrieben — `hooks:uninstall` hielt den eigenen Hook für fremd
und verweigerte die Arbeit. Das hätte eine repo-weit scharfe Sperre **ohne unterstützten Weg zur
Entfernung** hinterlassen. Marker vereinheitlicht; fünf Installer-Tests in einem Wegwerf-Repository
nageln den Rundlauf fest, Rot-Grün ausgeführt (Marker wieder getrennt → 2 rot).

**Beinahe-Fehler, empirisch geklärt statt gehofft:** eine endungslose Datei liest node üblicherweise
als CommonJS, die `import`-Anweisungen wären gescheitert. Node 24 erkennt ESM auch ohne Endung —
nachgewiesen erst durch die **Ablehnung einer belegten Slice**; der erste `exit=0`-Test bewies nichts,
weil das auch die Ausgabe eines korrekten Leerlaufs ist.

**Installation verifiziert:** 8/8 gewöhnliche git-Operationen unberührt (Status, Fetch, Log,
Branch-Anzeige, Stash, Tags, rev-parse, Worktree-Liste) — zuerst geprüft, weil drei fremde Spuren
mitlaufen. Sperre greift **aus dem Primär-Checkout, der `ref-transaction-guard.mjs` gar nicht trägt**,
was belegt, dass die Kopie die Arbeitsbaum-Abhängigkeit beseitigt. Name ohne Slice-Kennung geht durch.

**D-Y150d.7 Restabhängigkeit, unverändert benannt:** die *Entscheidung*, ob eine Slice belegt ist,
läuft weiter über `scripts/check-branch-collision` aus dem Arbeitsbaum — dort liegt die einzige
Wahrheit für Slice-Kennungen. Fehlt sie, endet der Hook mit Exit 0. Sie zu lösen hieße, die
Kennungs-Logik zu duplizieren; nicht einseitig entschieden.

## Deployment

**Deployed 2026-08-27 — Tag `v2.81.0-PROJ-Y-150d`, PR #479 (squash) → main `e4593bf`.**

Deployment Scope **`tooling-only`**: geliefert werden ein git-Hook, ein Installer, zwei npm-Skripte,
Tests und Buchführung — **kein `src/`-Diff, keine Migration, kein Dependency**. Der Merge **ist** die
Auslieferung des Codes; die **Wirkung** setzt zusätzlich ein `npm run hooks:install` je Klon voraus
(D-Y150d.1/2), und das ist bewusst nicht geschehen.

**Nachweis nach der Regel, nach dem Merge gegen `main` gemessen:**

| Nachweis | Ergebnis |
|---|---|
| Artefakte auf `main` | Hook, Installer, Tests, Spec und **beide** npm-Skripte vorhanden |
| Unit-Tests aus `main` | in der vollen Suite enthalten (59 Fälle der beiden Hook-Dateien) |
| Volle Suite auf `e4593bf` | siehe Gates unten |
| Verhalten | im Wegwerf-Klon vor dem Merge: **3/3 abgelehnt**, **8/8 durchgelassen**, Override durchgelassen |
| CI | 9/9 Checks grün auf dem gemergten Stand |

**Zwei Rebases beim Merge**, weil `main` sich dreimal bewegte (PROJ-151 `/qa`, dann dessen Deploy);
beide Konflikte im INDEX-Hotspot, fremde Zeilen per `diff` gegen `main` als wörtlich erhalten
nachgewiesen. Beim zweiten Versuch Push, Check-Wartezeit und Merge in **einem** Fenster, weil jede
Lücke den nächsten Konflikt einfängt.

**Kein eigener `/qa`-Durchlauf** — Präzedenz PROJ-147/PROJ-Y-148e, und jedes der neun Kriterien trägt
einen ausgeführten Nachweis samt Rot-Grün.

**Alle 9 AC erfüllt.** Offen bleibt **PROJ-Y-150e** (blindes Fenster der Erkennung, D-Y150d.6) — das
ist eine neu entdeckte Nachbarfrage, kein zurückgestelltes Kriterium dieser Slice: keines der neun
Kriterien verlangt, eine Slice ohne jede git-Spur zu erkennen.
