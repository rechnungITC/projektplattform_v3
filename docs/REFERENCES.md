# REFERENCES.md

Background material. Examples, links, style guides, standards, patterns, and notes that Claude should know about, but does not need to act on directly.

---

# 1. Purpose of This File

This file provides supporting reference material for the project.

Its purpose is to give Claude:
- conceptual orientation
- external standards and frameworks
- useful comparison patterns
- style and quality reference points
- background models for better judgment

This file is not:
- a task list
- a project brief
- a rulebook
- a step-by-step workflow

The operational working logic belongs in `CLAUDE.md`.  
The concrete project reality belongs in `CONTEXT.md`.  
This file exists to provide useful supporting references.

---

# 2. Reference Categories

The following reference categories are relevant for this project:

- project management frameworks and delivery models
- ERP implementation reference patterns
- construction project reference patterns
- software project delivery reference patterns
- governance and stakeholder management references
- output and communication patterns
- AI-assisted context processing and proposal logic
- modular architecture and system design references
- documentation and quality references
- useful external sources for later extension

---

# 3. Relevant Frameworks and Standards

## Scrum
Reference:
- https://scrumguides.org/

Useful for:
- iterative planning
- backlog structures
- sprint-oriented delivery logic
- lightweight delivery cycles within larger projects

Note:
Scrum is relevant as one possible delivery model, especially for software-related work, but it is not the only planning logic in this project.

---

## PMI / PMBOK
Reference:
- https://www.pmi.org/pmbok-guide-standards

Useful for:
- structured project planning
- stakeholder management
- schedule and budget control
- risk management
- formal project governance

Note:
Useful as a reference for traditional planning and steering logic, especially in enterprise settings.

---

## SAFe
Reference:
- https://scaledagileframework.com/

Useful for:
- scaled delivery structures
- portfolio-to-delivery thinking
- epic / feature / story decomposition
- cross-team planning and dependency management

Note:
Useful as a scaling reference, especially where software and organizational change overlap.

---

## PRINCE2
Reference:
- https://www.axelos.com/certifications/prince2

Useful for:
- governance structures
- role clarity
- staged delivery
- decision and control logic

Note:
Relevant as a governance-heavy reference model for controlled enterprise projects.

---

## Gantt Concepts
Reference:
- https://en.wikipedia.org/wiki/Gantt_chart

Useful for:
- timeline planning
- dependency visualization
- milestone-based planning
- schedule communication

Note:
Especially relevant for construction projects, ERP implementation phases, and management-level steering outputs.

---

## Kanban Concepts
Reference:
- https://en.wikipedia.org/wiki/Kanban_(development)

Useful for:
- operational work visibility
- flow-oriented execution
- task state transparency
- team-level delivery management

Note:
Relevant as an execution-oriented view, not as the sole product logic.

---

## General API Design Principles
Reference concept:
- REST API design guidelines
- event-driven integration patterns
- interface-first architecture thinking

Useful for:
- future integrations
- system-to-system communication
- output services
- ingestion interfaces
- internal and external extensibility

---

# 4. Reference Patterns for Project Types

## ERP Implementation Projects

Useful reference pattern:
A good ERP project model does not start at implementation only.

It usually includes:
- initiation
- business and scope clarification
- requirement gathering
- vendor evaluation if no solution is fixed
- negotiation and contract review
- governance and approval logic
- implementation preparation
- module planning
- migration and integration planning
- training and change support
- go-live readiness
- hypercare and post-go-live steering

Important pattern:
ERP projects are not only technical rollouts.  
They combine business decisions, governance, contractual structure, organizational change, and system implementation.

---

## Construction Projects

Useful reference pattern:
A good construction project model reflects:
- trades
- sections
- dependencies
- schedule constraints
- resource coordination
- progress tracking
- milestone-based communication

Important pattern:
Construction planning often relies more heavily on timeline and dependency visibility than many generic software tools support by default.

---

## Software Projects

Useful reference pattern:
A good software project model reflects:
- staged or iterative delivery
- implementation packages
- dependencies between technical and business work
- changing scope with traceability
- testing and release awareness
- documentation and handover needs

Important pattern:
Software project delivery is often not purely agile or purely traditional. Hybrid planning support is usually more realistic.

---

# 5. Architecture and System Design References

## Modular System Design

Useful reference principles:
- shared core plus extensions
- separation of concerns
- bounded responsibility areas
- composability instead of monolithic entanglement
- extensibility without structural duplication

Why relevant:
This project must support different project types without collapsing them into one flat logic.

---

## Domain-Oriented Thinking

Useful reference principles:
- identify shared concepts separately from domain-specific concepts
- avoid mixing core entities with special-case rules
- keep stakeholder logic, project logic, governance logic, and output logic distinguishable

Why relevant:
The platform needs to remain understandable and extensible as new project types and capabilities are added.

---

## Technology-Open Architecture

Useful reference principles:
- choose technology based on fit, not habit
- keep architecture independent from unnecessary framework assumptions
- define product and domain structure before locking implementation details
- allow future technical evolution without changing the product model

Why relevant:
This project is intentionally tech-stack-open and should not be over-shaped by one framework too early.

---

# 6. AI and Context Processing References

## Context Ingestion Pattern

Useful reference idea:
Treat emails, meeting notes, documents, and related materials as context sources, not just attachments.

Why relevant:
The platform depends on turning fragmented inputs into structured project logic.

---

## Proposal-Based AI Support

Useful reference idea:
AI should derive proposals rather than silently writing authoritative business data.

Examples of proposal types:
- task proposals
- dependency proposals
- risk proposals
- decision prompts
- output suggestions

Why relevant:
This keeps AI support reviewable, traceable, and controllable.

---

## Explainable Derivation Logic

Useful reference principles:
- show where a derived object came from
- preserve traceability to source content
- allow human confirmation or correction
- avoid opaque automation in business-critical decisions

Why relevant:
The project explicitly requires AI support with explainable linkage to source context.

---

# 7. Output and Communication References

## Output Modes

Relevant output patterns for this project include:
- Gantt-oriented planning views
- Kanban-oriented execution views
- work package structures
- milestone summaries
- management summaries
- decision templates
- steering committee materials
- presentation-ready structures for PowerPoint, Canva, or Miro

Important principle:
Outputs should fit the target audience and use case, not just the available data structure.

---

## Management Communication Patterns

Useful reference idea:
Management-facing outputs should usually be:
- condensed
- decision-oriented
- risk-aware
- milestone-based
- easy to scan quickly

---

## Operational Communication Patterns

Useful reference idea:
Execution-facing outputs should usually be:
- structured around concrete work
- clear on ownership and timing
- explicit on dependencies and blockers
- easy to update and review

---

# 8. Documentation and Quality References

## Good Documentation Principles

Useful reference principles:
- write for the actual audience
- separate internal design notes from user-facing material
- keep documentation aligned with implementation reality
- document decisions, not only outputs
- prefer clarity over verbosity

---

## Quality Reference Points

Useful quality dimensions for this project:
- structural clarity
- reviewability
- traceability
- maintainability
- extensibility
- consistency across domains
- clear separation between core and specialization
- usable output for both implementation and steering

---

## Naming and Structural Discipline

Useful principle:
Reference material, project context, and operational rules should remain separate from each other.

Why relevant:
This supports a clean relationship between:
- `CLAUDE.md`
- `CONTEXT.md`
- `REFERENCES.md`

---

# 9. Useful External Sources

These are useful external orientation sources for this project:

- Scrum Guide  
  https://scrumguides.org/

- PMI / PMBOK  
  https://www.pmi.org/pmbok-guide-standards

- SAFe  
  https://scaledagileframework.com/

- PRINCE2  
  https://www.axelos.com/certifications/prince2

- Gantt Chart Overview  
  https://en.wikipedia.org/wiki/Gantt_chart

- Kanban Overview  
  https://en.wikipedia.org/wiki/Kanban_(development)

Additional external sources may later be added for:
- ERP evaluation approaches
- governance and stakeholder models
- AI traceability and explainability patterns
- architecture and integration standards
- documentation quality models

---

# 10. Notes for Future Extension

This file is expected to evolve.

Possible future additions:
- industry-specific ERP references
- construction-specific planning references
- software delivery pattern references
- governance model templates
- architecture comparison notes
- AI quality and review patterns
- output-specific examples
- style references for management communication
- documentation templates and handover patterns

When extending this file:
- keep it reference-oriented
- avoid turning it into a rules file
- avoid repeating `CLAUDE.md`
- avoid repeating `CONTEXT.md`
- keep references grouped and explain why they matter