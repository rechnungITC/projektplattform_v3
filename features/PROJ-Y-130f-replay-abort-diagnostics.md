# PROJ-Y-130f — Warum die Shadow-DB nicht deckungsgleich mit Prod ist

## Status: Deployed
## Deployment Scope: tooling-only
<!-- Deployed 2026-08-20: PR #417 (squash) -> main `7825ad6`, Tag `v2.67.0-PROJ-Y-130f`.
     Scope `tooling-only`: nur der CI-Workflow und Dokumentation, kein `src/`-Diff,
     keine Migration, kein Produktverhalten. -->

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
- [x] **AC-Y130f.9** — **Alle sieben Ursachen sind benannt**, geliefert vom CI-Lauf dieses PRs (siehe
      Tabelle unten). Der Lauf beziffert die Tragweite mit **883 nicht ausgeführten Zeilen**.

## Definition of Done

- [x] Workflow-Diagnose, YAML-Integrität geprüft, Exit-Logik unverändert.
- [x] Buchführung: diese Spec, `features/INDEX.md`, `features/OPEN-DEFERRED-STATUS.md`.
- [x] Alle sieben Ursachen aus dem eigenen CI-Lauf nachgetragen.
- [ ] **Behebung** der sieben Abbrüche — eigene Folgearbeit als **PROJ-Y-130g**, siehe unten.

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

---

## Die sieben Ursachen — aus dem CI-Lauf dieses PRs

| Datei | Abbruch | verlorene Zeilen | fehlende Funktion |
|---|---|---|---|
| `harden_trigger_only_functions` | 18/35 | 17 | `enforce_last_lead()` |
| `security_internal_functions_lockdown` | 75/85 | 10 | `decrypt_tenant_ai_key(uuid,text)` |
| `proj70_beta_accept_bulk_rpc` | 441/505 | 64 | `accept_proposal_from_context_undo(uuid,uuid)` |
| **`proj107_risk_register`** | 42/256 | **214** | **`moddatetime()`** |
| **`proj110_stage_gates_and_decision_fields`** | 130/620 | **490** | **`moddatetime()`** |
| `proj122_spa_issues` | 436/499 | 63 | `stage_gate_prereadiness(uuid)` |
| `proj148_last_lead_cascade_fix` | 70/95 | 25 | `enforce_last_lead()` |

**Summe: 883 Zeilen laufen im Fresh-Apply nicht.**

### Der Hauptbefund: eine dokumentierte Regel, zweimal verletzt

Die zwei **größten** Verluste — 214 und 490 Zeilen, zusammen 80 % der Gesamtsumme — haben dieselbe
Ursache: die **bare** Form `moddatetime()` statt `extensions.moddatetime`. Genau davor warnt CLAUDE.md
wörtlich: *„`moddatetime` must be schema-qualified — `extensions.moddatetime`. The bare form resolves in
prod but not in the schema-drift shadow DB."*

Live nachgemessen, warum die Regel stimmt: die Extension liegt in Prod im Schema **`extensions`**, in
`public` gibt es **0** `moddatetime`-Funktionen. In Prod trägt der `search_path` die Auflösung, in der
Shadow-DB nicht.

Beide Dateien verletzen die Regel (bare = 1, qualifiziert = 0). Die Regel war also da, die Verletzung war
da — und **der Wächter hat sie verschwiegen**, weil seine Warnung die Ursache nicht nannte.

### Eine Kausalkette, die drei der sieben verbindet

`proj110` bricht an Zeile 130 ab, legt `stage_gate_prereadiness` aber erst in **Zeile 543** an — die
Funktion entsteht im Replay also nie. `proj122` braucht sie in Zeile 436 und bricht deshalb ebenfalls ab.

**Drei der sieben Abbrüche gehen damit auf zwei `moddatetime()`-Verletzungen zurück** (107, 110 direkt;
122 als Folge), und mit ihnen 767 der 883 Zeilen. Das macht die Behebung greifbar, statt sie als sieben
Einzelfälle erscheinen zu lassen.

### Warum die Behebung eine eigene Slice ist — PROJ-Y-130g

Zwei Gründe, und der zweite ist der wichtigere:

1. **Migrationen sind append-only.** Die fehlerhaften Zeilen sind nicht editierbar. Der naheliegende Weg
   wäre ein `public.moddatetime`-Stub in der Vorbereitungsphase des Workflows (dort, wo schon Rollen und
   Storage-Stubs entstehen) — das ist Test-Infrastruktur, keine Migration, und würde die Shadow-DB der
   echten Supabase-Umgebung **ähnlicher** machen statt eine Migration zu verbiegen.
2. **Der Fix macht den Wächter strenger, und das ist ein Risiko.** Läuft `proj110` künftig durch, werden
   **490 zusätzliche Zeilen** angewendet, die bisher nie liefen. Scheitert eine davon, ist es ein
   `structural failure` — und der Schema-Drift-Guard ist ein **Required Check**: er würde dann jeden PR
   blockieren. Das gehört in eine Slice, die genau das erwartet und beobachtet, nicht als Nebenwirkung
   einer Diagnose-Änderung.

## Deploy

**Deployed 2026-08-20:** PR #417 (squash) → main `7825ad6`, Tag `v2.67.0-PROJ-Y-130f`.

**Der Deploy-Nachweis ist der Lauf, der diese Slice beantwortet hat.** Der CI-Lauf des PRs führte die neue
Diagnose aus und lieferte alle sieben Ursachen samt Abbruchzeilen — sie ist damit nicht nur eingebaut,
sondern in der Umgebung, in der sie wirkt, nachweislich wirksam. Ein weiterer Smoke wäre gegenstandslos:
kein `src/`-Diff, kein Laufzeitverhalten.

**Scope `tooling-only`** — ein CI-Workflow und Dokumentation.

**Offen bleibt allein die Behebung** (PROJ-Y-130g), und das ist kein zurückgestelltes Kriterium dieser
Slice: ihr Auftrag war, die Ursache benennbar zu machen. Sie ist benannt, mit Datei, Zeile, fehlender
Funktion und Zeilenverlust für alle sieben Fälle.
