# Stakeholder Risk-Engine — Architektur-Übersicht

**Owner:** PROJ-35 (Phase 35-α deployed; β + γ in Entwicklung)
**Status:** Living Doc

## Zweck

Die Risk-Engine berechnet aus existierenden Stakeholder-Daten (PROJ-8, PROJ-33-α/γ/δ) drei abgeleitete Sichten:

1. **Risk-Score** (0–10, farbkodiert) — Multiplikative Formel aus Influence × Impact × Attitude × Conflict × Big5-Modifier × Authority.
2. **Eskalations-Patterns** — 4 hardcoded Hochrisiko-Konstellationen mit Audit-Trail.
3. **Tonalitäts-Empfehlung** — 32-Quadranten-Lookup auf Big5/OCEAN.

Plus zwei Aggregat-Sichten: **Wahrnehmungslücke** (Skill + Big5 separat) und **Trend-Sparkline** (zeitliche Entwicklung).

## Compute-Pipeline

```
[Stakeholder-Detail open] → fetch stakeholder + skill + personality profiles
   ↓
[merge tenant_settings.risk_score_overrides + defaults] = effective Config
   ↓
   ├── computeRiskScore(input, config)           → score + bucket
   ├── detectEscalationPatterns(input)            → text[]
   ├── resolveTonality(big5_fremd, channel, ...)  → recommendation
   ├── computeSkillGap(skill_profile)             → aggregate
   └── computeBig5Gap(personality_profile)        → aggregate
   ↓
[UI rendert Banner + Cards + Sparkline]
```

Alle Compute-Funktionen sind **pure** und liegen in `src/lib/risk-score/`. Keine DB-Writes; keine KI-Calls; sub-millisekunden Cost.

## Audit-Pipeline

```
[Stakeholder UPDATE]
  attitude / influence / conflict_potential / decision_authority
  ↓
[Trigger: stakeholders_audit_escalation_patterns_upd]
  ↓
[audit_escalation_patterns()]
  - join: stakeholders + stakeholder_personality_profiles
  - compute new patterns via compute_escalation_patterns()
  - read old patterns from stakeholders.current_escalation_patterns
  - INSERT audit-event for each delta (activated/deactivated)
  - UPDATE stakeholders.current_escalation_patterns
```

Identische Pipeline auf `stakeholder_personality_profiles` UPDATE OF `agreeableness_fremd, emotional_stability_fremd`.

## Datenmodell

### Schreibend (Phase 35-α)

| Tabelle | Spalte | Typ | Default | Zweck |
|---|---|---|---|---|
| `tenant_settings` | `risk_score_overrides` | jsonb | `'{}'::jsonb` | Tenant-spezifische Multiplikator-Overrides. Schema: siehe `merge-overrides.ts`. |
| `stakeholders` | `current_escalation_patterns` | text[] | `array[]::text[]` | Snapshot der zuletzt-detected Patterns. Vom Trigger gepflegt. Read-only für UI. |

### Lesen-only (existing)

- `stakeholders.{influence, impact, attitude, conflict_potential, decision_authority, communication_need, preferred_channel}` (PROJ-33-α)
- `stakeholder_skill_profiles.{*_fremd, *_self}` (PROJ-33-γ)
- `stakeholder_personality_profiles.{*_fremd, *_self}` (PROJ-33-γ)
- `audit_log_entries` (PROJ-10) — für Trend-Sparkline-Source der qualitativen Felder
- `stakeholder_profile_audit_events` (PROJ-33-γ + PROJ-35-α-Erweiterung) — für Trend-Sparkline-Source der Profile + Pattern-Activations

### Audit-Event-Form (Pattern-Trigger)

Schreibt in `stakeholder_profile_audit_events`:

```jsonb
{
  "event_type": "escalation_pattern_changed",
  "actor_kind": "system",
  "actor_user_id": null,
  "actor_stakeholder_id": null,
  "profile_kind": "escalation",
  "payload": {
    "pattern_key": "blocker_decider",
    "action": "activated"  // or "deactivated"
    "snapshot": {
      "attitude": "blocking",
      "conflict_potential": "critical",
      "decision_authority": "deciding",
      "influence": "critical",
      "agreeableness_fremd": 25,
      "emotional_stability_fremd": 30
    }
  }
}
```

`actor_kind='system'` ist ein neuer Wert, der in 35-α zur `actor_consistency`-CHECK hinzugefügt wurde.

## Skalierungs-Schwellwerte

| Komponente | MVP-Schwellwert | Kipp-Punkt |
|---|---|---|
| Compute-on-Read (TS) | < 5ms pro Stakeholder | ~2.000 aktive Stakeholder pro Tenant ⇒ Materialized View |
| Trend-Sparkline (ad-hoc aus Audit) | < 100ms pro Stakeholder | ~10.000 Audit-Events pro Stakeholder ⇒ `risk_score_history` Materialisierung |
| Health-Dashboard (Range-Query) | < 200ms für 100 Stakeholder | ~500 Stakeholder ohne Pagination ⇒ Pagination + Compute-on-Read-View |

## Anti-Patterns explizit ausgeschlossen

- ❌ **Materialized View für Risk-Score** im MVP — Premature-Optimization.
- ❌ **Eigene `risk_score_history`-Tabelle** — 36k Rows/Jahr/Tenant ohne validierten Need.
- ❌ **Pattern-Engine-DSL** — 4 hardcoded Patterns reichen für MVP.
- ❌ **Big5-Empfehlungs-LLM-Call** — Class-2-Compliance + Kosten-Vermeidung.
- ❌ **Realtime-Push fürs Dashboard** — Polling alle 30s reicht.

## Code-Layout

```
src/lib/risk-score/
├── defaults.ts              Multiplikator-Konstanten + Bucket-Helper
├── merge-overrides.ts       defaults ∪ tenant overrides (Zod-validated)
├── compute.ts               Risk-Score-Formula (pure)
├── escalation-patterns.ts   Pattern-Detector (mirrored to PG-Function)
├── perception-gap.ts        Skill + Big5 Aggregate (60% coverage)
├── big5-tonality-table.ts   32-Quadranten-Lookup + Override-Logik
└── *.test.ts                Pure-Function-Coverage (54 Cases in 35-α)

src/app/api/tenants/[id]/settings/risk-score/
└── route.ts                 GET · PUT · DELETE (Tenant-Admin only)

supabase/migrations/
└── 20260502230000_proj35a_risk_score_engine.sql
    ├── tenant_settings.risk_score_overrides column
    ├── stakeholders.current_escalation_patterns column
    ├── audit-event CHECK constraints extended (actor_kind='system')
    ├── compute_escalation_patterns() pure SQL helper
    ├── audit_escalation_patterns() trigger function
    └── 4 Triggers (2 stakeholders + 2 spp)

docs/decisions/
├── risk-score-defaults.md       ADR für Multiplikator-Werte
└── big5-tonality-lookup.md      ADR für 32-Quadranten-Lookup
```

## Sicherheits- + Compliance-Notes

- **Class-2** (Risk-Score selbst ist abgeleitet, nicht direkt personenbezogen identifizierend).
- **RLS:** alle neuen Spalten erben die Policies ihrer Eltern-Tabelle.
- **RBAC:** Tenant-Admin only für Override-Saves; alle Member dürfen GET-Read der effektiven Config (für "Warum dieser Score?"-Tooltip).
- **Audit:** Pattern-Activations als append-only Audit-Events; auch Override-Änderungen werden via PROJ-10 audit_log_entries getrackt (tenant_settings ist im Tracking-Set).
- **Defense-in-Depth:** Override-Schema-Validation am Read- UND Write-Pfad (gegen DB-Drift bei direkten SQL-Mutationen).

## Phasen-Status

- ✅ **35-α (deployed):** Compute-Bibliothek + Migration + Tenant-Config-API + Audit-Trigger + ADRs.
- ⏳ **35-β:** `phases.is_critical`-Migration + Stakeholder-Detail-UI (Risk-Banner · Pattern-Banner · Tonalitäts-Card · Wahrnehmungslücke-Section).
- ⏳ **35-γ:** Sparkline + Health-Dashboard (Page + Tab-Shortcut + Counter-Badge).
