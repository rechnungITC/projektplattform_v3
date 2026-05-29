# Codebase Review - 2026-05-28

## Kurzfazit

Die Codebase ist in den Kern-Gates stabil: Lint hat keine Errors, Unit-Tests sind vollständig grün, und der Production-Build läuft auf dem aktuellen Working Tree durch. Die Architektur ist breit modularisiert, die API-Fläche ist konsequent auth-gated, und die Supabase-/AI-/Projektmodule sind gut testbar geschnitten.

Es gibt aber mehrere Review-Funde, die vor dem nächsten größeren Feature-Schub gebündelt behoben werden sollten. Dafür wurde `PROJ-67` angelegt: [PROJ-67-codebase-review-quality-hardening.md](../features/PROJ-67-codebase-review-quality-hardening.md).

## Prüfbasis

- Datum/Zeit: 2026-05-28, Europe/Berlin.
- Branch: `main`, lokal `ahead 1` durch Commit `f8417fc fix(ai): add OpenAI quota fallback for suggestions`.
- GitNexus: Index nach dem Commit neu aufgebaut, Status danach up-to-date.
- GitNexus-Indexgröße: 20.658 Nodes, 30.868 Edges, 475 Cluster, 300 Flows.
- Repo-Größe: 1.041 `src` TypeScript/TSX-Dateien, 191 API-Route-Dateien, 109 Supabase-Migrationen, 205 Test-/Spec-Dateien.
- Working Tree während der Review: zusätzlich ungestagte Änderungen in `AGENTS.md`, `CLAUDE.md`, mehreren `src/lib/ai/*`-Dateien sowie eine untracked PROJ-65-Migration. Diese Änderungen wurden nicht zurückgesetzt und im finalen Lint/Test/Build mitgeprüft.

## Ausgeführte Checks

| Check | Ergebnis | Notiz |
|---|---:|---|
| `gitnexus analyze` | Pass | Direkte lokale CLI genutzt; `npx gitnexus analyze` hing vorher bei Paketinstallation. |
| `gitnexus status` | Pass | Index auf Commit `f8417fc` up-to-date. |
| `npm run lint` | Pass mit Warnungen | 0 Errors, 2 React-Compiler-Warnungen. |
| `npm run test` | Pass | 187 Test Files, 1557 Tests grün. |
| `npm run build` | Pass | Next.js 16.2.4, TypeScript ok, 66 statische Seiten. |
| `npm run test:e2e -- --project=chromium` | Fail | 68 passed, 5 skipped, 1 Visual-Regression auf Tenant Settings. |
| `npm run test:e2e` | Fail | 122 passed, 12 skipped, 14 failed; 13 Mobile-Safari-Infrafehler plus Tenant-Settings-Visual-Regression. |
| `npm audit --json` | Fail | 7 moderate, 0 high, 0 critical. |
| `npm run check:schema-drift` | Nicht ausführbar lokal | Exit 2: `DATABASE_URL is not set`. |

## Architekturbeobachtungen

- Die App ist klar in Next.js App Router, `src/lib/*`-Domänenmodule, UI-Komponenten und Supabase-Migrationen gegliedert.
- Die API-Fläche ist groß, aber weitgehend einheitlich: projektbezogene Endpunkte liegen unter `src/app/api/projects/[id]/*`, Tenant-/Admin-Endpunkte unter `src/app/api/tenants/*`.
- Supabase-Access ist überwiegend über Server-Clients, RPCs und RLS-orientierte Helper gekapselt.
- AI ist sauberer als in älteren Ständen: Provider-Resolver, Cost-Caps, Privacy-Klassifikation und Stub-Fallbacks sind getrennte Verantwortlichkeiten.
- Testabdeckung ist stark für Router, Auth-Gates, Domain-Logik und visuelle Baselines; die E2E-Umgebung selbst ist aktuell aber nicht vollständig reproduzierbar.

## Review-Funde

### F1 - Tenant-Settings-Visual-Regression

Severity: Medium

Der isolierte Chromium-E2E-Lauf scheitert nur an `tests/PROJ-51-visual-regression-authenticated.spec.ts:108` für `settings-tenant.png`.

Evidence:

- Erwartet: 1280 x 4305 px.
- Ist: 1280 x 4465 px.
- Diff: 231.790 Pixel, Ratio 0.05.
- Artefakte: `test-results/PROJ-51-visual-regression--76c5d-icated-Tenant-settings-page-chromium/settings-tenant-actual.png` und `settings-tenant-diff.png`.

Bewertung: Die tatsächliche Seite wirkt strukturell intakt, aber die Snapshot-Baseline ist nicht mehr synchron oder es gibt eine echte Layout-Veränderung auf der Tenant-Settings-Seite. Das muss visuell freigegeben und dann entweder korrigiert oder bewusst als neue Baseline übernommen werden.

### F2 - Full E2E lokal nicht vollständig reproduzierbar

Severity: Medium

Der Full-E2E-Lauf scheitert in Mobile Safari wegen fehlender Systembibliotheken (`libgtk-4.so.1`, `libgraphene-1.0.so.0`, `libatomic.so.1`, weitere GStreamer/WebKit-Abhängigkeiten). Das ist primär ein Testinfrastruktur-Problem, blockiert aber lokale vollständige QA.

Empfehlung: `npx playwright install-deps` in der lokalen/CI-Umgebung sicherstellen oder Mobile-Safari-Projekt in Umgebungen ohne WebKit-Dependencies explizit skippen.

### F3 - React-Hydration-Mismatch-Warnungen in E2E

Severity: Medium

Während der E2E-Läufe erscheinen mehrfach React-Hydration-Warnungen. Beispiele betreffen Settings, Stammdaten Resources, Profile Settings und Signup. Die Diffs zeigen unter anderem Attribute/Styles wie `caret-color`, Radix `SwitchBubbleInput`/`RadioBubbleInput`-Styles und SSR/Client-Unterschiede.

Bewertung: Die Tests bestehen überwiegend trotzdem, aber Hydration-Warnungen können echte SSR-Probleme maskieren und machen visuelle Tests instabiler.

### F4 - React-Compiler-Warnungen durch `form.watch(...)`

Severity: Medium

`npm run lint` ist grün, warnt aber in zwei Komponenten:

- `src/components/projects/goals/goal-detail-panel.tsx:450`
- `src/components/work-items/edit-work-item-dialog.tsx:410`

Beide verwenden `form.watch(...)` direkt im Renderpfad/JSX. React Hook Form gibt hier Funktionen zurück, die der React Compiler nicht sicher memoizen kann; React überspringt deshalb Optimierung für die betroffenen Komponenten.

Empfehlung: Auf `useWatch` oder kontrolliert abgeleitete lokale Werte wechseln.

### F5 - Dependency-Audit: 7 moderate Findings

Severity: Medium

`npm audit --json` meldet 7 moderate Findings, keine High/Critical:

- `brace-expansion` - DoS über große Range.
- `next` via `postcss`.
- `postcss` - XSS in CSS stringify.
- `resend` via `svix`.
- `svix` via `uuid`.
- `uuid` - Buffer-Bounds-Check.
- `ws` - uninitialized memory disclosure.

Bewertung: Kein akuter High/Critical-Blocker, aber das sollte in einem kontrollierten Dependency-Update geprüft werden. `npm audit fix` darf nicht blind laufen, da der Next-Fixvorschlag in der Audit-Ausgabe semver-inkonsistent wirkt.

### F6 - Schema-Drift lokal nicht ohne externe DB prüfbar

Severity: Low/Medium

`npm run check:schema-drift` bricht lokal ab:

```text
schema-drift: DATABASE_URL is not set. Set it to a freshly-migrated Postgres (CI does this automatically).
```

Bewertung: CI kann das abdecken, aber lokal ist die Prüfbarkeit nicht self-contained. Das erschwert schnelle Reviews gerade bei migrationsnahen Änderungen.

### F7 - GitNexus Query-CLI meldet FTS-Index-Probleme

Severity: Low/Medium

`gitnexus query` meldete mehrfach:

```text
FTS index ensure failed ... Cannot execute write operations in a read-only database!
```

`gitnexus context`, `impact` und `detect-changes` funktionieren, aber die konzeptuelle Query-Suche liefert dadurch keine belastbaren Ergebnisse. Das schwächt die Code-Intelligence-Workflows aus `AGENTS.md`.

### F8 - Eslint-Disable-Baseline ist wieder angewachsen

Severity: Low

`rg "eslint-disable" src | wc -l` meldet 20 Treffer. Einige sind begründet, die Zahl widerspricht aber dem Hygiene-Ziel aus PROJ-29, Disable-Kommentare nur eng begründet und selten einzusetzen.

## Positive Befunde

- Unit-Test-Suite ist umfangreich und schnell genug für regelmäßige lokale Ausführung.
- Build läuft auf dem aktuellen Working Tree vollständig durch.
- Auth-Gate-E2E deckt viele API- und Page-Routen ab und ist im Chromium-Lauf fast vollständig grün.
- Keine High/Critical Dependencies im Audit.
- Secrets und externe Provider sind überwiegend serverseitig gekapselt; Cron-Endpunkte nutzen Bearer-Secrets.
- Der neue OpenAI-Quota-Fallback ist committed und in der AI-Router-Testabdeckung verankert.

## Empfohlene Reihenfolge

1. `PROJ-67` umsetzen: Visual-Regression klären, E2E-Infrastruktur stabilisieren, Hydration-Warnungen und React-Compiler-Warnungen entfernen.
2. Danach Dependency-Audit gezielt aktualisieren, nicht per blindem `npm audit fix`.
3. Schema-Drift-Check lokal reproduzierbar machen oder Runbook für lokale Shadow-DB ergänzen.
4. GitNexus Query-ReadOnly-Problem beheben, weil AGENTS.md diese Workflows verbindlich macht.

## Reproduktionsbefehle

```bash
npm run lint
npm run test
npm run build
npm run test:e2e -- --project=chromium
npm run test:e2e
npm audit --json
npm run check:schema-drift
```
