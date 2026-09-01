# PROJ-160: Supply-Chain-Remediation `browserslist`

## Status: Approved
## Deployment Scope: —

**Created:** 2026-09-01
**Last Updated:** 2026-09-01

## Auslöser

Der PROJ-74-Required-Check `npm audit production dependencies` **und** der PROJ-147-Check
`OSV scan of the dependency lockfile` waren am 2026-09-01 auf `main` **beide rot**. Aufgefallen ist
es an PR #521 — einer **reinen Buchführungs-Slice ohne `package.json`-Diff**, was den Befund
unmittelbar einordnet: das Advisory ist über Nacht gelandet, nichts im Repo hat sich verschlechtert.
Genau das Muster, das CLAUDE.md als „`npm audit` breaks unrelated PRs" führt (Präzedenz
PROJ-140/142/146/149/Y-96e).

Weil beide Gates blockieren und `strict: true` gilt, war **jeder** offene PR gesperrt.

## Der Befund, in beiden Quellen dieselbe einzige Ursache

`browserslist <= 4.28.6`, zwei Advisories, installiert war **4.28.2**:

| Advisory | Inhalt | CVSS |
|---|---|---|
| GHSA-c83g-rgw3-j3cx | unbegrenztes Speicherwachstum (keine Cache-Verdrängung) über verschiedene Query-Ergebnisse → schließlich OOM | 7.5 |
| GHSA-73wf-gq98-2v4g | Absturz bzw. Prototype-Write über eine untrusted `browserslist-stats.json` (`normalizeStats`) | 7.5 |

**Beide Quellen zeigen auf dasselbe Paket** — `npm audit` meldet 1 HIGH, der OSV-Scanner 2 HIGH+
(er zählt je Advisory). Das ist der Ertrag von PROJ-147: die zweite Meinung ist keine Dekoration,
sie bestätigt hier unabhängig.

**Abhängigkeitspfad, gemessen statt vermutet** — `browserslist` ist Build-Zeit-Werkzeug, steht aber
im Prod-Baum, weil `@sentry/nextjs` eine Produktions-Abhängigkeit ist:

```
@sentry/nextjs → @sentry/webpack-plugin → webpack → browserslist
@sentry/nextjs → @sentry/bundler-plugin-core → @babel/core
                → @babel/helper-compilation-targets → browserslist
```

## Warum der Fix ein reiner Lockfile-Bump ist

**Beide Elternranges erlauben die gepatchte Version bereits:**

| Eltern | Range | 4.28.8 im Range? |
|---|---|---|
| `webpack` | `^4.28.1` | ja |
| `@babel/helper-compilation-targets` | `^4.24.0` | ja |

Damit braucht es **keinen `overrides`-Eintrag** — anders als bei PROJ-149, wo der Elternrange die
gepatchte Version deckelte und ein Override der *einzige* vorwärtsgerichtete Weg war. Hier gilt das
PROJ-Y-142a-Muster (`nanoid`): der Range lässt den Fix zu, also genügt `npm update browserslist`.

`npm audit fix --force` war **nicht** nötig und wäre auch nicht gewählt worden (PROJ-140/142: es hat
zweimal versucht, Next.js bzw. `pdfjs-dist` in ältere, verwundbarere Majors zurückzudrehen).

## Expositionsbewertung — gesagt, nicht gerundet

Beide Advisories treffen `browserslist` **zur Bauzeit**, nicht zur Laufzeit der ausgelieferten
Anwendung: der Prototype-Write braucht eine `browserslist-stats.json`, die dieses Repo nicht führt,
und das Speicherwachstum entsteht bei vielen verschiedenen Queries in einem lang lebenden Prozess.
Die reale Angreifer-Exposition ist damit **gering**.

Das ist ausdrücklich **kein** Grund, das Gate zu umgehen. Die Hausnorm zieht die Linie bei HIGH, und
sie zieht sie vor der Bewertung des Einzelfalls — genau damit niemand pro Advisory neu verhandelt.

## Acceptance Criteria

- [x] **AC-160.1** `npm run audit:prod` endet mit **0 Vulnerabilities** und Exit 0.
- [x] **AC-160.2** Der OSV-Gate endet mit Exit 0; verbleibender Fund benannt
      (`postcss-selector-parser@6.1.2`, CVSS 4.3 — unter der Schwelle, lag vor und nach dem Fix vor).
- [x] **AC-160.3** Rot-Grün ausgeführt: gegen den **Vorzustand** meldet der Gate
      `2 finding(s) at HIGH or above` (beide `browserslist@4.28.2`, je CVSS 7.5) und Exit **1**;
      gegen den Fixzustand Exit **0**. **Die Exit-Codes sind direkt gemessen** — ein erster Versuch
      fragte sie durch eine Pipe hindurch ab und hätte damit den Code von `tail` gelesen, also
      ausgerechnet an der Frage „ist das Gate dekorativ?" nichts belegt.
- [x] **AC-160.4** `package.json` unberührt; Diff nur `package-lock.json` (23 Einfügungen,
      23 Löschungen).
- [x] **AC-160.5** Paketzahl unverändert **1186 → 1186**. Mitgewandert sind nur browserslists eigene
      Datenpakete (`caniuse-lite`, `electron-to-chromium`, `node-releases`,
      `baseline-browser-mapping`, `update-browserslist-db`); bei `emoji-regex` **nur die
      `integrity`-Zeile** ohne Versionswechsel.
- [x] **AC-160.6** `rm -rf node_modules .next && npm ci` → `browserslist@4.28.8` (Lockfile also
      selbstkonsistent), `audit:prod` Exit 0, **Build clean** (Exit 0). Das ist der tragende
      funktionale Nachweis, weil `browserslist` genau zur Bauzeit wirkt.
- [x] **AC-160.7** vitest **4178/4178** in 474 Dateien · ESLint **0 errors** (die 4 Warnungen
      stammen aus `router-work-items-from-intent.skill-boundary.test.ts`, also PROJ-153, und stehen
      unverändert auch auf `main`) · tsc **11 = Baseline** nach `rm -rf .next` — die erste Messung
      wäre sonst der `.next`-Falle aus PROJ-Y-143e aufgesessen · migration-naming, index-scope,
      register-consistency je 0.

## Out of Scope

- Der verbleibende Fund unter der Schwelle (`postcss-selector-parser@6.1.2`, CVSS 4.3). Er lag
  **vor und nach** dem Fix vor und ist keine Regression dieser Slice.
- Eine Bewertung, ob `@sentry/nextjs` eine Produktions-Abhängigkeit sein muss. Sie ist der Grund,
  warum ein Build-Zeit-Werkzeug im Prod-Baum steht — aber das zu ändern ist eine
  Architekturentscheidung, keine Advisory-Behebung.

## Nachweise im Überblick

| Prüfung | Vorzustand | Fixzustand |
|---|---|---|
| `npm audit --omit=dev --audit-level=high` | 1 HIGH (`browserslist`) | **0 Vulnerabilities**, Exit 0 |
| OSV-Gate (Scanner v2.5.0, Checksumme verifiziert) | **2 HIGH+**, Exit **1** | 1 Fund unter der Schwelle, Exit **0** |
| `npm ci` → installierte Version | 4.28.2 | **4.28.8** |
| Build | — | **clean**, Exit 0 |
| Paketzahl im Lockfile | 1186 | **1186** |

Der Scanner selbst endet in beiden Fällen mit Exit 1 — er beendet bei **jedem** Fund. Die Linie bei
CVSS ≥ 7.0 zieht `scripts/osv-gate/`, und genau das ist ihr Zweck: ohne sie wäre der Check bei jedem
harmlosen Fund rot und würde binnen Tagen umgangen.

## Abweichungen

**D-160.1** Kein eigener Test. Die Slice ändert keine Zeile Produktivcode; ihr Nachweis ist der
Build auf frisch aufgelöster Installation plus die beiden Advisory-Quellen. Ein Unit-Test über eine
Lockfile-Version wäre eine Tautologie.

**D-160.2** Kein CIA-Pass. Nach `.claude/rules/continuous-improvement.md` ist ein
Dependency-Bump ohne Major-Wechsel ausdrücklich **nicht** CIA-pflichtig; hier ist es ein
Patch-Bump innerhalb bestehender Ranges, ohne neues Paket und ohne Override. Präzedenz
PROJ-Y-142a.
