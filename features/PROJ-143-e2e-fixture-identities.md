# PROJ-143 — RFC-4122-konforme E2E-Identitäten + explizites Test-Timeout

**Status:** Deployed (2026-08-11) — Closure-Deploy, Tag `v2.43.0-PROJ-143`. Code lag bereits auf main (Merge `812832a`, PR #313); test-only, daher kein Runtime-Verhalten geändert und keine Migration. Verifiziert auf main `265cccb`: ESLint 0 · `npm run build` clean · `check:migration-naming` 0 Errors.
**Erstellt:** 2026-08-10
**Requires:** PROJ-29 (E2E-Fixture-Fundament), PROJ-67/PROJ-138 (E2E-Infra)

## Problem

Die E2E-Fixture-Identitäten waren **keine gültigen UUIDs**:

| Konstante | alt | Defekt |
|---|---|---|
| `E2E_USER_ID` | `00000000-0000-0000-0000-000000000e2e` | Versions- **und** Variantennibble `0` |
| `E2E_TENANT_ID` | `00000000-0000-0000-0000-000000000e20` | dito |
| `E2E_PROJECT_ID` | `00000000-0000-0000-0000-000000000e21` | dito |

Die Anwendung validiert IDs mit **Zod 4**, dessen `z.string().uuid()` Version und Variante erzwingt. Direkt gegengetestet:

```
zod 4.4.3 accepts "00000000-0000-0000-0000-000000000e20": false
```

Der Fehler schlägt **nicht beim Setup** auf, sondern viel später — als 400 an einer API-Route oder als stille clientseitige Formularvalidierung. Genau deshalb wurde er dreimal lokal umgangen, bevor die Ursache benannt war:

1. **PROJ-70 F-3 / PROJ-89 F-3** — die Wizard-Draft-CREATE-Route lehnt die Tenant-ID ab (`wizardDraftCreateSchema.tenant_id`), Drafts mussten service-role geseedet werden.
2. **PROJ-Y-78f** — `responsible_user_id` wird mit `z.string().uuid()` geprüft; der einzige Member des E2E-Tenants trug die nicht-konforme ID. Damit war der Wizard **ab Schritt 1 nicht bedienbar** und die AC-135.3-Strecke strukturell nicht E2E-testbar.

Zweiter, unabhängiger Befund: **`playwright.config.ts` setzte kein `timeout`.** Damit galt Playwrights 30-s-Default, der jedes längere Timeout weiter unten **deckelt** — auch die im Bestand vorhandenen `page.goto(url, { timeout: 120_000 })`, die faktisch nie länger als 30 s warten konnten.

## Umfang

- Neue, RFC-4122-v4-konforme Identitäten mit `e2e…`-Präfix (bleiben erkennbar synthetisch).
- Eigene E-Mail-Adresse für den neuen Nutzer — `global-setup` behandelt „already registered" als Erfolg und meldet sich danach **per E-Mail** an; bei gleicher Adresse wäre die Migration ein stiller No-op geblieben.
- Eigene `tenants.domain` (Spalte ist UNIQUE, Alt-Tenant hält den alten Wert).
- Harter Konformitäts-Guard in `global-setup` (bewusst **nicht** fail-open, anders als alle übrigen Pfade dort).
- `timeout: 60_000` in `playwright.config.ts`.
- Duplizierte Domain-Konstante in `PROJ-1-2-live-closure.spec.ts` durch die geteilte ersetzt.

**Alt-Zeilen bleiben unangetastet.** Sechs SQL-Pentests (PROJ-76/77-α/77-β/77-γ/96/Y-96b) referenzieren sie als *fremde* Identität für Isolationsnachweise, teils mit FK-Bezug. Nach der Umstellung sind sie genau das: echt fremd. Kein destruktiver Eingriff in die Prod-DB.

## Akzeptanzkriterien

- **AC-143.1** — `E2E_USER_ID`, `E2E_TENANT_ID`, `E2E_PROJECT_ID` sind RFC-4122-v4-konform und werden von `z.string().uuid()` **und** `z.string().uuidv4()` akzeptiert. ✅
- **AC-143.2** — `global-setup` provisioniert die neuen Zeilen idempotent (auth.users, profiles, tenants, tenant_memberships, projects). ✅ live verifiziert
- **AC-143.3** — ein nicht-konformer Wert bricht `global-setup` **hart** ab, mit Ursache und Fundstelle in der Meldung. ✅
- **AC-143.4** — `playwright.config.ts` setzt ein explizites `timeout`; längere Timeouts weiter unten sind nicht mehr wirkungslos. ✅
- **AC-143.5** — keine E2E-Regression gegenüber dem Ausgangsstand. ✅ siehe unten
- **AC-143.6** — keine Löschung bestehender Prod-Zeilen. ✅

## Verifikation

**Live gegen Prod provisioniert und geprüft** — alle fünf Zeilen existieren und sind konform (auth.users, profiles, tenants, tenant_memberships(admin), projects).

**Volle chromium-Suite** gegen die neuen Identitäten. Ausgangsstand `main`: 350 passed / 7 failed.

**Endstand: 353 passed / 3 failed / 5 skipped** (Ausgangsstand `main`: 350 passed / 7 failed).

Fehlschläge einzeln zugeordnet:

| Fehlschlag | Bewertung |
|---|---|
| PROJ-135 AC-135.3 | erwartet — Fix liegt in PROJ-Y-78f (#307), dieser Branch hängt an `main` |
| PROJ-1-2 Invite-Route | vorbestehend, Supabase-E-Mail-Kontingent — reproduzierbar mit expliziter Meldung `invite_failed: email rate limit exceeded`; in PROJ-78 F-4 per Kontrollexperiment auch auf `main` belegt |
| PROJ-76 Auth-Gate / PROJ-1-2 Domain-Claim | **Last-Flakes**, treffen im Volllauf abwechselnd den einen oder anderen Test; isoliert beide grün (2 Durchgänge, 13/13). Vorbestehende Infra-Instabilität (PROJ-138-Domäne), nicht Folge dieser Slice |
| PROJ-1-2 Domain-Claim (Kollision) | **war von dieser Slice verursacht und ist behoben** — duplizierte Domain-Konstante kollidierte mit `tenants_domain_unique` |
| PROJ-51 ×2 Snapshots | **Folge dieser Slice** — frischer Tenant rendert andere Inhalte; neu baselined |
| PROJ-137 ×5 | **keine echten Fehlschläge** — siehe unten |

### Nebenbefund: PROJ-137 meldete jahrelang Phantom-Fehlschläge

Im ersten Volllauf schlug PROJ-137 fünfmal fehl (`duplicate key … projects_pkey`, `violates foreign key … context_sources_project_id_fkey`). Ursache ist **nicht** diese Slice: beide Describes der Datei seeden und löschen dieselbe fest kodierte `RFC_PROJECT_ID` in eigenen `beforeAll`/`afterAll`; unter `fullyParallel` landen sie in verschiedenen Workern und der Cleanup des einen räumt dem anderen das Projekt weg. **Seriell ausgeführt: 9/9 grün** — inklusive der drei `class3_blocked`-Tests, die seit Monaten als „vorbestehende Fehlschläge" durch die Berichte wandern und offenbar nie seriell gegengeprüft wurden.

Behoben mit `test.describe.configure({ mode: "serial" })` (dieselbe Fehlerklasse wie das markerbasierte Cleanup in PROJ-Y-78f). Gleichzeitig wurde der Datei-Kommentar korrigiert, der durch diese Slice inhaltlich falsch wurde: er behauptete weiterhin, `E2E_PROJECT_ID` sei nicht RFC-4122-konform, und begründete damit die separate `RFC_PROJECT_ID` — die jetzt der Isolation dient, nicht mehr einem Workaround. **Das war der vierte lokale Workaround für dieselbe Wurzel**, nicht der dritte.

## Deviations

- **D-1 — Snapshot-Neu-Baseline schreibt zwei Dinge fest.** `dashboard.png` und `stammdaten.png` waren **schon vor dieser Slice rot** (dokumentierte Datendrift, PROJ-88 F-3). Die neue Baseline friert damit sowohl die Folge des frischen Tenants als auch die nie aufgearbeitete UI-Drift ein. Vor dem Baselining wurde die Stabilität geprüft (zwei Läufe, identische Höhen 1554/1714 px; die zuvor beobachtete Schwankung war die Retry-Sequenz innerhalb eines Laufs), danach zweimal verifiziert (2× rc=0, 7/7). Eine inhaltliche Prüfung der eingefrorenen UI hat **nicht** stattgefunden.
- **D-2 — Alt-Tenant bleibt bestehen**, inklusive 43 angesammelter Testprojekte. Bewusst nicht gelöscht (Pentest-Referenzen + destruktiver Eingriff in Prod). Optionale Bereinigung nur nach ausdrücklicher Freigabe.
- **D-3 — Konformitäts-Guard in `global-setup` statt Unit-Test.** `tests/**` ist von vitest ausgeschlossen und gehört Playwright; ein dort abgelegter `*.test.ts` wäre für vitest unsichtbar und würde von Playwright geladen (real aufgetreten). Der Guard sitzt daher an der provisionierenden Stelle.

## Followups

- **PROJ-Y-143a** — `LEAD_PLACEHOLDER_UUID` in `tests/PROJ-135-clarifying-questions.spec.ts` (PROJ-Y-78f, #307) kann nach diesem Merge auf `E2E_USER_ID` zurückgeführt werden; der Platzhalter existierte nur wegen der nicht-konformen ID.
- **PROJ-Y-143b** — inhaltliche Prüfung der neu baselineten Snapshots (D-1).
- **PROJ-Y-143c** — optionale Bereinigung des Alt-Tenants (D-2).
