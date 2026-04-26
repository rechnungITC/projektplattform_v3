# Architecture Domain Model

## Purpose

This document describes the business domain structure of the platform at a level that is stable enough to guide later technical design, while remaining independent from implementation details.

The platform is an AI-assisted project orchestration platform. It supports a shared project core and project-type-specific extensions. The implementation stack is fixed (Python + FastAPI backend, Next.js frontend, internal orchestrator, PostgreSQL, Redis, S3, MCP) but this document stays stack-neutral.

---

## 1. Modeling principles

The domain model follows these principles:

- shared logic belongs in the common core
- project-type-specific logic belongs in extensions
- KI-generated content must remain proposal-based and traceable
- output logic must be derived from project state, but remain separate from the core domain
- governance is a cross-cutting business concern, not a side note
- context sources are first-class inputs to the platform

---

## 2. Top-level domain areas

The platform is structured around the following business areas:

1. Project Core  
2. Project-Type Extensions  
3. Context and Communication  
4. KI Proposal Logic  
5. Governance and Decisions  
6. Output and Management Artifacts  

These areas are logically connected but should remain conceptually separated.

---

## 3. Project Core

The Project Core contains the concepts that apply across project types.

### Main entities

#### Project
Represents the overall project container.

Key responsibilities:
- identity of the project
- type of project
- lifecycle status
- ownership and assignment
- relation to phases, milestones, risks, and stakeholders

#### ProjectType
Defines what kind of project this is.

Expected examples:
- general
- erp
- construction
- software

#### Phase
Represents a structured project stage.

Responsibilities:
- sequence
- timing context
- grouping of work and milestones
- governance transitions

#### Milestone
Represents an important target or control point.

Responsibilities:
- date relevance
- progress tracking
- management communication relevance

#### Task
Represents a unit of actionable work.

Responsibilities:
- execution responsibility
- work state
- relation to dependencies
- relation to context-derived proposals

#### Dependency
Represents a relation between two tasks or work units.

Responsibilities:
- ordering logic
- sequencing
- impact on planning

#### Risk
Represents an identified uncertainty or threat.

Responsibilities:
- traceable risk handling
- mitigation awareness
- management escalation relevance

#### Stakeholder
Represents a person, role, or party relevant to the project.

Responsibilities:
- influence and relevance
- communication context
- governance participation

---

## 4. Project-Type Extensions

The following project types should be modeled as extensions to the shared core, not as rewrites of the core.

### ERP Extension

Purpose:
Support ERP implementation projects as the first deep business focus.

Likely extension entities:
- VendorProcess
- VendorCandidate
- EvaluationCriteria
- VendorScore
- ERPModule
- GapAnalysis
- MigrationScope
- TrainingContext
- HypercareContext

Key business idea:
The ERP extension adds structured logic for vendor selection and ERP implementation-specific work, while reusing the shared core for phases, tasks, risks, stakeholders, and outputs.

### Construction Extension

Purpose:
Prepare the product for later construction project support.

Likely extension entities:
- Trade / Gewerk
- ConstructionSection
- Defect / Mangel
- Acceptance / Abnahme
- SiteLog / Bautagebuch

Key business idea:
Construction-specific flows are separate from the core but use the same shared project backbone.

### Software Extension

Purpose:
Prepare the product for later software project support.

Likely extension entities:
- Epic
- Story
- Sprint
- Release
- TestContext

Key business idea:
Software planning concepts are specific extensions, not replacements for the core project model.

---

## 5. Context and Communication

This area captures project-relevant input that comes from outside the structured project model.

### ContextSource
Represents any source that may contain project-relevant information.

Expected source types:
- document
- email
- meeting note
- uploaded file
- structured note

Responsibilities:
- preserve origin
- preserve source metadata
- enable later semantic analysis
- keep traceability

### ProcessedContext
Represents a structured interpretation of one or more context sources.

Responsibilities:
- extracted facts
- identified candidates for action
- structured interpretation layer before accepted domain write-back

This area is important because the platform is context-driven, not only manually structured.

---

## 6. KI Proposal Logic

The KI layer must not silently create hidden truth in the core.  
Instead, it should operate through reviewable proposals.

### Proposal
Represents a suggested structured object derived from context.

Possible proposal types:
- task proposal
- dependency proposal
- risk proposal
- decision proposal
- milestone proposal
- escalation hint
- output hint

Responsibilities:
- carry source traceability
- carry confidence
- remain reviewable
- preserve the path between context and structured project data

### ReviewState
Represents whether a proposal is:
- pending
- accepted
- rejected
- modified

This logic is central to trust and governance.

---

## 7. Governance and Decisions

This area represents formal and semi-formal control logic.

### Decision
Represents a documented decision and its rationale.

Responsibilities:
- decision traceability
- relation to context, stakeholders, and risks
- reference for future project behavior

### ApprovalGate
Represents a control point before progression.

Responsibilities:
- require review or approval
- connect governance to project state
- prevent uncontrolled transitions where needed

### EscalationRule
Represents the conditions under which a project issue must be raised.

Responsibilities:
- make escalation logic explicit
- connect risk, progress, or decision gaps to stakeholder action

Governance is not a peripheral concern. It is part of the business model of the platform.

---

## 8. Output and Management Artifacts

Outputs are derived from project state and governance state but are not the same as the domain core.

### OutputRequest
Represents a request to produce a specific view or artifact.

Possible targets:
- operational view
- management summary
- Gantt structure
- Kanban structure
- steering document
- presentation basis

### GeneratedOutput
Represents the produced artifact or structured output.

Responsibilities:
- audience-aware rendering
- state-based derivation
- reusable management communication basis

This keeps output generation separate from the primary domain model.

---

## 9. Relationship overview

### Core relationships
- Project contains Phases, Milestones, Risks, Stakeholders
- Tasks belong to Projects and often to Phases
- Dependencies connect Tasks
- Risks relate to Projects and may connect to Tasks or Decisions
- Stakeholders relate to Projects, Decisions, and Governance steps

### Extension relationships
- ERP entities extend the Project context without replacing the shared Project model
- Construction entities extend the Project context without replacing the shared Project model
- Software entities extend the Project context without replacing the shared Project model

### Context relationships
- ContextSource feeds ProcessedContext
- ProcessedContext produces Proposals
- accepted Proposals write into Core or Extension entities

### Governance relationships
- Decisions, ApprovalGates, and EscalationRules influence project progression and outputs

### Output relationships
- Outputs read from Core, Extensions, Context, and Governance
- Outputs do not define the core truth of the domain

---

## 10. Boundary rules

The following separation rules are mandatory:

- no project-type-specific entity should be forced into the shared core unless it is truly cross-project
- KI proposals must not bypass review and traceability
- output generation must not redefine domain truth
- governance logic must not be hidden inside unrelated project objects
- context ingestion must remain distinguishable from approved structured data

---

## 11. Open modeling questions

The following questions still need refinement:

- which ERP-specific entities must become fully explicit in the earliest implementation stage
- how deep construction and software extension preparation should go before active implementation
- how much of governance should be modeled explicitly in the first technical design
- whether output requests should become explicit first-class objects early or later
- which proposal types need dedicated structures from the start and which can begin as generalized proposal shapes

---

## 12. Recommendation

The domain model should continue to be refined around a stable shared project core, explicit extension boundaries, first-class context input, proposal-based AI assistance, and a separate output layer.

This is the safest path to support controlled product growth without forcing future structural rework.
