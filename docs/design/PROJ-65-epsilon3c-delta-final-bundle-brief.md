# PROJ-65 ε.3c.δ — Final Bundle Designer Brief

> **Scope:** 4 Decisions (D6 + D7 + D8 + D9) + PROJ-58 BroadcastChannel-Listener Mini-PR. ~4.5 PT (3.5 Backend + 1.0 Frontend + 0.5 Listener). Letzte Sub-Slice des ε.3c-Bundles. Voraussetzung Locks L29–L36 (Spec Section FF).
>
> **Critical constraint (R-C1):** D6 polymorphic-CHECK-Migration MUSS Full-CHECK-Rebuild via `pg_get_constraintdef()` + DO-Block-Smoke für ALLE 5 `from_type`-Werte. Wiederholung des ε.3b `audit_log_entities`-Bugs nicht akzeptabel.

---

## D6 — Sprint↔Phase-Dependencies polymorphic-CHECK + FS-only

### Goal

Sprint-Knoten können jetzt **Dependencies haben** (`from_type='sprint'` oder `to_type='sprint'`). Aktuell ist Sprint-Source-BFS in `plan_mutate_atomic` ein No-op weil die `dependencies` CHECK-Constraint nur `{project, phase, work_package, todo}` erlaubt. ε.3c.δ erweitert auf `sprint` mit nur FS (Finish-to-Start) Constraint-Type für MVP.

### Architecture-Decision (CIA-locked L32)

| Aspekt | Pick |
|---|---|
| Polymorphic-CHECK | `from_type/to_type ∈ {project, phase, work_package, todo, sprint}` |
| Constraint-Types | nur FS in MVP; FF/SS/SF deferred |
| Cycle-Detection | `from_type IN ('phase', 'sprint')` in BFS-Query; shared CTE/View (Auflage CIA) |
| Migration-Pattern | **Full-CHECK-Rebuild via `pg_get_constraintdef()` + DO-Block-Smoke für alle 5 Typen** (R-C1) |

### Layout / Interactions

**Reine Backend-Erweiterung — kein direktes UI in ε.3c.δ.** Die UI-Surface für Sprint-Deps-Anlage gibt es noch nicht (separate Slice). ε.3c.δ ermöglicht nur dass `plan_mutate_atomic` Sprint-Source-Walks korrekt verfolgt + bestehende `dependencies`-Inserts mit `'sprint'`-Discriminator akzeptieren.

### Migration-Anforderungen (R-C1 Critical)

```sql
-- VOR DROP: Full-CHECK lesen
do $$
declare v_current text;
begin
  select pg_get_constraintdef(c.oid) into v_current
    from pg_constraint c
    where c.conname = 'dependencies_from_type_check';
  if v_current is null then
    raise exception 'smoke-fail: existing CHECK not found';
  end if;
  raise notice 'CHECK before: %', v_current;
end$$;

-- DROP + REBUILD mit explicit enum of ALL existing values + sprint
alter table public.dependencies drop constraint dependencies_from_type_check;
alter table public.dependencies add constraint dependencies_from_type_check
  check (from_type = any (array[
    'project'::text, 'phase'::text, 'work_package'::text, 'todo'::text,
    'sprint'::text  -- PROJ-65 ε.3c.δ addition
  ]));

-- Gleicher Pattern für to_type_check.

-- POST-REBUILD: smoke-test alle 5 Typen + Sprint↔Phase-Cycle-Detection
do $$
declare v_count int;
begin
  -- (a) Insert success für alle 5 from_type/to_type Kombinationen (rollback marker)
  -- (b) BFS-Query mit from_type IN ('phase', 'sprint') läuft cyclesafe
  -- ...
end$$;
```

### Cycle-Detection Update

`plan_mutate_atomic` + `plan_mutate_atomic_bulk` Step 5 BFS-Walk: `from_type = 'phase'` → `from_type IN ('phase', 'sprint')` (shared CTE oder View für DRY).

---

## D7 — Per-Phase Risk-MAX inline + Index-Pflicht

### Goal

Aktuell anchored das Risk-Top-3 Rollup project-scoped am ersten Source. ε.3c.δ erweitert auf **Per-Phase-MAX(severity) entlang Dependency-Walk** — jeder affected Phase in der Cascade bekommt eigenen Top-3-Risk im Diff.

### Architecture-Decision (CIA-locked L33)

- Inline-Subquery in `plan_mutate_atomic` / `plan_mutate_atomic_bulk` Step 7
- **Auflage:** Index `idx_risk_links_linked_severity ON risk_links (linked_kind, linked_id) INCLUDE (severity)` MUSS in derselben Migration
- **EXPLAIN-Plan im Spec-Commit dokumentieren** (Bestätigung dass Index used wird)

### Layout / Interactions

**Frontend-Auswirkung:** DiffTable zeigt jetzt für JEDE Phase einen Risk-Severity-Row mit Top-3-Liste (statt nur am ersten Source). Existing `formatRiskDelta` + `TopRisksCollapsible` (aus ε.3b) sind bereits multi-row-capable — keine Component-Erweiterung nötig. Backend liefert mehr Rows mit `field === 'risk_severity'` pro `node_id`.

### Performance-Gate

Brief-AC erfordert EXPLAIN-Plan-Dokumentation. Tolerable Bereich: bei N=20 Phasen × ⌀5 risk_links = 100 Subquery-Ops. Mit Index `risk_links (linked_kind, linked_id)` sollte das < 200ms zusätzlich pro Mutation kosten.

---

## D8 — PROJ-58-Invalidation via BroadcastChannel

### Goal

Wenn Plan-Mutate in einem Tab/Window committet, soll **PROJ-58 Decision-Sim in anderen Tabs** des gleichen User-Accounts (oder anderen Routen) ihren Cache invalidieren und Snapshot neu fetchen.

### Architecture-Decision (User-Counter zu CIA, L34)

User-Pick: **(a) BroadcastChannel** statt CIA-empfohlenem (d) CustomEvent.
- Cross-Tab via Browser-`BroadcastChannel` API
- Same-tab UND cross-tab Listener-Surface
- PROJ-58 ProjectGraphView wird Mini-PR-Listener bekommen (~0.5 PT, gebundelt im δ-Deploy)

### Plan-Mutate-Producer-Side (Frontend)

In `plan-mutate-dialog.tsx` nach erfolgreichem Apply (handleApply → onCommitted-Callback) UND nach Undo (in use-plan-mutate-undo.tsx):

```ts
const channel = new BroadcastChannel('plan-mutate-events')
channel.postMessage({
  type: 'plan-mutate-committed',
  detail: { projectId, causation_id, affectedCount }
})
channel.close()
```

Channel-Name: `'plan-mutate-events'` (constant, exported aus shared module für Re-Use)

### PROJ-58-Consumer-Side (Mini-PR)

`src/components/projects/project-graph-view.tsx` bekommt einen Listener-Hook:

```tsx
React.useEffect(() => {
  const channel = new BroadcastChannel('plan-mutate-events')
  const handler = (event: MessageEvent) => {
    if (event.data?.type === 'plan-mutate-committed' &&
        event.data?.detail?.projectId === projectId) {
      setReloadTick((t) => t + 1)  // bestehende Snapshot-Refetch-Mechanik
    }
  }
  channel.addEventListener('message', handler)
  return () => {
    channel.removeEventListener('message', handler)
    channel.close()
  }
}, [projectId])
```

### Browser-Support

- BroadcastChannel: Safari 15.4+ (Pflicht-Minimum), Chrome/Edge/Firefox alle aktuell
- Fallback: keiner — wenn BroadcastChannel nicht verfügbar, kein Cross-Tab-Sync (graceful)

### Wo NICHT senden

- Plan-Mutate-Cancel: kein Broadcast (kein Commit erfolgt)
- Plan-Mutate-422-Cycle: kein Broadcast (kein Commit erfolgt)
- Plan-Mutate-409-Conflict: kein Broadcast (kein Commit erfolgt)
- Bei nur Page-Load des Dialogs ohne Apply: kein Broadcast (atomic-mutation passiert zwar in `plan_mutate_atomic` aber das ist nicht User-Intent für PROJ-58-Invalidation — siehe Apply-Re-Mutation-Bug deferred)

---

## D9 — Snap-to-Week Per-Projekt-Setting

### Goal

User kann pro-Projekt aktivieren ob Plan-Mutate Drag-Snap zu Wochengrenzen (Mo-So) statt zu Tagen geht. Default false (kein Verhaltensbruch).

### Architecture-Decision (CIA-locked L35)

- Persistenz in `projects.settings` JSONB (existing column-pattern)
- Key: `plan_mutate.snap_to_week` boolean
- Default `false` wenn nicht gesetzt
- Keine Migration nötig — JSONB ist already used

### UI-Surface

`/projects/[id]/einstellungen` (existing Project-Settings-Page) bekommt einen neuen Toggle:

```
┌─ Plan-Mutate ─────────────────────────────────────────┐
│  [ ] Snap-to-Week                                     │
│      Beim Verschieben von Sprint/Phase-Knoten auf     │
│      Wochengrenzen einrasten (Mo-So). Standard: aus.  │
└───────────────────────────────────────────────────────┘
```

### Frontend Snap-Logic

`plan-mutate-drag-handle.tsx` `resolvedPxPerDay`-Berechnung bekommt Snap-Override:

```tsx
const snapToWeek = snapshot?.settings?.plan_mutate?.snap_to_week ?? false

function applySnap(dayDelta: number): number {
  if (!snapToWeek) return dayDelta
  return Math.round(dayDelta / 7) * 7
}
```

### Migration

Keine Schema-Migration. `projects.settings` ist bereits JSONB. Settings-Form schreibt `{ plan_mutate: { snap_to_week: true|false } }` via existing settings-update-API.

---

## Frontend Handoff

### Backend Files (Migration 20260526xxxxxx_proj65_eps3c_delta_bundle.sql)

| Item | Description |
|---|---|
| **D6 Schema** | `dependencies_from_type_check` + `_to_type_check` rebuilt via Full-CHECK-Rebuild Pattern; smoke-test mit allen 5 Typen + Sprint↔Phase-Cycle-Test |
| **D7 RPC update** | `plan_mutate_atomic` + `plan_mutate_atomic_bulk` Step 7 erweitert um Per-Phase-Risk-Inline-Subquery |
| **D7 Index** | `CREATE INDEX idx_risk_links_linked_severity ON risk_links (linked_kind, linked_id) INCLUDE (severity)` |
| **BFS update** | Step 3 `from_type IN ('phase', 'sprint')` für both RPCs |

### Frontend Files

| Path | Status | Change |
|---|---|---|
| `src/lib/plan-mutate/broadcast-channel.ts` | NEU (~20 LOC) | Shared constant `PLAN_MUTATE_CHANNEL = 'plan-mutate-events'` + Helper `emitPlanMutateCommitted({ projectId, causation_id, affectedCount })` |
| `src/components/projects/trajectory/plan-mutate-dialog.tsx` | erweitern | `handleApply` Erfolgs-Branch ruft `emitPlanMutateCommitted(...)` |
| `src/components/projects/trajectory/use-plan-mutate-undo.tsx` | erweitern | Undo-Erfolgs-Branch ruft `emitPlanMutateCommitted(...)` mit `type: 'plan-mutate-undone'` |
| `src/components/projects/trajectory/plan-mutate-drag-handle.tsx` | erweitern | `snapToWeek`-Prop; Days-Calc rundet auf 7er-Schritte wenn aktiv |
| `src/components/projects/trajectory-graph-view.tsx` | erweitern | Liest `snapshot.settings?.plan_mutate?.snap_to_week` und reicht durch zu TrajectoryGraph2D → DragHandle |
| `src/components/projects/trajectory-graph-2d.tsx` | erweitern | Neue Prop `snapToWeek?: boolean`; reicht durch zu DragHandle |
| `src/app/(app)/projects/[id]/einstellungen/page.tsx` | erweitern | Plan-Mutate-Section mit Snap-to-Week-Switch (shadcn Switch) |

### PROJ-58-Listener Mini-PR (~0.5 PT)

| Path | Change |
|---|---|
| `src/components/projects/project-graph-view.tsx` | useEffect mit BroadcastChannel-Listener; bei `plan-mutate-committed` Event mit matching `projectId` → `setReloadTick(t => t + 1)` |

### API/Data Contract

- `snapshot.settings?.plan_mutate?.snap_to_week?: boolean` — neue optionale Snapshot-Permission ähnlich `permissions.can_plan_mutate`; aggregate.ts liest aus `projects.settings`-JSONB
- BroadcastChannel-Message-Shape: `{ type: 'plan-mutate-committed' | 'plan-mutate-undone', detail: { projectId: string, causation_id: string, affectedCount: number } }`

---

## MVP Acceptance Criteria

**Backend (D6 + D7):**

1. **AC-D6.1** `dependencies` CHECK akzeptiert `from_type='sprint'` + `to_type='sprint'`
2. **AC-D6.2** Migration enthält DO-Block-Smoke der alle 5 `from_type`-Werte testet (positive insert + rollback-marker)
3. **AC-D6.3** Smoke-Test demonstriert Sprint→Phase→Sprint-Cycle-Detection per BFS
4. **AC-D6.4** Pre-Sprint-Dep-Inserts überleben Migration (no data loss)
5. **AC-D7.1** `plan_mutate_atomic` Diff enthält `field: 'risk_severity'` Row pro affected Phase (nicht nur am ersten Source)
6. **AC-D7.2** Index `idx_risk_links_linked_severity` existiert + EXPLAIN-Plan im Migration-Comment dokumentiert dass er used wird
7. **AC-D7.3** Performance: bei N=20 Phasen Mutation-Latency steigt ≤ +200ms gegenüber ε.3c.β-Baseline

**Frontend (D8 + D9):**

8. **AC-D8.1** Plan-Mutate-Apply-Success emittet BroadcastChannel-Event `'plan-mutate-committed'` mit projectId + causation_id + affectedCount
9. **AC-D8.2** Plan-Mutate-Undo-Success emittet `'plan-mutate-undone'`
10. **AC-D8.3** Cancel / 409 / 422 emitten KEIN BroadcastChannel-Event
11. **AC-D8.4** PROJ-58 ProjectGraphView listened auf Channel und triggert reloadTick bei matching projectId
12. **AC-D9.1** Project-Settings-Page hat Plan-Mutate-Section mit Snap-to-Week-Switch (shadcn Switch)
13. **AC-D9.2** Toggle-Aktivierung persistiert via existing settings-update-API in `projects.settings.plan_mutate.snap_to_week`
14. **AC-D9.3** Drag-Handle Days-Calc rundet auf 7er-Schritte wenn `snapToWeek=true`
15. **AC-D9.4** Default-False bei neuen Projekten + bei Bestands-Projekten ohne Setting

**Cross-cutting:**

16. **AC-X.1** Tests bleiben grün (vitest + tsc + build clean)
17. **AC-X.2** No regression in ε.3c.α/α.5/β/γ-Verhalten

---

## States

- **Snap-to-Week aktiviert + Drag:** Cursor snapped visuell zu 7er-Schritten; Tooltip zeigt "+14 Tage" statt "+11 Tage"
- **BroadcastChannel-Listener-Loss:** wenn BroadcastChannel-API nicht verfügbar (uralte Browser), kein Crash; PROJ-58 reloadet nur via manuellen Reload
- **Settings-API-Failure:** Toggle reverted lokal mit Toast "Speichern fehlgeschlagen"
- **D7 Per-Phase-Risk bei Phasen ohne Risiken:** Row wird nicht emittet (existing Logic: nur wenn `top_3.length > 0`)

---

## Risks And Open Questions

| ID | Risk / Question | Mitigation |
|---|---|---|
| **R-δ1 (Critical)** | D6 CHECK-Enumeration-Bug Wiederholung aus ε.3b | **Migration MUSS pg_get_constraintdef()-Read + DO-Block-Smoke für ALLE 5 from_type-Werte + Sprint↔Phase-Cycle-Test enthalten**. CI/Reviewer-Auflage |
| **R-δ2** | D7 Inline-Subquery Performance bei sehr großen Projekten | Index-Pflicht in Migration + EXPLAIN-Plan im Migration-Comment; bei N > 50 Phasen Pilot-Monitor |
| **R-δ3** | D8 BroadcastChannel-Browser-Compat — Safari 15.4 minimum | Bestand-Browser-Min ist > 15.4; check `typeof BroadcastChannel !== 'undefined'` guards für defense-in-depth |
| **R-δ4** | D8 BroadcastChannel-Cross-Origin / Same-Origin-Policy | Same-origin only by design; reicht für unsere Use-Cases. Cross-User-Sync wäre Server-Side-Eventing — out of scope |
| **R-δ5** | D9 Snap-Override während aktivem Drag — UX-Confusion wenn User Setting toggled mid-drag | Setting wird nur beim Drag-START gelesen; aktiver Drag verwendet bisherigen Modus konsistent |
| **R-δ6** | PROJ-58-Listener-Mini-PR creates a coupling between trajectory and graph-view | Acceptable coupling — BroadcastChannel ist generisches Surface; listener kann später für andere Mutationen reused werden |
| **OQ-δ1** | Soll D9 Snap-to-Week auch im Bulk-Drag aus ε.3c.β wirken? | **Empfehlung: Ja.** Konsistenz; BulkShiftPopover.days-Input akzeptiert Beliebige int (mit Optionalem Snap-Hint im Tooltip) |
| **OQ-δ2** | Soll D7 Per-Phase-Risk auch im Multi-Source-Bulk-Diff zur Geltung kommen? | **Empfehlung: Ja.** Per-Phase ist global useful, nicht source-specific |

---

## Handoff

**Implementation-Order ε.3c.δ:**

1. **Backend (~3.5 PT):**
   - Migration `20260526xxxxxx_proj65_eps3c_delta_bundle.sql`:
     - D6 CHECK-Rebuild für `dependencies.from_type` + `to_type` (R-C1 mandatory smoke)
     - D7 `idx_risk_links_linked_severity` Index
     - D7 RPC-Update für `plan_mutate_atomic` + `plan_mutate_atomic_bulk` Step 3 (BFS from_type erweitert) + Step 7 (Per-Phase-Risk inline)
   - Backend kann via `mcp__supabase__apply_migration` deployed werden
   - Route tests erweitern für D7-Diff-Shape

2. **Frontend (~1.0 PT):**
   - `broadcast-channel.ts` Helper
   - `plan-mutate-dialog.tsx` + `use-plan-mutate-undo.tsx` emit on commit/undo success
   - `plan-mutate-drag-handle.tsx` + parent props für snapToWeek
   - `einstellungen/page.tsx` Plan-Mutate-Section mit Switch
   - `aggregate.ts` settings exposure

3. **PROJ-58-Listener-Mini-PR (~0.5 PT):**
   - `project-graph-view.tsx` BroadcastChannel-Listener

4. **`/qa`** ε.3c.δ gegen 17 AC + R-δ1 Critical-Migration-Verification

Nach ε.3c.δ: **ε.3c-Bundle komplett**. Letzter offener Slice ist ε.4 AI (trajectory_sequence + resource_swap + cross-project-links, ~4 PT).
