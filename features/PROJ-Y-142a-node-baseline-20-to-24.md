---
id: PROJ-Y-142a
title: "Node-Baseline 20 → 24 (CI-Parität mit Vercel-Prod)"
issue_type: Chore
epic_code: HYGIENE
epic_title: "Hygiene & Supply-Chain"
priority: High
priority_source: "Should"
labels: ["hygiene", "ci", "toolchain"]
dependencies: ["PROJ-142"]
roles: ["Platform"]
summary_for_jira: "[HYGIENE] Node-Baseline 20 → 24 in CI + Toolchain-Deklaration"
---

# PROJ-Y-142a: Node-Baseline 20 → 24

## Status: In Progress
**Created:** 2026-08-08
**Origin:** Followup aus PROJ-142 (Deviation D-142.1). `pdfjs-dist@6.2.108` deklariert `engines: { node: ">=22.13.0 || >=24" }`; die Toolchain lief auf Node 20. PROJ-142 hat das bewusst nicht mit-migriert, weil es für die Advisory-Remediation nicht nötig war — die Divergenz blieb aber als stille technische Schuld stehen.

> **Hygiene-Slice** analog PROJ-29/42/74/140/142. Kein Feature, keine Migration, kein Schema-Change, keine `src/**`-Logikänderung.

## Problem

Drei Node-Versionen im selben Projekt, ohne dass irgendwo stand, welche gilt:

| Fläche | Node vorher | Node nachher |
|---|---|---|
| **Vercel-Prod** (`nodeVersion` im Projekt) | **24.x** | 24.x (unverändert) |
| 4 GitHub-Actions-Workflows | 20 | **24** |
| Lokaler Dev-Host | 20.20.2 | → User-Handoff |
| `package.json` `engines` | **fehlte** | `>=22.13.0` |

Konsequenzen der Divergenz:

1. **CI testete nicht, was Prod ausführt.** Ein Node-24-spezifischer Bruch wäre erst in Produktion aufgefallen.
2. **Die Anforderung war unsichtbar.** Ohne `engines` gab es kein Signal, dass `pdfjs-dist@6` eine Node-Untergrenze mitbringt — ein Entwickler auf Node 18 hätte es schweigend falsch gemacht.
3. `@types/node` stand auf `^20`, während der Runtime 24 ist — Typen und Laufzeit driften auseinander.

## User Story

**Als** Platform-Verantwortlicher
**möchte ich**, dass CI auf derselben Node-Version läuft wie Vercel-Prod und die Anforderung im Repo deklariert ist,
**damit** ein versionsspezifischer Bruch in CI auffällt statt in Produktion.

## Entscheidung: 24, nicht 22

`pdfjs-dist@6` gäbe sich mit 22.13 zufrieden. Gewählt wurde trotzdem **24**, weil Prod-Parität das eigentliche Ziel ist — CI soll ausführen, was ausgeliefert wird. Die `engines`-Untergrenze bleibt bei **`>=22.13.0`**: das ist die ehrliche *Anforderung* (jemand auf 22.13+ kann arbeiten), während CI und `.nvmrc` auf **24** *pinnen* — was wir tatsächlich testen und betreiben. Untergrenze und Pin sind bewusst getrennt.

Vorab geprüft, dass 24 trägt: kein einziges Paket im Baum hat eine Node-**Obergrenze**; `vitest@4.1.7` (`^20 || ^22 || >=24`) und `jsdom@29.1.1` (`^20.19 || ^22.13 || >=24`) listen 24 explizit als unterstützt.

## Acceptance Criteria

- **AC-Y142a.1** Alle 4 CI-Workflows nutzen `node-version: "24"`.
- **AC-Y142a.2** `package.json` deklariert `engines.node` mit der realen Untergrenze.
- **AC-Y142a.3** `@types/node` passt zur Runtime-Major (24) und erzeugt **0 neue** tsc-Fehler.
- **AC-Y142a.4** Volle Regression auf **echtem Node 24** grün — nicht nur Config geflippt: `npm ci`, lint, vitest, build, `check:migration-naming`.
- **AC-Y142a.5** Ein Entwickler auf Node 20 ist **nicht blockiert**, sondern bekommt eine sichtbare Warnung (kein `engine-strict`).
- **AC-Y142a.6** `.nvmrc` pinnt die Dev-Version.

## Umsetzung

| Änderung | Datei |
|---|---|
| `node-version: "20"` → `"24"` (4 Stellen) | `.github/workflows/{migration-naming,schema-drift,supply-chain-audit}.yml` |
| `engines: { node: ">=22.13.0" }` | `package.json` |
| `@types/node` `^20` → `^24` | `package.json` |
| Neu: `24` | `.nvmrc` |
| Lockfile: `nanoid` 3.3.16 → 3.3.18 (Blocker, s.u.) | `package-lock.json` |

### Mit-erledigt: neues HIGH-Advisory `nanoid`

Während der Verifikation tauchte ein **neues** HIGH auf, das den Required-Check und damit jeden Merge blockiert hätte: `nanoid <3.3.17` (GHSA-2v37-7h3g-55p8, Endlosschleife bei `size = 0`), transitiv über `next → postcss → nanoid@^3.3.6`. Da postcss' Range den Fix bereits zulässt, genügte ein Lockfile-Bump auf 3.3.18 — **kein** zusätzlicher `overrides`-Eintrag nötig. Bewusst hier mit-erledigt statt in eigener Slice, weil es ein reiner Merge-Blocker ist (Präzedenz: PROJ-Y-96e, PROJ-142).

## Quality Gates — alle auf echtem Node 24.19.0 (LTS Krypton)

| Gate | Ergebnis |
|---|---|
| `npm ci` | clean |
| `npm run audit:prod` | **0 vulnerabilities**, Exit 0 |
| ESLint | **0**, Exit 0 |
| vitest | **2610/2610** (339 Files) |
| Build | ✓ Compiled successfully (23.4s) |
| `check:migration-naming` | 0 errors / 83 warnings, Exit 0 |
| tsc | **13 vorbestehend, 0 neu** — Verteilung vor/nach `@types/node`-Bump byte-identisch |
| Gegenprobe Node 20.20.2 | vitest **2610/2610** grün; `npm install` → `EBADENGINE`-**Warnung**, Exit 0 |

Verifiziert mit einem lokal entpackten Node-24-Tarball (kein Eingriff ins Host-System, kein sudo).

## Deviations

- **D-Y142a.1** — Der **lokale Dev-Host bleibt auf Node 20.20.2**. Ein System-Node-Upgrade braucht `sudo`/Paketmanager und ist keine Repo-Änderung → **User-Handoff** (siehe unten). Analog zum WebKit-Host-Libs-Handoff aus PROJ-67/F2. Der Handoff ist **nicht dringend**: die volle Suite läuft auf Node 20 weiter grün, es erscheint nur eine `EBADENGINE`-Warnung.
- **D-Y142a.2** — `engines.node` ist `>=22.13.0` (echte Untergrenze), nicht `>=24` (Pin). Bewusste Trennung von *Anforderung* und *getesteter Version*; ein `>=24` hätte Entwickler auf 22-LTS ohne fachlichen Grund ausgesperrt.
- **D-Y142a.3** — `schema-drift` konnte lokal nicht end-to-end verifiziert werden (braucht Docker, WSL-Integration offen — vorbestehend aus PROJ-67/F6). Der Workflow ist Required-Check und beweist sich beim ersten CI-Lauf selbst.

## User-Handoff

**Lokales Node-Upgrade 20 → 24** (empfohlen, nicht blockierend). Ohne Version-Manager auf diesem Host; sauberster Weg:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# neue Shell, dann im Repo:
nvm install     # liest .nvmrc → 24
nvm use
npm ci
```

Bis dahin: alles funktioniert weiter, `npm install` warnt lediglich.

## Follow-ups

- **PROJ-Y-142b** (aus PROJ-142, unverändert offen) — un-gemockte Abdeckung für `mammoth`, `mailparser`, `@kenjiuno/msgreader` nach dem Muster von `pdf-parser.real.test.ts`.
