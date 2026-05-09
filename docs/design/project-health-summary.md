# Project Health Summary

## Purpose

The Project-Room overview and report snapshots use the same frozen health
basis. The dashboard loads current values from
`GET /api/projects/:id/health-summary`; report snapshots persist the same
shape in `SnapshotContent.project_health`.

## Metrics

### Budget

- Source: `budget_items`, `budget_item_totals`, `fx_rates`
- Aggregation: `resolveBudgetSummary(..., inCurrency: "EUR")`
- Display: `actual / planned EUR`
- Utilization: `actual / planned * 100`
- State:
  - `empty`: no active budget items
  - `unknown`: planned amount is zero or budget aggregation cannot be resolved
  - `green`: utilization < 80% and no missing FX rates
  - `yellow`: utilization >= 80%
  - `red`: utilization >= 100% or missing FX rates

### Risks

- Source: `risks`
- Open risk: `status === "open"`
- Critical open risk: `score >= 16`
- State:
  - `empty`: no open risks
  - `green`: open risks exist, but none are critical
  - `yellow`: exactly one critical open risk
  - `red`: two or more critical open risks

### Schedule

- Source: `milestones`
- Uses the report traffic-light helper.
- Overdue milestone: `target_date < now` and status is not completed/closed.
- State:
  - `green`: no overdue milestones
  - `yellow`: one or two overdue milestones
  - `red`: three or more overdue milestones

### Stakeholder Risk

- Source: active `stakeholders`, `stakeholder_personality_profiles`,
  `tenant_settings.risk_score_overrides`
- Formula: `computeRiskScore()` in `src/lib/risk-score/compute.ts`
- Inputs:
  - influence
  - impact
  - attitude
  - conflict potential
  - decision authority
  - Big5 agreeableness external assessment
- Bucket mapping:
  - `< 1`: green
  - `1..3`: yellow
  - `3..6`: orange
  - `>= 6`: red
- Dashboard state:
  - `empty`: no active stakeholders
  - `green`: all stakeholders green
  - `yellow`: any yellow/orange stakeholder
  - `red`: any red stakeholder

## Overall Health

Overall project health is the highest severity of:

- report traffic light from schedule + risks
- budget state
- stakeholder-risk state

Labels:

- `green`: Im Plan
- `yellow`: Unter Beobachtung
- `red`: Kritisch

This keeps semantic domains separate while still giving the Project-Room and
reports one concise health result.
