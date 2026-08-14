---
id: PROJ-Y-143o
title: "E2E-Projektanhäufung an der Quelle stoppen (Teardown in den Wizard-Finalize-Specs)"
issue_type: Chore
epic_code: HYGIENE
epic_title: "Hygiene & Supply-Chain"
priority: Low
priority_source: "Should"
labels: ["hygiene", "testing", "e2e"]
dependencies: ["PROJ-143", "PROJ-Y-143c"]
roles: ["Platform"]
summary_for_jira: "[HYGIENE] E2E-Specs raeumen ihre angelegten Projekte nicht auf"
---

# PROJ-Y-143o: E2E-Projektanhäufung an der Quelle stoppen

## Status: Approved
## Deployment Scope: —
**Created:** 2026-08-13
**Origin:** Nebenbefund aus der Impact-Analyse zu PROJ-Y-143c.

## Befund

PROJ-Y-143c hat 43 angesammelte Testprojekte aus dem **Alt**-Mandanten entfernt. Das war
Symptombehandlung: der Alt-Bestand war eingefroren, der **aktuelle** Fixture-Mandant
`e2e00000-0000-4e2e-8e2e-000000000002` sammelt zum selben Zeitpunkt bereits **20 Projekte** an —
nach demselben Muster, in drei Tagen (Mandant angelegt 2026-08-10):

| Name | Anzahl | Herkunft |
|---|---|---|
| `[E2E 135] Finalize Project` | 10 | PROJ-135 Clarifying-Questions-Spec |
| `[E2E ε] Wizard KI Project` | 9 | PROJ-70-ε Wizard-Handoff-Spec |
| `[E2E] Visual-Regression Project` | 1 | gewollte, gepinnte Fixture (`E2E_PROJECT_ID`) |

Genau **eine** dieser Zeilen ist eine beabsichtigte Fixture. Die übrigen 19 entstehen, weil die Specs
den Wizard-Finalize-Pfad durchfahren — dessen Zweck es ist, ein echtes Projekt anzulegen — und danach
nichts aufräumen. Jeder weitere Lauf legt eine Zeile nach.

## Warum das mehr ist als Unordnung

Der Alt-Bestand hat gezeigt, wohin das führt:
`tests/sql/PROJ-77-gamma-skill-knowledge-links-smoke.sql` hatte eines dieser angesammelten Projekte
(`f6564e78-…`, "[BE-SMOKE2] proj") als **Fremdmandanten-Projekt hart verdrahtet**. Als PROJ-Y-143c die
Halde abräumte, brach der Pentest mit `23503` (FK-Verletzung) — ein Sicherheitsnachweis, der an
zufällig übrig gebliebenem Testmüll hing. Angesammelte Testdaten sind also nicht nur Ballast; sie
werden mit der Zeit stillschweigend zur Fixture, auf die sich anderes verlässt.

Zweiter Effekt: die PROJ-130-Kette hat den Audit-Trail append-only gemacht. Testrauschen aus
Mandanten ohne Ausnahme wäre damit **unwiderruflich** (im Alt-Mandanten greift
`tenants.audit_lifecycle_exempt` aus PROJ-Y-130h; für neue Fixture-Mandanten muss das bewusst gesetzt
werden, sonst sammelt sich Rauschen dauerhaft im Compliance-Artefakt).

## Sofortmaßnahme 2026-08-13 — Ausnahmeflag für die zwei neueren Fixture-Mandanten

Der obige Absatz beschrieb die Gefahr; eine Messung am selben Tag zeigte, dass sie bereits eingetreten
war. `audit_lifecycle_exempt` wird **nicht** aus dem `[E2E]`-Präfix abgeleitet (PROJ-Y-146b, Runbook
`docs/production/prod-test-fixtures.md`) — die beiden älteren Fixture-Mandanten trugen es, die beiden
**neueren** nicht, weil es nichts zu erben gibt:

| Mandant | exempt (vorher) | Audit-Zeilen | davon Lifecycle |
|---|---|---|---|
| `IT-Couch GmbH` (Produktiv) | false | 443 | 2 |
| `[E2E]` Alt (`…0e20`) | true | 41 | 0 |
| `[E2E]` Fixture (`…0002`) | true | 30 | 7 |
| `[E2E] Assistant Test` (`…0004`, PROJ-Y-144d) | **false** | 33 | **32** |
| `[E2E] Visual-Regression Workspace` (`…0007`, PROJ-Y-143l) | **false** | 8 | **4** |

Beim Assistant-Mandanten waren **32 von 33** Audit-Zeilen reines Testrauschen. Da `audit_log_entries`
seit PROJ-130-α append-only ist und sein Mandanten-FK entkoppelt wurde, überleben diese Zeilen sogar
das Löschen ihres Mandanten — Warten ist hier die *unumkehrbare* Richtung, das Setzen des Flags die
umkehrbare. Deshalb nach ausdrücklicher Freigabe sofort gesetzt statt auf die Richtungsentscheidung
dieser Slice zu warten:

```sql
update tenants set audit_lifecycle_exempt = true
where id in ('e2e00000-…-0004','e2e00000-…-0007')
  and name like '[E2E]%'
  and domain like 'e2e-%.projektplattform-v3.test'
  and audit_lifecycle_exempt = false;
```

Die drei Schutzbedingungen sind bewusst redundant zur ID-Liste: der UPDATE konnte den
Produktivmandanten strukturell nicht treffen, auch bei falsch abgeschriebener UUID. Verifiziert
danach: alle vier `[E2E]`-Mandanten `true`, `IT-Couch GmbH` unverändert `false` mit **0** Audit-Zeilen
zum Flag. Jede der vier Flag-Setzungen hat genau **eine** Feld-Audit-Zeile erzeugt — so gewollt: wer
die Ausnahme setzt, kann seine eigene Spur nicht verwischen (PROJ-Y-130h).

**Damit ist `AC-Y143o.5` für den Bestand erfüllt**; offen bleibt der strukturelle Teil — dass ein
*künftiger* Fixture-Mandant das Flag wieder nicht erbt. Das gehört in die Richtungsentscheidung unten.
Die Bestandszeilen (7 + 32 + 4) sind nicht rückholbar und bleiben stehen.

Nebenbefund, nicht in dieser Slice behandelt: `audit_lifecycle_exempt` ist an keine Test-Kennung
gebunden — kein `CHECK`, kein Trigger. Es lässt sich also auch auf einen echten Mandanten setzen und
dessen Anlage-/Löschprotokollierung abschalten; nachweisbar, weil die Änderung auditiert wird, aber
nicht verhindert. Registriert als **PROJ-Y-146c** (PROJ-130-Mechanismus, CIA-pflichtig).

## Scope

Ursache beheben, nicht erneut aufräumen. Zu klären ist die Richtung:

- **(a) Teardown je Spec** — der Spec löscht am Ende, was er angelegt hat. Direkt und lokal, stößt aber
  auf `enforce_last_lead()`: das Löschen eines Projekts scheitert an der letzten `lead`-Mitgliedschaft
  (in PROJ-Y-143c live belegt). Braucht also einen service-role-Pfad oder einen bewussten Umgang mit
  dem Wächter — kein dauerhaftes Abschalten von Integritätsregeln im Testpfad.
- **(b) Wiederverwenden statt anlegen** — Specs, die kein frisches Projekt brauchen, fahren gegen die
  gepinnte Fixture. Ändert die Aussage der Specs, die den Finalize-Pfad gerade **prüfen** sollen, daher
  nicht pauschal anwendbar.
- **(c) Periodischer Sweep** — ein Aufräumschritt in `global-setup`, der `[E2E …]`-Projekte des
  Fixture-Mandanten oberhalb einer Altersgrenze entfernt und die gepinnten IDs ausnimmt. Zentral und
  robust gegen abgebrochene Läufe, löscht aber Daten außerhalb der Sichtweite des einzelnen Specs.

Die 20 Bestandszeilen werden in dieser Slice **nicht** angefasst — erst die Quelle schließen, sonst
entsteht dieselbe Halde neu.

## Acceptance Criteria

- **AC-Y143o.1** — Die Ursache ist benannt und behoben: nach einem vollständigen Lauf der
  authentifizierten Suite ist die Projektzahl des Fixture-Mandanten **stabil**, nicht wachsend
  (vorher/nachher gemessen, nicht argumentiert).
- **AC-Y143o.2** — Die gepinnten Fixtures (`E2E_PROJECT_ID`, `E2E_ASSISTANT_PROJECT_ID`) überleben
  jeden Aufräumpfad nachweislich.
- **AC-Y143o.3** — Kein Integritäts-Trigger wird im Testpfad dauerhaft abgeschaltet; wird
  `enforce_last_lead()` umgangen, geschieht das transaktional und wird danach verifiziert.
- **AC-Y143o.4** — Kein SQL-Pentest und keine Fixture verdrahtet weiterhin eine **zufällig
  angesammelte** Zeile; Fremdmandanten-Objekte werden in der Transaktion angelegt (Muster: `PROJ-77-γ`
  nach PROJ-Y-143c, `PROJ-144`, `PROJ-Y-122a`).
- **AC-Y143o.5** — Für jeden Mandanten, in dem E2E-Läufe Objekte anlegen, ist entschieden und
  dokumentiert, ob `tenants.audit_lifecycle_exempt` gesetzt sein soll (PROJ-Y-130h).
  **Bestand erfüllt 2026-08-13** (siehe „Sofortmaßnahme"): alle vier `[E2E]`-Mandanten tragen das Flag,
  der Produktivmandant nicht. **Strukturell offen**: ein künftiger Fixture-Mandant erbt es weiterhin
  nicht — die gewählte Richtung muss das Setzen erzwingen oder prüfbar machen.

## Wechselwirkungen

- **PROJ-Y-143l** (läuft parallel, Stand 2026-08-13): legt für die Visual-Tests eine eigene Lane an —
  Mandant `e2e00000-…-0007` "[E2E] Visual-Regression Workspace" existiert seit 09:53 UTC und trägt
  1 Projekt. Damit gibt es einen **dritten** Fixture-Mandanten. Jede hier gewählte Lösung muss über
  alle Fixture-Mandanten hinweg funktionieren, nicht nur über `…0002`; die Reihenfolge (erst 143l
  fertig, dann diese Slice) vermeidet, dass ein Sweep gegen eine Lane gebaut wird, die sich noch bewegt.
- **PROJ-Y-143c**: hat den Alt-Bestand abgeräumt und dabei die Kopplung Pentest↔Testmüll aufgedeckt
  (`PROJ-77-γ`, dort F-1). Der Alt-Mandant bleibt bewusst stehen — vier Pentests nutzen ihn als
  Fremdmandanten.
- **PROJ-143**: hat die Fixture-Identitäten umgestellt; der Alt-Mandant fiel dabei trocken, der neue
  begann zu wachsen — beides Symptome derselben fehlenden Aufräumung.

## Nicht in Scope

Löschen der 20 Bestandszeilen im Mandanten `…0002`, Anfassen des Alt-Mandanten, Änderungen am
Produktivmandanten.

## Befund korrigiert 2026-08-14 — die Ursache war eine andere

Die Spec ging davon aus, die Specs räumten nicht auf („entstehen, weil die Specs den
Wizard-Finalize-Pfad durchfahren … und danach nichts aufräumen"). Das stimmt nicht. **Alle drei
betroffenen Stellen hatten längst ein `afterAll` mit Projekt-Löschung.** Sie waren wirkungslos,
und zwar aus zwei Gründen, die übereinander lagen:

1. **Falsche Tabelle.** Die Teardowns löschten aus `project_members` — die Tabelle heißt
   `project_memberships` und `project_members` existiert nicht. Die Lead-Mitgliedschaft blieb
   also stehen.
2. **Der Projekt-Delete brach ab.** Mit verbliebener Lead-Mitgliedschaft lief er in
   `23514 / project must have at least one lead` — derselbe Fehler, der im Produkt „endgültig
   löschen" unbrauchbar machte (**PROJ-148**, inzwischen behoben).

**Warum beides tagelang unsichtbar blieb — das ist der eigentliche Defekt:** jeder Teardown
verschluckte seine Fehler (`safe()`, `.then(()=>undefined,()=>undefined)`, `try {} catch {}`).
supabase-js *wirft* bei Datenbankfehlern nicht, es gibt `{ error }` zurück; ein `await …delete()`
ohne Prüfung sieht deshalb wie erfolgreiches Aufräumen aus und ist keins. Ein Aufräumschritt, der
nicht sagen kann, dass er gescheitert ist, verwandelt jeden Folgefehler in langsam wachsenden
Datenmüll — und er hat hier einen **Produktionsfehler mitverdeckt**.

Damit ändert sich die Richtungsentscheidung: keine der drei Optionen (a)/(b)/(c) trifft die
Ursache. Weder ein neuer Teardown noch ein Sweep hätte geholfen, solange Fehlschläge unsichtbar
sind. Umgesetzt ist deshalb:

- **Die falsche Tabelle entfällt** (die Mitgliedschaften räumt seit PROJ-148 der `ON DELETE
  CASCADE`).
- **Der Projekt-Delete ist laut** — neuer Helfer `tests/fixtures/cleanup.ts` (`deleteOrThrow`)
  prüft `{ error }` und wirft mit Kontext. Bewusst nur für das Projekt: dort hängt die Anhäufung.
  Storage-Objekte und Kindzeilen dürfen weiterhin leise scheitern, weil ein roter Lauf dafür mehr
  Schaden als Nutzen brächte.
- **AC-Y143o.5 strukturell geschlossen:** `global-setup` setzt `audit_lifecycle_exempt: true` in
  allen drei Fixture-Mandanten-Upserts. Ein künftiger Fixture-Mandant erbt das Flag damit nicht
  mehr zufällig nicht. Schreiben darf das seit PROJ-Y-146c nur die Service-Role — global-setup ist
  genau dieser Pfad.

## Nachweis (AC-Y143o.1)

Vollständiger Lauf beider projekt-erzeugender Specs, **9 passed**:
`projects` im Fixture-Mandanten **20 vorher → 20 nachher**, Reste exakt die 19 Altzeilen
(`[E2E 135]` 10, `[E2E ε]` 9) plus die gepinnte Fixture. Vor dem Umbau hätte derselbe Lauf zwei
Zeilen hinzugefügt. **AC-Y143o.2**: die gepinnte Fixture hat den Lauf überlebt.

`tests/PROJ-1-2-live-closure.spec.ts` (in PROJ-148 auf die reale Projektform mit Lead gehärtet)
läuft grün gegen den gefixten Trigger.

## Bewusst offen

Die 19 Altzeilen bleiben stehen — so in „Nicht in Scope" festgelegt, und sie sind jetzt jederzeit
löschbar. **AC-Y143o.3** entfällt gegenstandslos: es wird kein Integritäts-Trigger umgangen, weil
PROJ-148 den Abriss regulär erlaubt. **AC-Y143o.4** war bereits durch PROJ-Y-143c erledigt
(`PROJ-77-γ` legt sein Fremdmandanten-Projekt seither in der Transaktion an).
