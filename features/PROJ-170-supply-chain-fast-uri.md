# PROJ-170 — Supply-Chain-Remediation `fast-uri` (+ `@xmldom/xmldom`, `qs`)

## Status: Approved
## Deployment Scope: —

Beide Advisory-Gates auf `main` rot, und aufgefallen ist es an einer **fremden,
fertigen PR ohne `package.json`-Diff** (#537, die β.2-QA) — dasselbe Muster, das
CLAUDE.md als „`npm audit` breaks unrelated PRs" führt und das PROJ-140 · 142 ·
146 · 149 · 160 schon fünfmal gekostet hat. Weil das `main`-Ruleset `strict: true`
setzt, sperrt es **jede** offene PR, nicht nur die eigene.

## Der Befund: eine Wurzel, von beiden Quellen bestätigt

`fast-uri@3.1.5` trägt **vier** Advisories, im OSV-Scanner je **CVSS 7.5**:

| Advisory | Inhalt |
|---|---|
| GHSA-5jgf-p345-68v8 | Host-Verwechslung durch übersprungene IDN-Kanonisierung bei schema-relativen Referenzen |
| GHSA-f65p-4m7j-42xc | SSRF durch fehlerhafte IPv6-Normalisierung |
| GHSA-fph4-wmhf-6fwf | SSRF durch wiederholte Prozent-Dekodierung des Hostnamens |
| GHSA-jqff-g426-hqxp | Host-Verwechslung durch prozent-kodierte Schema-Normalisierung |

`npm audit` bewertet dasselbe Paket als **high**. Damit ist `fast-uri` die
**gemeinsame** Ursache beider roten Gates — und genau daran zeigt sich der Wert
der zweiten Meinung aus PROJ-147: die beiden Quellen weichen bei den *übrigen*
Funden in **beide** Richtungen voneinander ab (`@xmldom/xmldom` ist für npm
`moderate`, für OSV 6.3; `qs` für npm `moderate`, für OSV 2× 6.3), und nur weil
beide Gates laufen, ist die Schnittmenge belastbar.

**Warum das Paket überhaupt im Produktionsbaum liegt** (gemessen, nicht vermutet):

```
@modelcontextprotocol/sdk → ajv@8.20.0 → fast-uri
@sentry/nextjs → @sentry/webpack-plugin → webpack → schema-utils → ajv → fast-uri
```

Beide Elternpakete sind **Produktions**-Abhängigkeiten, deshalb erscheint ein
Bauzeit-URI-Parser in `--omit=dev`.

## Der Fix ist ein In-Range-Bump, kein Zwang

`ajv@8.20.0` verlangt `fast-uri: ^3.0.1`. Erste gepatchte Version der 3er-Linie
ist **3.1.6**, aktueller Kopf **3.1.7** — beide **innerhalb** der Elternspanne.
Der bestehende Override aus PROJ-Y-96e wird von `^3.1.5` auf `^3.1.7` gehoben,
und damit ist es der **einzige** `package.json`-Diff dieser Slice.

**Bewusst nicht** auf `fast-uri@4.x` gegangen: es existiert (4.1.4) und schließt
die Advisories ebenfalls, liegt aber **außerhalb** von ajvs `^3.0.1` — es
durchzudrücken wäre ein erzwungener Major quer durch eine fremde Spanne, also
genau die Klasse Eingriff, die PROJ-146 in der spiegelbildlichen Lage vermeiden
musste. Ein Major ist hier nicht nötig; ein Patch genügt.

**`npm audit fix --force` wurde nicht benutzt** und war nicht nötig. Die
Hausregel dagegen ist mit Schaden bezahlt: es hat schon versucht, Next.js
(PROJ-140) und `pdfjs-dist` (PROJ-142) in **ältere, verwundbarere** Majors
zurückzudrehen und `mailparser` unter die CVE-2026-3455-Grenze (PROJ-149).

## Zwei Mitnahmen, beide ohne Override

Weil sie in ihren Elternspannen liegen, brauchen sie **keinen** Eintrag in
`package.json` — ein Lockfile-Nachzug genügt:

- **`@xmldom/xmldom` 0.8.13 → 0.8.15** (GHSA-6gmq-8vp8-gcm6, XML-Fragment-Injektion;
  erste gepatchte 0.8.x ist **0.8.15**). Kommt aus `mammoth` (`^0.8.6`), also aus
  dem DOCX-Parser der Kickoff-Ingestion (PROJ-70-γ).
- **`qs` 6.15.2 → 6.16.0** (GHSA-x5fp-wj9c-mxmx Array-Limit-Umgehung,
  GHSA-4mjr-xmp4-gh2g DoS über angreifer-kontrolliertes `isBuffer`). Kommt über
  `express` aus dem MCP-SDK.

  **Eine eigene Behauptung dabei korrigiert, bevor sie stehenblieb:** der erste
  Entwurf dieser Spec nannte das den „Anfrage-Auswertungspfad der MCP-Bridge" und
  damit von außen erreichbar. Nachgemessen ist es das **nicht** — `src/` importiert
  `express` an **null** Stellen, und `src/app/api/mcp/route.ts` lädt aus dem SDK nur
  `types.js` und fährt PROJ-48s eigenen `OneShotTransport`. `express` und mit ihm
  `qs` sind eine Abhängigkeit des SDK, die unser Code **nie lädt** — dieselbe
  Kategorie wie der `@hono/node-server`-Risk-Accept aus PROJ-140. Der Bump bleibt
  richtig (eine Lockfile-Zeile, In-Range, schließt zwei Advisories), aber die
  Begründung ist **Hygiene**, nicht Erreichbarkeit.

  Der Unterschied zur bewussten Auslassung in PROJ-160 bleibt trotzdem bestehen:
  dort war für den Restfund **kein** In-Range-Weg gemessen, hier ist er es.

## Was bleibt, benannt statt weggelassen

`postcss-selector-parser@6.1.2` (CVSS 4.3) liegt **vor und nach** dieser Slice im
Baum und ist bereits in PROJ-160 benannt. Unter der Hausschwelle, kein
In-Range-Fix in Sicht, keine Regression.

## Akzeptanzkriterien

- **AC-170.1** `npm audit --omit=dev --audit-level=high` endet mit Exit 0.
- **AC-170.2** Der OSV-Scanner in der **in CI gepinnten** Fassung (v2.5.0,
  Prüfsummen-verifiziert) meldet **0** Funde bei CVSS ≥ 7.0; Restfunde unter der
  Schwelle sind namentlich benannt.
- **AC-170.3** Der `package.json`-Diff besteht aus **genau einer** Zeile
  (`fast-uri`-Override); `@xmldom/xmldom` und `qs` erscheinen **nicht** als direkte
  Abhängigkeiten.
- **AC-170.4** Die Paketzahl im Lockfile ist unverändert (keine stillen Zugänge).
- **AC-170.5** Die geänderten Pakete sind **funktional** nachgewiesen, nicht per
  Build-Beweis: echtes, un-gemocktes DOCX-Parsen (`mammoth` → `@xmldom/xmldom`)
  und die MCP-Suite (`express` → `qs`), jeweils gegen eine **frisch aus dem
  Lockfile** aufgelöste Installation (PROJ-149-Lehre: eine alte `node_modules`
  misst den Zustand *vor* dem Fix).
- **AC-170.6** Volle Gates grün: vitest, ESLint, tsc = Baseline, Build, fünf
  Datei-Wächter.
- **AC-170.7** Kein `src/`-Diff, keine Migration, kein neues Paket.

## Nachweise

**Rot-Grün mit demselben Werkzeug, das in CI sperrt** — osv-scanner **v2.5.0**, lokal
geladen und per `sha256sum -c` gegen die mitgelieferte Summendatei verifiziert (wie im
Workflow; ein ungepinntes `curl` wäre sein eigenes Supply-Chain-Loch):

| | Funde gesamt | davon ≥ CVSS 7.0 | Gate |
|---|---|---|---|
| `origin/main`-Lockfile (Vorzustand) | **8** | **4** (fast-uri 4× 7,5) | exit **1** |
| dieser Stand | **1** | **0** | exit **0** |

Der Vorzustand ist **direkt an mains Lockfile** gemessen, nicht am eigenen Branch — damit
ist unabhängig belegt, dass `main` selbst rot ist und die fremde PR #537 an etwas hing, das
ihr nicht gehört. Geschlossen sind 7 der 8 Funde (fast-uri 4×, `@xmldom/xmldom`, `qs` 2×);
übrig bleibt der benannte `postcss-selector-parser` bei CVSS 4,3.

- **`npm audit --omit=dev --audit-level=high`: exit 0**, und über alle Schweregrade
  `{critical:0, high:0, moderate:0, low:0, info:0}` — also nicht nur über der Schwelle leer.
- **AC-170.3** `package.json`-Diff ist **genau eine Zeile**. Der erste Anlauf hatte
  `@xmldom/xmldom` und `qs` als **direkte Abhängigkeiten** eingetragen, weil
  `npm install <pkg>@<ver>` das tut — zurückgenommen und durch `npm update
  --package-lock-only` ersetzt: die Pakete werden von unserem Code nicht importiert, sie als
  direkte Abhängigkeit zu deklarieren wäre eine **falsche Aussage über den Graphen**.
- **AC-170.4** Lockfile-Pakete **1187 → 1187**, keine stillen Zugänge.
- **AC-170.5 funktional, gegen eine frisch aus dem Lockfile aufgelöste Installation**
  (`rm`-freies `npm ci`, danach die Versionen **aus `node_modules`** gelesen statt aus dem
  Lockfile geglaubt: `3.1.7 / 0.8.15 / 6.16.0`):
  - `src/lib/context-ingestion` **93/93**, darunter `docx-parser.real.test.ts` — die
    **un-gemockte** Kette `parseFile → mammoth → @xmldom/xmldom` gegen ein zur Laufzeit
    erzeugtes DOCX. Genau dieser Test existiert, weil PROJ-142 gezeigt hat, dass eine
    gemockte Parser-Suite einen Major-Sprung stillschweigend übersteht.
  - MCP-Suiten **26/26** (`src/app/api/mcp`, `src/lib/mcp`).
  - `qs@6.16.0` zusätzlich direkt geladen und ausgeübt (`parse` mit `arrayLimit`), weil die
    MCP-Suite es nachweislich **nicht** erreicht — siehe die Korrektur oben.
- **AC-170.6** vitest **4227/4227** (474 Dateien) · ESLint **0 Fehler** (4 Warnungen, alle in
  einer fremden PROJ-153-Datei, stehen ebenso auf `main`) · tsc **11 = Baseline** · Build
  clean · alle **fünf** Datei-Wächter OK.
- **AC-170.7** `git diff origin/main --name-only` enthält **0** Dateien unter `src/` und
  **0** unter `supabase/`; kein neues Paket.

## Abweichungen

- **D-170.1** Kein CIA-Pass: `.claude/rules/continuous-improvement.md` nimmt
  Versions-Bumps ohne Major-Wechsel ausdrücklich aus (Präzedenz PROJ-Y-142a,
  PROJ-160).
- **D-170.2** Kein eigener Unit-Test: die Slice ändert keine Zeile Produktivcode,
  ein Test über eine Lockfile-Version wäre eine Tautologie. Der Nachweis sind die
  vorhandenen **echten** Bibliothekstests (PROJ-Y-142b) gegen die neuen Versionen.
