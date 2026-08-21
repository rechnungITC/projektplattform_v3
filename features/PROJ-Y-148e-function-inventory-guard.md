# PROJ-Y-148e — Wächter gegen undokumentierte Prod-Funktionen

## Status: Deployed
## Deployment Scope: tooling-only
<!-- Deployed 2026-08-19: PR #415 (squash) -> main `a6d430e`, Tag `v2.66.0-PROJ-Y-148e`.
     Scope `tooling-only`: Werkzeug, Tests, CI-Workflow, Runbook, versioniertes Inventar —
     kein `src/`-Diff, keine Migration, kein Produkt-Runtime-Verhalten. -->

**Created:** 2026-08-19
**Origin:** PROJ-Y-148c. Dort wurde ein Einzelfall aufgeräumt — eine Migration lief fünf Tage in Prod,
ohne im Repo zu sein — und ausdrücklich festgehalten, dass **nichts die Wiederholung verhindert**.

---

## Was gebaut wurde

`npm run check:function-inventory` prüft, ob jede Funktion des versionierten Prod-Inventars
(`supabase/prod-inventory/functions.txt`) einer bekannten Quelle zuordenbar ist: entweder legt eine
Migrationsdatei sie per `create function` an, oder sie steht **mit Begründung** in
`INVENTORY_EXCEPTIONS`. Alles andere ist ein Fund.

Reine Dateianalyse — kein Datenbankzugang, kein Docker, keine Secrets. Dazu ein CI-Workflow (bewusst
**nicht** als Required Check eingetragen, das ist Repo-Eigner-Entscheidung wie bei PROJ-147) und ein
Runbook `docs/production/function-inventory.md`.

## Die drei Messungen, die den Zuschnitt bestimmt haben

Der Zuschnitt ist nicht gewählt, sondern **erzwungen** — jede Grenze unten ist gemessen:

**1. Der statische Parse trägt für Funktionen.** 272 eigene Funktionen in Prod (nach Abzug der 71
`ltree`-Extension-Funktionen) gegen 275 Namen aus den Migrationsdateien. Differenz vollständig
erklärbar: 3 „nur in Prod" (1 offene Slice, 2 Alt-Bestand), 6 „nur im Repo" (3 Parser-Rauschen aus
Kommentaren, 3 echt gedroppt).

**2. Für Trigger trägt er nicht.** Ein statischer Parse findet **65 von 74** Tabellen mit
Audit-Trigger — **10 werden verfehlt**, weil PROJ-117/118/80/128 und PROJ-130-α ihre Trigger über
DO-Blöcke und Schleifen anlegen. 14 % Fehlerquote sind für einen Wächter untauglich.

**Und eine eigene Fehlschlussfolgerung, korrigiert:** diese 65 stimmten zunächst verblüffend mit der
65 aus dem PROJ-130-α-Befund überein, und ich hielt PROJ-Y-130f damit für gelöst. Das war falsch —
jene Zahl kam aus einem echten Shadow-DB-Replay, meine aus einem unvollständigen Parse, und Prod führt
inzwischen 74 statt 67. **Die Übereinstimmung war Zufall.** PROJ-Y-130f bleibt offen und braucht Docker.

**3. Ein npm-Skript kann Prod nicht befragen.** In `.env.local` liegt kein Connection-String, nur der
Service-Role-Key für PostgREST — und PostgREST exponiert Tabellen, Views und RPCs, keine Systemkataloge.
Deshalb prüft der Wächter gegen eine **versionierte Datei** statt gegen die Datenbank. Ein Prod-Secret
in CI zu legen ist eine Sicherheitsentscheidung, die niemand nebenbei trifft.

## Die Kategorie, die den Wächter überhaupt benutzbar macht

Beim ersten Lauf war er rot — mit **genau einem** Fund: `_dd_finding_source_question_guard` aus der
**laufenden** Slice PROJ-Y-114a, deren Migration seit dem 2026-08-17 in Prod liegt und die noch nicht
gemergt war.

Das ist kein Fehler, sondern der **normale Arbeitsablauf** dieses Repos (Migration in `/backend`, Merge
später). Ein Wächter, der das als Fehler meldet, wäre bei jeder offenen Slice rot — und ein Werkzeug,
das immer rot ist, wird ignoriert. Genau diese Falle stand als Warnung im Followup-Register.

Deshalb trägt jede Ausnahme ein `kind`:

- **`legacy`** — Alt-Bestand, bleibt dauerhaft.
- **`pending_merge`** — Wegwerf-Eintrag für eine offene Slice, mit Slice-ID im Grund.

Und die Liste **räumt sich selbst auf**: eine Ausnahme gilt auch dann als veraltet, wenn eine
Migrationsdatei die Funktion inzwischen anlegt. Ohne diese Prüfung bliebe ein `pending_merge`-Eintrag
nach dem Merge liegen und würde später einen echten Fund gleichen Namens decken.

---

## Akzeptanzkriterien

- [x] **AC-Y148e.1** — `npm run check:function-inventory` meldet jede Funktion des Prod-Inventars, die
      keine Migrationsdatei anlegt und die nicht dokumentiert ist. **Der PROJ-Y-148c-Fall ist als Test
      hinterlegt**: `hard_delete_project` in Prod, nicht im Repo → Fund.
- [x] **AC-Y148e.2** — Jede Ausnahme braucht eine Begründung; ein Test erzwingt das (Länge > 40 Zeichen)
      und friert die heute akzeptierten drei Einträge samt `kind` ein, damit ein neuer im Diff auffällt.
- [x] **AC-Y148e.3** — Eine veraltete Ausnahme ist ein Fehler, auf **beiden** Wegen: Funktion nicht mehr
      in Prod, **oder** inzwischen im Repo angelegt.
- [x] **AC-Y148e.4** — „nur im Repo" ist **kein** Fehler (gemergte, aber nicht angewendete Migration;
      gedroppte Funktion; `create function` in einem Kommentar).
- [x] **AC-Y148e.5** — Eine leere oder fehlende Inventardatei ist ein Fehler, nicht stilles Grün.
- [x] **AC-Y148e.6** — Rot-Grün am **echten** Wächter ausgeführt, nicht nur an Fixtures: Ausnahme
      entfernt → rot; Inventar geleert → rot; zurückgesetzt → grün.
- [x] **AC-Y148e.7** — Kein Datenbankzugang, kein Docker, keine Secrets; überall lauffähig inklusive CI.
- [x] **AC-Y148e.8** — Runbook benennt das Auffrischen **und** die Grenzen des Wächters.
- [x] **AC-Y148e.9** — Die Grenzen sind gemessen statt behauptet (Trigger-Fehlerquote, Extension-Filter,
      fehlender Connection-String) und in Code-Kommentar, Runbook und dieser Spec festgehalten.

## Definition of Done

- [x] Werkzeug, Tests, CI-Workflow, Runbook, Buchführung.
- [x] Gates: ESLint 0 · tsc = Baseline / 0 neu · vitest grün · Build clean · index-scope ·
      migration-naming · der neue Wächter selbst.
- [ ] **Enrollment als Required Check** — Repo-Eigner-Handoff, wie bei PROJ-147/PROJ-42/PROJ-74.

---

## Nachweise

| | |
|---|---|
| Werkzeug | `scripts/check-function-inventory/{analyze,index}.ts` |
| Tests | `analyze.test.ts`, **13/13** |
| Rot-Grün am echten Wächter | Ausnahme entfernt → `1 unerklärt`; Inventar geleert → `enthält keine Einträge`; zurückgesetzt → `OK` |
| Inventar | 272 Funktionen, Stand 2026-08-19 |
| Ausnahmen | 3 (2 `legacy`, 1 `pending_merge`) |
| CI | `.github/workflows/function-inventory.yml`, nicht enrolled |
| Runbook | `docs/production/function-inventory.md` |

## Was der Wächter nicht kann

- **Keine Funktionskörper.** Eine Änderung an einer bestehenden Funktion fängt er nicht — bei
  PROJ-Y-148c wären die vier erweiterten Guards durchgegangen, nur die neue RPC wäre aufgefallen.
  Braucht die Shadow-DB → Docker → offener Handoff PROJ-67/F6.
- **Keine Trigger, keine Grants, keine Policies.** Gleiche Ursache; für Trigger zusätzlich die
  gemessene 14-%-Fehlerquote des statischen Parses.
- **Nichts, was nicht im Inventar steht.** Eine neue Prod-Funktion wird erst beim Auffrischen sichtbar.
  Das ist die eingebaute Grenze: der Wert steckt im Diff, und der entsteht nur, wenn jemand auffrischt.
  Deshalb gehört das Auffrischen ins Runbook und an das Ende jeder Slice mit Migration.

**Die stärkere Alternative, bewusst nicht gebaut:** ein Prod-Connection-String als CI-Secret würde den
Wächter unabhängig von der Prozessdisziplin machen und zusätzlich Rümpfe, Grants und Trigger abdecken.
Das ist eine Sicherheitsentscheidung des Repo-Eigners — ein Lesezugang zur Produktionsdatenbank in
jedem CI-Lauf — und keine, die eine Werkzeug-Slice nebenbei trifft. Wenn sie fällt, ist dieser Wächter
die natürliche Stelle dafür.

## Deploy

**Deployed 2026-08-19:** PR #415 (squash) → main `a6d430e`, Tag `v2.66.0-PROJ-Y-148e`.

**Der Deploy-Nachweis ist der Wächter selbst.** Auf #415 lief der neue CI-Job
`Verify prod function inventory vs migration files` **grün** — er ist damit nicht nur lokal, sondern in
der Umgebung betrieblich nachgewiesen, in der er künftig wirkt. Ein HTTP-Smoke wäre gegenstandslos: die
Slice hat keinen `src/`-Diff und ändert kein Laufzeitverhalten.

**Scope `tooling-only`** — Werkzeug, Tests, CI-Workflow, Runbook und versioniertes Inventar. Die
Definition trifft wörtlich zu („repository tooling, CI, tests, or workflow"), und es gibt bewusst keine
Produktfläche.

**Ein Kriterium der Definition of Done bleibt offen und ist kein Versäumnis dieser Slice:** das
Enrollment als Required Check ist eine Repo-Eigner-Entscheidung — genau der Handoff-Typ, der bei
PROJ-42, PROJ-74 und PROJ-147 ebenfalls beim Eigner liegt. Der Workflow läuft auf jedem PR und meldet
sein Ergebnis; er sperrt nur noch nicht.
