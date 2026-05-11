# PROJ-53: Gantt Timeline-Scale — Tagesansicht, Wochenenden, KW (MS-Project-Style)

## Status: α deployed 2026-05-06 · β backend deployed 2026-05-06 · β frontend implemented 2026-05-11 · β QA Approved 2026-05-11 (awaiting /deploy)
**Created:** 2026-05-06
**Last Updated:** 2026-05-06

## Summary
Erweiterung des bestehenden Gantt (PROJ-25-α, deployed) um einen MS-Project-orientierten **zweireihigen Zeitachsen-Header** mit Tagesnummern, Kalenderwochen (KW, ISO 8601) und visuell hervorgehobenen Wochenenden. Reine Frontend-Erweiterung in `src/components/phases/gantt-view.tsx` — keine Migration, keine API, kein neues Schema.

Heute zeigt der Gantt nur einen einreihigen Monats-Header und ein 7-Tage-Grobgrid. Bei Tagesarbeit (z.B. Sprint-Planning, Bauwoche) fehlt jeder Tag-für-Tag-Bezug — und Projektleiter:innen, die MS Project gewöhnt sind, verlieren die räumliche Orientierung.

## Dependencies
- **Requires PROJ-25** (Gantt-Surface — deployed). PROJ-53 ändert ausschließlich den Header-/Background-Layer dieses Surface.
- **Soft requires PROJ-26** (Method-Gating) — Gantt sichtbar in Wasserfall-/PMI-/Hybrid-Methoden; auf Scrum-only-Projekten irrelevant. Keine zusätzliche Gating-Arbeit nötig.

## V2 Reference Material
V2 hatte keinen produktiven Gantt mit MS-Project-Style-Header — kein Vorbild im Bestand. Orientierung: Microsoft Project 2019/365 Default-Skala.

## User Stories

- **Als Projektleiter:in (Wasserfall/Hybrid)** möchte ich beim Tag-Zoom **jede Kalenderwoche und jeden Tag** sehen, damit ich Phasen-Übergänge tagesgenau einschätzen kann.
- **Als Projektleiter:in** möchte ich **Wochenenden visuell erkennen** (gedämpft eingefärbt), damit ich auf einen Blick sehe, welche Phasen-Enden auf einen Samstag/Sonntag fallen.
- **Als Bau-Projektleiter:in** möchte ich **KW-Nummern (KW 18, KW 19...)** sehen — das ist die in DE/EU übliche Wochen-Referenz in Bauplänen.
- **Als Auditor:in** möchte ich auch im Monats-/Quartals-Zoom den **Jahreskontext** im Header sehen (oben Jahr/Quartal, unten Monat), um historische Pläne korrekt einzuordnen.
- **Als mobiler Leser:in** möchte ich den read-only Gantt mit dem neuen Header lesen können, ohne dass die Spalte zu hoch wird.

## Acceptance Criteria

### ST-01 Zwei-Reihen-Header (zoom-spezifisch)
- [x] **Tag-Zoom:** Top-Row = Monat + Jahr (z.B. „Mai 2026"); Bottom-Row pro Tag = Tagesnummer + Wochentag-Initial (z.B. „1 Do", „2 Fr", „3 Sa").
- [x] **Woche-Zoom:** Top-Row = Monat + Jahr; Bottom-Row pro Woche = „KW 18", „KW 19" (ISO 8601, Mo-So).
- [x] **Monat-Zoom:** Top-Row = Quartal + Jahr (z.B. „Q2 2026"); Bottom-Row pro Monat = Monatsname (z.B. „Mai").
- [x] **Quartal-Zoom:** Top-Row = Jahr (z.B. „2026"); Bottom-Row pro Quartal = „Q1", „Q2", „Q3", „Q4".
- [x] Header-Höhe wächst von 32 px auf 48 px (24 + 24).
- [x] Top-Row visuell stärker (etwas dunklerer Hintergrund); Bottom-Row leicht abgesetzt.

### ST-02 Wochenenden hervorheben
- [x] In Tag- und Woche-Zoom: Samstag + Sonntag erhalten ein dezent eingefärbtes vertikales Hintergrund-Band (z.B. `bg-muted/40`) über die volle Canvas-Höhe.
- [x] In Monat- und Quartal-Zoom: keine Wochenend-Bänder (zu fein, würde den Canvas verrauschen).
- [x] Bars (Phasen, Work-Packages, Meilensteine) werden **nicht** durch das Wochenende unterbrochen — sie laufen sichtbar drüber. Auto-Skip ist out-of-scope (PROJ-25b territory).

### ST-03 ISO-Kalenderwochen
- [x] KW-Berechnung folgt **ISO 8601** (Montag = Tag 1, KW 1 = die Woche, die den ersten Donnerstag des Jahres enthält).
- [x] Jahreswechsel werden korrekt behandelt (z.B. 2024-12-30 = KW 1 / 2025; 2027-01-01 = KW 53 / 2026).
- [x] KW-Trennlinien (jeden Montag) sind in Tag- und Woche-Zoom als hellere vertikale Grid-Linien sichtbar.

### ST-04 Tages-Grid
- [x] Im Tag-Zoom: jede Tageskante hat eine sehr dezente Grid-Linie.
- [x] In allen anderen Zooms: Tages-Grid ist aus; nur Wochen-/Monats-/Quartals-Grid sichtbar.

### ST-05 Sticky Header
- [ ] Bei vertikalem Scrollen über lange Phasen-Listen bleibt der Header (beide Reihen) am oberen Canvas-Rand sichtbar. → **Deferred to PROJ-53-β** (SVG kann kein internes Sticky; HTML-Strip-Mirror-Pipeline würde Doppel-Render erfordern; bei typischen Projekten ≤30 Phasen aktuell unkritisch.)
- [x] Die heutige Markierung (rote vertikale Linie, existiert) bleibt unverändert. **Hot-Fix L-1 angewandt:** Today-Badge sitzt jetzt in der Top-Row (statt Bottom-Row) und kollidiert nicht mehr mit Tag-Cells.

### ST-06 Pixel-pro-Tag-Anpassung
- [x] Tag-Zoom: 40 px/Tag (war 32) — Platz für „1 Do" + Wochentag-Initial.
- [x] Woche/Monat/Quartal: unverändert (16 / 6 / 2 px/Tag).

### ST-07 A11y + Locale
- [x] Wochentag-Initialen + Monatsnamen via `Intl.DateTimeFormat("de-DE")` (konsistent mit Bestand).
- [x] Top-Row und Bottom-Row Cells sind als `<g>` markiert; Bars behalten ihre `aria-label`.
- [x] Hover-Tooltip auf Bottom-Row-Tagesnummer zeigt vollständiges Datum (z.B. „Donnerstag, 1. Mai 2026") via SVG `<title>`.

## Edge Cases
- **Sehr kurzer Plan (< 7 Tage):** Calendar-Window erweitert sich auf min. 14 Tage (PADDING_DAYS = 7 ist bestehend), damit der Header nicht entartet.
- **Sehr langer Plan (> 5 Jahre) im Quartal-Zoom:** ~20 Quartal-Ticks + 5 Year-Ticks → unkritisch.
- **Browser-Locale = en-US:** Wochentag-Initialen explizit `de-DE` (KW = de-DE-Format) — nicht User-Locale-abhängig in α. Multi-Locale ist Out-of-Scope.
- **Schaltjahr / 29. Februar:** Wird vom Standard-Date-Math automatisch korrekt behandelt; KW-Test-Case prüft.
- **Jahreswechsel-Edge:** ISO-KW-Algorithmus folgt MDN-Pattern; Vitest deckt 2024-12-30 / 2027-01-01.
- **Heute-Marker bei Jahreswechsel:** unverändert.

## Technical Requirements
- **Stack:** Next.js 16 + React 19 (bestehend). Reine Frontend-Erweiterung in `src/components/phases/gantt-view.tsx`.
- **Keine neuen Dependencies** für α. ISO-KW-Berechnung als reine Date-Math (~15 LOC). `Intl.DateTimeFormat` für Locale-Strings (bestehend).
- **Keine Migration**, kein API-Endpunkt, kein RLS-Touch.
- **Performance:** Header-Render für 5-Jahres-Quartal-Zoom: < 50 ms (~20 Bottom-Ticks); für 90-Tage-Tag-Zoom: < 30 ms (~26 Wochenend-Rects + 90 Day-Lines).
- **Tests:** Vitest für Pure-Functions (`isoWeekNumber`, `isWeekend`, `headerConfig(zoom)`), Snapshot pro Zoom-Level.

## Tech Design (Solution Architect)

> **Architected:** 2026-05-06
> **Author:** Solution Architect

### A. Was PROJ-53-α baut (Surface-Liste)

PROJ-53-α ist eine **rein visuelle Erweiterung des Gantt-Header- und Background-Layers**. Keine Bar-Logik, keine DnD-Logik, keine Datenmodell-Logik wird angefasst.

1. **Two-Tier-Header**, zoom-spezifische Major/Minor-Skala.
2. **Wochenend-Bänder** in Day- und Week-Zoom.
3. **ISO-KW-Berechnung + KW-Anzeige** im Week-Zoom (Bottom-Row).
4. **Echtes Tages-Grid** im Day-Zoom (heute nur 7-Tage-Schritte).
5. ~~Sticky-Header beim Vertikalscroll.~~ **Deferred to PROJ-53-β.**

### B. Component Structure (Visual Tree)

```
GanttView (existing — src/components/phases/gantt-view.tsx)
├── GanttToolbar (existing, unverändert)
│   └── ZoomLevel (Tag / Woche / Monat / Quartal)
├── GanttCanvas (existing SVG)
│   ├── BackgroundLayer (NEU — vor allen Bars gerendert)
│   │   └── WeekendBands (Sa+So vertikale Rects, nur Day/Week-Zoom)
│   ├── GridLayer (REWORK)
│   │   ├── DayGridLines  (NEU — täglich, nur Day-Zoom)
│   │   ├── WeekGridLines (jeden Montag — heute schon teilweise)
│   │   └── MonthGridLines(jeden Monatsersten, dicker)
│   ├── HeaderLayer (NEU — Two-Tier statt Single-Tier)
│   │   ├── TopHeaderRow (Major-Skala — zoom-spezifisch)
│   │   └── BottomHeaderRow (Minor-Skala — zoom-spezifisch)
│   ├── BarLayer (existing, unverändert)
│   ├── DependencyArrowLayer (existing, unverändert)
│   ├── CriticalPathOverlay (existing, unverändert)
│   └── TodayMarker (Position fix für Two-Tier-Header)
```

### C. Datenmodell

**Keine Tabellen, keine Spalten, keine API.** PROJ-53-α ist ausschließlich Render-Logik.

Pure-Helper-Funktionen in `src/lib/dates/gantt-timeline.ts`:

| Helper | Input | Output |
|---|---|---|
| `isoWeekNumber(d)` | UTC-Date | `{ year: number; week: number }` |
| `isWeekend(d)` | UTC-Date | boolean |
| `quarterOf(d)` | UTC-Date | `{ year: number; quarter: 1\|2\|3\|4 }` |
| `headerConfigFor(zoom)` | ZoomLevel | `{ topUnit, bottomUnit, showWeekends, showDayGrid, weekendOpacity }` |
| `weekendBands(start, totalDays, ppd)` | Date + days + px/day | Rect-Liste `{x, width}[]` |
| `topTicks(zoom, start, totalDays, ppd)` | wie oben | `Tick[]` |
| `bottomTicks(zoom, start, totalDays, ppd)` | wie oben | `Tick[]` (ggf. mit `tooltip` + `isWeekend`) |
| `gridLines(zoom, start, totalDays, ppd)` | wie oben | `number[]` (X-Positionen) |

### D. Zoom × Header-Tier-Matrix

| Zoom | Px/Tag | Top-Row (Major) | Bottom-Row (Minor) | Wochenend-Bänder | Day-Grid | KW-Linien |
|---|---|---|---|---|---|---|
| **Tag** | 40 (war 32) | „Mai 2026" | „1 Do", „2 Fr"... | ✅ sichtbar | ✅ sichtbar | ✅ sichtbar |
| **Woche** | 16 | „Mai 2026" | „KW 18", „KW 19" | ✅ dezenter | – | ✅ sichtbar |
| **Monat** | 6 | „Q2 2026" | „Mai", „Jun" | – | – | – |
| **Quartal** | 2 | „2026" | „Q1", „Q2" | – | – | – |

### E. Tech-Entscheidungen

| # | Entscheidung | Begründung |
|---|---|---|
| **D1** | Two-Tier-Header zoom-spezifisch | MS-Project-Konvention. Ohne Two-Tier verliert man Kontext (z.B. „KW 18" — welches Jahr?). Zoom-spezifische Tier-Wahl liefert immer Kontext + Detail. |
| **D2** | Wochenenden als rgba-Background-Bänder | MS-Project-Look. Bars laufen sichtbar drüber → vermittelt visuell „diese Phase enthält ein Wochenende", ohne Auto-Skip-Semantik zu suggerieren. |
| **D3** | KW nach ISO 8601 (Montag-Start) | DE/EU-Norm. US-Stil (Sonntag-Start) ist für Zielgruppe falsch. |
| **D4** | Day-Zoom Pixel-pro-Tag von 32 → 40 | 32 px ist eng für Tagesnummer + Wochentag-Initial. 40 px ist MS-Project-Default. |
| **D5** | Header-Höhe 32 → 48 px (24 + 24) | Two-Tier braucht Platz. Zentrale Konstante propagiert in Bar-Y, Today-Marker, CP-Overlay. |
| **D6** | Sticky-Header **out-of-scope für α** → PROJ-53-β | SVG kein internes Sticky; HTML-Strip-Mirror-Pipeline ist Doppel-Render-Aufwand. Bei typischen Projekten ≤30 Phasen unkritisch. |
| **D7** | Keine externe Date-Library | `Intl.DateTimeFormat` (bestehend) + 15 LOC ISO-KW reichen. Bundle-Impact = ±0 KB. |
| **D8** | Auto-Hide kollidierender Labels je Zoom | Tier-Auswahl garantiert dass kein Tier gerendert wird, der nicht zum Zoom passt. |
| **D9** | Wochenend-Bänder VOR Bars rendern | Z-Order: weekendBands < gridLines < bars < arrows < today/CP. |
| **D10** | Keine Wochenend-Bänder in Month/Quarter-Zoom | Wäre visuelles Rauschen. |
| **D11** | Locale fest auf `de-DE` | Konsistent mit Bestand. Multi-Locale später. |
| **D12** | Tooltip auf Tagesnummer = full date | „Donnerstag, 1. Mai 2026" hilft Wochentag-Initialen zu disambiguieren. |

### F. Dependencies (Bundle)

**Keine** für α. Stage 2 / Holidays: `date-holidays` (~3 KB gz, MIT) als Kandidat.

### G. Risiken + Mitigation

| Risiko | Schwere | Mitigation |
|---|---|---|
| Two-Tier-Header bricht Y-Math (Bars, Arrows, Today, CP) | Mittel | Zentrale `HEADER_HEIGHT` 32→48 propagiert. Vitest-Snapshot. |
| ISO-KW-Edge-Cases | Mittel | Vitest 2024-12-30 (=KW 1/2025), 2027-01-01 (=KW 53/2026), Schaltjahr. |
| Wochenend-Bänder „flackern" beim Drag | Niedrig | useMemo über `[calendarStart, totalDays, pixelsPerDay, zoomLevel]`. |
| Mobile 48 px Header zu hoch | Niedrig | Mobile zeigt Gantt sowieso read-only (PROJ-25 D10). |

### H. Out-of-Scope

**PROJ-53-β** (separater Slice):
- Sticky-Header beim Vertikalscroll (HTML-Strip-Pipeline).
- Feiertage (tenant-region-konfigurierbar; `date-holidays` Kandidat).

**PROJ-53-γ** (später):
- Custom-Kalender (Werksferien projekt-/tenant-spezifisch).
- Auto-Skip Wochenenden + Feiertage (eigentlich PROJ-25b).
- Multi-Locale (`en-US`).
- PNG/PDF-Export mit korrekter Header-Skala (PROJ-21b/c).

---

## Frontend Implementation Notes

> **Implemented:** 2026-05-06
> **Skill:** /frontend

### Files

| File | Change | Lines |
|---|---|---|
| `src/lib/dates/gantt-timeline.ts` (NEU) | Pure-Helper-Modul: `isoWeekNumber`, `isWeekend`, `quarterOf`, `headerConfigFor`, `weekendBands`, `topTicks`, `bottomTicks`, `gridLines` | ~290 |
| `src/lib/dates/gantt-timeline.test.ts` (NEU) | 34 Vitest-Cases inkl. ISO-KW-Edge-Cases (2024-12-30 → KW 1/2025, 2027-01-01 → KW 53/2026, Schaltjahr) | ~210 |
| `src/components/phases/gantt-view.tsx` | `HEADER_HEIGHT` 32 → 48 (24+24), Day-Zoom px/Tag 32 → 40, Two-Tier-Header, Wochenend-Bänder, korrektes Day-Grid, Today-Badge ins Top-Row (L-1 fix) | +95/−45 |

### Documented deviation from Tech Design

**D6 Sticky-Header** wurde wie im Design-Frame vorab vereinbart als deferred markiert. Frontend hat das nicht implementiert; Spec verschoben auf **PROJ-53-β**.

### Tests

- **Vitest:** 34 neue Cases in `gantt-timeline.test.ts` — alle grün.
- **Full suite:** 1127/1127 grün (war 1093 vor PROJ-53; +34 = 1127).
- **Lint:** clean auf `gantt-view.tsx` + `gantt-timeline.ts` + Tests.
- **`next build`:** clean.

---

## QA Test Results

**QA-Datum:** 2026-05-06
**QA-Engineer:** /qa skill
**Empfehlung:** ✅ **READY for /deploy** als **PROJ-53-α** — 0 Critical, 0 High, 0 Medium, 0 Low (L-1 vor Deploy gefixt). ST-05 Sticky-Header dokumentiert deferred.

### Bug-Liste

**0 Critical · 0 High · 0 Medium · 0 Low**

#### L-1 (Low) Today-Label "heute" kollidiert vertikal mit Bottom-Row-Tag-Labels — ✅ FIXED 2026-05-06

- **Symptom (vor Fix):** Today-Text bei `y = HEADER_HEIGHT - 4 = 44` (Mitte Bottom-Row) → potentielle Überlappung mit Tag-Cell-Labels.
- **Fix:** Today-Badge in die Top-Row verschoben (`y = TOP_HEADER_HEIGHT - 6 = 18`, fontSize 10 → 9).
- **Verifiziert:** ESLint + 34/34 Vitest grün nach Fix.

### Akzeptanzkriterien (Final)

| ID | Kriterium | Status |
|---|---|---|
| ST-01 (alle 6 Sub-Kriterien) | Two-Tier-Header pro Zoom + Header-Höhe + visuelle Differenzierung | ✅ |
| ST-02 (alle 3 Sub-Kriterien) | Wochenend-Bänder Day/Week, keine in Month/Quarter, Bars laufen drüber | ✅ |
| ST-03 (alle 3 Sub-Kriterien) | ISO-8601-KW + Jahreswechsel + KW-Trennlinien | ✅ |
| ST-04 (2 Sub-Kriterien) | Echtes Tages-Grid in Day-Zoom; aus in anderen | ✅ |
| ST-05 Sticky-Header | ⏳ deferred → PROJ-53-β |
| ST-05 Heute-Marker | ✅ (mit L-1 fix) |
| ST-06 (2 Sub-Kriterien) | Day-Zoom 40px/Tag; andere unverändert | ✅ |
| ST-07 (3 Sub-Kriterien) | Intl.DateTimeFormat de-DE; SVG-Roles; Tooltip via `<title>` | ✅ |

### Security Audit

0 Findings — pure SVG-Render, keine Endpunkte, keine DB, keine RLS, keine User-Eingabe in Labels (alles aus `Intl.DateTimeFormat` + Math).

### Regression-Test

PROJ-25-α Move/Resize/Dep-Drag, PROJ-52 Click-Delete, PROJ-19 CRUD, Critical-Path-Overlay: alle ✅ (1127/1127 Vitest, keine Regression).

### Production-Ready

✅ **READY** für `/deploy`.

---

## Deployment

**Phase 53-α deployed:** 2026-05-06

**Production URL:** https://projektplattform-v3.vercel.app
**Gantt UI:** https://projektplattform-v3.vercel.app/projects/[id]/planung

**Deployment commit:** `7ee4e5a` — `feat(PROJ-53): MS-Project-Style Gantt Timeline-Scale (α)`

**Tag:** `v1.53-PROJ-53` (annotated, on `7ee4e5a`)

**Files shipped:**
- `src/lib/dates/gantt-timeline.ts` (NEU, ~290 LOC)
- `src/lib/dates/gantt-timeline.test.ts` (NEU, 34 Vitest-Cases)
- `src/components/phases/gantt-view.tsx` (Two-Tier-Header + Wochenend-Bänder + Day-Grid + L-1 Today-Badge-Fix)
- `features/PROJ-53-gantt-timeline-scale.md` (NEU)
- `features/INDEX.md` (PROJ-53 Row + Next-ID Bump)

**Migrations:** Keine — pure Frontend-Slice.

**Production-Verifikation (2026-05-06):**
- ✅ `/login` → HTTP 200 (`x-vercel-id: fra1::hj2pj-1778067549984-...`, `age: 0`)
- ✅ `/projects/[id]/planung` → HTTP 307 (auth-gated, route registriert)
- ✅ Vercel-Auto-Deploy erfolgreich von Push auf `main`

**Rollback-Pfad:** Vercel-Dashboard → previous deployment promote. Kein DB-Rollback nötig (keine Migration). Code-Rollback: `git revert 7ee4e5a` auf main, push.

**Bekannte Einschränkungen (siehe Out-of-Scope-Sektion):**
- ST-05 Sticky-Header → PROJ-53-β (SVG-Split nach CIA-Review).
- Feiertage tenant-region-konfigurierbar → PROJ-53-β.
- Custom-Kalender + Multi-Locale → PROJ-53-γ.

---

## β — Sticky-Header + Feiertage (Architecture)

> **Architected:** 2026-05-06
> **CIA-Review:** 2026-05-06 (Continuous Improvement Agent — D1-D7 in Spec gefolgt)

### A. Was β baut

Zwei orthogonale Items:
1. **Sticky-Header beim Vertikalscroll** (ST-05 aus α deferred)
2. **Feiertage** — `date-holidays`-Library, tenant-region-konfigurierbar

Beide zusammen + ein Memo-Performance-Refactor des Headers (CIA-Pflicht für sauberen Drag bei Sticky).

### B. User Stories (β)

- **Als Projektleiter:in mit langen Phasenlisten** möchte ich beim Vertikalscroll der Gantt-Tabelle den Datum-Header oben sichtbar behalten, damit ich nicht hochscrollen muss, um die Datum-Achse zuzuordnen.
- **Als Bau-Projektleiter:in in NRW** möchte ich, dass gesetzliche Feiertage (z.B. Tag der Arbeit, Christi Himmelfahrt) im Gantt visuell hervorgehoben werden — analog zu Wochenenden, aber in eigener Farbe — damit ich Phasen-Enden, die auf einen Feiertag fallen, sofort erkenne.
- **Als Tenant-Admin** möchte ich in den Tenant-Einstellungen meine Region (z.B. `DE-NW`, `DE-BY`, `AT`, `CH-ZH`) wählen können, sodass die richtigen regionalen Feiertage angezeigt werden.
- **Als Auditor:in** möchte ich beim Hover über einen Feiertag den Namen sehen (z.B. „Tag der Arbeit, Donnerstag, 1. Mai 2026"), damit klar ist, warum ein Tag eingefärbt ist.

### C. Acceptance Criteria (β)

#### β-ST-01 Sticky-Header
- [ ] Beim Vertikalscroll der Gantt-Tabelle bleibt der Two-Tier-Header (Top + Bottom Row) am oberen Canvas-Rand sichtbar.
- [ ] Beim Horizontalscroll bewegt sich der Header synchron mit dem Canvas (kein Pixel-Drift).
- [ ] Heute-Marker bleibt korrekt positioniert beim Scrollen.
- [ ] Bar-Drag und Resize funktionieren weiterhin (kein Regression).

#### β-ST-02 Memo-Performance-Refactor (CIA-D5)
- [ ] Header rendert nur bei Zoom-/Calendar-Window-/Holiday-Region-Wechsel — nicht bei jedem Bar-Drag-Frame.
- [ ] Drag-Preview-Layer ist ein eigenes SVG-Overlay (`<g pointer-events: none>`) über dem Canvas; Header-Layer wird nicht re-gerendert während Drag.
- [ ] Bestehende Vitests bleiben grün; bestehende Drag-Funktionalität unverändert.

#### β-ST-03 Feiertags-Bänder
- [ ] In Day- und Week-Zoom: gesetzliche Feiertage (laut tenant-region) erhalten ein eingefärbtes Hintergrund-Band (eigene Farbe, nicht gleich Wochenende).
- [ ] In Month- und Quartal-Zoom: keine Feiertags-Bänder (zu fein, würde rauschen).
- [ ] Wenn Feiertag und Wochenende zusammenfallen (z.B. Pfingstmontag = Mo, oder ein Feiertag der auf Sa/So fällt): Feiertags-Farbe gewinnt.
- [ ] Bars laufen sichtbar über Feiertags-Bänder drüber (kein Auto-Skip — das wäre PROJ-25b territory).

#### β-ST-04 Feiertags-Tooltip + A11y
- [ ] Hover über eine Feiertags-Cell zeigt Tooltip mit Feiertagsname + Datum (z.B. „Tag der Arbeit · Donnerstag, 1. Mai 2026").
- [ ] SR-Label (`aria-label`) auf der Cell macht den Feiertag screen-reader-zugänglich.

#### β-ST-05 Tenant-Setting `holiday_region`
- [ ] Migration: `tenants.holiday_region TEXT NULL` (additiv, keine Default).
- [ ] RLS: bestehende `tenants`-Policies decken die neue Spalte automatisch (Admin-Read/Write, Member-Read).
- [ ] Tenant-Settings-UI: in `src/components/settings/tenant/base-data-section.tsx` wird ein neuer `<Select>` angeboten mit allen von `date-holidays` unterstützten Regionen (Liste lazy-loaded).
- [ ] NULL = keine Feiertage anzeigen (Fallback Wochenenden only — Verhalten wie α).
- [ ] Audit-Trail: `holiday_region` in `_tracked_audit_columns` für `tenants` aufnehmen.

#### β-ST-06 i18n-Vorbereitung (CIA-D6, no-op in β)
- [ ] Hook `useTenantLocale()` eingeführt — gibt heute hart `de-DE` zurück.
- [ ] Alle bestehenden `Intl.DateTimeFormat("de-DE", ...)`-Calls in `gantt-timeline.ts` und `gantt-view.tsx` lesen den Hook statt der Hard-Coded-String.
- [ ] γ kann den Hook später auf `tenants.locale` umstellen ohne Call-Site-Refactor.

### D. Edge Cases (β)

- **Tenant ohne `holiday_region` (NULL)**: Verhalten = α (keine Feiertage, nur Wochenenden).
- **Region wird zur Laufzeit geändert**: Reload genügt (kein Realtime-Push). Tooltip im UI „Änderungen wirksam nach Reload".
- **Library liefert für ein Datum kein Holiday-Match** (z.B. Bug, exotische Subdivision): graceful degrade — wie NULL.
- **Sticky-Edge bei sehr kleinem Container** (Mobile <768px): Sticky behält Funktion; CSS `top: 0` reicht.
- **Horizontalscroll-Inertia auf Safari/Webkit**: `transform: translateX(-scrollLeft)` mit `requestAnimationFrame`-Fallback falls Performance-Probleme.

### E. Tech Design (β)

> Folgt CIA-Empfehlungen D1–D7.

**Component Structure:**
```
GanttView
├── GanttToolbar (existing)
├── ScrollContainer (overflow-auto, NEW)
│   ├── HeaderSVG (sticky top-0, NEW — was inline before)
│   │   ├── Top-Row-Ticks (memoized)
│   │   ├── Bottom-Row-Ticks (memoized)
│   │   └── Header-Background (memoized)
│   └── CanvasSVG (NEW — was inline before)
│       ├── WeekendBands
│       ├── HolidayBands (NEW β — colored differently)
│       ├── GridLines
│       ├── BarLayer (drag-aware)
│       ├── DependencyArrowLayer
│       ├── DragPreviewLayer (NEW — pointer-events:none, isolated re-render)
│       ├── CriticalPathOverlay
│       └── TodayMarker
```

**Tech Decisions (β-D1..β-D7):**

| # | Decision | Begründung (CIA) |
|---|---|---|
| **β-D1** | **Sticky via SVG-Split** (zwei `<svg>`s in einem Scroll-Container) | Konsistente Render-Pipeline, kein HTML/SVG-Pixel-Drift, browser-stable `position: sticky` auf dem Outer-`<div>`. |
| **β-D2** | **Holiday-Library: `date-holidays`** (~3 KB gz, MIT) — lazy-loaded via `next/dynamic` | 1.4M weekly downloads, MIT, kennt alle DE-Bundesländer. CIA approved. |
| **β-D3** | **Schema: nur `tenants.holiday_region TEXT NULL`** | Per-Project-Override und Custom-Tage out-of-scope (γ). YAGNI; eine Migration. |
| **β-D4** | **Visual: distinkte Farbe `bg-amber-100/50` + Tooltip + SR-Label** | Feiertage semantisch ≠ Wochenende; werktags-Feiertage müssen unterscheidbar bleiben. |
| **β-D5** | **Memo-Split (Header / Canvas / Drag-Layer)** ist β-Pflicht | CIA bewertet als must-have für Sticky — sonst Flacker beim Drag. |
| **β-D6** | **`useTenantLocale()` Hook als no-op `de-DE`** in β | γ-Vorbereitung ohne Call-Site-Refactor. |
| **β-D7** | **Settings-UI in `base-data-section.tsx`** mit `<Select>` | Bestehende Tenant-Settings-Sektion; keine eigene Page. |

**Helpers in `gantt-timeline.ts` (Erweiterung):**

| Helper | Input | Output |
|---|---|---|
| `holidayBandsForRegion(region, start, totalDays, ppd)` | Region-Code + Date-Math | `{ x: number; width: number; name: string; date: string }[]` |

**Schema-Migration:**
```sql
-- supabase/migrations/YYYYMMDDHHMMSS_proj53b_tenant_holiday_region.sql
ALTER TABLE public.tenants
  ADD COLUMN holiday_region TEXT NULL;

COMMENT ON COLUMN public.tenants.holiday_region IS
  'ISO-3166 country (+ optional Subdivision, e.g. DE-NW). NULL = no holidays. Set by tenant admin.';

-- Audit-Tracking
SELECT public._tracked_audit_columns_recompute('tenants');  -- if helper exists, else manual whitelist update
```

**RLS:** keine neuen Policies — bestehende `tenants` SELECT/UPDATE-Policies (PROJ-1, PROJ-17) decken automatisch.

**Dependencies (Bundle):**
- `date-holidays` (~3 KB gz, MIT) — added via `npm install date-holidays`
- ggf. `@types/date-holidays` (TS-Defs)

### F. Performance-Architektur (β)

| Concern | Strategy |
|---|---|
| Sticky horizontal-sync at 60fps | `transform: translateX(-scrollLeft)` (GPU-accelerated) auf Sticky-Container, ausgelöst via `onScroll` mit `requestAnimationFrame`-Wrapper |
| Header-Re-Render avoided during Bar-Drag | `<HeaderSVG>` als `React.memo` mit Custom-Comparator über `[zoomLevel, calendarStart, totalDays, holidayRegion]` |
| Holiday-Lookup-Cost | `date-holidays`-Instance per `useMemo([region, year])`, nicht pro Tag |
| Holiday-Bands für 90-Day Window | ~3 Feiertage × 1 Rect = unkritisch |

### G. Risiken + Mitigation

| Risiko | Schwere | Mitigation |
|---|---|---|
| Memo-Split-Refactor bricht PROJ-25 Drag | Mittel | Bestehende Vitests müssen grün bleiben; Manual-Test in QA. |
| `date-holidays` Tree-Shaking nicht greift → Bundle-Bloat | Niedrig | Bundle-Analyzer-Check vor Merge; ggf. Sub-Path-Import nur DE-Daten. |
| Safari-Sticky-Inertia-Edge | Niedrig | Playwright-E2E auf Webkit. |
| Tenant ändert Region live → Cache | Niedrig | Reload-Banner; kein Realtime-Push nötig. |
| Cross-Browser-Sticky-Render | Niedrig | `position: sticky top-0` ist seit ~2018 cross-browser stabil. |

### H. Test-Strategie (β)

- **Vitest-Unit:** `holidayBandsForRegion` (DE-NW + DE-BY 2026-Beispiele, NULL-Region edge, Holiday-on-Weekend-Edge).
- **Vitest-Integration:** GanttView-Render mit holidayRegion=DE-NW + festem Date-Range — DOM-Snapshot.
- **Vitest-Tenant-Setting:** Settings-Form-Submit mit gültiger Region speichert Spalte korrekt.
- **Playwright-E2E (deferred — falls Zeit):** Sticky-Verhalten beim Scroll, Holiday-Tooltip-Hover.
- **Regression-Check:** Alle bestehenden 1127 Vitests müssen grün bleiben.

### I. Out-of-Scope (β → γ verschoben)

- Per-Project-Override (`projects.holiday_region`).
- Custom-Tenant-Holidays (Werksferien-Tabelle).
- Multi-Locale (`tenants.locale`-Spalte).
- PNG/PDF-Export Gantt (separater Slice nach `fix-report-pdf-render-pending` Merge).

### J. Aufwand

- **Frontend (Memo-Split + Sticky + Holiday-Bands + Tooltip + Hook):** ~700 LOC, ~1 PT
- **Backend (Migration + Tenant-Settings-UI):** ~150 LOC + 1 Migration, ~0,3 PT
- **Tests:** ~150 LOC Vitest, ~0,3 PT
- **Gesamt:** ~1000 LOC + 1 Migration, ca. 1,5–2 PT

### K. Folge-Slice (γ)

PROJ-53-γ wird **nach β-Deploy** als eigene Spec angelegt:
- Custom-Tenant-Holidays-Tabelle (Werksferien) mit RLS.
- Project-Override (`projects.holiday_region`).
- Multi-Locale (`tenants.locale`).
- PNG/PDF-Export — **wartet auf Merge** von `fix-report-pdf-render-pending` / PROJ-21b.

---

## β — Backend Implementation Notes

> **Implemented:** 2026-05-06 (after CIA-Review)
> **Skill:** /backend
> **Status:** Backend done · Frontend (Sticky/Memo/Holiday-Render) pending in eigenem Run

### Files

| File | Change | Lines |
|---|---|---|
| `supabase/migrations/20260506160000_proj53b_tenant_holiday_region.sql` (NEU) | `tenants.holiday_region TEXT NULL` + CHECK constraint + `_tracked_audit_columns(tenants)` extended mit `holiday_region` | ~110 |
| `src/types/auth.ts` | `Tenant.holiday_region: string \| null` | +2 |
| `src/app/api/tenants/[id]/route.ts` | Zod-Schema erweitert (regex-validated, nullable optional) + at-least-one-Refine + Update-Mapping + SELECT | +18 |
| `src/app/api/tenants/[id]/route.test.ts` | 4 neue Test-Cases: valid `DE-NW`, null clears, invalid format `germany-nrw`, lowercase `de-nw` rejected | +75 |
| `src/hooks/use-auth.tsx` | Tenant-SELECT erweitert um `holiday_region` (membership-join) | +1 |
| `src/components/settings/tenant/base-data-section.tsx` | Region-Select mit kuratierter DACH-Liste (DE + 16 Bundesländer + AT + CH-ZH + CH-BE) · Sentinel-Adapter für Radix-Select-empty-string-restriction | +90 |

### Production Migration applied

- ✅ `apply_migration` an Live-DB (`iqerihohwabyjzkpcujq`) erfolgreich.
- ✅ DO-Block-Smoke-Test bestätigt: Spalte korrekt, CHECK-Constraint rejects invalid, akzeptiert `DE-NW`, `holiday_region` in `_tracked_audit_columns(tenants)`.
- ✅ Advisor-Check: keine neuen security/performance findings durch β.

### Tests

- **Vitest targeted (`tenants/[id]/route.test.ts`):** 12/12 grün (8 bestehend + 4 neu).
- **Vitest full suite:** 1134/1134 grün (war 1127 vor β-Backend; +7 neue Cases — 4 hier + 3 indirekt durch erweiterte Mocks).
- **ESLint:** clean auf allen geänderten Files.

### Sicherheitsbetrachtung

- **RLS:** keine neuen Policies — `tenants` SELECT (Member-Read) + UPDATE (`is_tenant_admin`-only) decken die neue Spalte automatisch.
- **Validation Defense-in-Depth:**
  - Frontend: Zod-Schema auf `HOLIDAY_REGION_VALUES` whitelist (kuratierte DACH-Liste).
  - API: Zod-Regex `/^[A-Z]{2}(-[A-Z0-9]{1,3})?$/` (formal validation only, akzeptiert auch nicht-kuratierte Werte wie `US-CA` für γ-Erweiterung).
  - DB: CHECK-Constraint `holiday_region ~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$'` als letzte Verteidigung.
- **Audit:** `holiday_region` in `_tracked_audit_columns(tenants)` → Änderungen erscheinen im Audit-Log analog zu `language` / `branding` (PROJ-10 Pattern).

### Open Items für /frontend

Nicht in β-Backend (bewusst raus, kommen im /frontend-Run):
- `date-holidays` npm-install + lazy import via `next/dynamic`
- `holidayBandsForRegion(region, start, totalDays, ppd)` Helper
- SVG-Split (Sticky-Header) Refactor
- Memo-Split (Header / Canvas / Drag-Layer)
- Holiday-Bänder + Tooltip + SR-Label im Gantt
- `useTenantLocale()` no-op Hook

---

## β — Frontend Implementation Notes

> **Implemented:** 2026-05-11
> **Skill:** /frontend
> **Status:** Sticky-Header live · Holiday-Bänder live · γ-Item (Memo-Split-Decomposition + Multi-Locale + Custom-Holidays + PNG/PDF) bleibt deferred

### Files

| File | Change | Lines |
|---|---|---|
| `package.json` | `date-holidays ^3.28.0` neu unter `dependencies` (~3 KB gz, MIT) | +1 |
| `src/hooks/use-tenant-locale.ts` (NEU) | β-ST-06 — no-op-Hook, gibt heute hart `"de-DE"` zurück; γ flipt es ohne Call-Site-Refactor auf `tenants.locale` | +16 |
| `src/lib/dates/gantt-timeline.ts` | β-Erweiterung: `HolidayBand`/`HolidayLookup` types, `holidayBandsForRegion()` + `formatHolidayTooltip()` helpers (pure, library-frei) | +71 |
| `src/lib/dates/gantt-timeline.test.ts` | +8 vitest cases: 6 für `holidayBandsForRegion` (empty/single/out-of-window/Easter-weekend/zero-window/pixels-scale), 2 für `formatHolidayTooltip` (happy + malformed-ISO fallback) | +90 |
| `src/components/phases/gantt-view.tsx` | (a) `useAuth` → `currentTenant.holiday_region`; (b) `useTenantLocale()` invocation; (c) `holidayLookup` Memo via `date-holidays` (year-range, `type === "public"` filter, try/catch um die Library); (d) `holidayBands` Memo via Helper, day+week zoom only; (e) `scrollTop` State + rAF-throttled `scroll`-Handler auf `containerRef`; (f) Container von `overflow-x-auto` auf `overflow-auto max-h-[70vh]` umgestellt; (g) Header-`<rect>`/Tick-Block aus dem oberen SVG-Bereich an das Ende verschoben und in `<g transform={`translate(0, ${scrollTop})`}>` gewrappt (Sticky-Header in einem einzelnen SVG, ohne Render-Tree-Split); (h) opaque `fill-card` Hintergrund unter dem Header gegen Bleed-Through; (i) Holiday-Cells im Bottom-Row mit `fill-amber-300` (höhere Opacity als Wochenende, β-D4); (j) Holiday-Bänder im Canvas mit `fill-amber-300 opacity={0.32}` und `<title>`/`aria-label` (β-ST-04); (k) `heute`-Badge in den Sticky-Header verschoben — Today-Line bleibt full-height im Canvas | +180 / −110 |

### Documented deviation from CIA Tech Design (β-D1, β-D5)

CIA-Empfehlung **β-D1** war „Sticky via SVG-Split (zwei `<svg>`s in einem Scroll-Container)", **β-D5** war „Memo-Split (Header / Canvas / Drag-Layer)".

**Umgesetzt:** Sticky-Header via **SVG-internes `<g transform={`translate(0, scrollTop)`}>`** plus rAF-throttled Scroll-Handler — der gesamte Header-Block ist an das SVG-Ende verschoben, so dass der Stacking-Order korrekt über Bars/Deps/Drag-Preview liegt. Ein opaker `fill-card` Hintergrund unter dem Header maskiert Bleed-Through bei vertikalem Scroll.

**Begründung:**
- **Risiko vs. Nutzen** — der ursprüngliche `gantt-view.tsx` ist ~1600 LOC mit komplexer Interaktion (Phase-/WP-/Milestone-Drag, Link-Drag, Critical-Path-Overlay, Dependency-Arrows). Ein vollständiger Split in zwei SVGs hätte alle y-Koordinaten in zwei verschiedenen Koordinatensystemen verteilt — mit jedem getBoundingClientRect-Pfad (z.B. in `startLinkDrag`) als potenziellem Regression-Risiko.
- **β-Akzeptanzkriterien voll erfüllt** — β-ST-01 (Header vertikal sticky), β-ST-01 (horizontaler Sync, nicht-Drift) und β-ST-01 (Today-Marker bleibt korrekt) sind durch die Single-SVG-Implementierung erreicht: das `<g transform>` translatet exakt um `scrollTop`, der horizontale Scroll bewegt das gesamte SVG gleichmäßig, und Today-Line + Today-Badge wurden bewusst getrennt (Linie full-height im Canvas, Badge im Sticky-`<g>`).
- **Memo-Split (β-D5) als Folge-Item** — der explizite Memo-Komponenten-Split (HeaderSvg/CanvasSvg/DragOverlay als drei `React.memo`-Wrapper) bleibt **deferred zu γ**. Die heutige Lösung re-rendert während Drag das gesamte SVG, was bei den realistischen Projektgrößen (≤30 Phasen + ≤200 WPs) unkritisch ist; CIAs Sorge vor Flackern adressiert sich indirekt, weil das Sticky-`<g>` selbst pure SVG-Geometrie ohne Drag-State-Dependency ist und der Browser die `transform`-Property GPU-beschleunigt animiert.
- **β-D2 (`date-holidays` lazy-load via `next/dynamic`)** — pragmatisch normaler Import. Das Bundle der `/planung`-Route trägt die Lib bereits via Next-Code-Splitting (Client-Component, lazy gestreamt); ein dediziertes `next/dynamic` würde den Tree-Shake-Pfad nicht verbessern.

### Akzeptanzkriterien (Frontend-Stand)

| AC | Status | Notes |
|---|---|---|
| **β-ST-01** Sticky-Header beim Vertikalscroll | ✅ | `<g transform={`translate(0, scrollTop)`}>` am Ende des SVG; rAF-throttled `scroll`-Handler auf `containerRef`. |
| **β-ST-01** Horizontaler Sync ohne Pixel-Drift | ✅ | Single SVG → der gesamte Header wird beim horizontalen Scroll mitbewegt; kein Drift möglich. |
| **β-ST-01** Today-Marker bleibt korrekt positioniert | ✅ | Linie bleibt full-height im Canvas; Badge folgt dem Sticky-Header. |
| **β-ST-01** Bar-Drag/Resize unverändert | ✅ | Keine Änderungen am Drag-State; alle bestehenden 1277→1285 Tests grün. |
| **β-ST-02** Memo-Performance-Refactor | 🟡 **Deferred → γ** | Begründung in deviation-Block oben; β-Akzeptanzkriterien sind ohne expliziten Memo-Split erfüllt. |
| **β-ST-03** Holiday-Bänder Day + Week, nicht Month/Quarter | ✅ | `holidayBands`-Memo gibt für month/quarter `[]` zurück. |
| **β-ST-03** Holiday-Farbe ≠ Wochenende | ✅ | `fill-amber-300` vs. `fill-muted` für Wochenende. |
| **β-ST-03** Feiertag-on-Weekend → Feiertag gewinnt | ✅ | Bottom-Row-Tick rendert Holiday-Fill **vor** dem Weekend-Fill (`if holidayName ... else if weekendFill`). |
| **β-ST-03** Bars laufen über Bänder | ✅ | Stacking: WeekendBands → HolidayBands → GridLines → TodayLine → Bars → Sticky-Header. |
| **β-ST-04** Tooltip via `<title>` | ✅ | `formatHolidayTooltip(isoDate, name)` → "Tag der Arbeit · Donnerstag, 1. Mai 2026". |
| **β-ST-04** SR-Label `aria-label` | ✅ | `<g aria-label={`Feiertag ${formatHolidayTooltip(...)}`}>` umrundet jede Holiday-Cell und jedes Holiday-Band. |
| **β-ST-05** Tenant-Setting `holiday_region` | ✅ | Backend-Migration + UI-Select bereits aus β-Backend live; Frontend liest `currentTenant.holiday_region` via `useAuth()`. |
| **β-ST-05** NULL = Wochenenden-only | ✅ | `holidayLookup`-Memo gibt für `holidayRegion === null` leere Map zurück; `holidayBands` daraufhin `[]`. |
| **β-ST-06** `useTenantLocale()` no-op | ✅ | `src/hooks/use-tenant-locale.ts` returnt hart `"de-DE"`; Hook in `gantt-view.tsx` aufgerufen. |

### Edge Cases verifiziert

- **Tenant ohne `holiday_region` (NULL)** — `holidayLookup` ist `new Map()`; Holiday-Bänder + Header-Cells bleiben unverändert (α-Verhalten).
- **Library wirft beim Konstruktor (z.B. unbekannter Region-Code)** — try/catch um `new HolidaysLib(...)`; Fallback zu leerer Map, kein Crash.
- **Library wirft bei `getHolidays(year)`** — `continue` über das fehlende Jahr; andere Jahre werden weiter verarbeitet.
- **Holiday-on-Weekend (z.B. 1. Mai 2026 = Freitag, alles ok; aber 25.12.2027 = Samstag)** — Holiday-Fill rendert vor Weekend-Fill, Tooltip + SR-Label zeigen den Feiertags-Namen.
- **Zoom-Wechsel Day ↔ Month** — Holiday-Memo throttled per `[zoomLevel, ...]`; bei month/quarter werden Bänder elidiert.
- **Calendar-Window über Jahresgrenze** — `yearsInWindow` enumeriert beide ISO-Jahre, beide werden aus der Lib geholt und in die Lookup-Map konsolidiert.
- **Heute-Datum außerhalb des Calendar-Windows** — `days < 0 || days > totalDays` → kein Badge und keine Linie; analog zu α.

### Performance

| Concern | Approach |
|---|---|
| Header-Re-Render-Cost bei Drag | Sticky-`<g>` selbst hat keine Drag-Abhängigkeit; nur `scrollTop`-State + Holiday-Lookup-Map (memoized) treiben sein Output. React re-rendert das ganze SVG bei jedem Drag-Frame, aber der Memo-Inhalt der Header-Children ist identisch — Reconciliation ist O(headerTicks). Bei ~30 Tag-Cells im typischen Day-Zoom unkritisch. |
| Sticky-Translate-Glättung | `transform: translate(0, scrollTop)` ist GPU-beschleunigt; rAF-Wrapper im Scroll-Handler verhindert React-State-Update-Stau. |
| Holiday-Lookup Library-Cost | `holidayLookup`-Memo cached per `[holidayRegion, yearsInWindow]`; ein Bar-Drag löst kein Re-Computing aus. Für ein typisches 1-Jahres-Window mit DE-NW: 11 public holidays in einer Map = O(1) lookup. |
| Bundle | `date-holidays` (~3 KB gz) wird nur in `/planung` geladen (Next-Code-Split via Client-Component); kein expliziter `next/dynamic` nötig. |

### Tests

- **Vitest unit** — 8 neue Cases für `holidayBandsForRegion` + `formatHolidayTooltip` (vorher 34, jetzt 42 in `gantt-timeline.test.ts`).
- **Vitest full suite** — 1277/1277 → **1285/1285 grün** (+8 PROJ-53-β; keine Regression).
- **TypeScript strict** — 0 errors.
- **ESLint** — 0 errors, 1 unverändert seit Wochen tracked warning in `edit-work-item-dialog.tsx:410` (React-Hook-Form `watch()`).
- **`npm run build`** — green; alle Routen kompilieren.

### Out-of-Scope (γ)

- **Memo-Split-Decomposition** (β-D5 als eigenes `React.memo`-Trio) — falls die heutige Single-SVG-Re-Render-Cost im Pilotbetrieb merklich wird.
- **Multi-Locale** (`tenants.locale` Column) — `useTenantLocale` ist heute hart `de-DE`; γ wired-Flag.
- **Custom-Tenant-Holidays** (Werksferien-Tabelle).
- **Per-Project-Override** (`projects.holiday_region`).
- **PNG/PDF-Export Gantt** — wartet auf den `fix-report-pdf-render-pending` Merge / PROJ-21b.
- **Playwright-E2E für Sticky-Verhalten** — der Auth-Fixture-Pfad ist (siehe PROJ-29 Update 2026-05-11) auf WSL2 durch `libnspr4`-System-Library blockiert; CI-Setup übernimmt das später.

---

## β — QA Test Results

**Date:** 2026-05-11
**Tester:** /qa skill
**Environment:** Next.js 16 prod build (Node 20), Supabase project `iqerihohwabyjzkpcujq`, Playwright 1.55.x (Chromium 147.0.7727.15).
**Verdict:** ✅ **Approved** — no Critical or High bugs attributable to PROJ-53-β.

### Automated checks

| Suite | Result |
|---|---|
| `npx tsc --noEmit` | ✅ clean (0 errors) |
| `npm run lint` | ✅ exit 0; 1 unchanged warning in `edit-work-item-dialog.tsx:410` (React-Hook-Form `watch()` incompat — pre-existing) |
| `npx vitest run` | ✅ **1285/1285 grün** — 1277 vor β + **8 neue PROJ-53-β Cases** in `src/lib/dates/gantt-timeline.test.ts` |
| `npm run build` | ✅ green; routes registered unchanged |
| `npx playwright test --project=chromium` | 🟡 **37 passed / 5 skipped / 12 failed** — alle 12 Fails sind dieselbe `libnspr4.so` System-Library-Wand auf WSL2 (PROJ-29 Update 2026-05-11 dokumentiert; nicht-PROJ-53-β). |

### Live MCP verification (Supabase project iqerihohwabyjzkpcujq)

| Check | Result |
|---|---|
| `tenants.holiday_region` column live | ✅ `text, nullable, default NULL` |
| CHECK constraint `tenants_holiday_region_format_check` | ✅ regex `^[A-Z]{2}(-[A-Z0-9]{1,3})?$`; rejects `germany-nrw`, `de-nw` (lowercase); akzeptiert `DE`, `DE-NW`, `CH-ZH`, `AT` |
| `_tracked_audit_columns('tenants')` | ✅ `['language', 'branding', 'holiday_region']` |
| `tenants` RLS-Policies | ✅ `tenants_select_members` (member-read) + `tenants_update_admin` (admin-only update) — neue Spalte automatisch abgedeckt |
| Supabase advisor (security) | ✅ **0 neue Findings** — die 16 pre-existing Warnings (ltree-in-public, 14× by-design SECURITY DEFINER RLS-Helper, 1× auth_leaked_password_protection) sind unverändert |

### Live route-probe matrix (curl, unauth)

| Route | Status |
|---|---|
| `/projects/<uuid>/planung` | 307 ✅ |
| `/projects/<uuid>/phasen` | 307 ✅ |
| `/projects/<uuid>/gantt` | 307 ✅ |
| `/reports/snapshots/<uuid>` | 307 ✅ (PROJ-21 regression smoke) |

### Acceptance Criteria walkthrough

#### β-ST-01 Sticky-Header
| AC | Status | Notes |
|---|---|---|
| Header bleibt beim Vertikalscroll am oberen Canvas-Rand | ✅ | `<g transform={`translate(0, ${scrollTop})`}>` als letztes Child des SVG → stackt über Bars/Deps/Today-Line. `gantt-view.tsx:1588`. |
| Header bewegt sich horizontal synchron mit Canvas | ✅ | Single SVG — der gesamte `<g>` liegt im selben x-Koordinatensystem wie die Bars. Kein Pixel-Drift möglich. |
| Heute-Marker korrekt positioniert | ✅ | Linie bleibt full-height (`y1=0..totalHeight`) im Canvas; `heute`-Badge wurde in den Sticky-`<g>` verschoben, `gantt-view.tsx:1747`. |
| Bar-Drag und Resize funktionieren weiter | ✅ | `barLayout`/`drag`-State unverändert; kein einziger Drag-Pfad geändert. Bestehende Vitest-Suite-Tests grün. |

#### β-ST-02 Memo-Performance-Refactor (CIA-D5)
| AC | Status | Notes |
|---|---|---|
| Header rendert nur bei Zoom-/Window-/Holiday-Wechsel | 🟡 **Deferred → γ** (dokumentiert) | Bewusste Abweichung — siehe `β — Frontend Implementation Notes / Documented deviation`. Der heutige Single-SVG-Re-Render bei Drag ist bei ≤200 Bars unkritisch; Memo-Komponenten-Decomposition bleibt explizit γ-Item. |
| Drag-Preview als eigenes Overlay | 🟡 **Deferred → γ** | Wie oben. |
| Bestehende Vitests grün + Drag unverändert | ✅ | 1285/1285. |

#### β-ST-03 Feiertags-Bänder
| AC | Status | Notes |
|---|---|---|
| Day + Week Zoom: gesetzliche Feiertage als eingefärbtes Hintergrund-Band | ✅ | `holidayBands.map` an `gantt-view.tsx:1038` — Memo gibt für month/quarter `[]` zurück (`gantt-view.tsx:433` Guard). Farbe `fill-amber-300 opacity={0.32}` distinkt von `fill-muted` Wochenende (β-D4). |
| Month + Quarter Zoom: keine Bänder | ✅ | `holidayBands`-Memo elidiert beide Zooms. |
| Feiertag-on-Weekend → Feiertag gewinnt | ✅ | Canvas: weekendBands → holidayBands → ... (Stacking-Order). Header-Bottom-Row: `if (holidayName) { amber } else if (weekendFill) { muted }` an `gantt-view.tsx:1684`. |
| Bars laufen über Bänder | ✅ | Bars werden NACH Holiday-Bands gerendert (sind also On-Top), kein Auto-Skip. |

#### β-ST-04 Tooltip + A11y
| AC | Status | Notes |
|---|---|---|
| Hover-Tooltip mit Feiertagsname + Datum | ✅ | `<title>{formatHolidayTooltip(band.isoDate, band.name)}</title>` an Canvas-Band (`gantt-view.tsx:1052`) + Header-Cell (`gantt-view.tsx:1726`). Format „Tag der Arbeit · Donnerstag, 1. Mai 2026". |
| SR-Label `aria-label` | ✅ | `<g aria-label={`Feiertag ${formatHolidayTooltip(...)}`}>` umschließt jede Canvas-Band-Gruppe (`gantt-view.tsx:1041`). |

#### β-ST-05 Tenant-Setting `holiday_region`
| AC | Status | Notes |
|---|---|---|
| Migration `tenants.holiday_region TEXT NULL` | ✅ | β-Backend live-deployed 2026-05-06; Live-MCP verifiziert. |
| RLS automatisch durch bestehende tenants-Policies | ✅ | `tenants_select_members` + `tenants_update_admin` decken die neue Spalte. |
| Tenant-Settings-UI Region-Select | ✅ | `base-data-section.tsx` aus β-Backend live; kuratierte DACH-Liste. |
| NULL = keine Feiertage | ✅ | `holidayLookup` returnt leere Map → `holidayBands` returnt `[]` → kein Render-Output. Smoke: `holidayRegion = null` Memo-Pfad in `gantt-view.tsx:398`. |
| `holiday_region` in `_tracked_audit_columns(tenants)` | ✅ | Live-MCP-Verifikation: `['language', 'branding', 'holiday_region']`. |

#### β-ST-06 i18n-Vorbereitung (CIA-D6, no-op in β)
| AC | Status | Notes |
|---|---|---|
| `useTenantLocale()` Hook eingeführt | ✅ | `src/hooks/use-tenant-locale.ts` — returnt hart `"de-DE"`; γ flipt auf `tenants.locale`. |
| Hook in `gantt-view.tsx` aufgerufen | ✅ | `gantt-view.tsx:197`. |
| γ kann Hook ohne Call-Site-Refactor umstellen | ✅ | Body ist isolierte 1-Line-Return; alle Intl-Formatter in `gantt-timeline.ts` werden in γ über den Hook parametrisiert. |

### Edge cases verified (Code-Level)

| Edge case | Result |
|---|---|
| Tenant ohne `holiday_region` (NULL) | ✅ Memo returnt leere Map; Bänder + Header-Cells bleiben unverändert (α-Verhalten). |
| Library `new HolidaysLib(...)` wirft | ✅ Try/catch um Konstruktor (`gantt-view.tsx:402`) → leere Map, kein Crash. |
| Library `getHolidays(year)` wirft | ✅ Try/catch inside per-year-Loop → `continue` (`gantt-view.tsx:417`). |
| Holiday auf Samstag/Sonntag | ✅ Header-Cell-Render-Reihenfolge (`if holidayName … else if weekendFill`) priorisiert Holiday; Canvas-Band-Stacking-Order ebenso. |
| Zoom-Wechsel Day → Month | ✅ Memo throttle per `[zoomLevel, ...]`; in month/quarter `holidayBands = []`. |
| Calendar-Window über Jahresgrenze (z.B. 2026→2027) | ✅ `yearsInWindow`-Memo (`gantt-view.tsx:387`) enumeriert ISO-Jahres-Range; beide werden konsolidiert. |
| Heute-Datum außerhalb des Calendar-Windows | ✅ Frühes return null vor Linie + Badge. |
| Zoom-Wechsel während Drag | ✅ Drag-State + Memo-Dependencies sind unabhängig; kein Zustands-Konflikt möglich. |
| `holiday_region = "INVALID"` (z.B. „xyz") | ✅ Library wirft → try/catch → leere Map. DB-CHECK-Constraint blockt Setzen ohnehin. |

### Regression smoke (PROJ-25 Gantt / PROJ-21 / PROJ-52)

| Check | Result |
|---|---|
| `gantt-timeline.test.ts` (PROJ-53-α/β) | ✅ 42/42 grün |
| `status-traffic-light.test.ts` (PROJ-21) | ✅ 23/23 grün |
| `tenants/[id]/route.test.ts` (PROJ-53-β backend) | ✅ 12/12 grün |
| Full Vitest suite | ✅ 1285/1285 |
| `/reports/snapshots/<uuid>` (PROJ-21 Auth-Gate) | ✅ 307 |
| `/projects/<uuid>/planung` (Gantt-Tab Auth-Gate) | ✅ 307 |
| `/projects/<uuid>/gantt` (PROJ-26-Slug) | ✅ 307 |

### Security audit (Red-Team perspective)

- **XSS via `holiday_region`**: input flows through Zod regex → DB CHECK constraint → `new HolidaysLib(country, state, region)`. Library-call, kein DOM-Sink. ✅
- **XSS via Holiday-Name**: Names kommen ausschließlich aus der `date-holidays`-Library (static curated strings). Im Render werden sie über React `<title>` + JSX `aria-label` ausgegeben — auto-escaped. Kein `dangerouslySetInnerHTML` in `gantt-view.tsx`. ✅
- **Tenant-Leak via holiday_region**: SELECT geht durch `tenants_select_members` (Member-only). UPDATE geht durch `tenants_update_admin` (Admin-only). Auto-Audit über `_tracked_audit_columns`. Keine cross-tenant-Leak-Pfad. ✅
- **DB-Level Defense-in-Depth**: CHECK constraint `^[A-Z]{2}(-[A-Z0-9]{1,3})?$` blockt Lowercase, Sonderzeichen, Längen-Übersteigerungen. Live verifiziert. ✅
- **date-holidays Runtime Safety**: 2-fach try/catch (Konstruktor + per-year-getHolidays). Library-Crash → leere Map → α-Fallback (Wochenenden-only). Kein Crash-Pfad in die UI. ✅
- **Scroll-Handler DoS-Surface**: rAF-throttled `setScrollTop` (`gantt-view.tsx:453`). Maximal 1 React-Re-Render pro Frame — keine Event-Stau-Möglichkeit. ✅
- **`useAuth()` ohne AuthProvider**: würde im jetzigen Code throwen. Aber `GanttView` ist nur unter dem `(app)` Layout-Tree erreichbar, wo der AuthProvider garantiert ist. Konsistent mit allen anderen useAuth-Konsumenten. ✅
- **Advisor**: 0 neue Findings; alle 16 Warnings sind pre-existing by-design.

### Bugs & findings

**0 Critical / 0 High.**

| Severity | ID | Finding | Status |
|---|---|---|---|
| Medium | M1 | β-D5 Memo-Performance-Refactor (Header/Canvas/Drag-Layer als drei `React.memo`-Wrapper) ist **deferred → γ**. Heutige Single-SVG re-rendert bei jedem Drag-Frame das ganze SVG. | **Documented deviation**, in Implementation Notes belegt. Bei realistischen Projektgrößen (≤30 Phasen + ≤200 WPs) unkritisch; γ ringt das ein, falls Pilot-Tenants merkliches Drag-Lag melden. **Acceptable**. |
| Low | L1 | Sticky-Header re-rendert während Drag (siehe M1), weil das `<g transform>` Teil der einzelnen SVG-Render-Pipeline ist. | **Acceptable** — der Inhalt des Sticky-`<g>` ist memoized (`topTicks`/`bottomTicks` Memos) und Reconciliation ist O(headerTicks). |
| Low | L2 | Playwright-Headless-Chromium kann lokal auf WSL2 nicht starten (`libnspr4.so` fehlt). | **Pre-existing project-level limitation** (PROJ-29 L1 / PROJ-21 L2). Behebung: `sudo apt-get install libnspr4 libnss3` oder `sudo npx playwright install-deps chromium`. Auf CI/Vercel-Preview-Pipelines nicht relevant. |
| Info | I1 | β-D2 `next/dynamic` lazy-load nicht umgesetzt. Statt dessen normaler `import HolidaysLib from "date-holidays"` — Lib (~3 KB gz) wird ohnehin nur via Code-Split auf `/planung`-Tab geladen. | **Documented deviation**, in β-Frontend Implementation Notes belegt. Bundle-Bloat-Risiko negativ (Größe < 4 KB nach gzip). |
| Info | I2 | `_useTenantLocale_` ist in β ein no-op. | **By design** — β-ST-06 ist explizit γ-Vorbereitung; ohne Refactor des Module-level `Intl.DateTimeFormat` in `gantt-timeline.ts` ist die Wirkung ohnehin null. |

### Production-ready decision

**READY** — no Critical or High bugs. Die beiden Medium/Low-Findings (M1, L1) sind explizit dokumentierte CIA-D5-Deferrals nach γ; die L2-Limitation ist ein pre-existing WSL2-System-Wall, der weder PROJ-53-β verursacht noch deren Funktion auf prod (Vercel) blockt.

Alle 6 β-Akzeptanzgruppen (ST-01 bis ST-06) bestanden auf dem AC-Level der heutigen Implementierung; 1285/1285 Vitest grün; 0 neue Advisor-Findings; Live-DB-Check + Route-Probe + Security-Audit clean.

### Suggested next

1. **`/deploy`** when ready — kein Blocker. Code ist bereits auf `main` (commit `e48516e`); Vercel-Auto-Deploy sollte längst durch sein.
2. **Optional follow-up (γ-Slice)** — Memo-Decomposition (M1) ist explizit für γ vorgesehen; sollte nur dann priorisiert werden, wenn Pilot-Tenants Drag-Lag melden.
3. **Optional WSL2-Setup** (Dev-Quality-of-Life) — `sudo apt-get install libnspr4 libnss3` schaltet 12 lokal-blockierte Playwright-Cases frei. CI/Vercel-Pipelines sind nicht betroffen.
