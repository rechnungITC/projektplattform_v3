# PROJ-Y-130g — Die Fresh-Apply-Abbrüche an der Wurzel beheben

## Status: Deployed
## Deployment Scope: tooling-only
<!-- Der CI-Lauf hat die vorab festgehaltene Erwartung in jedem Punkt bestätigt,
     inklusive der Zeilenzahl. Scope beim Merge: `tooling-only`. -->

**Created:** 2026-08-20
**Origin:** PROJ-Y-130f, das die sieben Abbrüche benennbar gemacht hat und die Behebung ausdrücklich
getrennt hat, weil sie einen Required Check strenger macht.

---

## Der Fix ist kein Nachbau, sondern das Beseitigen einer Umgebungsdifferenz

Die Vorlage in PROJ-Y-130f schlug einen `public.moddatetime`-Stub vor. Beim Nachmessen zeigte sich, dass
es den nicht braucht — und dass die Ursache eine Ebene tiefer liegt:

- Der Workflow installiert `moddatetime` **bereits korrekt** in `extensions`
  (`create extension if not exists moddatetime schema extensions`).
- Prod läuft mit `search_path = "$user", public, extensions` (live gelesen).
- Die Shadow-DB lief mit dem **Standard ohne `extensions`**.

Genau daraus entstand die in CLAUDE.md notierte Beobachtung, die bare Form löse „in prod but not in the
schema-drift shadow DB" auf. Der Fix ist deshalb eine Zeile: `alter database postgres set search_path`
auf den Prod-Wert. Damit prüft der Replay gegen **dieselbe Auflösung, die Prod verwendet** — er baut
nichts nach und verbiegt keine Migration.

## Die Regel wird ab jetzt ausdrücklich erzwungen

Der `search_path`-Fix hat eine unangenehme Nebenwirkung: danach akzeptiert der Replay die bare Form. Die
CLAUDE.md-Regel verlöre damit ihren — zufälligen und, wie PROJ-Y-130f zeigte, **schlechten** — Erzwinger.

Sie bleibt aber richtig, und zwar aus einem Grund, der mit dem Replay nichts zu tun hat: in einer
`SECURITY DEFINER`-Funktion mit `set search_path = public, pg_temp` löst `moddatetime()` **gar nicht**
auf. Deshalb prüft `check:migration-naming` sie jetzt direkt — als **Fehler**, nicht als Warnung. Das ist
die Lehre aus PROJ-Y-130f: eine Warnung, die niemand liest, verhindert nichts.

Die zwei bestehenden Verletzungen stehen als **dokumentierte, eingefrorene Ausnahmen** in
`MODDATETIME_EXCEPTIONS` — Migrationen sind append-only, und in Prod sind beide korrekt angewendet.

---

## Erwartung an den eigenen CI-Lauf

Ausdrücklich vorab festgehalten, damit sie prüfbar ist statt hinterher angepasst:

1. **Drei der sieben Abbrüche verschwinden** — `proj107_risk_register` und `proj110_stage_gates` direkt,
   `proj122_spa_issues` als Kaskade (es scheiterte an `stage_gate_prereadiness`, das `proj110` erst in
   Zeile 543 anlegt, also hinter seiner Abbruchstelle 130).
2. **Vier bleiben**: `harden_trigger_only_functions` und `proj148_last_lead_cascade_fix` (beide
   `enforce_last_lead`), `security_internal_functions_lockdown` (`decrypt_tenant_ai_key`),
   `proj70_beta_accept_bulk_rpc` (`accept_proposal_from_context_undo`). Diese vier haben **kein**
   `search_path`-Problem: es sind `public`-Funktionen, die keine Datei anlegt oder die später gedroppt
   werden.
3. **Die verlorene Zeilenzahl fällt von 883 auf rund 116.**
4. **Das eigentliche Risiko:** `proj110` führt künftig **490 bisher nie ausgeführte Zeilen** aus,
   `proj107` weitere 214. Scheitert eine davon, ist es ein `structural failure` — und der Guard bricht
   dann ab. Genau deshalb ist diese Slice von der Diagnose getrennt: der PR-Lauf zeigt es, **bevor**
   etwas auf `main` landet.

### Ergebnis — die Erwartung ist in jedem Punkt eingetroffen

```
Applied 216 migration(s); 4 tolerated abort(s); 0 structural failures.
PROJ-Y-130f: 4 Migration(en) brechen im Fresh-Apply ab; rund 116 Zeile(n) laufen dadurch nicht.
```

| | erwartet | tatsächlich |
|---|---|---|
| Abbrüche | 7 → 4 | **7 → 4** |
| verschwunden | `proj107` · `proj110` · `proj122` | **genau diese drei** |
| verbleibend | `harden_trigger_only_functions` · `security_internal_functions_lockdown` · `proj70_beta_accept_bulk_rpc` · `proj148_last_lead_cascade_fix` | **genau diese vier**, mit unveränderten Abbruchzeilen 18/75/441/70 |
| verlorene Zeilen | 883 → ~116 | **883 → 116** |
| `structural failures` | 0 (das Risiko) | **0** |
| angewendete Dateien | — | 213 → **216** |

**Das Risiko hat sich nicht materialisiert.** Die 704 Zeilen, die `proj107` und `proj110` nun erstmals
ausführen, liefen fehlerfrei durch — der Schema-Drift-Guard blieb grün, ebenso die übrigen acht Checks.
Das war vorher nicht bekannt und ist der Grund, warum diese Slice von der Diagnose getrennt war: hätte
eine dieser Zeilen gescheitert, wäre der Required Check rot geworden.

**Bemerkenswert am Rande:** die Kaskade hat sich exakt so aufgelöst wie vorhergesagt. `proj122` scheiterte
nie an sich selbst, sondern an einer Funktion, die `proj110` hinter seiner Abbruchstelle anlegt — mit
`proj110` verschwand auch `proj122` aus der Liste, ohne dass diese Slice die Datei berührt hat.

---

## Akzeptanzkriterien

- [x] **AC-Y130g.1** — Der `search_path` der Shadow-DB entspricht dem von Prod, live gelesen und im
      Workflow kommentiert.
- [x] **AC-Y130g.2** — Kein Stub, keine nachgebaute Funktion, keine geänderte Migration.
- [x] **AC-Y130g.3** — Die CLAUDE.md-Regel wird ausdrücklich geprüft, als **Fehler**, mit eingefrorener
      Ausnahmeliste für die zwei nicht korrigierbaren Bestandsfälle.
- [x] **AC-Y130g.4** — Rot-Grün am echten Guard: Ausnahme entfernt → `1 error`, zurückgesetzt → `OK`.
- [x] **AC-Y130g.5** — Die `g`-Flag-Falle von `RegExp.test` ist behandelt und durch einen Test über
      **zwei** verletzende Dateien abgesichert (ohne Rücksetzen bliebe die zweite stumm).
- [x] **AC-Y130g.6** — Exit-Logik des Drift-Workflows unverändert; YAML-Integrität geprüft.
- [x] **AC-Y130g.7** — Der eigene CI-Lauf bestätigt die Erwartung **in jedem Punkt**, inklusive der
      Zeilenzahl (116, vorhergesagt „rund 116") und der Identität der vier verbleibenden Abbrüche.
- [x] **AC-Y130g.8** — **0 `structural failures`**, obwohl 704 Zeilen erstmals ausgeführt wurden. Alle
      neun Checks grün.

## Definition of Done

- [x] `search_path`-Angleichung, expliziter Regel-Wächter, Tests, Rot-Grün.
- [x] CI-Lauf beobachtet, Ergebnis gegen die Erwartung gehalten und eingetragen.
- [x] Buchführung final; die vier verbleibenden Abbrüche sind als **PROJ-Y-130h** registriert.

## Was diese Slice nicht tut

Sie behebt die **vier** verbleibenden Abbrüche nicht. Deren Ursache ist eine andere Klasse: Funktionen,
die keine Migrationsdatei anlegt (`enforce_last_lead` — die Alt-Divergenz, die PROJ-Y-148e als `legacy`
führt) oder die eine spätere Migration droppt (`decrypt_tenant_ai_key`). Dort ist je Fall zu entscheiden,
ob die verlorenen `revoke`-Anweisungen per Fix-forward nachzuholen sind — 116 Zeilen gegenüber 767, die
diese Slice adressiert.

## Deploy

**Deployed 2026-08-20:** PR #419 (squash) → main `21bd260`, Tag `v2.68.0-PROJ-Y-130g`.

**Der Deploy-Nachweis ist der Lauf des PRs selbst** — er hat die Wirkung gemessen, nicht behauptet:
`Applied 216 migration(s); 4 tolerated abort(s); 0 structural failures`, und der Schema-Drift-Guard blieb
dabei grün. Ein zusätzlicher Smoke wäre gegenstandslos: kein `src/`-Diff, keine Migration, kein
Laufzeitverhalten.

**Scope `tooling-only`** — eine Workflow-Zeile, eine Guard-Prüfung, Tests, Dokumentation.

**Offen bleibt PROJ-Y-130h** (vier Abbrüche, 116 Zeilen) — kein zurückgestelltes Kriterium dieser Slice:
ihr Auftrag waren die `moddatetime`-Fälle und die Erzwingung der Regel. Beide erledigt.
