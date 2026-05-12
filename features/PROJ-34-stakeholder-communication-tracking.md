# PROJ-34: Stakeholder Communication Tracking

## Status

Planned

## Summary

Track stakeholder communication signals as structured project data: interaction history, response behavior, cooperation indicators, sentiment, and coaching context. This closes the gap referenced by PROJ-33 and PROJ-35 where stakeholder risk can use qualitative profile data but cannot yet learn from actual communication behavior.

## Source Requirements

- `docs/Stakeholderwissen/`
- `features/PROJ-33-stakeholder-extension.md`
- `features/PROJ-35-stakeholder-interaction-engine.md`
- `docs/PRD.md`

## Dependencies

- Requires: PROJ-8 stakeholder core
- Requires: PROJ-13 communication center
- Requires: PROJ-30 narrative purpose
- Influences: PROJ-35 stakeholder risk score
- Influences: PROJ-39 assistant action packs

## User Stories

### ST-01 Interaction Log
As a project lead, I want stakeholder interactions to be recorded with channel, date, participants, and summary so that communication history is not lost in free text.

Acceptance criteria:
- [ ] Interactions are project-scoped and tenant-scoped.
- [ ] An interaction can reference one or more stakeholders.
- [ ] Supported channels include email, meeting, chat, phone, and other.
- [ ] Raw personal content is classified before any AI processing.

### ST-02 Sentiment and Cooperation Signals
As a project lead, I want interaction-level sentiment and cooperation signals so that emerging conflict can be detected early.

Acceptance criteria:
- [ ] Signals are stored as reviewable values, not hidden AI truth.
- [ ] Users can override generated sentiment/cooperation values.
- [ ] Class-3 data never leaves allowed provider paths.

### ST-03 Response Behavior
As a project lead, I want the system to show response latency and missing-response patterns so that blocked stakeholder loops become visible.

Acceptance criteria:
- [ ] Open communication requests can be marked as awaiting response.
- [ ] Overdue responses are visible in the stakeholder detail surface.
- [ ] Response behavior can feed PROJ-35 risk scoring only after review.

### ST-04 Coaching Context
As a project lead, I want communication recommendations based on stakeholder profile and recent interactions so that outreach is better targeted.

Acceptance criteria:
- [ ] Recommendations cite source interactions and profile inputs.
- [ ] Recommendations are advisory only and never auto-send messages.
- [ ] Assistant action packs can read approved recommendations later.

## Out of Scope

- Automatic email inbox ingestion. This belongs to PROJ-44.
- Real Teams adapter. This belongs to PROJ-49.
- Autonomous communication sending. This belongs to later assistant action packs.

## Technical Requirements

- Every new table must include `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`.
- RLS must use established tenant and project membership helpers.
- AI-derived fields must carry source traceability, model/provider identity, and review state.
- Communication-derived risk inputs must be optional and auditable.

## V2 Reference Material

- `docs/decisions/stakeholder-vs-user.md`
- `docs/decisions/stakeholder-data-model.md`
- `docs/decisions/communication-framework.md`
- `docs/Stakeholderwissen/`

