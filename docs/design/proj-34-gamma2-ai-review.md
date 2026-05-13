# PROJ-34 γ.2 — AI Sentiment Review UI: Designer Spec

> Slice: **34-γ.2** — AI-Vorschlag-Pill + Accept/Reject/Modify-Dialog am Interaction-Item
> Status der Vorgängerslices: α (Interaction-Log) live · β (manuelle Per-Participant-Slider) live · γ.1 (AI-Router Backend mit Class-3-Lock + Stub) live (PR #17).
> Reuse-Ziel: Das hier definierte Review-Pattern wird von Slice **ε (Coaching-Recommendations)** wiederverwendet.

---

## 1. Goal and user context

Der Projektleiter erfasst eine Stakeholder-Interaktion (Channel, Direction, Summary, ≥1 Stakeholder). γ.1 schreibt anschließend pro Teilnehmer einen `SentimentSignal` (`participant_sentiment`, `participant_cooperation_signal`, `confidence`) mit `_source = 'ai_proposed'` in `stakeholder_interaction_participants`. γ.2 muss diese Vorschläge **sichtbar, prüfbar und entscheidbar** machen — pro Teilnehmer, nicht pro Interaktion.

Designziel: der PL kann ein 4-Personen-Meeting in **< 30 Sekunden** durchreviewen, ohne das List-Item zu verlassen, mit gleichzeitiger Sichtbarkeit aller 4 Vorschläge. Kein „Silent-Apply", kein verstecktes Drilling.

## 2. Reference pattern fit

- **Jira / GitHub Copilot suggestions**: inline "AI suggested · Accept / Dismiss" Pill direkt am Datensatz, ohne Modal-Sprung. Wir adaptieren das **am Item-Header**.
- **Linear "Suggested labels"**: Accept-All / per-Item-Override im selben Surface. Wir bauen das als **Multi-Participant-Tabelle im rechten Sheet**.
- **monday.com AI Assistant**: separate Review-Queue **pro Board** zusätzlich zum Inline-Vorschlag → wir liefern das **als „Next"**, nicht als γ.2-Scope (siehe F).
- **V3-eigen**:
  - PROJ-33 `profile-edit-sheet.tsx` — `Sheet side="right"` mit grouped Form-Sections. Genau dieses Pattern wird hier wiederverwendet (kein Modal-Dialog, weil 1..n Stakeholder ≈ N Slider-Paare nicht in einen Dialog passen).
  - PROJ-34-β `communication-tab.tsx` Z. 633–684 `ParticipantSignalRow` — die Pill-Anker-Reihe existiert bereits, γ.2 hängt nur den AI-State daran.
  - PROJ-35 `escalation-pattern-banner.tsx` / `tonality-card.tsx` — Banner-Pattern für „external_blocked"-Meldung wird übernommen.

## 3. Information architecture and navigation

γ.2 ändert **keine** Routes. Touch-Points:

| Surface | Datei | γ.2-Eingriff |
|---|---|---|
| Stakeholder-Detail-Tab „Kommunikation" | `src/components/stakeholders/communication/communication-tab.tsx` | Neue Pill-Variante + Sheet-Trigger am `InteractionItem` (Z. 510–575) |
| `ParticipantSignalRow` | gleiche Datei, Z. 633–684 | Erweiterung um `_source = 'ai_proposed'`-Branch |
| `SignalEditDialog` | gleiche Datei, Z. 686–840 | Wird **abgelöst** durch `AIReviewSheet` (Multi-Participant). Solo-Edit-Dialog bleibt erhalten für „Bewerten"-Button auf nicht-AI-Pills. |
| AI-Trigger-Button | NEU am `InteractionItem`-Header | „KI-Vorschlag anfragen" — nur sichtbar wenn `participants[*]._source` alle `null/manual` UND Tenant hat Provider-Key |
| Tab-Header der Kommunikation | gleiche Datei, neuer Bereich vor `AwaitingResponsesSection` | **„Offene KI-Vorschläge" Banner** (Mini-Queue für aktuellen Stakeholder, siehe §F „Now") |

## 4. Primary and secondary views

**Primary**: Inline Pills am `InteractionItem` → Click auf AI-Pill öffnet rechtes Sheet mit Multi-Participant-Tabelle.

**Sekundär**: kein zweites View für γ.2 — Review-Queue projekt-weit ist **„Next"**, nicht γ.2-Scope.

## 5. Layout and component plan

### A) Komponenten-Liste

```
CommunicationTab  (existing, modified)
└── AIProposalsBanner               NEU — collapsible Banner, nur wenn ≥1 pending AI-Vorschlag
│   ├── Badge "{n} KI-Vorschläge offen"
│   └── Button "Alle prüfen" → opens AIReviewSheet im "Queue"-Mode (deferred to Next)
├── AwaitingResponsesSection         existing (PROJ-34-δ)
├── AddInteractionForm               existing (modified: zeigt nach Create einen "KI-Analyse läuft…"-State)
└── InteractionList
    └── InteractionItem              existing, modified
        ├── Header-Row
        │   ├── Channel/Direction/Date-Badges  existing
        │   ├── Participant-Count               existing
        │   ├── Awaiting-Response-Badge         existing
        │   ├── AIProposalPill   NEU — replaces nothing, sits between count + delete
        │   └── Delete-IconButton  existing
        ├── Summary                  existing
        ├── ParticipantPillsStrip    NEU — N rows (one per participant), each row =
        │   ├── StakeholderAvatar + Name
        │   ├── SentimentPill (with _source halo)
        │   ├── CooperationPill (with _source halo)
        │   └── ConfidenceMicrobar (only when _source startsWith 'ai_')
        └── existing ParticipantSignalRow stays for manual "Bewerten"-flow

AIReviewSheet                       NEU — Sheet side="right" sm:max-w-2xl
├── SheetHeader
│   ├── Title "KI-Vorschlag prüfen"
│   ├── Sub "Meeting · 13.05.2026 · 14:00 · 4 Teilnehmer"
│   └── ProviderBadge "Anthropic · claude-opus-4-7" (or "Stub · neutral")
├── StubFallbackBanner              conditional — neutral 0/0 from γ.1 Stub
├── ExternalBlockedBanner           conditional — Class-3, no tenant provider
├── ParticipantReviewList
│   └── ParticipantReviewCard       repeated N times
│       ├── Header: Avatar + Name + DecisionChip ("offen" / "akzeptiert" / "abgelehnt" / "geändert")
│       ├── SentimentSlider (5-stop ToggleGroup, AI-suggestion pre-selected, with ghost-halo)
│       ├── CooperationSlider (same)
│       ├── ConfidenceRow "KI-Konfidenz: 73%" + Microbar
│       └── PerCardActionRow "Übernehmen · Ablehnen · Anders bewerten"
├── SheetFooter (sticky)
│   ├── Bulk: "Alle übernehmen" | "Alle ablehnen"
│   ├── Decision counter "3 von 4 entschieden"
│   └── Primary "Speichern" (enabled wenn ≥1 Decision; Secondary "Schließen")
```

### shadcn-Primitives-Mapping

| Component | Primitive(s) |
|---|---|
| `AIProposalPill` | `Badge` (custom variant `ai-proposed`) + `Tooltip` |
| `ParticipantPillsStrip` | flexbox row + `Badge` + `Avatar` + `Progress` (h-1, w-12) for confidence microbar |
| `AIReviewSheet` | `Sheet` `side="right"` (already used by `profile-edit-sheet.tsx`) |
| `ParticipantReviewCard` | `Card` + `CardContent` (no `CardHeader` — kept dense) |
| `Sentiment/CooperationSlider` | `ToggleGroup type="single"` (5 buttons, already used in β `SignalSlider` Z. 842–876) |
| `DecisionChip` | `Badge` with state-variants |
| `Bulk-Action-Row` | `Button` + `Button` |
| `ConfidenceMicrobar` | `Progress` |
| Banners | `Alert` with `variant="default"` (Stub) and `variant="destructive"` (external_blocked) |

## 6. Wireframe descriptions (ASCII)

### 6.1 InteractionItem with pending AI proposal (default state, desktop ≥768px)

```
┌─ Card ────────────────────────────────────────────────────────────────────────┐
│  [Meeting] [Bidirektional]  13.05.2026 · 14:00  [4 Teilnehmer]               │
│  [✦ KI-Vorschlag · 4 offen]  ← clickable, primary-container background       [🗑]│
│                                                                               │
│  Sprint-Planning mit Key-Usern: Anforderungs-Workshop für Modul Einkauf …    │
│                                                                               │
│  ┌── Teilnehmer ────────────────────────────────────────────────────────┐    │
│  │ 👤 A. Schmidt    [Stimmung: +1 ✦]  [Kooperation: +2 ✦]  ●●●○○ 73%  │    │
│  │ 👤 B. Weber      [Stimmung:  0 ✦]  [Kooperation: −1 ✦]  ●●○○○ 41%  │    │
│  │ 👤 C. Roth       [Stimmung: +2 ✦]  [Kooperation: +2 ✦]  ●●●●○ 88%  │    │
│  │ 👤 D. Bauer      [Stimmung: −1 ✦]  [Kooperation:  0 ✦]  ●●●○○ 67%  │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────┘
```

Legend: `✦` = sparkle-icon (lucide `Sparkles`) marks AI-source. Background tone of these pills uses `primary-container` (`#3b6769`) at 15% opacity + 1px `primary/40` border to distinguish from manual pills (`secondary-container`).

### 6.2 AIReviewSheet (right side, 480–640px wide)

```
┌── KI-Vorschlag prüfen                            [×] ──┐
│ Meeting · 13.05.2026 · 14:00 · 4 Teilnehmer            │
│ ✦ Anthropic · claude-opus-4-7  ·  Konfidenz Ø 67%      │
├────────────────────────────────────────────────────────┤
│                                                        │
│ ┌── A. Schmidt ─────────────────── [offen]──┐         │
│ │ Stimmung   [-2][-1][ 0][+1●][+2]           │         │
│ │ Kooperation[-2][-1][ 0][+1][+2●]           │         │
│ │ KI-Konfidenz 73% ▓▓▓▓▓▓▓░░░                │         │
│ │ [Übernehmen]  [Ablehnen]  [Anders bewerten]│         │
│ └────────────────────────────────────────────┘         │
│ ┌── B. Weber ─────────────── [✓ übernommen]┐          │
│ │ Stimmung   [-2][-1][ 0●][+1][+2]           │         │
│ │ Kooperation[-2][-1●][ 0][+1][+2]           │         │
│ │ KI-Konfidenz 41% ▓▓▓▓░░░░░░ ⚠ niedrig      │         │
│ │ [Übernommen ✓]                             │         │
│ └────────────────────────────────────────────┘         │
│ ┌── C. Roth ──────────────────────── [offen]┐          │
│ │ … (collapsed by default after ~3rd card)    │         │
│ └────────────────────────────────────────────┘         │
│                                                        │
├────────────────────────────────────────────────────────┤
│ 2 von 4 entschieden                                    │
│ [Alle übernehmen] [Alle ablehnen]                      │
│              [Schließen]  [Speichern (2)]              │
└────────────────────────────────────────────────────────┘
```

### 6.3 Mixed-state Item-Header (2 of 4 decided)

```
[Meeting] [Bidirektional] 13.05.2026  [4 Teilnehmer]
[✦ KI-Vorschlag · 2 offen]   ← counter shrinks as decisions accumulate
```

When all 4 are decided → AI-Pill **disappears**, regular pills (β-style) show the final values with `_source` halo (`ai_accepted` / `ai_rejected` / `manual`).

## 7. Designer-Decisions (Pflicht-Output)

### D1 — Pill Anchor: one Pill per Interaction (not per Participant), but **counter-aware**

**Decision:** Single AI-Pill at the **InteractionItem-Header**, with a live counter `"✦ KI-Vorschlag · {n} offen"` where `n = count(participants WHERE _source='ai_proposed')`.

Rationale:
- Per-Participant-Pill in the header would create up to 10 pills for a board meeting → visual noise.
- The **per-Participant decision state** already lives on the `ParticipantPillsStrip` rows (via `_source` halo + decision chip in the Sheet). That is enough fidelity.
- Mixed state (2 decided, 2 open) is communicated by the **counter** + by the **per-row halo** on the Strip.
- When `n = 0`, the Pill is removed; the Strip below still shows the values with their `_source` markers, so the user can audit later.

### D2 — Sheet > Modal > Inline-Expand

**Decision:** `Sheet side="right"` (`sm:max-w-2xl`).

Rationale:
- N can be up to ~10 stakeholders in a workshop. A centered Dialog forces vertical scroll inside an already-modal container, losing the interaction context behind it. The Sheet leaves the InteractionItem visible on the left for context.
- Inline-Expand would push the entire interaction list down and disorient the user on long lists.
- **ε reuse argument:** Coaching-Recommendations are also 1..n items per stakeholder, also need quote-citations and longer text. The same `Sheet` shell with a different body slot works for both. Concretely: `AIReviewSheet` becomes a generic `<AIReviewShell>{children}</AIReviewShell>` where γ.2 mounts `<ParticipantReviewList>` and ε mounts `<CoachingRecommendationList>`. **Same surface → consistent muscle memory for the PL.**

### D3 — Per-Participant Edit Layout: **stacked Cards, not table, not tabs**

**Decision:** Vertical Cards (one per participant), each card holds two ToggleGroup-Slider-Rows + confidence + per-card actions. After scroll position 3, further cards are **collapsed** (show only header + DecisionChip + a one-line preview "+1 / +2 · 73%"). User clicks to expand.

Rationale:
- Table would force horizontal scroll on tablet/mobile and is hard to reuse for ε.
- Tabs hide N-1 participants behind a click — the PL needs to see overall mood at a glance.
- Stacked Cards is the same pattern as PROJ-31 Approval-Gates per-approver list (which has worked).
- Confidence is shown as **Microbar (5 dots) + numeric** (`●●●○○ 73%`). The Microbar uses `Progress` (h-1.5, w-16). Color stays neutral (`outline-variant` fill, `primary` for the filled portion) — **confidence does not get a red/yellow/green semantic** because confidence is not the same as risk; a confident negative signal is still a confident signal, and we do not want to dilute the `tertiary`/`error` tokens.

### D4 — Review-Queue-Listing: **Now / Next split**

**Decision γ.2 scope:**
- **Now (γ.2):** Per-Stakeholder banner at the top of the Kommunikations-Tab ("3 KI-Vorschläge offen → Alle prüfen"), opens the same Sheet in "Queue-Mode" iterating through every pending interaction of THIS stakeholder. Same component, different data source. Cost: ~0.5 PT additional.
- **Next:** Project-wide "Open AI Reviews" surface as a Project-Room sidebar badge + a dedicated page `/projects/[id]/ki-reviews`. Aggregates Sentiment proposals (γ.2) + Coaching recommendations (ε) + future PROJ-44 ingestion proposals. **Out of γ.2 scope** — proposed as **PROJ-65 candidate** ("Tenant-wide AI Proposal Inbox").
- **Later:** Global "My AI Reviews" inbox in PROJ-64 Global Dashboard. Surface to the PM as a Daily-Standup view.

### D5 — OF-1 Aggregation Formula: **Median + Outlier-Highlight**

**Decision:** Aggregate on Interaction-Level for the **stakeholder list-page summary cards** (not for the per-interaction pills, which are always per-participant). Aggregate = **Median**, with an additional badge `"⚠ Streuung"` if `max - min ≥ 3`.

Rationale:
- Mean systematically lies in bimodal Meetings ("2 koop + 2 obstr" → false-neutral mean). CIA L3 explicitly called this out.
- Median preserves the dominant tone but loses minority signal. We restore minority visibility via the Streuung-badge.
- Mode is unstable for 4-person samples with ties.
- This is one helper `aggregateInteractionSignal(participants[]) → { median, spread }` — used in α/β Interaction-Item already (`focusedParticipant`-Logic Z. 531). γ.2 only adds the spread-marker.

### D6 — OF-2 Overdue-Threshold (advisory, not γ.2 scope)

**Recommendation for δ-followup:** Use the **PROJ-26 method-gating** as source of truth. Defaults:
- Scrum: 3 working days (sprint cadence is short, signal must surface fast)
- Kanban: 5 working days
- Waterfall / SAFe / V-Modell: 14 working days (formal cycles)
- Tenant-override per project in `project_settings.communication_overdue_days`.

Persist as `tenant_settings.communication_overdue_defaults` (one entry per method-key). UI: a small `Select` in the Tenant-Risk-Score config page (where `communication_weight` already lives in ζ).

### D7 — Edge-State UX (all states resolved here, not left to /frontend)

See **§ D) Edge-State-Matrix** below.

## 8. Interaction-Spec (Click-Paths and Transitions)

### 8.1 Happy path (with provider)

1. PL creates an interaction with summary + ≥1 participant.
2. On POST-Success, server immediately invokes `invokeSentimentGeneration` (server-action, non-blocking returns the interaction). Frontend renders the new InteractionItem with a **`Skeleton`-strip** in the ParticipantPillsStrip + Toast „KI-Analyse läuft…" + spinner inside an empty AI-Pill.
3. Within ≤ 10s (typical), the server-action emits `{ status: 'completed', signals: [...] }`. Polling or `router.refresh()` updates the row.
4. Pill switches from `Skeleton` → `"✦ KI-Vorschlag · {n} offen"`. Strip renders pre-filled values with halo + microbar.
5. Click pill → Sheet opens, focus moves into Sheet (a11y), first un-decided card has focus on its „Übernehmen"-button.
6. PL clicks „Übernehmen" → row collapses, DecisionChip flips to ✓ übernommen, counter decrements. State persists optimistic; server confirms.
7. When all decided → on Sheet close, parent re-fetches, Pill disappears.

### 8.2 Modify path

- „Anders bewerten" expands the ToggleGroup-Slider so PL can pick different value. Confirm with „Speichern (1)". → `_source = 'manual'` (User-Override).

### 8.3 Reject path

- „Ablehnen" → row collapses, DecisionChip flips to ✗ abgelehnt. `_source = 'ai_rejected'`, values null.
- The Strip then shows the row as „nicht bewertet" pills with dashed border (matches the existing β-Pattern in `signalPill` Z. 605–631 for `value == null`).

### 8.4 Bulk

- „Alle übernehmen" → all undecided rows go to `ai_accepted`. Confirmation `AlertDialog` if N ≥ 5.
- „Alle ablehnen" → no confirmation needed (it is the safer choice).
- Bulk respects already-decided rows (idempotent — doesn't re-touch them).

### 8.5 Keyboard

| Key | Action |
|---|---|
| `Esc` | Closes Sheet (standard) |
| `Tab` | Cycles Sheet-internal focus (cards → bulk actions → footer) |
| `1`..`5` (when slider has focus) | Sets value to -2/-1/0/+1/+2 |
| `A` / `a` | Übernehmen (current card) |
| `R` / `r` | Ablehnen (current card) |
| `M` / `m` | Anders bewerten (current card → focuses first slider) |
| `Shift+A` | Alle übernehmen |
| `Enter` (on footer) | Speichern |

Hotkeys documented inline via `Tooltip` on each button (matches PROJ-23 sidebar a11y pattern).

## 9. D) Edge-State Matrix

| Zustand | Trigger | UI |
|---|---|---|
| **AI-call läuft** | Server-action started, no result yet | `Skeleton` strip for participants. Empty AI-Pill with inline spinner: `✦ KI analysiert…`. Disabled cursor on pill. Sheet not openable. |
| **AI-call abgeschlossen, pending review** | `_source = 'ai_proposed'` exists for ≥1 participant | AI-Pill `"✦ KI-Vorschlag · {n} offen"`, `primary-container/15` bg, `primary/40` border. Strip rows show pre-filled values + halo + microbar. |
| **AI-call mit Stub** (γ.1: no provider implementation) | `status = 'completed'` but provider returned via `StubProvider.generateSentiment` (neutral 0/0, confidence 0.3) | Pill = `"✦ Lokaler Stub · Review nötig"` with **tertiary** color (`tertiary/15` bg) — distinguishes from real-provider proposal. Sheet header shows `StubFallbackBanner` with `Alert variant="default"` (not destructive): *"Kein KI-Provider verfügbar — neutrale Platzhalter wurden eingetragen. Bitte manuell bewerten oder ablehnen."* Confidence-Microbar shows 30% with **dashed border** (visual marker that this is not a real measurement). |
| **External_blocked** (Class-3, no tenant provider key) | `ki_runs.status = 'external_blocked'` | **No Pill** at all. Instead a single **muted Banner** above the AddInteractionForm: `Alert variant="default"` with icon `ShieldAlert`: *"KI-Sentiment ist für diesen Mandanten nicht verfügbar — keine kompatiblen AI-Provider hinterlegt. Tenant-Admin: /settings/tenant/ai-providers"*. Banner dismissable per session (localStorage). Manual β-flow (existing) still works. |
| **AI-call failed** | `status = 'failed'` or network error | Toast (destructive): *"KI-Vorschlag fehlgeschlagen — Werte können manuell gesetzt werden"*. Pill becomes `"✦ KI fehlgeschlagen · Wiederholen"` with `error/15` bg. Click reopens the request via the same server-action. After 2 retries, pill switches to permanent "✦ KI nicht verfügbar" muted state until next manual trigger. |
| **Bereits reviewed** | All participants `_source ∈ {ai_accepted, ai_rejected, manual}` | No AI-Pill on the header. Strip shows final values with appropriate halo (`(KI ✓)` / `(KI ✗)` / no marker for manual). Existing β-`signalPill` already supports this via the `aiHint` branch (Z. 619–624). |
| **Mixed** | Some accepted/rejected, some still `ai_proposed` | AI-Pill counter reflects only undecided. Strip rows visually mix halos. Sheet opens with already-decided cards collapsed (showing DecisionChip + 1-line preview). |
| **Stakeholder deleted** | Participant CASCADE-deleted between proposal and review | Sheet card shows greyed-out row: *"(Stakeholder gelöscht — Vorschlag verworfen)"* with auto-rejected state. No action buttons. |
| **Permission denied** (user has `view` not `edit`) | RBAC | Pill visible but cursor `not-allowed`. Tooltip: *"Nur Projekt-Manager dürfen KI-Vorschläge prüfen."* Sheet does not open. Strip read-only. |
| **Offline / 403 mid-review** | Save action fails | Per-card error border, inline message *"Speichern fehlgeschlagen — erneut versuchen"*. Other cards keep their state in local Sheet-state until save retries. |
| **Empty (no AI yet)** | Brand-new interaction, no AI run | No AI-Pill. Inline button on InteractionItem header: `[✦ KI-Analyse anfragen]` (only visible if tenant has any provider, otherwise hidden). |

## 10. Frontend-Handoff — Acceptance Criteria

| ID | AC |
|---|---|
| **FE-1** | New component `AIProposalPill` in `src/components/stakeholders/communication/ai-proposal-pill.tsx` accepts `{ pendingCount: number, isStub: boolean, isFailed: boolean, onClick }` and renders the four pill variants from §D matrix. |
| **FE-2** | New component `AIReviewSheet` in `src/components/stakeholders/communication/ai-review-sheet.tsx` uses `Sheet side="right"` (mirror `profile-edit-sheet.tsx` props/structure) and accepts `{ open, onOpenChange, projectId, interactionId, participants: InteractionParticipant[], runMetadata: { provider, model, status, confidence_avg } }`. |
| **FE-3** | Each `ParticipantReviewCard` uses `ToggleGroup type="single"` for the two sliders, identical to existing `SignalSlider` (Z. 842–876) but rendered side-by-side, not above-each-other. Pre-selects the AI-proposed value. |
| **FE-4** | Decision state lives in Sheet-local React state; only on "Speichern" footer click do we POST all decisions in one batch to `PATCH /api/projects/[id]/interactions/[iid]/ai-review` (new endpoint expected from /backend). Batch body shape: `{ decisions: [{ stakeholder_id, decision: 'accept' \| 'reject' \| 'modify', overrides?: { sentiment, cooperation } }] }`. |
| **FE-5** | Inline AI-Pill at `InteractionItem`-header is only rendered when `participants.some(p => p.participant_sentiment_source === 'ai_proposed' \|\| p.participant_cooperation_signal_source === 'ai_proposed')`. The counter is the **count of stakeholders** with ≥1 unresolved `ai_proposed` field (not the count of fields). |
| **FE-6** | `ParticipantPillsStrip` replaces the current single-participant `ParticipantSignalRow` (Z. 633–684) on interactions with `>1` participant. For 1-participant interactions, the existing β-row stays (no regression). |
| **FE-7** | Confidence microbar is a `Progress` of height `h-1.5` and width `w-16`, using neutral colors only (no red/yellow). Numeric percentage label has `tabular-nums`. |
| **FE-8** | Banner variants (StubFallback / ExternalBlocked / AIFailed) all use the shadcn `Alert` primitive — no custom banner code. ExternalBlocked link routes to `/settings/tenant/ai-providers` (existing PROJ-32 surface). |
| **FE-9** | Keyboard map of §8.5 is implemented via a single `onKeyDown` on the Sheet root; the focused card is tracked in Sheet-local state. `Esc` MUST NOT discard local decisions silently — show `AlertDialog` "Ungespeicherte Entscheidungen verwerfen?" when ≥1 unsaved decision is in state. |
| **FE-10** | All new tokens use `primary-container` / `tertiary-container` / `error-container` from `docs/design/design-system.md`. No new hex literals. Pill background = `primary-container/15` + `primary/40` border (matches §6.1). |
| **FE-11** | Tests: vitest unit-tests for `AIProposalPill` (4 variants) and for `aggregateInteractionSignal` (median + spread). Playwright smoke for happy-path Accept + Reject + Modify (3 scenarios). |
| **FE-12** | a11y: Sheet announces "{n} KI-Vorschläge zu prüfen für {N} Teilnehmer" via `aria-live="polite"` on open. Each DecisionChip change emits `aria-live="polite"` on the card. Buttons have explicit `aria-label` (German labels). |

## 11. F) Now / Next / Later

| Now (γ.2) | Next (PROJ-65 candidate) | Later (PROJ-64 / ε) |
|---|---|---|
| AI-Pill on InteractionItem | Project-wide "Open AI Reviews" page `/projects/[id]/ki-reviews` | Global "My AI Reviews" inbox in PROJ-64 dashboard |
| `AIReviewSheet` Multi-Participant | Sidebar badge in PROJ-23 Sidebar showing total open AI reviews per project | Tenant-wide notification when ≥10 pending |
| Stakeholder-Tab Banner with Mini-Queue | Bulk-mode across multiple interactions (currently we Sheet one interaction at a time) | Auto-batch "Empfehlung der Woche" for low-priority interactions |
| Stub-Fallback Alert | Provider-real implementations for Anthropic/OpenAI/Google `generateSentiment` (`PROJ-32x`) | Confidence-threshold auto-accept (e.g. ≥95% no-review). **Explicit non-goal** per Out-of-Scope §117 of the spec, but worth noting as future research. |
| Median + Streuung Aggregation | OF-2 method-aware Overdue-Threshold in tenant-settings (δ-followup) | ε reuses `AIReviewShell` for Coaching-Recommendations |
| | Separate `sentiment` cost-cap topf (CIA L7, currently deferred per γ.1 implementation note) | |

## 12. G) Mobile / Tablet / Desktop

| Width | Behavior |
|---|---|
| **1440px+ (desktop)** | Stakeholder-Tab is in main column (max-w-7xl per `page.tsx` Z.18). Sheet opens at 640px from right, leaves ~800px of context visible. Cards in Sheet show sliders side-by-side. |
| **768px (tablet)** | Sheet opens at `sm:max-w-md` (~480px), context shrinks but stays usable. Sliders stack vertically inside each card. Bulk-actions go full-width in footer. |
| **375px (mobile)** | Sheet goes full-screen (`w-full`, no `sm:max-w-*`). Inline AI-Pill on InteractionItem **shows only the icon + counter** (no full text label — `✦ 4`). Tooltip on long-press. Strip rows show only one signal at a time, swipeable horizontally (one of Stimmung/Kooperation visible, swipe to flip). Confidence microbar is hidden on mobile (numeric % only). Bulk-mode in Sheet shows action buttons in a 2-column grid. |

## 13. Accessibility-Notes

- All four Pill variants pass WCAG AA contrast on `surface-container-low` background (verified via the existing PROJ-51 token contrast pass — `primary-container` + `on-primary-container` already audited).
- Sheet has `role="dialog"` (provided by shadcn `Sheet`), `aria-labelledby` pointing to `SheetTitle`.
- Confidence microbar has `aria-valuetext="KI-Konfidenz 73 Prozent"` on the `Progress`.
- Sparkle icon (`Sparkles` lucide) is `aria-hidden="true"`; the textual label `KI-Vorschlag` carries semantic.
- Per-card `aria-live="polite"` announces decision changes.
- Reduced-motion: the Sheet open transition respects `prefers-reduced-motion` (shadcn default).
- Focus-trap inside Sheet (shadcn default); on close, focus returns to the AI-Pill that opened it.

## 14. Frontend Handoff — Files Likely Affected

| File | Change-Type |
|---|---|
| `src/components/stakeholders/communication/communication-tab.tsx` | Modify — add `AIProposalsBanner`, modify `InteractionItem` header + body, route Sheet trigger |
| `src/components/stakeholders/communication/ai-proposal-pill.tsx` | **New** |
| `src/components/stakeholders/communication/ai-review-sheet.tsx` | **New** — uses `Sheet` primitive |
| `src/components/stakeholders/communication/participant-review-card.tsx` | **New** — exported for ε-reuse |
| `src/components/stakeholders/communication/participant-pills-strip.tsx` | **New** — replaces the per-row `ParticipantSignalRow` for `>1`-Participant case |
| `src/lib/stakeholder-interactions/api.ts` | Modify — add `submitAIReviewBatch(projectId, interactionId, decisions)` |
| `src/lib/stakeholder-interactions/aggregate.ts` | **New** — `aggregateInteractionSignal(participants[])` (median + spread) |
| `src/app/api/projects/[id]/interactions/[iid]/ai-review/route.ts` | **New** (backend, /backend slice) |
| `src/components/stakeholders/communication/communication-tab.test.tsx` | Modify — add 4 new test cases |
| `tests/PROJ-34-gamma2-ai-review.spec.ts` | **New** Playwright smoke (3 scenarios) |

## 15. Open Questions and Risks

| # | Question | Risk | Mitigation |
|---|---|---|---|
| OQ-1 | Does the server-action emit a realtime event on AI completion, or do we poll? | Without realtime, the loading state lingers and users may double-trigger. | /backend MUST decide between Supabase Realtime channel `ki_runs:{run_id}` vs simple polling every 3s for up to 15s, then fail-toast. Spec for /backend. |
| OQ-2 | Cost-cap exceeded mid-Sheet (rare race) | User decides, saves, server rejects with 402 cost-cap-exhausted | Display dedicated banner inside Sheet on save-fail and keep local state intact. |
| OQ-3 | ε reuse — does `AIReviewShell` need a generic decision shape? | Coupling | Define `AIReviewDecision<T>` generic at ε time. Not in γ.2 scope. |
| OQ-4 | Provider rotation — if tenant has 2 providers and one fails mid-Sheet, do we offer "retry with other provider"? | Adds complexity | **Out of γ.2 scope.** Will surface as PROJ-32x follow-up. |

---

> **Handoff:** Designer brief complete. Next step: Run `/frontend features/PROJ-34-stakeholder-communication-tracking.md` and use sections §10 (FE-1..FE-12 ACs) + §14 (Files Likely Affected) as the implementation target. Backend stub for `PATCH /api/projects/[id]/interactions/[iid]/ai-review` will need /backend follow-up.