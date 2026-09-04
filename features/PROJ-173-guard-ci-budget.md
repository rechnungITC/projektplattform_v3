# PROJ-173 — Das Zeitbudget der Datei-Wächter

## Status: In Progress
## Deployment Scope: —

Fünf Required Checks können **rot melden, ohne dass am Code etwas falsch ist** —
und tun es inzwischen reproduzierbar.

## Der Befund

Die fünf Datei-Analyse-Wächter (`index-scope`, `function-inventory`,
`register-consistency`, `token-drift`, `migration-naming`) sind **identisch**
aufgebaut: `actions/setup-node` mit `cache: "npm"`, dann `run: npm ci`, dann der
eigentliche Wächter — und alle tragen `timeout-minutes: 5`.

Auf PR #549 wurden zwei davon im Schritt **`Install dependencies`** abgebrochen:

| Wächter | Dauer | Ausgang |
|---|---|---|
| `token-drift` | 4m24s | pass |
| `index-scope` | 5m11s | **cancelled** |
| `function-inventory` | 5m16s | **cancelled** |

Auf PR #548 traf es **vier** der fünf, auf PR #545 zwei. Es ist also kein
Einzelfall, sondern über drei PRs reproduzierbar.

**Warum das mehr ist als Kosmetik:** GitHub meldet ein `cancelled` als **`fail`**.
Am Ruleset nachgelesen (nicht angenommen) sind **sieben** Kontexte enrolled, und
von den fünf Wächtern sind **drei** darunter: `index-scope`, `migration-naming`,
`register-consistency`. Für diese drei **sperrt ein abgebrochener Lauf den
Merge** — bei einer PR, an der nichts falsch ist. `token-drift` und
`function-inventory` laufen auf jeder PR, sind aber **nicht enrolled**
(Repo-Eigner-Handoff, siehe PROJ-Y-51d und PROJ-Y-148e); ihr Abbruch sperrt
nicht, er zeigt nur rot.

Das mindert die Dringlichkeit, **nicht** den Befund. Ein grundlos roter Required
Check sperrt; ein grundlos roter nicht-enrollter erzieht dazu, rote Wächter zu
übersehen — die andere Richtung desselben Schadens. Wer das oft genug sieht, gewöhnt sich an rote Wächter,
und genau damit verlieren sie ihren Wert (PROJ-147 hat vorgeführt, wie ein
dekorativer Wächter aussieht; ein sprunghaft roter ist die andere Richtung
desselben Schadens).

**Kein Konfigurationsunterschied erklärt es**, das ist gemessen: alle fünf tragen
denselben Cache, denselben Installationsbefehl und dasselbe Limit. Welcher
Wächter kippt, ist damit Zufall — `token-drift` kam mit **24 Sekunden Reserve**
durch.

## Die konkurrierende Erklärung, die zuerst zu widerlegen ist

Am selben Tag scheiterte auf PR #544 der Job `npm audit production dependencies`
mit

```
npm warn audit 503 Service Unavailable - POST .../security/advisories/bulk
npm error audit endpoint returned an error
```

und brauchte dafür **fünf Minuten** (08:50:20 → 08:55:21). Damit steht eine
zweite, sparsamere Erklärung im Raum: **npms Registry war heute gestört**, und
eine gestörte Registry erklärt beide Symptome auf einmal — langsame
Installationen, die gegen die Fünf-Minuten-Wand laufen, **und** einen Netzausfall,
der sich als Sicherheitsfehlschlag liest.

Die Slice darf deshalb **nicht** mit „das Limit ist zu knapp" beginnen. Erst ist
zu messen, ob die Installationsdauer über die letzten Wochen **gewachsen** ist
oder ob sie **heute** ausreisst. Beide Befunde führen zu verschiedenen Antworten:
ein gewachsener Baum verlangt mehr Budget oder eine schnellere Installation, ein
gestörtes Gegenüber verlangt Robustheit gegen genau diesen Ausfall.

**Zweiter, unabhängiger Befund derselben Beobachtung:** `npm audit` unterscheidet
**nicht** zwischen „Advisory gefunden" und „Endpunkt nicht erreichbar" — beides
ist exit 1. Ein Required Check, der bei einer Netzstörung „Sicherheitsproblem"
meldet, erzieht dazu, rote Sicherheits-Gates wegzuklicken. Ob das in diese Slice
gehört oder eine eigene ist, entscheidet die Messung.

## Was diese Slice NICHT ist

Kein Aufweichen der Wächter. Die Prüfungen selbst sind schnell (Datei-Analyse,
kein DB-Zugang, keine Secrets); teuer ist ausschliesslich das Herstellen ihrer
Laufumgebung. Ein `continue-on-error` wäre die falsche Antwort — es baut genau
den dekorativen Check, den PROJ-147 abgeschafft hat.

## Die Messung — und sie widerlegt die naheliegende Erklärung

75 Jobs über die fünf Wächter, dazu 60 Läufe `index-scope` für die Historie.

| Tag | Jobs | abgebrochen | `npm ci` Median / Max |
|---|---|---|---|
| 2026-09-01 | 12 | 0 | 23 s / 27 s |
| 2026-09-02 | 20 | 1 | 23 s / 25 s |
| 2026-09-03 | 20 | 0 | 21,5 s / 28 s |
| **2026-09-04** | 8 | 1 | **160 s / 244 s** |

Über alle fünf: bis 09-03 **44 Jobs, 0 Abbrüche**, Install-Median 21,5 s — das ist
**Faktor 13 unter der Wand**. Ab 09-04: 31 Jobs, **9 Abbrüche**, alle im Schritt
`Install dependencies`, Job-Dauern 309–316 s.

**Das Budget war nie knapp.** Die Installationszeit ist nicht gewachsen, sie lag
drei Tage flach und ist an einem Tag um das Zehnfache gesprungen. „Das Limit ist
zu knapp" wäre die falsche Antwort auf ein akutes Ereignis gewesen.

**Die Ursache ist belegt, nicht indiziert.** Die Annotation der abgebrochenen
Läufe lautet wörtlich `The job has exceeded the maximum execution time of 5m0s`.
**Concurrency ist zweifach ausgeschlossen:** `proj-171/requirements` hat über die
gesamte Historie **genau einen** `index-scope`-Lauf — es gab keinen Nachfolger,
der ihn hätte abbrechen können —, und auf `proj-y-5a` liegt der nächste Lauf
**17,6 Minuten** nach dem abgebrochenen, also lange nach dessen Fünf-Minuten-Tod.
**Runner-Ausfall ist ausgeschlossen**, weil die Läufe fachlich durchliefen: einer
druckte `added 1032 packages in 5m` und wurde an der Ziellinie gekillt.

## Wo die Zeit wirklich liegt

Der npm-Cache ist **nicht** der Kostenträger — in **allen** geprüften Läufen,
schnellen wie langsamen, steht derselbe Treffer (`Cache restored successfully`,
~314 MB), kein einziger Fehltreffer. Entscheidend ist die Zeitachse **innerhalb**
des Schritts:

| | Start | → Baum steht | → „added … in Xs" |
|---|---|---|---|
| schnell (09-03) | +0 s | +14,4 s | +9,6 s = **24 s** |
| langsam (09-04) | +0 s | **+11,5 s** | **+230,8 s** = **4 min** |

Am langsamen Tag steht der Baum sogar **schneller**. Die kompletten 230 s liegen
**hinter** dem fertigen Baum — im **Audit-Netzwerkaufruf**, den `npm ci`
standardmässig mitmacht.

Und den brauchen die Wächter nicht: alle fünf importieren ausschliesslich
`node:fs`, `node:path` und ihr eigenes `./analyze` — **null npm-Pakete**. Aus
`node_modules` gebraucht wird nur **`tsx`** als Läufer. Gemessen läuft jeder
Wächter in **0,15–0,22 s** durch. Der Wächter rechnet ein Fünftel einer Sekunde,
seine Installation 15 bis 300.

## Die Hebel, gemessen

| Variante | Wall | Wächter lauffähig? |
|---|---|---|
| `npm ci` | **302,06 s** | ja |
| `npm ci --no-audit` | **16,06 s** | ja |
| `npm ci --ignore-scripts --no-audit --no-fund` | 18,19 s | ja, alle fünf exit 0 |
| `npm ci --omit=dev --no-audit` | 14,35 s | **nein — `tsx` fehlt** |
| `npm audit` allein auf warmem Baum | 166,16 s | — |

## Entscheidung: `--no-audit --no-fund`, kein neues Zeitlimit

`--no-audit` **allein** holt 302 s auf 16 s — **95 % der Laufzeit**. Tragender
Grund: die Wächter bewerten keine Advisories. Das echte Sicherheits-Gate ist ein
eigener, eingetragener Workflow (`npm run audit:prod` mit `--audit-level=high`
plus die zweite Meinung des OSV-Scanners). Das Audit **im Installationsschritt**
ist dort reine Beifang-Ausgabe, die nichts sperrt. Ein Wächter, der 0,2 Sekunden
rechnet, soll nicht an einem Netzaufruf sterben, der ihn nichts angeht.

**Bewusst auf alle acht Installationsschritte angewendet, nicht nur auf die
fünf.** Eine Regel halb umzusetzen hinterlässt die Inkonsistenz für den
Nächsten. `schema-drift` wurde am 09-04 ebenso getroffen (Install 305 s und
306 s) und überlebte nur wegen seines doppelten Budgets; die beiden
Supply-Chain-Jobs auditieren im **ausdrücklichen** Schritt, ihr Installations-
Audit ist doppelte Arbeit.

**Kein Zeitlimit angehoben.** Nach dem Eingriff ist der schlechteste beobachtete
Baumaufbau ~15 s — das sind **20-fache Reserve** in fünf Minuten. Eine Anhebung
wäre Symptombehandlung an der falschen Stelle.

**Ausdrücklich nicht gewählt**, jeweils gemessen: `--omit=dev` (danach fehlt
`tsx`, die Wächter sind tot), `--ignore-scripts` (Beitrag ~2 s, und npm hält die
drei Postinstall-Skripte in CI ohnehin zurück), ein `node_modules`-Cache (spart
die 12–15 s Baumaufbau, **nicht** die 230 s Audit; kein Hausvorbild — `grep` über
`.github/workflows/` findet **null** Treffer auf `actions/cache` mit
`node_modules`; und er brächte 314 MB Wiederherstellung mit).

**Preis, benannt:** die Verwundbarkeits-Zeilen verschwinden aus den Logs dieser
acht Schritte. Substanziell kostet das nichts, weil dieselbe Prüfung im
Supply-Chain-Workflow **schärfer** läuft. Wer sie dort abschaltete, verlöre
etwas; hier nicht.

## Was diese Slice offen lässt

Der Job `npm audit production dependencies` **kann** `--no-audit` nicht bekommen —
Auditieren ist sein Zweck. Er lief am 09-04 in sein Zehn-Minuten-Limit (Abbruch
bei **614 s**), und getrennt davon scheiterte er auf #544 mit
`503 Service Unavailable` vom Advisory-Endpunkt. Damit stehen dort **zwei**
Fragen, die diese Slice nicht beantwortet und auch nicht nebenbei beantworten
soll: das Budget dieses einen Jobs, und dass `npm audit` **nicht** zwischen
„Advisory gefunden" und „Endpunkt nicht erreichbar" unterscheidet — beides ist
exit 1, ein Netzausfall meldet sich also als Sicherheitsfehlschlag. Registriert
als **PROJ-Y-173a**.

## Akzeptanzkriterien

- **AC-173.1** Die Ursache ist **belegt**, nicht plausibel gemacht: entweder das
  Zeitlimit oder ein anderer Abbruchgrund, mit Zahlen aus den Läufen.
- **AC-173.2** Die Verteilung der Installationsdauer über mehrere Läufe je
  Wächter ist gemessen (Median, Maximum, Zahl der Abbrüche).
- **AC-173.3** Der gewählte Hebel ist mit **gemessener** Ersparnis begründet und
  sein Preis benannt.
- **AC-173.4** Ein neu gewähltes Zeitlimit ist aus dem gemessenen Maximum plus
  benannter Reserve **hergeleitet**, nicht gegriffen.
- **AC-173.5** Die Wächter prüfen danach unverändert dasselbe: kein
  `continue-on-error`, keine gelockerte Regel, keine übersprungene Prüfung.
  Belegt an einem Lauf, der eine echte Verletzung weiterhin **rot** meldet.
- **AC-173.6** Die Wirkung ist in der Umgebung belegt, in der sie zählt — alle
  fünf Wächter auf der eigenen PR grün, ohne Neustart.
- **AC-173.7** Kein `src/`-Diff, keine Migration, kein neues Laufzeit-Paket.
- **AC-173.8** Die konkurrierende Erklärung (gestörte npm-Registry statt zu
  knappem Budget) ist mit Zahlen **entschieden**, nicht offen gelassen — und
  falls sie zutrifft, ist gesagt, was das für die Antwort bedeutet.
