# PROJ-50: Bidirectional Jira Sync

## Status

Planned

## Summary

Extend the Jira export connector into bidirectional sync with inbound webhooks, external references, conflict handling, and audit visibility. This starts only after PROJ-47 has proven outbound mapping and job logging.

## Source Requirements

- `features/PROJ-14-integrations-connectors.md`
- `features/PROJ-47-jira-export-connector.md`
- `features/JIRA-IMPORT-2026-04-30.md`

## Dependencies

- Requires: PROJ-47 Jira export connector
- Requires: PROJ-9 work item model
- Requires: PROJ-10 audit/versioning
- Influences: PROJ-46 software extension

## User Stories

### ST-01 Inbound Webhook Receiver
As an integration owner, I want Jira webhooks received and verified so that Jira-side changes can be considered by V3.

Acceptance criteria:
- [ ] Webhooks are authenticated/verified.
- [ ] Unknown Jira issue keys are ignored or quarantined.
- [ ] Webhook processing is idempotent.

### ST-02 External References
As the system, I want stable external refs between V3 work items and Jira issues so that sync state is reliable.

Acceptance criteria:
- [ ] External refs store provider, project key, issue key, external URL, and last sync timestamp.
- [ ] External refs are tenant-scoped.
- [ ] Deleting a V3 item does not silently delete Jira issues.

### ST-03 Conflict Resolution
As a project lead, I want conflicts to be surfaced for review so that Jira and V3 do not overwrite each other silently.

Acceptance criteria:
- [ ] Last-writer conflicts create reviewable sync conflicts.
- [ ] Users can choose V3 wins, Jira wins, or manual merge for supported fields.
- [ ] Conflict decisions are audited.

## Out of Scope

- Full Jira workflow migration.
- Syncing every custom Jira field.
- Automatic destructive deletes across systems.

## Technical Requirements

- Use queued/background-safe processing for webhook bursts.
- Store sanitized raw webhook metadata only as allowed by tenant retention policy.
- All inbound changes must pass the same validation as native API mutations.

## V2 Reference Material

- `docs/decisions/connector-framework.md`
- `features/JIRA-IMPORT-2026-04-30.md`

