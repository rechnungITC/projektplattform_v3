# PROJ-Y-130f — Warum die Shadow-DB nicht deckungsgleich mit Prod ist

## Status: Approved
## Deployment Scope: —
<!-- Scope bleibt leer bis zum Merge; aus den Belegen ist `tooling-only` die Klassifikation. -->

**Created:** 2026-08-20
**Origin:** PROJ-130-α (CI-Replay-Befund), dreifach in Prosa benannt, als Registerzeile nachgetragen in
PROJ-Y-148c, in der Fragestellung korrigiert durch PROJ-Y-148e.

---

## Die Frage war falsch gestellt

Registriert war: *„Zwei Audit-Trigger existieren in Prod, die die Migrationsdateien nicht herstellen.
Welche zwei ist nicht bestimmt."* Die Zahlen dahinter — 65 aus der Shadow-DB, 67 in Prod — sind aus
PROJ-130-α korrekt übernommen.

Beides ist inzwischen überholt, und zwar in beide Richtungen:

- **Die Momentaufnahme ist veraltet.** Prod führt heute **74** Tabellen mit `record_audit_changes`, nicht
  67 — seit dem 2026-08-11 sind PROJ-45-β, PROJ-80, PROJ-120, PROJ-122, PROJ-Y-115c und PROJ-130-γ2
  gelandet. Eine Differenz „zwei" gibt es nicht mehr.
- **Die Ursache sind keine Trigger.** Sie ist gemessen: **sieben Migrationsdateien brechen im
  Fresh-Apply ab.** `ON_ERROR_STOP=1` beendet die Datei an der Fehlerstelle, alles danach läuft nicht —
  und der Workflow toleriert das seit je als Warnung. Fehlende Audit-Trigger sind eine *Folge* davon,
  nicht der Befund.

Der letzte Lauf auf `main` (`32278037584`) sagt es wörtlich:
`Applied 213 migration(s); 7 tolerated REVOKE-warnings; 0 structural failures.` — bei **220** Dateien.

## Der eigentliche Befund sitzt im Workflow

Zwei Dinge machten die Ursache unsichtbar:

1. **Die Fehlermeldung wurde verworfen.** Der Toleranz-Zweig gab nur eine feste Warnung aus; das
   psql-Log lag in `/tmp` und wurde nie gelesen. Sieben stille Warnungen bei jedem Lauf, ohne zu sagen,
   *was* fehlschlug oder *wie viel* danach nicht mehr lief.
2. **Die Warnung schrieb eine unbelegte Ursache fest.** Sie lautete „REVOKE/GRANT on missing function",
   während der Grep darüber nur `ERROR:.*function.*does not exist` prüft. Das trifft ebenso ein
   `create trigger … execute function`, einen Aufruf in einem DO-Block oder eine Signatur-Abweichung.
   Die Zuschreibung war eine Vermutung im Gewand einer Feststellung.

## Was diese Slice tut

Sie macht die sieben Abbrüche **benennbar**: Fehlermeldung, Abbruchzeile und Zahl der übersprungenen
Zeilen je Datei, plus eine Zusammenfassung, die die Tragweite ausspricht („die Shadow-DB ist NICHT
deckungsgleich mit Prod"). Die Exit-Logik bleibt **unverändert** — Warnungen brechen den Lauf weiter
nicht ab, nur `failures` tun das. Ein Required Check ist kein Ort für Experimente.

**Ein Fall ist bereits statisch abgeleitet und benannt:**
`20260428120000_harden_trigger_only_functions.sql` bricht an **Zeile 18** ab, weil `enforce_last_lead`
dort nicht existiert — PROJ-Y-148e hat unabhängig gemessen, dass **keine** Migrationsdatei diese Funktion
anlegt. **18 der 36 Zeilen laufen nicht**, also die Hälfte der Datei: sie besteht ausschließlich aus
`revoke execute`-Anweisungen, und die nach Zeile 18 fehlen im Replay. Eine frisch gebaute Datenbank
lässt diesen Funktionen also `PUBLIC`-EXECUTE, das Prod längst entzogen hat.

Für die übrigen sechs reicht die statische Ableitung nicht: derselbe Lauf über alle 220 Dateien fand nur
diesen einen Fall. Ihre Ursachen liegen außerhalb dessen, was ohne echten Replay entscheidbar ist
(dynamisch per `execute format` angelegte Funktionen, Signatur-Abweichungen) — genau deshalb macht diese
Slice den Replay selbst sprechen, statt weiter zu raten.

---

## Akzeptanzkriterien

- [x] **AC-Y130f.1** — Die Fragestellung ist korrigiert: nicht „zwei Audit-Trigger", sondern **sieben
      abbrechende Migrationen**; die 65/67-Zahlen sind als überholte Momentaufnahme gekennzeichnet.
- [x] **AC-Y130f.2** — Der Workflow gibt bei jedem tolerierten Abbruch die **echte Fehlermeldung**, die
      Abbruchzeile und die Zahl der übersprungenen Zeilen aus.
- [x] **AC-Y130f.3** — Die Warnung behauptet keine Ursache mehr, die sie nicht geprüft hat.
- [x] **AC-Y130f.4** — Eine Zusammenfassung benennt die Tragweite, statt nur zu zählen.
- [x] **AC-Y130f.5** — Die **Exit-Logik ist unverändert**: nur `failures` beenden den Lauf. Nachgewiesen
      am Diff.
- [x] **AC-Y130f.6** — Die Zeilennummer-Extraktion ist gegen echte psql-Fehlerformen getestet, inklusive
      der Form **ohne** `psql:`-Präfix (dann bleibt sie leer und wird nicht geraten).
- [x] **AC-Y130f.7** — Ein Zählfehler ist behoben, bevor er wirken konnte: ohne `skipped=0` im
      `else`-Zweig hätte die Summe den Wert des vorigen Durchlaufs mitgeschleppt. Mit einer Simulation
      der Schleife belegt (Summe 18, nicht 103).
- [x] **AC-Y130f.8** — Ein konkreter Abbruch ist benannt und mit einer unabhängigen Messung verbunden
      (PROJ-Y-148e: `enforce_last_lead` wird von keiner Datei angelegt).
- [ ] **AC-Y130f.9** — Die restlichen **sechs** Ursachen sind benannt. Wird durch den CI-Lauf dieses PRs
      geliefert und **vor dem Merge** hier nachgetragen.

## Definition of Done

- [x] Workflow-Diagnose, YAML-Integrität geprüft, Exit-Logik unverändert.
- [x] Buchführung: diese Spec, `features/INDEX.md`, `features/OPEN-DEFERRED-STATUS.md`.
- [ ] Die sechs offenen Ursachen aus dem eigenen CI-Lauf nachgetragen.
- [ ] **Behebung** der sieben Abbrüche — eigene Folgearbeit, siehe unten.

---

## Was diese Slice nicht tut

Sie **behebt** die sieben Abbrüche nicht. Das ist bewusst getrennt, und zwar aus einem Grund, der bei der
Diagnose sichtbar wurde: eine Behebung heißt, die Ursachen einzeln zu verstehen und je Fall zu
entscheiden — Migrationen sind append-only, die fehlerhaften Zeilen sind also nicht editierbar. Für den
einen bekannten Fall wäre der Fix eine Fix-forward-Migration, die die 18 verlorenen `revoke`-Anweisungen
idempotent nachholt. Für die anderen sechs ist die Entscheidung erst nach dem CI-Lauf treffbar.

Die Tragweite ist auch nach dieser Slice **nicht vollständig bekannt**: wie viele Objekte in der
Shadow-DB fehlen, sagt erst der Vergleich, den PROJ-Y-148e für Funktionen aufgebaut hat und der für
Trigger, Grants und Policies noch fehlt — dafür braucht es die Shadow-DB als Quelle, also Docker
(offener Handoff PROJ-67/F6).
