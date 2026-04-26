# Architecture Module Structure

## Purpose

This document translates the target picture and domain model into a pragmatic technical module structure.

The goal is to describe how responsibilities group across the Python backend, Next.js frontend, and supporting services — not to define final code.

Technical baseline:
- Backend: Python + FastAPI, layered as `routers / services / domain / db` (see [../../build/CONTEXT.md](../../build/CONTEXT.md))
- Frontend: Next.js App Router
- Orchestration: internal `services/orchestrator/` module (LangGraph-compatible design)
- Monorepo: pnpm + uv workspaces

---

## 1. Module structure principles

The technical module structure should follow these rules:

- keep core modules stable and broadly reusable
- isolate project-type-specific logic in extension-style modules (`domain/erp/`, `domain/construction/`, `domain/software/`)
- isolate AI-related processing from business truth (proposal flow, review states)
- keep output generation as a separate concern (`domain/output/`)
- keep FastAPI-specific code out of `domain/` — routers only orchestrate
- prefer MCP-based tool integration over ad-hoc HTTP clients

---

## 2. Proposed top-level technical structure

A pragmatic target structure can be grouped into these areas:

1. Core  
2. Extensions  
3. Context Processing  
4. KI Proposal Layer  
5. Governance  
6. Output Layer  
7. Shared Technical Support  

---

## 3. Core modules

These modules should contain the shared project foundation.

### Project Core Module
Responsibilities:
- project lifecycle
- project type assignment
- phase handling
- milestone handling
- shared project metadata

### Work Management Module
Responsibilities:
- task handling
- dependency handling
- assignment and state
- relation to project structure

### Risk and Stakeholder Module
Responsibilities:
- risk management
- stakeholder handling
- project-side control visibility

These modules should stay free of ERP-only, construction-only, or software-only rules.

---

## 4. Extension modules

These modules hold project-type-specific logic.

### ERP Extension Module
Responsibilities:
- vendor process
- evaluation logic
- ERP-specific work structures
- ERP module context
- migration, training, hypercare preparation

### Construction Extension Module
Responsibilities:
- construction-specific entities and workflows
- trade and acceptance structures
- defect context
- daily project-site context

### Software Extension Module
Responsibilities:
- software-specific planning entities
- sprint, epic, story, release, and test context

At the current stage, ERP should be the first extension module to deepen.

---

## 5. Context processing modules

This area should capture and normalize incoming project context.

### Context Ingestion Module
Responsibilities:
- intake of documents
- intake of emails
- intake of meeting notes
- intake of uploaded files
- source typing and source metadata

### Context Structuring Module
Responsibilities:
- normalize raw sources
- prepare extracted content for proposal logic
- keep source traceability visible

This area should not silently write into approved project state.

---

## 6. KI proposal modules

This area should turn structured context into reviewable suggestions.

### Proposal Engine Module
Responsibilities:
- derive proposals from processed context
- attach confidence and source information
- create proposal types in a controlled structure

### Proposal Review Module
Responsibilities:
- review status handling
- acceptance and rejection flow
- traceable transition from proposal to approved data

These modules must remain visibly separate from the main domain write logic.

---

## 7. Governance module

This module should hold explicit governance logic.

Responsibilities:
- decision documentation
- approval gates
- escalation rules
- relation between control logic and project progression

Governance should not be spread invisibly across unrelated modules.

---

## 8. Output layer modules

This area should produce structured outputs for different audiences.

### Output Aggregation Module
Responsibilities:
- collect relevant state from core, extensions, context, and governance
- prepare audience-specific data views

### Output Rendering Module
Responsibilities:
- operational views
- management summaries
- Gantt-ready structures
- Kanban-ready structures
- steering or presentation-ready structures

Outputs must remain downstream of approved project state.

---

## 9. Shared technical support

This area contains reusable technical support that multiple modules may depend on.

Examples:
- audit or logging support
- role and permission handling
- file handling support
- messaging support
- shared utility boundaries where justified

These shared services should support modules, not replace them.

---

## 10. Suggested directory orientation

A practical structure inside the current system could evolve toward something like:

- `app/Core`
- `app/Extensions/ERP`
- `app/Extensions/Construction`
- `app/Extensions/Software`
- `app/Context`
- `app/AI`
- `app/Governance`
- `app/Output`
- `app/Shared`

This is a directional structure only.  
It should be adapted to the real conventions of the existing codebase rather than imposed blindly.

---

## 11. Responsibility summary

### Core
Owns:
- shared project truth

### Extensions
Own:
- project-type-specific business logic

### Context
Owns:
- raw and normalized project input sources

### KI Proposal Layer
Owns:
- proposal generation and proposal review flow

### Governance
Owns:
- explicit control logic and formal decisions

### Output
Owns:
- audience-specific derived artifacts

### Shared
Owns:
- reused technical support only

---

## 12. Structural risks

The following risks must be avoided:

- ERP logic leaking into the shared project core
- proposal logic writing directly into business truth without controlled review
- output logic becoming a hidden place for business rules
- overengineering the structure before the earliest implementation stages are agreed
- binding the orchestrator prematurely to LangGraph or any other external engine
- FastAPI routers that accumulate business logic instead of staying thin

---

## 13. Recommended implementation order

1. define stable module boundaries
2. strengthen the shared core
3. deepen the ERP extension
4. define context ingestion and proposal flow
5. introduce governance structures
6. build the output aggregation and rendering path
7. prepare later construction and software extensions

This order reduces the risk of later structural corrections.

---

## 14. Recommendation

Use a modular target structure that clearly separates core logic, extension logic, AI proposal logic, governance, and outputs across the Python + TypeScript monorepo.

This keeps the product architecture maintainable as it grows through the stages defined in the target picture.
