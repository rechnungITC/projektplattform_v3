# PROJ-67 - Codebase Review Quality Hardening

## Status: In Progress (AC-4 + AC-5 closed 2026-05-30; AC-8 closed 2026-05-31; AC-1/2/3/6/7 pending)

**Created:** 2026-05-28
**Origin:** Codebase Review 2026-05-28
**Review Report:** [docs/codebase-review-2026-05-28.md](../docs/codebase-review-2026-05-28.md)

## Problem Statement

Der vollständige Review zeigt eine grundsätzlich stabile Codebase, aber mehrere Qualitäts- und QA-Lücken, die zusammen die Verlässlichkeit von Releases schwächen:

- Chromium-E2E hat eine Tenant-Settings-Visual-Regression.
- Full-E2E ist lokal wegen Mobile-Safari-Systembibliotheken nicht vollständig reproduzierbar.
- React-Hydration-Warnungen treten während E2E auf.
- React Compiler überspringt Optimierung in zwei Komponenten wegen `form.watch(...)`.
- Dependency-Audit meldet 7 moderate Findings.
- Lokaler Schema-Drift-Check ist ohne `DATABASE_URL` nicht ausführbar.
- GitNexus Query-CLI ist durch ein ReadOnly-FTS-Problem eingeschränkt.

Dieses PROJ bündelt diese Review-Funde als Hardening-Slice. Ziel ist nicht, neue Produktfunktionalität zu bauen, sondern die Release-Sicherheit wieder auf ein sauberes Niveau zu bringen.

## Dependencies

- PROJ-29 Hygiene-Slice: Lint-/Disable-Policy.
- PROJ-42 Schema-Drift-CI-Guard: lokale/CI-Prüfbarkeit.
- PROJ-51 Modern UI/UX & Motion System: Visual-Regression-Baselines.
- GitNexus AGENTS.md Workflow: Query/Impact/Detect-Changes.

## Findings

| ID | Severity | Bereich | Befund |
|---|---|---|---|
| F1 | Medium | UI/E2E | `settings-tenant.png` Visual-Regression: expected 1280x4305, actual 1280x4465, diff ratio 0.05. |
| F2 | Medium | E2E Infra | Full-E2E bricht in Mobile Safari wegen fehlender WebKit/Systembibliotheken ab. |
| F3 | Medium | SSR/React | Hydration-Mismatch-Warnungen in Settings/Profile/Resources/Signup während E2E. |
| F4 | Medium | React Compiler | `form.watch(...)` in `goal-detail-panel.tsx` und `edit-work-item-dialog.tsx` erzeugt Compiler-Warnungen. |
| F5 | Medium | Security/Deps | `npm audit` meldet 7 moderate Findings, 0 high/critical. |
| F6 | Low/Medium | Schema QA | `npm run check:schema-drift` lokal ohne `DATABASE_URL` nicht ausführbar. |
| F7 | Low/Medium | Tooling | `gitnexus query` meldet FTS-Index-Writeversuch auf read-only DB und liefert keine belastbaren Query-Ergebnisse. |
| F8 | Low | Hygiene | 23 `eslint-disable`-Treffer in `src`; Review/Reduktion sinnvoll. |

## Acceptance Criteria

- [ ] AC-1: `npm run test:e2e -- --project=chromium` läuft grün oder die Tenant-Settings-Baseline wurde nach sichtbarer UI-Freigabe bewusst aktualisiert.
- [ ] AC-2: `npm run test:e2e` ist lokal/CI reproduzierbar oder Mobile Safari wird in Umgebungen ohne WebKit-Systembibliotheken explizit und nachvollziehbar übersprungen.
- [ ] AC-3: E2E-WebServer-Logs enthalten keine React-Hydration-Mismatch-Warnungen mehr für Settings/Profile/Resources/Signup.
- [x] AC-4: `npm run lint` läuft ohne React-Compiler-Warnungen; insbesondere keine `form.watch(...)`-Reads direkt im JSX/Renderpfad der zwei betroffenen Komponenten. **Erledigt 2026-05-30** — `goal-detail-panel.tsx` (3 sites: source_ref.kind, auto_pull_date ×2) und `edit-work-item-dialog.tsx` (3 sites: phase_id, planned_start, planned_end) auf `useWatch({ control: form.control, name: ... })` umgestellt; `npm run lint` jetzt 0 errors + 0 warnings (vorher 0 errors + 2 warnings).
- [x] AC-5: `npm audit --json` ist triagiert; alle 7 moderate Findings sind entweder durch kontrollierte Upgrades behoben oder mit Exploitability/Owner/Follow-up dokumentiert. **Erledigt 2026-05-29 via PR #77** — 5 von 7 moderate CVEs via `npm audit fix` non-breaking aufgelöst (ws < 8.20.1, uuid < 11.1.1, svix transitive, resend transitive). Verbleibende 2: transitives `postcss` über `next/node_modules/postcss` — `npm audit fix` würde nur via breaking Next-Downgrade auflösen; wartet auf upstream Next-Bump.
- [ ] AC-6: `npm run check:schema-drift` hat einen dokumentierten lokalen Pfad mit frischer Shadow-DB oder ein klares Runbook mit `DATABASE_URL`-Setup.
- [ ] AC-7: `gitnexus query` funktioniert ohne ReadOnly-FTS-Warnungen und liefert wieder Prozess-/Symboltreffer.
- [x] AC-8: Alle `eslint-disable`-Treffer in `src` sind entweder entfernt oder mit knapper Begründung und Owner-Entscheidung bestätigt. **Erledigt 2026-05-31** — `rg -n "eslint-disable" src` zeigt 23 Treffer in 19 Files; vier fehlende Inline-Begründungen ergänzt (`EditWbsCodeDialog`, `BacklogClient`, `CreateWorkItemLinkDialog`, `BacklogTree`), die übrigen 19 Treffer hatten bereits knappe Owner-Entscheidungen.

## Non-Goals

- Keine neuen Produktfeatures.
- Keine große UI-Neugestaltung der Settings-Seiten.
- Kein blindes Dependency-Auto-Fix, wenn dadurch Framework-Versionen unerwartet springen oder zurückfallen.
- Keine Änderung an RLS-/DB-Policies ohne eigene GitNexus-/Migration-Review.

## Suggested Implementation Plan

1. Visual-Regression isolieren:
   - `npm run test:e2e -- --project=chromium tests/PROJ-51-visual-regression-authenticated.spec.ts -g "Tenant settings page"`
   - Actual/Diff prüfen.
   - UI-Fix oder Snapshot-Freigabe.
2. Playwright-Infra stabilisieren:
   - WebKit-Dependencies installieren oder Projekt-Gating dokumentieren.
   - Full-E2E erneut ausführen.
3. Hydration-Warnungen beseitigen:
   - Betroffene Radix/Form/Input/Switch-Renderpfade prüfen.
   - SSR-/Client-Style-Unterschiede vermeiden.
4. React-Compiler-Warnungen fixen:
   - `form.watch(...)` durch `useWatch` oder stabil abgeleitete Werte ersetzen.
5. Dependency-Audit triagieren:
   - `next`, `postcss`, `resend`, `svix`, `uuid`, `ws`, `brace-expansion` kontrolliert aktualisieren.
6. Schema-Drift-Local-Runbook ergänzen.
7. GitNexus Query-ReadOnly-Problem beheben oder upstream/workaround dokumentieren.

## QA Plan

```bash
npm run lint
npm run test
npm run build
npm run test:e2e -- --project=chromium
npm run test:e2e
npm audit --json
npm run check:schema-drift
node /home/sven/.npm/_npx/e46929201c1128dd/node_modules/gitnexus/dist/cli/index.js query "auth tenant ai provider"
```

## Review Evidence

- Unit: 187 files / 1557 tests passed.
- Build: Next.js 16.2.4 production build passed; 66 static pages generated.
- Chromium E2E: 68 passed, 5 skipped, 1 failed.
- Full E2E: 122 passed, 12 skipped, 14 failed.
- Audit: 7 moderate, 0 high, 0 critical.
