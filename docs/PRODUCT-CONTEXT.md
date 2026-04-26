# Product Workspace Context

This workspace is for business logic, product thinking, requirements, user stories, workflows, backlog structure, and decisions.

Use this workspace when the task is about:
- clarifying requirements
- defining scope
- breaking work into epics, features, and stories
- writing acceptance criteria
- describing user flows
- documenting business decisions

## Process
1. Understand the business goal
2. Identify the affected users or roles
3. Break the topic into process steps
4. Define scope and exclusions
5. Write structured output in editable markdown

## Main folders
- /vision
- /business-requirements
- /user-stories
- /epics-features
- /workflows
- /personas
- /backlog
- /decisions

## Good output
Good output is precise, business-oriented, and implementation-ready.

## Stakeholder ≠ User/RBAC

Stakeholder-Logik ist fachlich von technischer User-/RBAC-Logik zu trennen:
- **User/RBAC**: Systemzugang, Loginrollen, Permissions — gehört in technische Systemlogik
- **Stakeholder**: Projektrolle, Einfluss, Governance-Partizipation (Steering Committee, Betriebsrat, Key User, Einkauf) — gehört in die fachliche Domäne
- In Anforderungen und User Stories niemals beide Konzepte vermischen

## Avoid
- jumping directly into technical solutions without clear business logic
- mixing architecture details into requirements unless needed
- vague user stories without acceptance criteria
- Stakeholder-Anforderungen mit RBAC/Permission-Anforderungen vermischen