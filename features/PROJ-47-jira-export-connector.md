# PROJ-47: Jira Export Connector

## Status

Planned

## Summary

Implement the first real Jira adapter on top of PROJ-14 connector plumbing. The scope is outbound export from V3 to Jira with field mapping, credential lookup, retry behavior, and sync logs. Bidirectional sync is explicitly split into PROJ-50.

## Source Requirements

- `features/PROJ-14-integrations-connectors.md`
- `features/JIRA-IMPORT-2026-04-30.md`
- `docs/decisions/connector-framework.md`

## Dependencies

- Requires: PROJ-14 connector registry and tenant secrets
- Requires: PROJ-9 work item model
- Influences: PROJ-46 software extension
- Precedes: PROJ-50 bidirectional Jira sync

## User Stories

### ST-01 Jira Connection
As a tenant admin, I want to configure Jira base URL and credentials so that the platform can export work items.

Acceptance criteria:
- [ ] Credentials are stored via tenant secrets.
- [ ] Test connection validates authentication without leaking secrets.
- [ ] Connector health is visible.

### ST-02 Field Mapping
As a project lead, I want V3 work item fields mapped to Jira issue fields so that exported tickets are useful immediately.

Acceptance criteria:
- [ ] Mapping covers title, description, type, priority, status, assignee, labels, and project key.
- [ ] Unsupported fields are reported before export.
- [ ] Mapping can be tenant-configured later without schema rewrite.

### ST-03 Export Job and Sync Log
As an integration owner, I want exports to run as jobs with visible results so that failures can be retried and audited.

Acceptance criteria:
- [ ] Export results store external Jira issue key and URL.
- [ ] Failures store sanitized error messages.
- [ ] Re-export is idempotent where an external ref already exists.

## Out of Scope

- Jira webhooks.
- Conflict resolution.
- Inbound changes from Jira.

## Technical Requirements

- Use PROJ-14 connector descriptors and tenant secrets.
- Add tenant-scoped sync log/external reference records if existing structures are insufficient.
- Never expose provider credentials in logs or client payloads.

## V2 Reference Material

- `docs/decisions/connector-framework.md`
- `features/JIRA-IMPORT-2026-04-30.md`

