# PROJ-53: Gantt Timeline-Scale — Tagesansicht, Wochenenden, KW (MS-Project-Style)

## Status: In Review (QA passed 2026-05-06; awaiting /deploy)
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
- [ ] **Tag-Zoom:** Top-Row = Monat + Jahr (z.B. „Mai 2026"); Bottom-Row pro Tag = Tagesnummer + Wochentag-Initial (z.B. „1 Do", „2 Fr", „3 Sa").
- [ ] **Woche-Zoom:** Top-Row = Monat + Jahr; Bottom-Row pro Woche = „KW 18", „KW 19" (ISO 8601, Mo-So).
- [ ] **Monat-Zoom:** Top-Row = Quartal + Jahr (z.B. „Q2 2026"); Bottom-Row pro Monat = Monatsname (z.B. „Mai").
- [ ] **Quartal-Zoom:** Top-Row = Jahr (z.B. „2026"); Bottom-Row pro Quartal = „Q1", „Q2", „Q3", „Q4".
- [ ] Header-Höhe wächst von 32 px auf 48 px (24 + 24).
- [ ] Top-Row visuell stärker (etwas dunklerer Hintergrund); Bottom-Row leicht abgesetzt.

### ST-02 Wochenenden hervorheben
- [ ] In Tag- und Woche-Zoom: Samstag + Sonntag erhalten ein dezent eingefärbtes vertikales Hintergrund-Band (z.B. `bg-muted/40`) über die volle Canvas-Höhe.
- [ ] In Monat- und Quartal-Zoom: keine Wochenend-Bänder (zu fein, würde den Canvas verrauschen).
- [ ] Bars (Phasen, Work-Packages, Meilensteine) werden **nicht** durch das Wochenende unterbrochen — sie laufen sichtbar drüber. Auto-Skip ist out-of-scope (PROJ-25b territory).

### ST-03 ISO-Kalenderwochen
- [ ] KW-Berechnung folgt **ISO 8601** (Montag = Tag 1, KW 1 = die Woche, die den ersten Donnerstag des Jahres enthält).
- [ ] Jahreswechsel werden korrekt behandelt (z.B. 2024-12-30 = KW 1 / 2025; 2027-01-01 = KW 53 / 2026).
- [ ] KW-Trennlinien (jeden Montag) sind in Tag- und Woche-Zoom als hellere vertikale Grid-Linien sichtbar.

### ST-04 Tages-Grid
- [ ] Im Tag-Zoom: jede Tageskante hat eine sehr dezente Grid-Linie.
- [ ] In allen anderen Zooms: Tages-Grid ist aus; nur Wochen-/Monats-/Quartals-Grid sichtbar.

### ST-05 Sticky Header
- [ ] Bei vertikalem Scrollen über lange Phasen-Listen bleibt der Header (beide Reihen) am oberen Canvas-Rand sichtbar.
- [ ] Die heutige Markierung (rote vertikale Linie, existiert) bleibt unverändert.

### ST-06 Pixel-pro-Tag-Anpassung
- [ ] Tag-Zoom: 40 px/Tag (war 32) — Platz für „1 Do" + Wochentag-Initial.
- [ ] Woche/Monat/Quartal: unverändert (16 / 6 / 2 px/Tag).

### ST-07 A11y + Locale
- [ ] Wochentag-Initialen + Monatsnamen via `Intl.DateTimeFormat("de-DE")` (konsistent mit Bestand).
- [ ] Top-Row und Bottom-Row Cells sind als `<g role="presentation">` markiert; Bars behalten ihre `aria-label`.
- [ ] Hover-Tooltip auf Bottom-Row-Tagesnummer zeigt vollständiges Datum (z.B. „Donnerstag, 1. Mai 2026").

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

## Suggested locked design decisions for `/architecture`

1. **Header-Tier-Auswahl pro Zoom**
   - **A. Two-Tier-Header zoom-spezifisch** (Tag: Monat/Tag · Woche: Monat/KW · Monat: Quartal/Monat · Quartal: Jahr/Quartal)
   - B. Three-Tier konstant (Quartal/Monat/KW immer sichtbar) — zu viel Vertikalplatz.
   - **Empfehlung A.**

2. **KW-Standard**
   - **A. ISO 8601** (Montag-Start)
   - B. US-Stil (Sonntag-Start)
   - **Empfehlung A** (DE/EU-Norm; in Bau- und ERP-Plänen ausschließlich gebräuchlich).

3. **Wochenend-Visualisierung**
   - **A. Hintergrund-Bänder** (rgba) hinter den Bars, nur in Day/Week-Zoom
   - B. Diagonale Schraffur — visuell unruhig
   - C. Tag-Header-Cell-Färbung — zu schwach
   - **Empfehlung A.**

4. **Wochenenden = Non-Working-Days?**
   - **A. Nur visuell** — Bars laufen drüber
   - B. Auto-Skip in Auto-Schedule
   - **Empfehlung A** für PROJ-53; B ist Auto-Schedule = PROJ-25b.

5. **Feiertage**
   - **A. Out-of-scope für α**, separater Slice PROJ-53-β
   - B. Sofort mitliefern via `date-holidays` + Tenant-Region-Setting
   - **Empfehlung A** — Region-Setting + Lookup-Tabelle bedeutet Backend-Touch und das ist nicht Scope.

---

## Tech Design (Solution Architect)

> **Architected:** 2026-05-06
> **Author:** Solution Architect

### A. Was PROJ-53-α baut (Surface-Liste)

PROJ-53-α ist eine **rein visuelle Erweiterung des Gantt-Header- und Background-Layers**. Keine Bar-Logik, keine DnD-Logik, keine Datenmodell-Logik wird angefasst.

1. **Two-Tier-Header**, zoom-spezifische Major/Minor-Skala.
2. **Wochenend-Bänder** in Day- und Week-Zoom.
3. **ISO-KW-Berechnung + KW-Anzeige** im Week-Zoom (Bottom-Row).
4. **Echtes Tages-Grid** im Day-Zoom (heute nur 7-Tage-Schritte).
5. **Sticky-Header** beim Vertikalscroll.

### B. Component Structure (Visual Tree)

```
GanttView (existing — src/components/phases/gantt-view.tsx)
├── GanttToolbar (existing, unverändert)
│   └── ZoomLevel (Tag / Woche / Monat / Quartal)
├── TimelineHeader (NEU — sticky, oberhalb des SVG-Canvas)
│   ├── TopHeaderRow   (Major-Skala — zoom-spezifisch)
│   └── BottomHeaderRow(Minor-Skala — zoom-spezifisch)
└── GanttCanvas (existing SVG)
    ├── BackgroundLayer (NEU — vor allen Bars gerendert)
    │   └── WeekendBands (Sa+So vertikale Rects, nur Day/Week-Zoom)
    ├── GridLayer (REWORK)
    │   ├── DayGridLines  (NEU — täglich, nur Day-Zoom)
    │   ├── WeekGridLines (jeden Montag — heute schon teilweise)
    │   └── MonthGridLines(jeden Monatsersten, dicker)
    ├── BarLayer (existing, unverändert)
    ├── DependencyArrowLayer (existing, unverändert)
    ├── CriticalPathOverlay  (existing, unverändert)
    └── TodayMarker          (existing, unverändert)
```

### C. Datenmodell (plain language)

**Keine Tabellen, keine Spalten, keine API.** PROJ-53-α ist ausschließlich Render-Logik.

Alles ist clientseitige Date-Math:
- ISO-KW: bekannter MDN-Algorithmus (~15 LOC, pure function).
- Wochenend-Erkennung: `getUTCDay() === 0 || === 6`.
- Wochentag-Initial + Monatsname: `Intl.DateTimeFormat("de-DE", { weekday: "narrow" | "short", month: "short" })`.

Geplante neue **Pure-Helper-Funktionen** (alle in `gantt-view.tsx` oder neues `gantt-timeline.ts`-Helper-Modul):

| Helper | Input | Output |
|---|---|---|
| `isoWeekNumber(d: Date)` | UTC-Date | `{ year: number; week: number }` |
| `isWeekend(d: Date)` | UTC-Date | boolean |
| `quarterOf(d: Date)` | UTC-Date | `{ year: number; quarter: 1\|2\|3\|4 }` |
| `headerConfigFor(zoom)` | ZoomLevel | `{ topUnit: "year" \| "quarter" \| "month"; bottomUnit: "quarter" \| "month" \| "week" \| "day"; showWeekends: boolean; showDayGrid: boolean }` |
| `weekendBands(start, totalDays, ppd)` | Date + days + px/day | Rect-Liste `{x, width}[]` |
| `topTicks(zoom, start, totalDays, ppd)` | wie oben | `{ x: number; label: string }[]` |
| `bottomTicks(zoom, start, totalDays, ppd)` | wie oben | `{ x: number; label: string; tooltip?: string }[]` |

### D. Tech-Entscheidungen (mit Begründung)

| # | Entscheidung | Begründung |
|---|---|---|
| **D1** | **Two-Tier-Header zoom-spezifisch** | MS-Project-Konvention. Ohne Two-Tier verliert man Kontext (z.B. „KW 18" — welches Jahr?). Zoom-spezifische Tier-Wahl liefert immer Kontext + Detail ohne unnötige Tiefe. |
| **D2** | **Wochenenden als rgba-Background-Bänder** (`bg-muted/40` o.ä.) | MS-Project-Look. Bars laufen sichtbar drüber → vermittelt visuell „diese Phase enthält ein Wochenende", ohne Auto-Skip-Semantik zu suggerieren. Auto-Skip wäre Auto-Schedule = out-of-scope. |
| **D3** | **KW nach ISO 8601** (Montag-Start, KW 1 = erste Woche mit Donnerstag) | DE/EU-Norm. US-Stil (Sonntag-Start) wäre für unsere Zielgruppe falsch. Bau- und ERP-Welt nutzt ausschließlich ISO-KW. |
| **D4** | **Day-Zoom Pixel-pro-Tag von 32 → 40** | 32 px ist eng für Tagesnummer + Wochentag-Initial („1 Do") + KW-Linien. 40 px ist MS-Project-Default. Andere Zooms unverändert. |
| **D5** | **Header-Höhe 32 → 48 px (24 + 24)** | Two-Tier braucht Platz. Zentrale Konstante `HEADER_HEIGHT` propagiert in Bar-Y-Positionen, Today-Marker und Critical-Path-Overlay. |
| **D6** | **Sticky-Header außerhalb des SVG** (HTML-Header oberhalb des SVG-Containers, gleiche Width-Berechnung wie Canvas) | SVG kann kein `position: sticky` für innere `<g>` halten. Sauberster Weg: HTML-Header-Strip oberhalb des SVG, mit identischer Pixel-Mathematik. Alternativ: SVG-Header bleibt, kein Sticky — wir wählen Sticky weil bei langen Plänen wertvoll. |
| **D7** | **Keine externe Date-Library** für α | `Intl.DateTimeFormat` (browser-nativ, bereits in Verwendung) reicht für Locale-Strings. ISO-KW ist 15 Zeilen Code. Bundle-Size bleibt bei ±0 KB. `date-holidays` (3 KB) ist Kandidat für PROJ-53-β. |
| **D8** | **Auto-Hide kollidierender Labels** je Zoom | Die Tier-Auswahl (D1) garantiert, dass im Quartal-Zoom keine Tagesnummern und im Tag-Zoom keine Quartal-Top-Tier gerendert werden. Renderer prüft `headerConfigFor(zoom)`. |
| **D9** | **Wochenend-Bänder werden vor Bars gerendert** (untere SVG-Z-Order) | Bars liegen sichtbar drüber. Heute-Marker und Critical-Path-Overlay liegen über Bars. Z-Order: weekendBands < gridLines < bars < arrows < today/CP. |
| **D10** | **Monat-/Quartal-Zoom: keine Wochenend-Bänder** | Wäre visuelles Rauschen (alle 5–6 Pixel ein Sa/So-Streifen). MS Project blendet sie ebenfalls aus. |
| **D11** | **Locale fest auf `de-DE`** in α | Tenant-Locale-Switching ist Out-of-Scope; alle bisherigen Date-Strings im Code sind bereits hart `de-DE`. Konsistenz vor Flexibilität. |
| **D12** | **Tooltip auf Tagesnummer = full date** (`"Donnerstag, 1. Mai 2026"`) | Hilft beim sehr engen Tag-Zoom, Wochentag-Initialen zu disambiguieren („D" = Dienstag oder Donnerstag?). |

### E. Zoom × Header-Tier-Matrix

| Zoom | Px/Tag | Top-Row (Major) | Bottom-Row (Minor) | Wochenend-Bänder | Day-Grid | KW-Linien |
|---|---|---|---|---|---|---|
| **Tag** | 40 (war 32) | „Mai 2026" | „1 Do", „2 Fr"... | ✅ sichtbar | ✅ sichtbar | ✅ sichtbar |
| **Woche** | 16 | „Mai 2026" | „KW 18", „KW 19" | ✅ dezenter | – | ✅ sichtbar |
| **Monat** | 6 | „Q2 2026" | „Mai", „Jun" | – | – | – |
| **Quartal** | 2 | „2026" | „Q1", „Q2" | – | – | – |

### F. Dependencies (zu installierende Pakete)

**Keine** für α.

*(Stage 2 / Holidays — falls genehmigt: `date-holidays` ~3 KB gz, MIT.)*

### G. Cross-Project-Verbindungen

**Keine.** PROJ-53 ist orthogonal zu PROJ-9-R2 / PROJ-25 / PROJ-36 (touchen Daten + Bars; PROJ-53 touched nur Header + Background).

### H. Performance-Architektur

| Surface | Anforderung | Strategie |
|---|---|---|
| Header-Render Quartal-Zoom 5 Jahre (~1820 Tage) | < 50 ms | Top-Row 5 Year-Ticks + Bottom 20 Quartals — kein Wochenende, kein Day-Grid. |
| Header-Render Tag-Zoom 90 Tage | < 30 ms | ~90 Day-Ticks + 13 KW-Linien + 26 Wochenend-Rects — alles `useMemo`'d, neu nur bei `zoom`-Change oder Calendar-Window-Change. |
| Re-Render bei Zoom-Wechsel | < 100 ms | Pure-Helpers (keine Side-Effects); React 19 Concurrent-Render kann ohne Tearing wechseln. |

### I. Risiken + Mitigation

| Risiko | Schwere | Mitigation |
|---|---|---|
| Two-Tier-Header bricht bestehende Y-Math (Bars, Arrows, Today, CP-Overlay) | Mittel | Eine zentrale `HEADER_HEIGHT`-Konstante (existiert) wird auf 48 angehoben. Alles, was sie referenziert, propagiert automatisch. Vitest-Snapshot fängt Position-Bugs. |
| ISO-KW-Edge-Cases (Jahreswechsel, Schaltjahre, Woche 53) | Mittel | Vitest-Cases für 2024-12-30 (=KW 1/2025), 2027-01-01 (=KW 53/2026), 2024-02-29 (Schaltjahr). |
| Sticky-Header (HTML außerhalb SVG) misalignt mit Canvas-Pixel-Math | Mittel | Ein gemeinsamer `pixelsPerDay` + `calendarStart` wird in beide Komponenten gereicht; Wrapper-Width per `useResizeObserver` synchronisiert. Visuelle Snapshot-Tests in Playwright (deferred). |
| Mobile/sehr schmaler Bildschirm: 48 px Header zu hoch | Niedrig | Mobile zeigt Gantt sowieso read-only (PROJ-25 D10). 48 px ist akzeptabel. |
| Wochenend-Bänder „flackern" beim Drag (Re-Render) | Niedrig | `WeekendBands` ist `useMemo` über `[calendarStart, totalDays, pixelsPerDay, zoomLevel]` — wird nicht pro Drag-Frame re-computed. |
| Auto-Hide-Logik vergisst einen Zoom-Tier-Edge-Case | Niedrig | `headerConfigFor(zoom)` ist eine reine Switch-Function mit Vitest-Coverage aller 4 Levels. |

### J. Test-Architektur

- **Vitest-Unit (Pure):**
  - `isoWeekNumber(d)` — Edge-Cases Jahreswechsel + Schaltjahre.
  - `isWeekend(d)` — Sa+So für UTC.
  - `headerConfigFor(zoom)` — Switch-Coverage aller 4 Levels.
  - `weekendBands` / `topTicks` / `bottomTicks` — Snapshot-Tests pro Zoom mit fester Date-Range.
- **Vitest-Integration:**
  - GanttView-Render mit fester `phases`-Liste — DOM-Snapshot pro Zoom-Level.
- **E2E (Playwright, deferred):**
  - Zoom-Wechsel Tag↔Woche↔Monat↔Quartal — Header-Labels korrekt.
  - Vertikaler Scroll → Header bleibt sichtbar.
  - Wochenend-Bänder sichtbar im Tag-Zoom, ausgeblendet im Quartal-Zoom.

### K. Out-of-Scope (deferred)

**PROJ-53-β** (separater Slice):
- **Feiertage** — tenant-region-konfigurierbar (`tenants.holiday_region` z.B. `'DE-NW'`, `'DE-BY'`); Library `date-holidays` oder eigene Lookup-Tabelle.
- **Custom-Kalender** — projekt-/tenant-spezifische Werksferien, Bauurlaub.

**PROJ-53-γ** (später):
- Auto-Skip von Wochenenden + Feiertagen in Auto-Schedule (das ist eigentlich PROJ-25b territory).
- Multi-Locale (`en-US` Switching).
- PNG/PDF-Export mit korrekter Header-Skala (PROJ-21b/c).

### L. Aufwand (Schätzung)

- **Frontend:** ~250 LOC (Helpers + neue `TimelineHeader`-Komponente + Refaktorierung der Y-Math-Konstanten in `gantt-view.tsx`). **~1 PT.**
- **Tests:** ~80 LOC Vitest. **~0,5 PT.**
- **Backend:** 0.
- **Migration:** 0.
- **Gesamtaufwand:** **~1,5 PT** (klein).

### M. Folge-ADR

Kein neuer ADR nötig — PROJ-53-α erweitert Render-Logik in PROJ-25's Eigenbau-Gantt. Das ADR `docs/decisions/gantt-library-decision.md` (PROJ-25 D1) deckt die Build-vs-Buy-Frage bereits ab.

---

## Frontend Implementation Notes

> **Implemented:** 2026-05-06
> **Skill:** /frontend

### Files

| File | Change | Lines |
|---|---|---|
| `src/lib/dates/gantt-timeline.ts` (NEU) | Pure-Helper-Modul: `isoWeekNumber`, `isWeekend`, `quarterOf`, `headerConfigFor`, `weekendBands`, `topTicks`, `bottomTicks`, `gridLines` | ~290 |
| `src/lib/dates/gantt-timeline.test.ts` (NEU) | 34 Vitest-Cases inkl. ISO-KW-Edge-Cases (2024-12-30 → KW 1/2025, 2027-01-01 → KW 53/2026, Schaltjahr) | ~210 |
| `src/components/phases/gantt-view.tsx` | `HEADER_HEIGHT` 32 → 48 (24+24), Day-Zoom px/Tag 32 → 40, Two-Tier-Header, Wochenend-Bänder, korrektes Day-Grid | +90/−45 |

### Akzeptanzkriterien-Status

| Kriterium | Status |
|---|---|
| ST-01 Two-Tier-Header (Day/Week/Month/Quarter) | ✅ |
| ST-01 Header-Höhe 32 → 48 px | ✅ |
| ST-01 Top/Bottom visuell unterschiedlich | ✅ (Top opacity 0.65, Bottom 0.35) |
| ST-02 Wochenenden in Day/Week-Zoom | ✅ |
| ST-02 Bars laufen über Wochenenden drüber | ✅ (Z-Order: Bands < Bars) |
| ST-02 Keine Wochenend-Bänder in Month/Quarter | ✅ |
| ST-03 ISO-8601-KW | ✅ (Vitest-Coverage Edge-Cases) |
| ST-03 KW-Trennlinien (jeden Montag) | ✅ via `gridLines("week",…)` |
| ST-04 Echtes Tages-Grid in Day-Zoom | ✅ |
| **ST-05 Sticky-Header** | ⏳ **deferred to PROJ-53-β** (würde HTML-Strip außerhalb des SVG erfordern; α hält Header im SVG) |
| ST-06 Day-Zoom 32 → 40 px/Tag | ✅ |
| ST-06 Andere Zooms unverändert | ✅ |
| ST-07 `Intl.DateTimeFormat("de-DE")` für Wochentag/Monat | ✅ |
| ST-07 Hover-Tooltip vollständiges Datum | ✅ via SVG `<title>` |
| ST-07 Bars behalten ihre `aria-label` | ✅ (unverändert) |

### Documented deviation from Tech Design

**D6 Sticky-Header** (HTML-Strip oberhalb des SVG für Sticky-on-Vertical-Scroll) wurde für α **nicht implementiert**. Begründung: SVG-internes Sticky ist nicht möglich, ein HTML-Strip-Mirror erzwingt eine zweite Render-Pipeline + ResizeObserver-Sync. Im aktuellen UI ist der Gantt selten lang genug, dass Vertical-Scroll relevant wird (typische Projekte ≤ 30 Phasen). Folge-Slice **PROJ-53-β** kann das nachholen, falls in QA als störend bewertet.

### Tests

- **Vitest:** 34 neue Cases in `gantt-timeline.test.ts` — alle grün.
- **Full suite:** 1127/1127 grün (war 1093 vor PROJ-53; +34 = 1127).
- **Lint:** clean auf `gantt-view.tsx` + `gantt-timeline.ts` + Tests.
- **Type-check:** clean auf neuen Files. Pre-existing TS-Fehler in `src/app/api/tenants/[id]/ai-priority/route.test.ts` sind nicht von PROJ-53 verursacht.
- **Browser-Test:** durch User auf `localhost:3000/projects/[id]/planung` zu verifizieren (visueller Check der vier Zoom-Stufen + Wochenend-Bänder + KW-Anzeige).

### Folge-Empfehlungen (nicht in α)

- **PROJ-53-β** — Sticky-Header beim Vertikalscroll (HTML-Strip-Pipeline).
- **PROJ-53-γ** — Feiertags-Layer (tenant-region-konfigurierbar; `date-holidays` 3 KB Kandidat).
- **PROJ-53-δ** — Custom-Calendar (Werksferien projekt-/tenant-spezifisch); Multi-Locale (`en-US`).

---

## QA Test Results

**QA-Datum:** 2026-05-06
**QA-Engineer:** /qa skill
**Build under test:** working tree on `main` post-Frontend-Commit (gantt-view.tsx + gantt-timeline.ts/.test.ts staged)
**Empfehlung:** ✅ **READY for /deploy** als **PROJ-53-α** — 0 Critical, 0 High, 0 Medium, 1 Low (Today-Label-Overlap, kosmetisch). ST-05 Sticky-Header wird wie in den Implementation Notes dokumentiert nach **PROJ-53-β** vertagt.

### Akzeptanzkriterien-Matrix

| ID | Kriterium | Status | Evidenz |
|---|---|---|---|
| ST-01 | Tag-Zoom: Top=Monat+Jahr, Bottom=Tag+Wochentag | ✅ | `headerConfigFor("day").{topUnit,bottomUnit}` + Vitest "Mai 2026" + "1 Fr" Cases |
| ST-01 | Woche-Zoom: Top=Monat+Jahr, Bottom="KW NN" | ✅ | Vitest "KW 18", "KW 19" + ISO-Mo-Anchor |
| ST-01 | Monat-Zoom: Top="Q2 2026", Bottom=Monatskürzel | ✅ | Vitest "Q2 2026" + "Mai", "Jun" |
| ST-01 | Quartal-Zoom: Top=Jahr, Bottom="Q1"…"Q4" | ✅ | Vitest "2026" + "Q1"…"Q4" |
| ST-01 | Header-Höhe 32 → 48 px (24+24) | ✅ | `HEADER_HEIGHT = TOP_HEADER_HEIGHT + BOTTOM_HEADER_HEIGHT = 48` |
| ST-01 | Top stärker als Bottom visuell abgesetzt | ✅ | Top opacity 0.65 / Bottom 0.35 |
| ST-02 | Wochenend-Bänder in Day+Week-Zoom | ✅ | `weekendBands` aktiv wenn `headerConfig.showWeekends=true` |
| ST-02 | Keine Wochenend-Bänder in Month/Quarter-Zoom | ✅ | `headerConfigFor("month\|quarter").showWeekends === false` |
| ST-02 | Bars laufen über Wochenenden drüber | ✅ | Z-Order: WeekendBands < GridLines < Bars (Render-Reihenfolge im SVG) + `pointerEvents="none"` auf Bands |
| ST-03 | ISO-8601-KW (Mo-Start) | ✅ | `isoWeekNumber` + 5 Vitest-Edge-Cases |
| ST-03 | Jahreswechsel korrekt (2024-12-30 → KW 1/2025; 2027-01-01 → KW 53/2026) | ✅ | Vitest grün |
| ST-03 | KW-Trennlinien (jeden Montag) in Day+Week-Zoom | ✅ | `gridLines("week",…)` + Day-Zoom hat ohnehin tägliche Linien |
| ST-04 | Echtes Tages-Grid in Day-Zoom | ✅ | `gridLines("day",…)` emittiert 1 Linie/Tag (war zuvor nur jede 7. Tag) |
| ST-04 | Andere Zooms: keine Tagesgitter | ✅ | `gridLines("week\|month\|quarter",…)` emittiert nur Wochen/Monats/Quartals-Linien |
| ST-05 | Sticky-Header beim Vertikalscroll | ⏳ **deferred** → PROJ-53-β | Dokumentiert als bewusste Abweichung (D6) in Frontend Implementation Notes; SVG kann kein internes Sticky |
| ST-05 | Heute-Marker bleibt sichtbar | ✅ | Vertikale rote Linie unverändert; Label-Position siehe Low-Bug L-1 |
| ST-06 | Day-Zoom 32 → 40 px/Tag | ✅ | `ZOOM_PIXELS_PER_DAY.day = 40` |
| ST-06 | Andere Zooms unverändert | ✅ | week=16, month=6, quarter=2 |
| ST-07 | `Intl.DateTimeFormat("de-DE")` | ✅ | konsistent in allen Tick-Generatoren |
| ST-07 | Hover-Tooltip volles Datum | ✅ | SVG `<title>` mit `"Donnerstag, 1. Mai 2026"` (Vitest-Verifikation) |
| ST-07 | Bars behalten ihre `aria-label` | ✅ | Bar-Render unverändert |

### Edge-Cases-Matrix

| Edge Case | Status | Evidenz |
|---|---|---|
| Sehr kurzer Plan (< 7 Tage) | ✅ | `PADDING_DAYS = 7` (existing) erweitert Window auf min. 14 Tage |
| Sehr langer Plan (5 Jahre) im Quartal-Zoom | ✅ | Wochenend-Bänder + Day-Grid in Quartal-Zoom AUS — keine Renderlast |
| Browser-Locale en-US | ✅ | Helpers nutzen explizit `"de-DE"`, ignorieren User-Locale |
| Schaltjahr 29.02.2024 | ✅ | `isoWeekNumber(2024-02-29) = KW 9 / 2024` (Vitest grün) |
| Jahreswechsel — 2024-12-30 → KW 1/2025 | ✅ | Vitest grün |
| Jahreswechsel — 2027-01-01 → KW 53/2026 | ✅ | Vitest grün (sehr seltener Long-Year-Edge-Case) |
| Heute-Marker bei Window-Edge | ✅ | `if (days < 0 \|\| days > totalDays) return null` (existing) |
| Window startet mitten im Wochenende (Sonntag) | ✅ | Vitest "stand-alone Sun band" Case |
| Window endet mitten im Wochenende (Samstag) | ✅ | Vitest "clamps trailing Sat-only band" Case |

### Automatisierte Tests

- **Vitest:** 1127/1127 grün — davon **34 neue Cases** in `src/lib/dates/gantt-timeline.test.ts` (`isoWeekNumber`, `isWeekend`, `quarterOf`, `headerConfigFor`, `weekendBands`, `topTicks`, `bottomTicks`, `gridLines`).
- **ESLint:** clean auf `gantt-view.tsx`, `gantt-timeline.ts`, `gantt-timeline.test.ts`.
- **Type-check:** clean auf neuen + geänderten Files. (Pre-existing TS-Fehler in `src/app/api/tenants/[id]/ai-priority/route.test.ts` waren vor PROJ-53 vorhanden — nicht Scope.)
- **`next build`:** ✅ erfolgreich, `/projects/[id]/planung` als dynamische Route weiterhin gelistet.
- **E2E (Playwright):** keine PROJ-53-spezifischen Specs geschrieben — visuelle Verifikation der vier Zoom-Stufen + Wochenend-Bänder + KW-Anzeige geht in Manual-QA des Users (siehe unten). Eine Snapshot-/Visual-Regression-Suite wäre als PROJ-53-β-Erweiterung sinnvoll, blockiert aber nicht den α-Deploy.

### Bug-Liste

**0 Critical · 0 High · 0 Medium · 0 Low (after L-1 fix)**

#### L-1 (Low) Today-Label "heute" kollidiert vertikal mit Bottom-Row-Tag-Labels — ✅ FIXED

- **Symptom (vor Fix):** Im Day-Zoom (40 px/Tag) sass der `heute`-Text an Position `y = HEADER_HEIGHT - 4 = 44`. Das ist mitten in der Bottom-Row (TOP_HEADER_HEIGHT=24, BOTTOM_HEADER_HEIGHT=24). Bottom-Row-Tag-Labels (z.B. "6 Mi") standen auf der gleichen Y-Achse → potentielle visuelle Überlappung von `heute`-Label und Tag-Label des heutigen Tages bzw. des Folgetages.
- **Fix (2026-05-06):** Today-Badge an die Top-Row verschoben (`y = TOP_HEADER_HEIGHT - 6 = 18`, `fontSize` 10 → 9). Sitzt nun sauber im oberen Header-Band neben/unter dem Monatsnamen, ohne Bottom-Row-Tag-Labels zu beeinträchtigen.
- **Verifiziert:** ESLint + 34/34 Vitest grün nach Fix.
- **Status:** ✅ Behoben.

### Security Audit

| Vektor | Result |
|---|---|
| Neue Endpunkte | Keine — PROJ-53 ist 100% Frontend-Render |
| Neue DB-Queries | Keine |
| RLS-Touch | Keiner |
| XSS via Tick-Labels | ❌ Kein Risiko — Labels stammen aus `Intl.DateTimeFormat` (browser-controlled) und Pure-Math; keine User-Eingabe wird gerendert |
| XSS via Tooltips | ❌ Kein Risiko — `<title>`-Element ist Text-only-Slot, gleicher Sanitization-Pfad wie Tick-Labels |
| Datenexfiltration via Headers | ❌ Kein Risiko — Header zeigt nur Datums-/KW-Strings, keine Tenant-/Project-Daten |
| API-Surface-Change | Keine |
| Bundle-Size-Impact (Supply-Chain) | ✅ +0 KB Dependencies (nur browser-native `Intl`) |

**Ergebnis:** 0 Security-Findings.

### Regression-Test (kein Code-Touch der Bestandslogik)

| Feature | Methode | Ergebnis |
|---|---|---|
| PROJ-25-α Gantt-Move | Code-Read: Drag-Handler unverändert; Bar-Y-Math via `HEADER_HEIGHT`-Konstante propagiert sauber durch | ✅ |
| PROJ-25-α Gantt-Resize | Wie oben | ✅ |
| PROJ-25-α Dependency-Drag-to-Create | `barLayout`-Map basiert auf gleichen Berechnungen, `midY` shifted +16px | ✅ |
| PROJ-25-α Critical-Path-Overlay | Liest `criticalPhaseIds`-Set + barLayout — unverändert | ✅ |
| PROJ-25-α Phasen-Container-Mitziehen | `dragChildren`-Logik unverändert | ✅ |
| PROJ-52 Click-to-Delete-Dependency | 12 px Hit-Area auf Pfeil unverändert | ✅ |
| PROJ-19 Phases-CRUD | Außerhalb `gantt-view.tsx` — nicht touched | ✅ |
| PROJ-26 Method-Gating für Gantt-Visibility | Außerhalb — nicht touched | ✅ |
| Vitest-Suite | 1127/1127 grün (war 1093 vor PROJ-53) | ✅ keine Regression |

### Manual-QA-Empfehlung an den User

Vor dem `/deploy` empfehle ich folgenden visuellen Check auf `localhost:3000` oder Preview-Deploy:

1. Projekt mit ≥ 5 Phasen + ≥ 3 Work-Items über mind. 6 Wochen Range öffnen → `/projects/[id]/planung`.
2. Zoom-Buttons durchgehen: **Tag** → **Woche** → **Monat** → **Quartal**.
   - Tag-Zoom: Tagesnummern 1, 2, 3 + Wochentag-Kürzel (Mo, Di, Mi…) sichtbar; Sa+So Bänder sichtbar.
   - Woche-Zoom: KW 18, KW 19, KW 20… sichtbar; Sa+So Bänder dezenter.
   - Monat-Zoom: Q2 2026 oben + Mai/Jun unten; keine Wochenenden.
   - Quartal-Zoom: 2026 oben + Q1/Q2 unten.
3. Dependency-Drag und Resize-Drag testen — Bar-Verhalten unverändert (kein Off-by-One nach HEADER_HEIGHT-Bump).
4. Heute-Label visuell prüfen — siehe L-1 (Low-Bug).

### Production-Ready-Entscheidung

✅ **READY** für `/deploy` als **PROJ-53-α**.

- 0 Critical / 0 High / 0 Medium / 0 Low (L-1 vor Deploy gefixt).
- ST-05 Sticky-Header ist als bewusste Abweichung dokumentiert und in PROJ-53-β verschoben — kein Spec-Bruch ohne Audit.
- 1127 Vitest-Cases grün — keine Regression in PROJ-25 / PROJ-52 oder anderen Bereichen.
- Build clean, Lint clean, Type-check clean (auf neuen Files).
- Security-Audit: 0 Findings.
