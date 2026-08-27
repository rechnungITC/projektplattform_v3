# PROJ-152 — Zeitbudget für KI-Anbieter + ehrliches Laufprotokoll

## Status: In Progress
## Deployment Scope: —

## Auslöser

Nutzer-Meldung 2026-08-27: „der prozess hängt wenn ich via ki vorschlag und kickoff datei
mein backlog oder meine arbeitspakete oder phasen erstellen will — geht es bei stakeholder
nicht weiter".

Der Befund ist **kein** Anwendungsfehler in der Orchestrierung, sondern eine fehlende
Zeitgrenze eine Ebene tiefer.

## Gemessener Befund (Prod, 2026-08-27)

`ki_runs` des Mandanten `IT-Couch GmbH`, Zeitfenster 19:50–19:58 UTC:

| Uhrzeit | Zweck | Provider | Dauer | Vorschläge |
|---|---|---|---|---|
| 19:50:33 | `proposal_from_context` (Backlog) | openai/gpt-4o | 8.522 ms | ✅ |
| 19:51:13 | `proposal_from_context` | openai/gpt-4o | 8.452 ms | ✅ |
| 19:51:58 | `proposal_from_context` | openai/gpt-4o | 8.166 ms | ✅ |
| **19:52:11** | **`proposal_stakeholders_from_context`** | **ollama/gemma4:latest** | **null** | **0** |
| 19:52:56 | `proposal_from_context` | openai/gpt-4o | 6.680 ms | ✅ |
| **19:53:07** | **`proposal_stakeholders_from_context`** | **ollama/gemma4:latest** | **null** | **0** |
| 19:57:10 | `proposal_risks_from_context` | openai/gpt-4o | 8.876 ms | ✅ |
| 19:58:06 | `proposal_risks_from_context` | openai/gpt-4o | 7.455 ms | ✅ |

Die zwei Stakeholder-Zeilen tragen `latency_ms = null`, `input_tokens = null`,
`output_tokens = null` und **0** erzeugte Vorschläge — sie sind nie fertig geworden.

### Ursachenkette

1. **Stakeholder ist Class-3-gepinnt.** `classifyStakeholderProposalsAutoContext`
   (`classify.ts:394`) gibt unbedingt `3` zurück (PROJ-88 Lock L1, Invariante #3). Cloud ist
   damit strukturell ausgeschlossen; es bleibt ausschließlich ein tenant-eigenes Ollama.
2. **Das Ollama antwortet nicht mehr in vertretbarer Zeit.** Zuletzt validiert am
   **2026-06-25**; die letzten *erfolgreichen* Läufe brauchten **175.951 ms** und
   **253.057 ms**. Nebenbefund: `gemma4:latest` — Ollama führt gemma, gemma2 und gemma3,
   aber kein gemma4.
3. **Es gab nirgends eine Zeitgrenze.** Die fünf Provider-Clients wurden ohne eigenes
   `fetch` erzeugt, und `maxDuration` war in **0 von allen** API-Routen gesetzt. Nichts
   scheiterte schnell, nichts meldete zurück.
4. **Der Orchestrator läuft sequenziell** (`orchestration-tab.tsx`, `for … await`). Backlog
   ✅ → Stakeholder hängt → **Risiken startet nie**, obwohl es nachweislich in 8 Sekunden
   durchgelaufen wäre. Die Modul-Isolation aus PROJ-90 (AC-90.7) greift bei *Fehlern*, nicht
   bei *Stille*.
5. **Das Laufprotokoll log.** `insertKiRun` (`router.ts:348`) trug den Lauf optimistisch als
   `status = 'success'` ein — erzwungen, weil `ki_runs_status_check` kein „läuft noch"
   kannte. Ein abgeschnittener Lauf las sich damit als Erfolg.

## Nutzer-Entscheide

- **L1 — Budget großzügig statt knapp.** 240 s für lokale Modelle, damit die gemessenen
  176-/253-s-Läufe überleben. Ausdrücklich **mit** sichtbarer Fortschrittsanzeige, weil ein
  langes Warten ohne Rückmeldung von einem Defekt nicht zu unterscheiden ist.
- **L2 — Invariante #3 bleibt unangetastet.** Stakeholder-Daten gehen nicht in die Cloud,
  auch nicht „nur wenn Ollama nicht antwortet".

## Akzeptanzkriterien

- **AC-152.1** Jeder Provider-Aufruf hat ein endliches Zeitbudget. Ein Endpunkt, der die
  Verbindung annimmt und nie antwortet, führt zu einem benannten Fehler statt zu Stille.
- **AC-152.2** Das Budget hängt an **einer** Stelle je Provider (dem `fetch` des Clients),
  nicht an den 45 einzelnen `generateObject`/`generateText`-Aufrufstellen — sonst vergisst
  es die 46.
- **AC-152.3** Lokale Modelle bekommen mehr Zeit als Cloud-Anbieter (gemessen: 176–253 s
  gegen 6–9 s) und bleiben unter der Vercel-Pro-Funktionsgrenze von 300 s.
- **AC-152.4** Ein Abbruch, der vom Aufrufer kommt, wird **nicht** als Timeout gemeldet.
- **AC-152.5** Die AI-Routen setzen `maxDuration`, sonst stirbt die Funktion vor dem
  Provider-Budget und der Nutzer sieht nie einen Grund.
- **AC-152.6** `ki_runs` startet auf `running` und wird erst durch die Finalisierung
  abgeschlossen. Eine auf `running` stehengebliebene Zeile ist das sichtbare Signal für
  „unterwegs abgeschnitten".
- **AC-152.7** Der Timeout-Grund erscheint **in der Fläche**, nicht nur im
  `title`-Tooltip — auf Touch-Geräten ist ein Tooltip gar nicht erreichbar.
- **AC-152.8** Die laufende Modulzeile zeigt die vergangene Zeit und nennt ab 20 s, warum
  dieses Modul langsam sein *darf*.
- **AC-152.9** Kein Regress: die drei bestehenden Statuswerte bleiben gültig, ein erfundener
  Status wird weiterhin abgelehnt, und die Nutzungszählung bleibt korrekt.

## Umsetzung

| Bereich | Datei | Inhalt |
|---|---|---|
| Zeitbudget | `src/lib/ai/provider-timeout.ts` (neu) | Budgets, `ProviderTimeoutError`, `createTimeoutFetch`, `describeProviderFallback` |
| Verdrahtung | 5 Provider-Clients | `fetch: createTimeoutFetch(...)` an der Konstruktionsstelle |
| Meldung | `router.ts` | 7 Aufrufstellen auf den gemeinsamen Formatierer umgestellt |
| Protokoll | `router.ts` + Migration `20260827140000` | `status: "running"` beim Start, CHECK um `running` erweitert |
| Funktionsgrenze | 12 AI-Routen | `export const maxDuration = 300` |
| Fläche | `orchestration-tab.tsx` | `RunningText` mit Uhr + Grund; blockiert/Fehler nennen den Grund sichtbar |

### Entwurfsentscheidungen

**Warum am `fetch` und nicht an den Aufrufen (AC-152.2).** `generateObject` nimmt ein
`abortSignal`, aber es gibt **45** solche Aufrufstellen über fünf Provider und zwei Runner.
Ein Budget je Aufrufstelle wäre 45× dieselbe Zeile — und die 46. würde es vergessen. Das
ist wörtlich die Lücke, an der PROJ-85 den stillen Stub-Rückfall hatte. Das `fetch` des
Clients ist der eine Ort, durch den jeder Aufruf läuft, auch jeder künftige.

**Warum ein eigener `AbortController` statt `AbortSignal.timeout()`.** Zwei gemessene
Gründe: dessen Timer läuft nach einer erfolgreichen Antwort weiter (bei 240 s ein Handle,
das die Anfrage überlebt), und er hängt an einem Node-internen Zeitgeber, den die
Testzeitsteuerung nicht stellen kann — der erste Testlauf brauchte deshalb 11 s und lief in
Vitests eigenen Timeout. Mit explizitem Controller: 565 ms und im `finally` aufgeräumt.

**Warum die historischen Zeilen stehenbleiben.** Die zwei Phantom-`success`-Zeilen vom
2026-08-27 werden **nicht** umgeschrieben. Sie sind Kundendaten, und eine nachträgliche
Korrektur des eigenen Laufprotokolls wäre schlechter als ein dokumentiertes Artefakt.

## Nachweise

**Live gegen Prod** (zurückgerollt, 0 Rückstände), Migration `20260827140000` angewendet:

- `V1_running_insert=PASS` — `running` ist einfügbar (vorher `23514`)
- `V2_running_to_success=PASS` — die Finalisierung funktioniert
- `V3_bogus_rejected=PASS` — **Gegenprobe**: ein erfundener Status wird weiterhin
  abgelehnt. Ohne diesen Vektor wäre V1 auch bei komplett gelöschtem CHECK grün.
- `V4_running_excluded_from_usage=PASS` — eine laufende Zeile fällt aus
  `tenant_ai_monthly_usage` heraus (sie hat nachweislich keine Token verbraucht)

**Rot-Grün, viermal ausgeführt** (jeweils über Dateikopie zurückgesetzt, nie `git checkout`
— PROJ-130-δ2/F-3):

| Sabotage | Wirkung |
|---|---|
| Zeitbudget entfernt (= Zustand **vor** dieser Slice) | **2** Timeout-Fälle rot |
| Timeout zurück in die generische Hülle | **1** Fall rot |
| Zeitanzeige zurück auf statisches „generiert …" | **3** Fälle rot |
| Hinweis sofort statt ab 20 s | genau **1** Fall rot |

**Gates:** vitest **3899/3899** (451 Dateien; Basis 3885 in 449 Dateien + 14 neue in 2 Dateien) · ESLint **0** · tsc **13 = Baseline /
0 neu** (gegen einen frischen `origin/main`-Worktree gegengemessen: 13 = 13) · Build clean ·
migration-naming 0 Fehler · index-scope 0 Fehler · token-drift 0 Fehler.

## Eigene Fehler, festgehalten statt weggelassen

- **F-152.1** Die erste Testfassung nutzte `/…/s` — das `s`-Flag verlangt ein höheres
  tsc-Target als dieses Projekt setzt, und der Zähler ging auf **14 statt 13**. Gefunden
  nur, weil gegen einen frischen Baseline-Worktree diffed wurde statt die Zahl zu glauben.
- **F-152.2** `new RegExp("… (Datenschutz)")` — die Klammern sind eine **Capture-Gruppe**,
  das Muster passte nicht auf den echten Text. Der positive Fall fiel auf; die beiden
  **negativen** Zusagen waren dadurch aus dem falschen Grund grün. Escaping nachgezogen.
- **F-152.3** Gearbeitet wurde zunächst im **primären Checkout auf einem fremden Branch**
  (`proj-y-151b/...`) — Verstoß gegen die Worktree-Regel. Änderungen in einen eigenen
  Worktree umgezogen, der Checkout unverändert zurückgegeben (die fremde untrackte Datei
  `tests/zz-probe.spec.ts` nicht angefasst).

## Abweichungen

- **D-152.1** Kein Ende-zu-Ende-Nachweis gegen das **echte** Ollama des Kunden. Der
  Endpunkt liegt verschlüsselt in `tenant_ai_providers.encrypted_config`, der
  Entschlüsselungsschlüssel nicht lokal vor, und es ist fremde Infrastruktur. Bewiesen ist
  das Verhalten gegen eine schweigende Zusage, nicht gegen diesen Endpunkt.
- **D-152.2** Kein authentifizierter Browser-Durchlauf der Fortschrittsanzeige. Belegt sind
  Komponente (5 Fälle inkl. zweier Gegenproben) und Zustandsmodell, nicht die Verkettung im
  Browser.
- **D-152.3** Das Budget gilt für **alle** Provider, nicht nur Ollama. Ein unbegrenztes
  `fetch` ist dieselbe Defektklasse, auch wo sie bisher nicht aufgefallen ist.
- **D-152.4** Kein CIA-Pass: keine neue Abhängigkeit, keine Architekturentscheidung, kein
  Eingriff in eine geteilte Rechteregel — ein Fehlerbehebungs-Slice nach `.claude/rules`.

## Offen / Folgearbeit

- **Ihre Ollama-Konfiguration** ist damit **nicht** repariert. Der Fix sorgt dafür, dass die
  Fläche den Grund nennt und weiterläuft; ob der Endpunkt erreichbar ist und `gemma4:latest`
  dort existiert, ist eine Konfigurationsfrage außerhalb dieser Slice.
- **PROJ-Y-152a** — Arbeitspakete aus dem Vorhaben + Projekt-Skills **ohne** Kickoff-Datei
  (der zweite Teil der Nutzer-Meldung). Eigener AI-Zweck, siehe Registereintrag.
