> **Inherited from V2** — Decision still applies to V3. Stack-specific references (FastAPI, Redis, etc.) are historical; Supabase/Next.js V3 implementations follow the same principle.

# Decision Architecture Principles

## Decision
The platform shall use a shared core with project-type-specific extensions.

## Implications
- general logic stays in the core
- ERP, construction, and software logic are modeled as extensions
- AI logic remains proposal-oriented (traceable, reviewable)
- output logic remains a separate layer
- orchestration is implemented as an internal module, LangGraph-compatible in design but not LangGraph-bound
- the fixed target stack (Next.js + FastAPI + PostgreSQL + Redis + S3 + MCP) is the technical baseline

## Why
This reduces structural coupling and lowers the risk of later rebuilds.
