# PROJ-65 ε.3c.γ — Plan-Mutate Pagination-Streaming · Designer Brief

> **Scope:** D3 Pagination-Streaming für BFS bei N > 200 affected Knoten via `continuation_token`. ~1.5 PT (0.5 Backend + 1.0 Frontend). Voraussetzung Locks L29 (Pagination), L30 (Bulk all-or-nothing), L34 (BroadcastChannel ε.3c.δ). Story 65-7 AC-9 ("Propagation darf den Main Thread nicht blockieren").

---

## Goal

Plan-Mutate Dialog bleibt **responsive** bei Cascade-Mutationen über 200+ Knoten. Diff lädt **Page-by-Page** mit klarer Progress-Anzeige + Cancel-Möglichkeit. User sieht erste 50 affected Rows sofort, weitere Pages streamen progressiv. ESC oder Cancel-Button bricht laufende Pagination ab.

**Erwartete Effekte:**
- First-Page-Latency unverändert (~200-500ms) — User sieht initial-Diff schnell
- Total-Latency bei N=300 ≈ 6 × (50ms RPC + 200ms render) = ~1.5s gesamt
- User kann während laufendem Fetch abbrechen ohne UI-Freeze
- Memory bleibt linear in N (DiffTable kann virtualisiert werden bei N > 200 — deferred)

---

## Benchmark Fit

| Tool | Pattern |
|---|---|
| Jira | Backlog-Edit-Modal lädt erste 100 Items, "Load more" Button bei großem Backlog |
| ClickUp | Bulk-Update-Preview mit progressive-load + ESC cancel + percentage progress |
| monday.com | Bulk-Apply-Preview mit "X von ~Y geladen" Counter unten links |
| Local V3 | **ε.3c.α.5 Slow-Connection-Hint** (3-Tier) als Loading-UX-Pattern reusen; **ε.3c.β BulkActionBar** als Inspiration für Inline-Progress-Surface |

---

## Open Decisions G1–G5

### G1 — Page-Größe

**Optionen:**
- (a) Fixed N=50 (CIA L29 default)
- (b) Tenant-Setting `tenant_settings.plan_mutate_page_size` (default 50)
- (c) Adaptive: N=20 first page (schnell first-paint), N=100 subsequent (effizienter)

**Empfehlung:** **(a) Fixed N=50** für MVP. 50 ist Compromise zwischen Latency und Roundtrip-Count. Tenant-Setting (b) ist Over-Engineering vor Pilot-Daten. Adaptive (c) Komplexität nicht gerechtfertigt.

### G2 — Commit auf partial-Pagination

**Optionen:**
- (a) **Block:** Commit-Button disabled bis pagination komplett (Default-Safe)
- (b) **Allow:** User kann "Commit only what's loaded"-Mode aktivieren
- (c) **Force-load-rest:** Cancel-Button bricht NUR die anzeige ab, Pagination läuft im Hintergrund weiter und Commit wartet

**Empfehlung:** **(a) Block.** All-or-nothing-Semantik aus L30 verlangt komplette Diff vor Commit. Wenn User Cancel klickt, ist das Intent "Abort" — partial-commit wäre Mental-Model-Bruch. User kann Workflow neu starten mit präziserer Source-Auswahl.

### G3 — Auto-Continue vs Manual-Load-More

**Optionen:**
- (a) **Auto-continue:** Sobald Page N geladen, fetcht automatisch Page N+1
- (b) **Manual "Load next 50"-Button** zwischen Pages
- (c) **Hybrid:** Auto bis Page 5, dann Manual ("Über 200 Knoten betroffen — manuell weiterladen?")

**Empfehlung:** **(c) Hybrid mit Soft-Limit 5 Pages (=250 Knoten).** Auto-continue für 95%-Fall (≤ 250 Knoten); explizite User-Bestätigung wenn Cascade sehr groß ist — als Schutz vor versehentlichen Massen-Mutates und Performance-Drosselung.

### G4 — Cancel-Behavior

**Optionen:**
- (a) **Discard:** Cancel → AbortController + clear bisher geladene Pages → Dialog zeigt Cancel-Banner mit "Erneut versuchen"
- (b) **Keep + Disable-Commit:** Cancel → Abort, bisher geladene Pages bleiben sichtbar mit Banner "Pagination abgebrochen — Commit nicht möglich"
- (c) **Keep + Resume:** Cancel pauseiert; "Fortsetzen"-Button setzt Pagination ab letzter `continuation_token` fort

**Empfehlung:** **(a) Discard.** Cancel ist explizites Abort-Intent. Keep-State (b/c) ist Komplexität ohne klaren Use-Case. Wenn User Pagination unterbricht und resumed, sind Snapshot-Daten möglicherweise schon stale → besserer Workflow: ganz neu starten.

### G5 — Progress-Visualisierung

**Optionen:**
- (a) **Indeterminate Spinner** + Text "Lade weitere Knoten..."
- (b) **Page-Counter** "Page 3 / ~6 (~150 Knoten geladen)"
- (c) **Percentage-Bar** (braucht Total-Count vom Server → +1 SELECT pro Mutation)
- (d) **Hybrid Counter + Spinner**

**Empfehlung:** **(d) Hybrid — Counter + animated Spinner.** Counter zeigt klare Progression ("~150 Knoten geladen, lade nächste 50"); Spinner gibt Liveness-Feedback. Total-Count ist nicht zwingend nötig (Server kann optional liefern), Counter zeigt akkumulierte Knoten.

---

## Recommended View Strategy

| Aspekt | Entscheidung |
|---|---|
| **Default behavior** | Single-Source / Bulk mit ≤ 50 affected Knoten: Single-Shot (unchanged from ε.3b/β) — keine Pagination sichtbar |
| **Pagination-Trigger** | Backend-Response enthält `continuation_token` → Client erkennt mehr Pages und fetcht progressiv |
| **Page-Boundary-Visualisierung** | Subtle visual hint (z.B. `border-t-2 border-dashed`) zwischen Pages — vermittelt "diese Knoten kommen aus separater Server-Roundtrip" |
| **Soft-Limit** | Nach 5 Pages (~250 Knoten) Pause-Banner mit "Über 250 Knoten betroffen — manuell weiterladen?" |
| **Cancel-Surface** | Persistente "Abbrechen"-Button im Footer während Pagination läuft; ESC global |

---

## Layout

### Pagination-Active State (während Fetch)

```
┌─────────────────────────────────────────────────────────────────┐
│ Plan-Mutate-Vorschau · 3 Knoten · +5 Tage         🔒 Class-3   │
├─────────────────────────────────────────────────────────────────┤
│ Phase: Anforderungsphase                                        │
│   Start    01.07. → 06.07.  ↑5d   delay                         │
│   Ende     15.07. → 20.07.  ↑5d   delay                         │
│                                                                  │
│ Phase: Konzeptionsphase                                         │
│   Start    16.07. → 21.07.  ↑5d   delay                         │
│   Ende     31.07. → 05.08.  ↑5d   delay                         │
│   ⋯ 48 weitere Zeilen ⋯                                         │
│                                                                  │
│   [Page-Separator: dashed-border]                               │
│                                                                  │
│ Phase: Realisierung                                             │
│   Start    01.08. → 06.08.  ↑5d   delay                         │
│   ...                                                            │
│ ▒▒▒▒▒▒▒▒▒▒▒▒░░░░░░░░░░░  (Skeleton-Row während Fetch)          │
├─────────────────────────────────────────────────────────────────┤
│ ⟳ Lade weitere Knoten… (~150 von Cascade geladen)               │
│                                          [Abbrechen] [Übernehmen disabled] │
└─────────────────────────────────────────────────────────────────┘
```

**Visual elements:**
- **Page-Separator:** subtle `border-t-2 border-dashed border-outline-variant` zwischen accumulated pages (visuell schwächer als Group-Headers)
- **Skeleton-Row** (1× am Ende der Tabelle): `<TableRow><TableCell colSpan={5}><Skeleton h-9/></TableCell></TableRow>` während Fetch läuft
- **Progress-Bar** above Footer:
  - Left: `⟳` (lucide `Loader2` animated) + Counter-Text "Lade weitere Knoten… (~{count} von Cascade geladen)"
  - Right: "Abbrechen" (`variant="ghost"`) + "Übernehmen" (`disabled` während Pagination)
- **Soft-Limit-Pause-Banner** (nach 5 Pages):
  - `<Alert variant="default">` ersetzt Skeleton-Row + Progress
  - Title: "Über 250 Knoten betroffen"
  - Description: "Plan-Mutate hat bereits {count} Knoten geladen. Weitere Pages laden?"
  - Buttons: "{N+50} laden" (`variant="default"`) + "Hier abbrechen" (`variant="outline"`)

### Cancel-State (nach Abort)

```
┌─────────────────────────────────────────────────────────────────┐
│ Plan-Mutate-Vorschau · 3 Knoten · +5 Tage                       │
├─────────────────────────────────────────────────────────────────┤
│ ⚠️ Pagination abgebrochen                                       │
│ Die Plan-Mutate-Vorschau wurde unterbrochen. Bitte erneut       │
│ versuchen oder Auswahl verkleinern.                             │
│                                                                  │
│             [Schließen]    [Erneut versuchen]                   │
└─────────────────────────────────────────────────────────────────┘
```

DiffTable wird **NICHT** angezeigt — Cancel ist Discard (G4-(a)). User startet komplett neu.

### Mobile 375px

- Counter + Spinner: `text-xs` + `Loader2` inline
- Footer-Buttons stacken vertikal (Sheet-Variant aus α.5)
- Soft-Limit-Pause-Banner full-width

---

## Interactions

| Aktion | Behavior |
|---|---|
| **Single-Source / Small Bulk (≤ 50 Knoten)** | Single-Shot (no pagination sichtbar) — Backend response hat `continuation_token: null` direkt |
| **Drop / Bulk-Submit auf große Cascade** | Erster Fetch returns `continuation_token` + N=50 Rows. Dialog rendert DiffTable mit ersten 50 + Skeleton-Row + Progress-Bar |
| **Auto-Continue (Pages 2-5)** | Sobald Page rendered, neuer Fetch mit `continuation_token`. Progress-Counter updated |
| **Soft-Limit (Page 5 reached, ~250 Knoten)** | Auto-Continue pausiert; Pause-Banner mit "+50 laden"-Button. User-Click resumed Pagination |
| **"Abbrechen"-Button (während Pagination)** | `AbortController.abort()` → discard alle gefetchten Pages → State wechselt zu Cancel-State Banner |
| **ESC-Taste (während Pagination)** | Identisch zu "Abbrechen"-Button (global keydown listener) |
| **"Erneut versuchen" (im Cancel-State)** | Reset state → fresh fetch ab Page 1 |
| **"Übernehmen" (während Pagination)** | Disabled (G2-(a)). Tooltip: "Vollständige Vorschau wird noch geladen" |
| **Network-Drop mid-Pagination** | Letzte Page-Request failed → Alert "Verbindung zur Plan-Vorschau verloren" + "Wiederholen"-Button (resume from last `continuation_token`) — **dies ist NICHT ein User-Cancel, sondern Error-Recovery** |
| **409-Conflict in irgendeiner Page** | Discard alle bereits geladenen Pages → ConflictBanner ersetzt DiffTable (L30 all-or-nothing) |
| **422-Cycle in irgendeiner Page** | Discard alle bereits geladenen Pages → CycleAlert (vorhandener Flow aus ε.3b) |

---

## States

| State | Render |
|---|---|
| **Initial-Loading** | Existing α.5 PlanMutateChunkLoading (chunk-load) → ε.3b initial Skeleton (first-page fetch) |
| **Page-Loaded (More Pending)** | DiffTable shows accumulated rows + Skeleton-Row at bottom + Progress-Bar |
| **Pagination-Complete** | Existing ε.3b/β Diff-State; Commit-Button enabled; no Progress-Bar |
| **Soft-Limit-Pause** | Banner statt Skeleton-Row + Progress-Bar; "+50 laden" + "Abbrechen" Buttons |
| **Cancel-State** | Cancel-Banner statt DiffTable; "Schließen" + "Erneut versuchen" Buttons |
| **Error-mid-Pagination** | Alert above Footer "Verbindung verloren" + "Wiederholen"-Button (network only); für 409/422 → respective Error-States ersetzen Diff komplett |
| **Mobile 375px** | Sheet-Variante; Counter + Spinner kompakt; Buttons stacked |
| **A11y** | Live-Region announces "{count} von Cascade geladen" alle 50 Knoten; "Abbrechen"-Button hat `aria-label="Plan-Mutate-Vorschau abbrechen"` |

---

## Dashboard And Rollups

n/a — interne Performance-Optimierung für große Cascade-Mutates; keine User-facing-Reports.

---

## Frontend Handoff

### Modified Files

| Path | Change |
|---|---|
| `src/components/projects/trajectory/plan-mutate-dialog.tsx` | Pagination-Loop-Logic: `useEffect` mit `AbortController`, sammelt Pages in `affected[]`; State-Machine erweitert um `loading-more` + `cancelled` + `paused-soft-limit`; Progress-Counter + Cancel-Button im Footer; "Übernehmen" disabled wenn `state.kind != 'complete'` |
| `src/components/projects/trajectory/plan-mutate-diff-table.tsx` | Optional Skeleton-Row als letzte Row wenn `paginationLoading=true`; Page-Separator-Border zwischen accumulated pages (via `page_index` field per row); no logic changes |
| **NEU:** `src/components/projects/trajectory/plan-mutate-pagination-pause-banner.tsx` | Soft-Limit-Pause-Banner mit "+50 laden" + "Abbrechen"-Buttons |
| **NEU:** `src/components/projects/trajectory/plan-mutate-cancel-banner.tsx` | Cancel-State-Banner mit "Schließen" + "Erneut versuchen" |
| `src/lib/project-graph/types.ts` | Erweitern `PlanMutateResponse` shape um `continuation_token?: string` + `next_page_size?: number`; `AffectedRow` optional `page_index: number` |

### Backend Contract (Backend extends in parallel)

`POST /api/projects/[id]/plan-mutate` Request **+optional Field:**
```ts
{
  // ...existing fields...
  continuation_token?: string  // when present, server resumes from this token
}
```

`POST /api/projects/[id]/plan-mutate` Response **+optional Field:**
```ts
{
  ok: true,
  causation_id: string,        // SAME across all pages of a single mutation
  diff: { affected: AffectedRow[] },
  continuation_token?: string  // present iff more pages exist
}
```

**Backend semantics:**
- First request: no `continuation_token` in body; server computes BFS, applies first 50 UPDATEs (or all if ≤ 50), returns first 50 affected rows + `continuation_token` if more remain. **All UPDATEs apply atomically in first request — pagination is presentation-only, not commit-deferral.**
- Wait — that breaks atomicity. **Alternative model:** First request does FULL BFS + FULL UPDATE atomically (under one causation_id), but only returns first 50 diff rows. `continuation_token` is a server-side cursor over the diff result-set, NOT a partial-commit.
- **Empfehlung: Diff-Pagination, NOT Mutation-Pagination.** The actual mutation is atomic and complete in one request. Pagination only applies to streaming the diff response — the cascade has already happened. This preserves L30 atomicity.
- Server caches diff in temp-table / function-scoped state keyed by causation_id for ~5min; subsequent requests with `continuation_token` (= `causation_id:page_offset` Composite) return next 50 rows without re-running BFS.

**Alternative simpler model:** Diff-Pagination via Client-Side-Slicing. Server returns full diff in single response, FE slices into pages of 50 for progressive render. This avoids server-state-cache complexity but means initial-fetch-latency is full-cascade latency. **Decision deferred to G6 (added).**

### Open Decision G6 — Pagination-Model

**Options:**
- (a) **Server-side cached cursor:** Diff stored in PG temp-table keyed by causation_id; client iterates with token. +Complexity +Memory.
- (b) **Server-side stateless re-fetch:** Each page request re-runs BFS + LIMIT/OFFSET over diff result. Wasteful at high N.
- (c) **Client-side pagination:** Server returns full diff in one response; FE slices for progressive render. No server-state, simpler. But first-fetch latency is full-cascade latency.

**Empfehlung: (c) Client-side pagination.** First-Page-Render via FE-Slicing der erste 50 affected rows. Weitere Pages durch `setTimeout(0)` für Main-Thread-Yield ohne Blocking. Cancel ist FE-State-Discard. **Vermeidet komplette Backend-Erweiterung.** Wenn Pilot zeigt dass Server-Latency bei N=500 wirklich ein Problem ist, kann (a) als ε.3d-Optimization nachgereicht werden.

Mit (c) **verschwindet die Backend-Erweiterung komplett aus ε.3c.γ-Scope.** Das macht γ einen reinen FE-Slice ~1.0 PT total. CIA L29 würde sich revidieren auf "FE-side progressive render statt Backend-Streaming".

### MVP Acceptance Criteria

Assumes G6=(c) Client-side pagination. Wenn G6=(a) gewählt wird, sind AC um Backend-cache + token-protocol zu erweitern.

1. **AC-1 Diff-Threshold ≤ 50 Single-Shot:** Bei `affected.length <= 50` keine Pagination sichtbar — existing flow unchanged
2. **AC-2 Pagination > 50:** Bei `affected.length > 50` FE rendert erste 50 sofort, dann Pages à 50 via `requestIdleCallback` / `setTimeout(0)` für non-blocking
3. **AC-3 Progress-Indikator:** Footer zeigt "Lade weitere Knoten… (~{count} von Cascade)" + animated `Loader2`
4. **AC-4 Auto-Continue ≤ 5 Pages:** Pages 1-5 (≤ 250 Knoten) auto-render; danach Pause-Banner
5. **AC-5 Soft-Limit Pause-Banner:** "+50 laden" + "Abbrechen" Buttons; Click "+50" resumed pagination um weitere 50
6. **AC-6 Cancel-Discard:** ESC oder "Abbrechen" → AbortController.abort() → State wechselt zu Cancel-Banner; alle bisher geladenen Pages werden discarded
7. **AC-7 Cancel-Banner-Recovery:** "Erneut versuchen" → fresh fetch (re-trigger BFS); "Schließen" → Dialog close + reset state
8. **AC-8 Commit-Gating:** "Übernehmen" disabled wenn `state.kind != 'complete'`; Tooltip "Vollständige Vorschau wird noch geladen"
9. **AC-9 Page-Separator-Visual:** Subtle `border-t-2 border-dashed` zwischen accumulated Pages in DiffTable
10. **AC-10 409-Conflict mid-Pagination:** Wenn ANY Page eine 409-Response liefert → discard alle Pages + ConflictBanner (L30)
11. **AC-11 422-Cycle mid-Pagination:** Identisch zu 409-Behavior — discard alles + CycleAlert
12. **AC-12 Mobile 375px:** Counter kompakt; Buttons stacked; Pause-Banner full-width
13. **AC-13 A11y:** Live-Region announces "{count} Knoten geladen" alle ~50 Knoten; Cancel-Button mit `aria-label`
14. **AC-14 Performance:** Bei N=300 → erste Page <250ms render; total ≤2s; Main-Thread-Jank < 50ms per page-render

### Later (NOT in ε.3c.γ)

- Server-side-cached cursor (G6-(a)) — wenn Pilot Latency-Probleme bei sehr großem N zeigt
- DiffTable-Virtualisierung (`react-virtual` / `tanstack-virtual`) bei N > 500 für DOM-Performance
- Network-Resume bei mid-Pagination-Disconnect — `continuation_token` würde dafür gebraucht (G6-(a))
- Cost-Recompute-Pagination — γ deckt nur Datum/Risk/Stakeholder-Last-Cascade; Cost separat (PROJ-24 cost-stack)

---

## Risks And Open Questions

| ID | Risk / Question | Mitigation / Empfehlung |
|---|---|---|
| **R-γ1** | Client-side-pagination (G6-(c)) verschiebt Latency-Last in den initialen Backend-Call | Trade-off bewusst akzeptiert: Backend-Latency unverändert vs Backend-Cache-Komplexität; Pilot-Daten entscheiden |
| **R-γ2** | Memory bei N=1000 — 1000 Diff-Rows im React-State + DOM | DiffTable-Virtualisierung deferred (later); ε.3c.γ MVP toleriert N=500 ohne Probleme |
| **R-γ3** | Race zwischen Cancel + last-page-resolve | `AbortController.signal.aborted` prüfen vor `setState`; existing pattern aus ε.3b PlanMutateDialog |
| **R-γ4** | Soft-Limit-Pause-Banner: User wartet, vergisst, kommt 10min später zurück — Snapshot ist stale | Banner zeigt "Snapshot von {time} — bei längerer Pause ggf. neu laden"; auto-clear bei Mode-Switch / Snapshot-Refetch |
| **R-γ5** | Progress-Counter ohne Total-Count zeigt nicht "wie weit noch" | OK für MVP; Total-Count wäre zusätzliche Komplexität ohne klaren Gain (User klickt Cancel wenn zu lang) |
| **OQ-γ1** | Sollen Sources im Cancel-Banner sichtbar bleiben (User-Recap) oder reset? | Empfehlung: visible — User soll sehen WAS canceled wurde |
| **OQ-γ2** | Sollte "Erneut versuchen" Selection reset oder behalten? | Empfehlung: behalten — User wollte ja diese Mutation; lokaler Retry ist gewünscht |

---

## Handoff

**Implementation-Order ε.3c.γ:**

1. **G6-Confirm (User):** Server-side vs Client-side Pagination
2. Wenn G6=(c) **client-side** (Recommended): pure FE-Slice ~1.0 PT
   - Erweitern `plan-mutate-dialog.tsx` State-Machine + Pagination-Loop
   - Neu: `plan-mutate-pagination-pause-banner.tsx` (~60 LOC)
   - Neu: `plan-mutate-cancel-banner.tsx` (~50 LOC)
   - Erweitern `plan-mutate-diff-table.tsx` für Page-Separator + Skeleton-Row
3. Wenn G6=(a) **server-side cursor**: +0.5 PT Backend (PG temp-table cache + token-protocol)
4. **`/qa`** gegen 14 AC + R-γ3-Race-Test + R-γ4-Stale-Snapshot-Test
5. Danach `/designer` Brief für **ε.3c.δ** (D6 Sprint-Deps + D7 Per-Phase-Risk + D8 BroadcastChannel + D9 Per-Projekt-Setting + PROJ-58-Listener)
