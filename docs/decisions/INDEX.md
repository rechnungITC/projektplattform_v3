# Architecture Decision Records (ADR) — Index

> All ADRs are inherited from V2. Stack-specific references (FastAPI, Redis, etc.) are historical; the **decisions still apply** to the V3 Next.js + Supabase implementation. New V3-specific decisions go alongside these as additional ADRs.

## Decisions Catalog

| ADR | One-Line Summary |
|---|---|
| [architecture-decisions-table.md](architecture-decisions-table.md) | Consolidated table of all architecture decisions with cross-references. |
| [architecture-principles.md](architecture-principles.md) | Shared core + project-type-specific extensions; AI as proposal layer; orchestration is internal, not bound to LangGraph. |
| [backlog-board-view.md](backlog-board-view.md) | Backlog view toggle (List / Board), 5-column status board, arrow-button card movement instead of drag & drop in v1. |
| [communication-framework.md](communication-framework.md) | Outbox pattern + channel-adapter protocol for project communication; defers real provider integrations per channel. |
| [compliance-as-dependency.md](compliance-as-dependency.md) | Compliance & process artifacts (ISO, GDPR, M365, vendor-evaluation, etc.) are first-class dependencies via tags + `ComplianceTrigger` service. |
| [connector-framework.md](connector-framework.md) | Connector registry with `ConnectorDescriptor`, default `UnconfiguredConnector` stubs, admin-only API surface. |
| [data-privacy-classification.md](data-privacy-classification.md) | Three data classes (1/2/3); class-3 (personal data) is technically blocked from external LLMs — no bypass. |
| [deployment-modes.md](deployment-modes.md) | Two operation modes (shared SaaS, stand-alone enterprise) sharing one codebase, switched by config. |
| [master-data-editing.md](master-data-editing.md) | Master-data editing covered by cross-cutting Audit/Undo/Role-checks; no new code path needed for EP-03-ST-05. |
| [metadata-model-context-sources.md](metadata-model-context-sources.md) | Minimal metadata model for context sources: required (id/project/type/title/date), optional (author/origin/tag), and Wave-3 reserved fields. |
| [metamodel-infra-followups.md](metamodel-infra-followups.md) | Follow-ups: Sprint entity, SAFe portfolio kinds, per-tenant retention overrides, Ollama local provider. |
| [method-catalog.md](method-catalog.md) | Active methods enum: Scrum, Kanban, Waterfall, SAFe; PMI/PRINCE2/VXT2.0 as templates layered over methods. |
| [method-object-mapping.md](method-object-mapping.md) | Mapping of methods to active work-item kinds; bugs are cross-method; phases/milestones for waterfall. |
| [project-room.md](project-room.md) | Project room is implicit (the project detail page) with tab layout: Overview, Planning, Backlog, Settings, plus bonus tabs. |
| [project-rule-engine.md](project-rule-engine.md) | Pure-function rule engine `compute_rules(type, method)` deriving active modules, suggested roles, starter kinds. |
| [project-type-catalog.md](project-type-catalog.md) | Project types kept as code-registry (not DB); ERP and Generic Software defined with standard roles, modules, required info. |
| [retention-and-export.md](retention-and-export.md) | Retention as code policy; admin-only audit export endpoint with class-3 redaction; deletion via `apply_retention`. |
| [role-model.md](role-model.md) | Two role layers: platform/tenant roles (admin/member/viewer) and project roles (lead/editor/viewer); combined check on every request. |
| [sprint-1-product-open-points.md](sprint-1-product-open-points.md) | D-P1 archive=closed, D-P2 all projects visible to authenticated users (Wave 1), D-P3 project number is optional free text. |
| [stakeholder-data-model.md](stakeholder-data-model.md) | Stakeholder table per project with kind, origin, role, influence, impact; conservative class-3 classification for `name`. |
| [stakeholder-vs-user.md](stakeholder-vs-user.md) | Stakeholder is a business entity, separate from technical user/RBAC; optional `linked_user_id` link. |
| [work-item-metamodel.md](work-item-metamodel.md) | `work_items` STI table with kinds (epic/feature/story/task/subtask/bug/work_package); phases & milestones stay separate; method-aware visibility. |

## Pflege-Regel (unchanged from V2)

New architecture decisions get their own ADR file (`<slug>.md`) and a row in this table. Existing ADRs are not edited; superseded decisions get a new ADR with back-reference.

## Related

- [../GLOSSARY.md](../GLOSSARY.md) — terminology
- [../architecture/domain-model.md](../architecture/domain-model.md) — domain model
- [../architecture/target-picture.md](../architecture/target-picture.md) — target picture (V3 adapted)
- [../../CLAUDE.md](../../CLAUDE.md) — working protocol (incl. V2 Heritage section)
