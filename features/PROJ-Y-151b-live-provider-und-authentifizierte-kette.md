# PROJ-Y-151b — Echter Anbieter-Durchlauf und authentifizierte Kette (KI-Chat)

## Status: Deployed
## Deployment Scope: full

Followup zu **PROJ-151** (Projektbezogener KI-Chat, deployed mit Scope `mvp`).
Registriert als **Voraussetzung für Scope `full`**: der Kernpfad „Frage rein →
Modellantwort raus" war nie gelaufen, und ein authentifizierter Durchlauf durch
die Oberfläche fehlte.

## Warum diese Slice nötig war

PROJ-151 hat Router, Klassifizierung, Kostendeckel, Absagegründe und die
Capability-Matrix belegt — alles gegen **gemockte** Anbieter. Genau die Lücke,
an der PROJ-142 gezeigt hat, dass eine gemockte Abdeckung einen ganzen
Major-Sprung still überlebt. Diese Slice schließt sie in zwei Hälften:

1. **Echter Anbieter-Durchlauf** gegen die deployte Anwendung
   (`scripts/verify-prod-chat-roundtrip.mjs`, hinter `PROD_WRITE_ACK=1`).
2. **Authentifizierte Kette** durch die Oberfläche in eigener Fixture-Lane
   (`tests/PROJ-Y-151b-chat-chain.spec.ts`, Muster PROJ-Y-144d).

Die Aufteilung ist bewusst: die Lane hat **keinen** KI-Anbieter, weil eine
dauerhafte Fixture mit einer Kopie des Eigner-Schlüssels bei jedem E2E-Lauf
einen kostenpflichtigen Anbieter riefe. Der echte Aufruf ist deshalb ein
Skript auf Zuruf, nicht Teil der Suite.

## Akzeptanzkriterien

| # | Kriterium | Nachweis |
|---|---|---|
| AC-Y151b.1 | Eine Frage geht durch die **deployte** Route an einen **echten** Anbieter und kommt als Antwort zurück | `provider=openai`, `status=success`, Token in/out > 0 |
| AC-Y151b.2 | Die Antwort ist nachweislich im Projektkontext geerdet, nicht Allgemeinwissen | K1: eine Kennung, die kein Weltwissen sein kann, steht in der Projektbeschreibung und muss in der Antwort auftauchen |
| AC-Y151b.3 | Der Skill-Kontext wirkt wirklich | K2: ein aktiver Skill schreibt ein Losungswort vor; es muss in der Antwort stehen, und `skills_applied` muss den Skill nennen |
| AC-Y151b.4 | Die Class-3-Sperre hält live | K3: dieselbe Lane, Frage mit E-Mail — kein Cloud-Anbieter, `reason_code` gesetzt |
| AC-Y151b.5 | Beide Läufe sind in `ki_runs` protokolliert | Zweck, Anbieter, Status, Klassifikation, Token aus der Datenbank |
| AC-Y151b.6 | Authentifizierter Durchlauf: Fläche erreichbar, Vertraulichkeit ausgesprochen | Playwright, eigene Lane |
| AC-Y151b.7 | Frage senden persistiert die Nachricht, und eine **leere** Antwort wird erklärt | Oberfläche + Gegenprobe in der Datenbank |
| AC-Y151b.8 | Die Class-3-Warnung ist ein Hinweis, kein Riegel — und deckt sich mit der tatsächlichen Sperre | „Senden" bleibt aktiv; nach dem Senden erscheint die Class-3-Meldung |
| AC-Y151b.9 | Keine Rückstände | Zählung über alle berührten Tabellen, beide Hälften |

## Ergebnis

**Alle neun Kriterien erfüllt.** Live gegen die **deployte** Produktion:
**17/17 PASS, 0 FAIL**, 0 laufbezogene Rückstände über 12 Tabellen.
Authentifizierte Kette **3× 3/3**, 0 Rückstände.

Die Antwort des Modells ist der Nachweis in einem Satz:

> `NORDLICHT: Das interne Projektkennzeichen dieses Projekts ist ZORQ-4471.`

Beide Kontrollmarken stehen darin — `ZORQ-4471` kann kein Weltwissen sein und
stammt aus der Projektbeschreibung (K1), `NORDLICHT` schreibt der aktive Skill
vor (K2). `provider=openai`, `status=success`, 272/22 Token.

**Vorher/Nachher als Beleg für F-1:** derselbe Lauf gegen die Produktion **vor**
dem Deploy war bei K2 rot (`skills_applied: []`, kein Losungswort, 237
Eingabe-Token). Nach dem Deploy: grün, `skills_applied: ["[E2E]
Losungswort-Skill"]`, **272** Eingabe-Token — der Zuwachs ist die Skill-Anweisung,
die jetzt wirklich im Prompt landet. Das ist eine unabhängige Bestätigung
neben der Textprüfung.

## Drei Produktfehler gefunden — alle nur durch echte Läufe sichtbar

### F-1 (hoch): Der Skill-Kontext war in Produktion still wirkungslos

`loadProjectChatSkills` bettete `skills(name)` in die `skill_versions`-Abfrage
ein. Zwischen den beiden Tabellen bestehen **zwei** Fremdschlüssel
(`skill_versions.skill_id → skills.id` und
`skills.current_version_id → skill_versions.id`); PostgREST kann die Einbettung
nicht auflösen und antwortet mit *„Could not embed because more than one
relationship was found"*. Weil `error` nicht geprüft wurde, war die Liste leer —
und der Chat lief **für jedes Projekt** ohne Skill-Kontext, ohne dass irgendetwas
rot wurde.

Der Skill-Kontext ist ein vom Eigner ausdrücklich gewählter Bestandteil von
PROJ-151. Er war seit dem Deploy ohne Wirkung.

**Warum kein Wächter griff:** der Schema-Drift-Wächter prüft, ob *Spalten*
existieren, nicht ob eine *Einbettung* eindeutig ist. Dieselbe Datei trägt im
Kopf bereits die Warnung vor genau dieser stillen Klasse — damals ging es um den
falschen Spaltennamen `content_md`, den der Wächter noch gefunden hatte. Eine
Zeile tiefer schlug dieselbe Klasse über einen anderen Mechanismus zu.

**Behoben** durch Wegfall der mehrdeutigen Einbettung (der Name steht bereits in
der ersten Abfrage) statt durch Benennen des Fremdschlüssels — eine zweite
Quelle wäre überflüssig. Beide Abfragen melden ihren Fehler jetzt laut.
Rot-Grün ausgeführt: gegen die alte Form fallen genau 2 der 4 neuen Tests.

### F-2 (mittel): Jede Fehlermeldung des Chats las sich „[object Object]"

Das Haus-Fehlerformat ist `{ error: { code, message } }` (`apiError` in
`route-helpers.ts`). Der Chat-Client typisierte `error` als Zeichenkette und
reichte das **Objekt** an den Fehlerkonstruktor weiter. Betroffen war **jeder**
Chat-Fehler: Modul aus, 403, 404, fehlerhafte Eingabe. Die Route-Tests konnten
das nicht sehen — sie prüfen Statuscodes, nicht was der Nutzer liest.

### F-3 (niedrig, a11y): Aktion und Eintrag hießen gleich

Der Knopf „Neue Unterhaltung" und jede damit angelegte Unterhaltung trugen
denselben Namen — für eine Sprachausgabe nicht unterscheidbar. Die Aktion heißt
jetzt „Neue Unterhaltung beginnen". Aufgefallen als mehrdeutiger Selektor; der
Zugänglichkeits-Anteil ist der eigentliche Ertrag.

## Nebenbefund ohne Schweregrad

`settings-tenant.png` war **+49 px** hoch. Nicht diese Slice: PROJ-151 hat
`ai_chat` in `TOGGLEABLE_MODULES` aufgenommen, was der Einstellungsseite eine
Modulzeile hinzufügt — und die Baseline beim eigenen Deploy nicht nachgezogen
(die Visual-Suite läuft lokal, nicht in CI; gleiche Klasse wie in PROJ-Y-143g
protokolliert). Ursache am DOM belegt („KI-Chat" vorhanden, Höhe 4603 = Ist),
**Kontrollexperiment auf unverändertem `origin/main`** zeigt dieselbe eine
Fläche fallen, danach über Dateilöschung neu aufgenommen und 3× 9/9 grün.

## Vier Fehler im eigenen Nachweis — benannt, nicht weggedrückt

Sie stehen hier, weil jeder von ihnen als Produktfehler aussah:

1. **Verschluckte Datenbankfehler.** supabase-js wirft nicht, es gibt `{error}`
   zurück. Ein Seed-Schritt scheiterte still (`project_memberships.created_by`
   ist `NOT NULL`), ein `select` scheiterte still (die Spalten heißen
   `input_tokens`/`output_tokens`, nicht `token_input`/`token_output`) — und
   eine Folgezusicherung bestand daraufhin **leer** (`[].every()` ist wahr).
2. **`upsert` ohne `onConflict`** zielt auf den Primärschlüssel, nicht auf die
   Eindeutigkeit `(tenant_id, user_id)`. Jeder Wiederholungslauf scheiterte,
   solange die Zeile des Vorlaufs noch stand.
3. **`afterAll` läuft pro Worker.** Bei `fullyParallel` liefen die drei Fälle in
   getrennten Workern; die Aufräumung des einen löschte die Zeilen, auf die der
   andere wartete. Jetzt seriell (Lehre wie PROJ-90).
4. **Ein Auth-Fehler tarnte sich als 405.** Ein 307 auf `/anmelden` behält bei
   automatischem Folgen die Methode bei, und eine Seiten-Route beantwortet POST
   mit 405. Ursache war ein handgebautes Cookie: der SSR-Client erwartet die
   ganze Sitzung als `base64-<base64url(JSON)>`, gestückelt — jetzt derselbe
   Encoder wie in `global-setup.ts`. Das Skript folgt Redirects nicht mehr
   automatisch.

## Abweichungen

* **D-Y151b.1** — Die Fixture-Lane hat **keinen** KI-Anbieter (Kosten). Der echte
  Aufruf ist das Skript auf Zuruf.
* **D-Y151b.2** — Der Lane-**Mandant** bleibt stehen, wie die vier bestehenden
  `[E2E]`-Mandanten: `enforce_admin_invariant` verbietet das Löschen der letzten
  Admin-Mitgliedschaft und trifft über den CASCADE den Mandanten selbst. Es gibt
  keinen DML-Pfad, und ein Trigger-Ausstieg wäre genau die Aushebelung, die
  PROJ-Y-148c zurückgebaut hat. Alles Laufbezogene wird entfernt und auf 0
  nachgezählt, ausdrücklich auch die Kopie des Anbieter-Schlüssels.
* **D-Y151b.3** — Das Skript läuft **nicht** in CI: es schreibt in die
  Produktionsdatenbank und ruft einen kostenpflichtigen Anbieter (Muster
  `verify-prod-snapshot-render.mts`, PROJ-Y-146a).
* **D-Y151b.4** — Mobile Safari env-übersprungen (PROJ-67/F2).

## Deployment

**Deployed 2026-08-27: Tag `v2.82.0-PROJ-Y-151b` auf dem Merge-Commit
`51817f9` (PR #483, squash → `main`).** Der Merge **ist** die Auslieferung:
kein Runtime-DB-Change, aber echter `src/`-Diff (Skill-Lader, Fehlerformat,
Zugänglichkeit), also Laufzeitverhalten. Vercel-Produktions-Deployment aus genau
diesem SHA erfolgreich; **erst danach** der Live-Lauf, damit er den neuen Stand
misst und nicht den alten.

Alle acht Pflicht-Checks grün, dazu der (nicht enrollte) Vercel-Build — er
belegt, dass es in der Zielumgebung baut.

Gates nach dem Merge auf `main`: ESLint 0 · tsc **13 = Baseline / 0 neu**
(nach `rm -rf .next` gemessen, PROJ-Y-143e-Falle) · vitest **3898/3898** ·
Build clean · Visual **3× 9/9** · index-scope 0 · migration-naming 0.

## Folge für PROJ-151

Beide Hälften des Registereintrags sind erfüllt; die dort genannte Voraussetzung
für Scope `full` ist damit eingelöst. Die Aufstufung selbst gehört in eine
eigene Buchführung mit erneutem QA-Blick, nicht in diesen Followup —
**PROJ-151 bleibt hier unverändert `mvp`**.
