# PROJ-Y-173a — `npm audit` unterscheidet Ausfall nicht von Befund

## Status: In Progress
## Deployment Scope: —

Aus PROJ-173 ausdrücklich **nicht** mitgenommen und dort als Nachbarfrage
registriert. Am selben Tag ist sie eingetreten und hat zwei PRs gesperrt.

## Der Befund

`npm audit` liefert **denselben Exit-Code 1** für zwei völlig verschiedene Lagen:

1. „Ich habe ein Advisory ab HIGH gefunden" — ein Sicherheitsbefund.
2. „Ich konnte npms Advisory-Endpunkt nicht erreichen" — eine fremde Störung.

Live gemessen am 2026-09-04 (Job 33858605152, PR #552):

```
npm warn audit network timeout at: .../-/npm/v1/security/advisories/bulk
npm error audit endpoint returned an error
##[error]Process completed with exit code 1.
```

und zuvor auf PR #544 in der 503-Form. **Die Registry selbst war dabei gesund** —
direkt gemessen, während die Jobs scheiterten:

| Endpunkt | Antwort |
|---|---|
| `registry.npmjs.org/fflate` | **HTTP 200 in 0,07 s** |
| `.../-/npm/v1/security/advisories/bulk` | **keine Antwort, Abbruch nach 30 s** |

Gestört ist also genau **ein** Dienst. Der Required Check
`npm audit production dependencies` meldete deshalb „Sicherheitsproblem", wo keines
vorlag, und sperrte #544 und #552.

**Warum das mehr ist als Unbequemlichkeit:** ein Sicherheits-Gate, das bei einer
fremden Störung rot wird, erzieht dazu, rote Sicherheits-Gates wegzuklicken. Das
ist derselbe Schaden wie beim dekorativen Check, den PROJ-147 abgeschafft hat — nur
aus der anderen Richtung.

## Die Entscheidung (Nutzer-Lock)

**Ausweichen auf die zweite Meinung, mit dem Rückgrat der ehrlichen Variante.**
Nicht: aussitzen. Nicht: blind durchwinken.

1. **Das Urteil kommt aus dem Bericht, nie aus dem Exit-Code.** Dieselbe Regel wie
   in `scripts/osv-gate` — und hier ist sie zwingend, weil der Exit-Code die zwei
   Lagen per Konstruktion nicht trennt.
2. **Wiederholungen** (3 Versuche, je 60 s Zeitlimit, 5 s und 15 s Rücklauf), damit
   ein kurzes Zucken nicht sofort zum Ausweichfall wird.
3. **Ein eigener Exit-Code 2** für „Endpunkt unerreichbar". Das ist ausdrücklich
   **kein** Freispruch, sondern eine unbeantwortete Frage.
4. **Deckung aus der zweiten Quelle**: bei Exit 2 fährt derselbe Job den gepinnten
   OSV-Scanner. Fällt auch der aus, **fällt der Job**. Kein `continue-on-error`
   an keiner Stelle.
5. **Fail-closed bei Unklarheit:** was der Klassifizierer nicht einordnen kann,
   ist ein Fehlschlag. Eine unlesbare Antwort ist kein sauberes Zeugnis.

## Der benannte Restrisiko-Preis

OSV und npm sind **verschiedene Datenbanken**. Ein Advisory, das nur npm kennt,
liefe für die Dauer der Störung ungesehen durch. Das ist ein kleineres Loch als
die beiden Alternativen — jede PR an einer fremden Störung zu sperren, oder den
Check blind durchzuwinken — und es ist auf die Dauer des Ausfalls begrenzt. Der
Ausweichfall wird zudem **laut** protokolliert (`::warning::` mit der Aussage,
dass gegen npms Datenbank **nicht** geprüft wurde), damit niemand ihn für einen
vollständigen Lauf hält.

## Was dadurch nebenbei entfällt

PROJ-173 hat als zweite offene Frage das **Zehn-Minuten-Budget** dieses Jobs
benannt (Abbruch bei 614 s am 09-04). Es braucht keine Anhebung: mit einem
Zeitlimit von 60 s je Versuch kann der Audit-Schritt nicht mehr fünf Minuten an
einem Aufruf hängen — schlimmstenfalls rund 3,5 Minuten für drei Versuche plus
etwa eine Minute Ausweichlauf. Das Budget wird also durch **Konstruktion**
eingehalten statt durch eine höhere Zahl.

## Was in CI belegt ist — und was nicht

Der erste Lauf des neuen Gates in CI (PR #553, Job 101012094095) nahm den
**sauberen Pfad**: `npm-audit-gate: OK — production tree audited, nothing at HIGH
or above (none)` in **2,4 Sekunden**, der Ausweichschritt wurde übersprungen.

Das belegt den Normalfall in der Umgebung, in der es zählt, und es lässt eine
Lücke offen, die hier ausgesprochen statt gerundet wird: **der Ausweichpfad ist in
CI nicht ausgeübt worden.** Belegt sind seine zwei Hälften einzeln — der
**Auslöser** lokal gegen eine tatsächlich unerreichbare Registry (drei Versuche,
Rücklauf, `exit 2`), und der **Rumpf** ist der byte-gleiche, gepinnte OSV-Block,
den der Geschwister-Job auf jeder PR grün fährt. Die **Verkettung** der beiden in
CI ist es nicht. Sie zu erzwingen hätte eine Teständerung im Workflow verlangt,
also genau die Art Eingriff, die man an einem Sicherheits-Gate nicht als Beifang
mitnimmt.

**Eine Beobachtung, die zur Vorsicht mahnt:** derselbe Endpunkt antwortete dem
GitHub-Runner um 11:47 in Millisekunden, während er meinem Rechner um 11:36 und
11:41 gar nicht antwortete — und umgekehrt lief er meinem Rechner um 11:33 sauber
durch, während CI ihn um 09:30 und 11:3x nicht erreichte. Ob das zeitliches
Flattern ist oder vom Netzweg abhängt, ist aus diesen Daten **nicht** zu trennen;
sicher ist nur, dass beide Seiten ihn zeitweise nicht erreichen. Genau deshalb ist
die Antwort Widerstandsfähigkeit und nicht „warten, bis es wieder geht".

## Akzeptanzkriterien

- **AC-Y173a.1** Das Urteil wird aus dem Bericht abgeleitet, nicht aus dem
  Exit-Code — belegt durch Tests in **beide** Richtungen (sauberer Bericht mit
  Exit 1 bleibt sauber; Befund mit Exit 0 bleibt Befund).
- **AC-Y173a.2** Die gemessenen Ausfall-Signaturen (Netz-Zeitüberschreitung und
  503) werden als Ausfall erkannt, **wörtlich** aus den echten CI-Läufen gepinnt.
- **AC-Y173a.3** Ein **brauchbarer Bericht schlägt eine Warnsignatur** — sonst
  würde ein echtes HIGH-Advisory als Störung gelesen und vom Ausweichweg
  durchgewunken. Eigener Test.
- **AC-Y173a.4** Unklassifizierbares **scheitert** (fail-closed), nicht „sauber".
- **AC-Y173a.5** Bei unerreichbarem Endpunkt läuft die Deckung über den zweiten
  Anbieter; fällt auch der aus, **fällt der Job**. Kein `continue-on-error`.
- **AC-Y173a.6** Der Ausweichfall ist im Lauf **laut** erkennbar und sagt, dass
  gegen npms Datenbank nicht geprüft wurde.
- **AC-Y173a.7** Rot-Grün am Klassifizierer mit **je eigener** Trefferzahl je
  Sabotage — eine Sabotage, die alle Tests rot macht, belegt nichts.
- **AC-Y173a.8** Ende-zu-Ende gegen den **echten** Ausfall gefahren, nicht gegen
  eine Nachstellung.
- **AC-Y173a.9** Kein `src/`-Diff, keine Migration, kein neues Laufzeit-Paket.
- **AC-Y173a.10** Der Normalfall ist **in CI** belegt. Der Ausweichpfad ist es
  **nicht** — seine zwei Hälften sind einzeln belegt, ihre Verkettung in CI
  bleibt offen und ist als Grenze benannt statt als erfüllt gebucht.
