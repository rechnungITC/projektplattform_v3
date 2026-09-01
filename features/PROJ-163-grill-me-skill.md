# PROJ-163 — `grill-me`: Entscheidungs-Verhör als aufrufbarer Skill

## Status: In Review
## Deployment Scope: —

**Created:** 2026-09-01

## Problem

Der Nutzer hat am 2026-09-01 eine Skill-Vorlage `grill-me` ins Repo gelegt — ein Interview, das
einen Plan Zweig für Zweig stresstestet, jede Entscheidung **einzeln** vorlegt und die Umsetzung
bis zur Bestätigung sperrt. Sie war **nicht installiert und nicht aufrufbar**:

1. **Falscher Pfad.** Skills werden unter `.claude/skills/<name>/SKILL.md` gefunden; die Datei lag
   als `.claude/skills/qa/grill-me_SKILL.md`, also als Streudatei **innerhalb** eines fremden
   Skill-Verzeichnisses. Gemessen: sie erscheint in der Skill-Liste der Sitzung nicht — `/grill-me`
   existierte faktisch nicht.
2. **Fehlendes Frontmatter-Feld.** Alle **9** Bestandsskills tragen `user-invocable: true`; die
   Vorlage trug es nicht. CLAUDE.md sagt ausdrücklich: „Only use skills listed in the
   user-invocable skills section." Selbst am richtigen Ort wäre der Slash-Aufruf also unsicher.
3. **Falsche Zuordnung.** `qa` prüft gegen Akzeptanzkriterien und macht Security-Audit, **nachdem**
   gebaut wurde. `grill-me` sagt wörtlich „Fang nicht mit der Umsetzung an, bevor ich bestätigt
   habe" — das ist die Gegenrichtung und gehört vor den Bau.

## Messungen vor dem Entwurf

Alles am 2026-09-01 gegen den Bestand gemessen, nicht angenommen:

- **9 von 9** Skills unter `.claude/skills/*/SKILL.md` tragen `user-invocable: true`.
- **`~/.claude/skills` existiert auf dieser Maschine nicht** — eine benutzerweite Ablage wäre ein
  neuer, unversionierter Ort, der bei einem Maschinenwechsel lautlos fehlt.
- Der Skill wird an **drei** Stellen gebraucht, nicht an einer: `/requirements` (Nutzer-Locks vor
  der Spec), `/architecture` (Forks, die die Spec offen ließ — `continuous-improvement.md`,
  Workflow-Integration) und der **Halt-und-Frage-Checkpoint**, den
  `.claude/rules/continuous-improvement.md` für Sitzungen ohne Sub-Agenten vorschreibt. Ihn in eine
  Stufe einzubauen hätte die anderen zwei auf eine Kopie verwiesen.
- Namensraum frei: kein `grill-me` unter den Projekt-, Plugin- oder Top-Level-Skills.

## Nutzer-Entscheidungen (im Verhör selbst getroffen)

Die Slice ist ihr eigener Anwendungsfall: der Zuschnitt entstand in einem `grill-me`-Durchgang mit
acht Fragen, eine je Turn.

- **L1** — Ablage als **projektweiter Top-Level-Skill**, nicht als Referenzdatei in `requirements`
  und nicht benutzerweit. Versioniert, teambar, aus jeder Stufe aufrufbar.
- **L2** — **eigene PROJ-Kennung** statt Mitbuchung in der PRD-Slice: Prozesswerkzeug und
  Dokumentations-Autorität bleiben getrennt.
- **L3** — Kennung wird **bei Anlage** vergeben, nicht im Voraus versprochen. Ich hatte im Verhör
  drei IDs vorab zugeteilt und das zurückgenommen — genau dieses Vorausversprechen ist die Ursache,
  aus der `PROJ-Y-151d` doppelt vergeben wurde und die Mail-Kette aus PROJ-158 an ihrer `160`
  gebrochen ist.

### Der zweite Versuch war auch falsch, und das ist der Ertrag (F-163.1)

Diese Slice lief zuerst als **PROJ-159**, weil `check:branch-collision -- PROJ-159` „free" meldete.
Der Guard prüft **git-Refs**; er sieht keine Versprechen in Prosa. Nachgemessen ist `PROJ-159`
**24-mal** als „Mail-Abholung" verdrahtet: **14×** in der ausgelieferten `PROJ-158`-Spec (darunter
„Blockiert PROJ-159" und AC-158.17 „ohne diese Festlegung darf PROJ-159 nicht beginnen"), **7×** im
INDEX, **3×** im Register. Das ist wörtlich das blinde Fenster aus **PROJ-Y-150e**: eine Slice, an
der noch kein Branch hängt, ist für den Ref-Guard unsichtbar.

Aufgelöst nach dem Muster **PROJ-Y-151e** — die Seite **ohne Artefakte weicht**: dort wich der
Registereintrag ohne Spec und Tag, hier weicht diese zehn Minuten alte Slice gegen eine
ausgelieferte Spec mit 24 Verweisen. Neue Kennung ist **PROJ-163**, also **hinter** der Mail-Kette,
damit sie nie versprochen war; `161` und `162` werden erst durch die Entnummerierung frei und
bleiben deshalb ungenutzt. Vor der Umbuchung ist beides geprüft: Refs **und** Prosa (`PROJ-163`:
0 Vorkommen in `features/` und `docs/`) — genau die Gegenprobe, die beim ersten Versuch fehlte.

## Akzeptanzkriterien

- **AC-163.1** — Der Skill liegt unter `.claude/skills/grill-me/SKILL.md` mit `name`,
  `description`, `argument-hint` und `user-invocable: true` — dieselbe Frontmatter-Form wie die 9
  Bestandsskills.
- **AC-163.2** — Der Anweisungstext des Nutzers ist **wörtlich** erhalten: vier Absätze,
  unverändert, keine Umformulierung.
- **AC-163.3** — Der Skill benennt seine drei Einsatzstellen und grenzt ausdrücklich ab, wofür er
  **nicht** gedacht ist (Bugfixes, spec-folgende Umsetzung, mechanische Aufräumarbeit) — sonst wird
  aus einem Werkzeug für Entscheidungen ein Ritual für alles.
- **AC-163.4** — `requirements/SKILL.md` und `architecture/SKILL.md` verweisen je an ihrer eigenen
  Rückfragen-Stelle auf `/grill-me`, damit er dort gefunden wird, wo die Regel ihn verlangt.
- **AC-163.5** — Kein `src/`-Diff, keine Migration, kein neues Paket; alle Datei-Wächter grün
  (`check:index-scope`, `check:register-consistency`, `check:migration-naming`,
  `check:token-drift`, `check:function-inventory`).
- **AC-163.6** — Die Streudateien am alten Ort sind **benannt** statt stillschweigend belassen.

## Bewusste Abweichungen und Grenzen (gemessen, nicht behauptet)

- **D-163.1 (Handoff, nicht erledigt):** die zwei Streudateien `grill-me_SKILL.md` und
  `grill-me_SKILL.md:Zone.Identifier` liegen **untracked im Primär-Checkout**, der zum Zeitpunkt
  dieser Slice einer **busy Peer-Sitzung** gehörte (Branch `proj-160/browserslist-remediation`, mit
  uncommitteten Änderungen an `features/INDEX.md` und `features/OPEN-DEFERRED-STATUS.md`). CLAUDE.md
  verbietet, fremde untracked Dateien anzufassen. Aufräumen mit
  `rm '.claude/skills/qa/grill-me_SKILL.md' '.claude/skills/qa/grill-me_SKILL.md:Zone.Identifier'`
  — bis dahin existiert der Skill zweimal: einmal versioniert und wirksam, einmal als wirkungslose
  Streudatei.
- **D-163.2 (Nachweistiefe, ausdrücklich keine erfüllte Zusage):** dass `/grill-me` in der
  Skill-Liste **erscheint**, ist in dieser Sitzung **nicht beobachtet** — die Liste wird beim
  Sitzungsstart geladen, und die Datei entsteht erst mit dieser Slice. Belegt ist die Form
  (Pfad und Frontmatter deckungsgleich mit den 9 wirksamen Skills), nicht die Beobachtung. Gleiche
  Klasse Grenze wie **D-Y150a.1**, wo das Feuern des Hooks ebenfalls erst nach dem Merge sichtbar
  wurde.
- **D-163.3:** kein eigener `/qa`-Durchgang — Präzedenz PROJ-150, PROJ-157, PROJ-Y-148e (reine
  Prozess-/Werkzeug-Slices ohne separate QA-Stufe), und jedes Kriterium trägt einen ausgeführten
  Nachweis.
- **D-163.4:** kein CIA-Pass. Kein Diff unter `.claude/agents/`, keine Technologie, keine Migration,
  kein `src/`-Code. Die **Reichweite** ist dennoch benannt statt nebenbei mitgenommen: ein Skill
  ändert Agentenverhalten, sobald er aufgerufen wird — hier aber nur auf ausdrücklichen Aufruf, ohne
  Automatik und ohne Hook.
- **D-163.5:** der Abschnitt „Wo dieser Skill greift" ist **nicht** Nutzertext, sondern Zutat dieser
  Slice; er steht deshalb sichtbar getrennt unter eigener Überschrift, während die vier
  Original-Absätze davor unangetastet bleiben.

## Nachweise

- **Dogfooding, der tragende Nachweis:** der Skill wurde in seiner eigenen Anlage-Sitzung angewandt
  — acht Fragen, je eine pro Turn, jede mit empfohlener Antwort, alle Fakten (Skill-Liste,
  Frontmatter-Verteilung, Worktree-Belegung, Story-Bestand, PRD-Drift, ID-Freiheit) vorab selbst
  nachgeschlagen statt erfragt, Umsetzung erst nach ausdrücklicher Bestätigung begonnen. Der
  Durchgang hat dabei **zwei eigene Fehler korrigiert**: die Vorab-Zuteilung dreier IDs (L3) und die
  Annahme, PRs seien durch rote Supply-Chain-Gates blockiert (PROJ-160 war zu diesem Zeitpunkt
  bereits ausgeliefert).
- **Form gegen den Bestand geprüft:** `user-invocable: true` in 10 von 10 Skills nach der Änderung.
- **Wörtlichkeit gemessen, nicht behauptet:** vier Absätze in beiden Fassungen, inhaltlicher
  md5 identisch — `f349010261eec49324674b85cb62a55c` über Vorlage und ausgelieferte Datei.
- Datei-Wächter und Verweise: siehe Deployment-Abschnitt.
