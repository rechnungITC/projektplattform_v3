---
id: PROJ-142
title: "Supply-Chain-Remediation js-yaml + pdfjs-dist (npm-audit-Baseline zurück auf grün) + ESLint-Reparatur"
issue_type: Chore
epic_code: HYGIENE
epic_title: "Hygiene & Supply-Chain"
priority: High
priority_source: "Must"
labels: ["hygiene", "supply-chain", "security", "ci"]
dependencies: []
roles: ["Platform"]
summary_for_jira: "[HYGIENE] Supply-Chain-Remediation js-yaml + pdfjs-dist — npm-audit Required-Check zurück auf grün"
---

# PROJ-142: Supply-Chain-Remediation js-yaml + pdfjs-dist

## Status: Deployed (2026-08-07)
**Deployed:** 2026-08-07 — PR #297 → main (`c4419bf`), Tag `v2.35.0-PROJ-142`. Alle 6 Required-Checks grün (npm audit + Snyk exit 0, schema-drift, migration-naming, Vercel). Vercel-Prod-Deploy `dpl_HCe64Av` READY auf main HEAD `1c3fdef`; Post-Deploy-Smoke `/`, `/projects`, `/stammdaten/skills`, `GET`+`POST /api/context-sources` (pdfjs-Pfad) alle 307 Auth-Gate ohne Leck. Runtime-Dep-Bump `pdfjs-dist@6.2.108` + `js-yaml@4.3.1` live. Clean-`npm ci` von merged main re-verifiziert: audit 0, ESLint 0. Kein neuer Env/Secret, keine Migration. **Entblockt PROJ-Y-3 (#292), das unmittelbar danach gemerged wurde.**
**Created:** 2026-08-07
**Origin:** PROJ-74 `npm audit --omit=dev --audit-level=high` Required-Check auf `main` rot; blockierte den ansonsten fertigen PROJ-Y-3-Merge (PR #292). Portfolioweit, kein Feature-Bug.

> **Hygiene-Slice** analog PROJ-29/42/74/140. Kein neues Feature, keine Migration, keine `src/**`-Logikänderung außer einem additiven Regressionstest.

## Problem

Am 2026-08-07 meldet `npm audit --omit=dev` **2 HIGH** auf `main`. Der PROJ-74-Required-Check ist damit rot und blockiert per Branch-Protection jeden Auto-Merge.

| # | Paket | Sev | Advisory | Herkunft | Feature-Kontext |
|---|-------|-----|----------|----------|-----------------|
| 1 | `js-yaml 4.0.0–4.3.0` | **high** | GHSA-5p4m-2wfm-xmqj — quadratischer CPU-Verbrauch bei `!!omap`-Auflösung (CVE-2026-59870 nicht auf 4.x zurückportiert) | direkt + transitiv via `date-holidays` | PROJ-76 Skill-Serializer (`src/lib/skills/serialize.ts`) |
| 2 | `pdfjs-dist >=5.6.83 <6.2.108` | **high** | GHSA-hq66-cqwq-w95j — **arbitrary JavaScript execution beim Öffnen eines präparierten PDFs** | direkt | **PROJ-70-γ Kickoff-PDF-Ingestion — verarbeitet nutzer-hochgeladene PDFs, also ein realer Angreifer-Vektor** |

`npm audit fix --force` ist wie bei PROJ-140 **kein gangbarer Weg**: es schlägt für `pdfjs-dist` einen **Downgrade auf 5.5.207** vor. Zwar liegt 5.5.207 unterhalb des Advisory-Bereichs, aber auf einem Parser, der untrusted Uploads verarbeitet, rückwärts zu gehen (und dabei alle seither gefixten Issues zu verlieren) ist die falsche Richtung.

### Kern-Fork: pdfjs-dist v6 verlangt Node ≥22.13 — der Toolchain läuft auf Node 20

`pdfjs-dist@6.2.108` deklariert `engines: { node: ">=22.13.0 || >=24" }`. Im Repo:

- **Vercel-Prod: Node 24.x** → innerhalb des Engine-Bereichs. **Hier läuft die PDF-Verarbeitung tatsächlich** (API-Route `/api/context-sources`).
- Lokaler Host: Node 20.20.2 · alle 4 CI-Workflows: `node-version: "20"` → außerhalb.

Entscheidend: die einzigen Node-20-Flächen (lokale Tests + CI) **mocken `pdfjs-dist` vollständig**. Ein Node-Upgrade ist daher für diese Slice **nicht erforderlich**; es bleibt als eigenständige Toolchain-Frage offen (→ PROJ-Y-142a).

Empirisch verifiziert statt angenommen (echter, un-gemockter Smoke auf Node 20.20.2): Import OK, `getDocument({data, disableWorker})` → `.promise` → `numPages` → `getPage(n)` → `getTextContent()` → `items[].str` unverändert, Text korrekt extrahiert. Die genutzte API-Fläche ist zwischen v5 und v6 stabil.

### Begleitfund: `npm run lint` war auf `main` komplett kaputt

Beim Verifizieren der eigenen Änderung fiel auf, dass ESLint gar nicht mehr startet:

```
TypeError: expand is not a function
    at Minimatch.braceExpand (node_modules/minimatch/minimatch.js:271:10)
```

Ursache: der Override `brace-expansion: ^5.0.9` (aus dem PROJ-77-Supply-Chain-Fix, PR #264) drückt v5 auch in `minimatch@3.1.5`, das `brace-expansion@^1.1.7` als **CJS-Default-Export** erwartet. `origin/main` hat byte-identisch dieselbe Auflösung — der Bruch ist also **vorbestehend**, kein Regress dieser Slice. Folge: sämtliche „ESLint 0"-Angaben in Slice-Notizen seit #264 waren nicht belastbar, weil der Linter nicht lief.

Fix: den Override versions-scopen (`minimatch@3`), sodass nur die 3.x-Linie das kompatible `brace-expansion@1.1.18` bekommt, während `minimatch@10.2.5` (das `import { expand }` aus `^5.0.5` nutzt) beim gehoisteten v5 bleibt. Ein *breiter* `minimatch`-Override hätte den Crash nur in die 10.x-Linie verschoben — beide Linien sind zur Laufzeit einzeln verifiziert.

### Begleitfund: die PDF-Test-Abdeckung war vakuum

`src/lib/context-ingestion/file-parser.test.ts` mockt `pdfjs-dist/legacy/build/pdf.mjs` vollständig. Die 26 Tests bleiben deshalb grün, egal ob das installierte pdfjs funktioniert, kaputt ist oder fehlt — sie blieben auch über einen Major-Sprung hinweg grün. Exakt die Lücken-Klasse, die PROJ-79 für `file-type` mit `mime.ooxml.test.ts` geschlossen hat.

## User Story

**Als** Platform-Verantwortlicher
**möchte ich** die npm-audit-Baseline ohne sicherheits-absurde Downgrades zurück auf grün bringen,
**damit** die Branch-Protection wieder Merges zulässt und der PDF-Parser, der untrusted Uploads verarbeitet, nicht angreifbar bleibt.

## Acceptance Criteria

- **AC-142.1** `npm run audit:prod` (`npm audit --omit=dev --audit-level=high`) endet mit Exit 0.
- **AC-142.2** `js-yaml` auf ≥ 4.3.1 (in-range Patch, kein Major); Dependency **und** Override im Lockstep, sonst `EOVERRIDE`.
- **AC-142.3** `pdfjs-dist` auf ≥ 6.2.108. **Kein** Downgrade auf 5.5.207.
- **AC-142.4** Die von `parsePdf()` genutzte pdfjs-API ist gegen die **echte** Library verifiziert, nicht gegen einen Mock — als dauerhafter Regressionstest im Repo.
- **AC-142.5** `npm run lint` läuft wieder durch und meldet 0 Errors (war: Crash vor der ersten Datei).
- **AC-142.6** Keine Migration, kein Schema-Change, keine Logikänderung an `src/**` außer additiven Tests.
- **AC-142.7** Volle Regression grün: vitest, build, tsc ohne neue Fehler gegenüber Baseline.

## Umsetzung

| Änderung | Datei | Zweck |
|---|---|---|
| `js-yaml` `^4.2.0` → `^4.3.1` (dependency + override) | `package.json` | AC-142.2 |
| `pdfjs-dist` `^5.6.205` → `^6.2.108` | `package.json` | AC-142.3 |
| `"minimatch@3": { "brace-expansion": "^1.1.18" }` | `package.json` overrides | AC-142.5 |
| Neuer un-gemockter Regressionstest gegen echtes pdfjs | `src/lib/context-ingestion/pdf-parser.real.test.ts` | AC-142.4 |

## Quality Gates

| Gate | Ergebnis |
|---|---|
| `npm run audit:prod` | **0 vulnerabilities** (vorher 2 HIGH) |
| ESLint | **0** (vorher: Crash — lief gar nicht) |
| vitest | **2607/2607** (338 Files, +2 neu) |
| Build | clean |
| tsc | 13 vorbestehende Fehler in Test-Dateien, **0 neue**; keine davon referenziert `pdfjs`/`js-yaml` |
| Echter pdfjs-Smoke auf Node 20 | PASS (Import + Extraktion + `items[].str`) |
| `minimatch@3` / `minimatch@10` Laufzeit | beide brace-expandieren korrekt |

## Deviations

- **D-142.1** — Node bleibt auf 20 in lokalem Host und CI, obwohl `pdfjs-dist@6` `>=22.13` deklariert. Begründet: Prod (Vercel) läuft auf Node 24 und ist damit konform; die Node-20-Flächen mocken pdfjs vollständig; der reale Betrieb auf Node 20 ist zusätzlich empirisch verifiziert. Das Toolchain-Upgrade ist eine eigene Entscheidung → **PROJ-Y-142a**.
- **D-142.2** — Die ESLint-Reparatur liegt streng genommen außerhalb des Advisory-Scopes, ist aber Voraussetzung dafür, die eigene Änderung überhaupt gegen das Lint-Gate prüfen zu können. Vorbestehender Bruch, mit Beweis gegen `origin/main`.

## Follow-ups

- ~~**PROJ-Y-142a** — Node-Baseline 20 → 22/24 in lokalem Host + 4 CI-Workflows + `@types/node`.~~ **Erledigt 2026-08-08** → [PROJ-Y-142a](PROJ-Y-142a-node-baseline-20-to-24.md): CI + `.nvmrc` auf **24** (Prod-Parität), `engines.node >=22.13.0`, `@types/node@^24` (0 neue tsc-Fehler); volle Regression auf echtem Node 24 grün. Lokaler Host-Node bleibt als nicht-blockierender User-Handoff offen.
- **PROJ-Y-142b** — Audit der übrigen mock-only Parser-Abdeckung (`mammoth`/DOCX, `mailparser`/EML, `@kenjiuno/msgreader`/MSG) nach dem Muster dieser Slice und PROJ-79: mindestens ein un-gemockter Pfad je Parser, damit Major-Bumps nicht still grün bleiben.
