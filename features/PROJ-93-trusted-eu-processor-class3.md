# PROJ-93: Trusted-EU-Processor — kontrollierte Class-3-Freigabe für attestiertes Azure OpenAI

## Status: Planned
**Created:** 2026-06-10
**Last Updated:** 2026-06-10
**Origin:** PO-Entscheidung 2026-06-10 (kontrollierte Lockerung der Invariante #3) · CIA-Review 2026-06-10 (GO mit Pflicht-Guardrails)
**Priority:** P1 — Should-have (sicherheitskritisch, isolierte Slice)

## Summary
Kontrollierte, **opt-in** Lockerung der Architektur-Invariante #3: Class-3-Purposes (personenbezogene Daten, z.B. PROJ-88 Stakeholder-Extraktion) dürfen zusätzlich zu Ollama einen **Trusted-EU-Processor** wählen — und zwar ausschließlich eine per PROJ-92 angebundene Azure-OpenAI-Ressource im **eigenen Azure-Tenant des Kunden, EU-Region**, für die der Tenant-Admin ein **DPA-Attest** hinterlegt hat. Ohne Attest ändert sich exakt nichts: `defaultProviderOrder(3)` bleibt `["ollama"]`. Die Lockerung wird über alle drei Defense-Layer **DPA-konditional** umgesetzt (nie pauschal) und per ADR + CLAUDE.md-Anpassung dokumentiert.

## Problem / Context
Invariante #3 blockt Class-3 technisch von allen externen Modellen — auch von Azure-OpenAI im EU-Kunden-Tenant mit Microsoft-DPA, was rechtlich oft vertretbar wäre. Pilotkunden ohne eigene Ollama-Infrastruktur können dadurch keine Class-3-Features (PROJ-88-Stakeholder, resource_swap) nutzen. Der PO hat entschieden: kontrollierte Öffnung NUR für attestierte EU-Azure-Endpoints, opt-in pro Tenant.

Heutige Verankerung des Blocks (alle drei müssen konsistent konditionalisiert werden, CIA F-Must):
1. `key-resolver.ts` Default-Order-Clamp (`dataClass === 3 → ["ollama"]`),
2. `key-resolver.ts` `LOCAL_ONLY_PROVIDERS`-Clamp (defense-in-depth),
3. DB-CHECK `class3_local_only` auf der Priority-Matrix (`<@ array['ollama']`).

## User Stories
- Als Tenant-Admin möchte ich für meine Azure-OpenAI-Ressource ein DPA-Attest hinterlegen (Datum, Referenz, bestätigender Admin), damit Class-3-Purposes über meinen eigenen EU-Azure-Vertrag laufen dürfen.
- Als Compliance-Officer möchte ich jeden Class-3-Lauf über den Trusted-Processor in `ki_runs` eindeutig erkennen (inkl. Region), damit Audits Ollama- von Azure-Läufen unterscheiden.
- Als Tenant-Admin OHNE Attest möchte ich, dass sich nichts ändert (Ollama-only, klare Meldung), damit die Öffnung niemals implizit passiert.
- Als Plattform-Betreiber möchte ich die Invarianten-Änderung als ADR dokumentiert haben, damit die Entscheidung auditierbar und reversibel bleibt.

## Acceptance Criteria
- [ ] **AC-93.1 (DPA-Attest)**: Azure-Provider-Config erhält `dpa_confirmed_at` (timestamptz), `dpa_confirmed_by` (→ profiles), `dpa_reference` (text, Vertragsnummer/Referenz — KEIN Dokument-Upload im MVP). Attestierung erzeugt ein append-only Audit-Event via `record_tenant_ai_provider_audit` (Action `dpa_attest`); Widerruf ebenso (`dpa_revoke`).
- [ ] **AC-93.2 (class3_eligible)**: Ein Provider ist Class-3-fähig genau dann, wenn `provider='azure'` UND DPA-Attest vollständig UND `azure_region` in der EU-Allowlist. Diese Ableitung existiert genau EINMAL (zentral, z.B. als berechnetes Feld/Helper) — kein verstreutes `if provider==='azure'` (CIA R2).
- [ ] **AC-93.3 (Resolver-Parametrisierung)**: `LOCAL_ONLY_PROVIDERS` → `CLASS3_ELIGIBLE_PROVIDERS`, berechnet aus den Provider-Records (Ollama immer; Azure nur bei class3_eligible). `defaultProviderOrder(3)` liefert ohne Attest weiterhin exakt `["ollama"]` (Regressionstest über alle 3 Layer, CIA R2).
- [ ] **AC-93.4 (DB-CHECK konditional, NICHT fallen)**: Der `class3_local_only`-CHECK wird zu `class3_trusted_only`: `['ollama','azure']` nur zulässig, wenn das DPA-Attest des Tenants existiert (Trigger- oder Generated-Column-Mechanik). Eine pauschale CHECK-Erweiterung auf `'azure'` ohne DPA-Bezug ist explizit verboten (CIA R1 — gefährlichster Fehler des Projekts).
- [ ] **AC-93.5 (ki_runs-Kennzeichnung)**: Class-3-Läufe über Azure werden in `ki_runs` als Trusted-Processor-Lauf gekennzeichnet (Provider + Region erkennbar); Provider-CHECK-Migration analog 20260505100200.
- [ ] **AC-93.6 (ADR + Invariante)**: Neues ADR in `docs/decisions/` („Trusted-Processor Provider-Klasse"); CLAUDE.md-Invariante #3 wird präzisiert: Block gilt „…except attested EU-resident Trusted-Processor endpoints in the tenant's own Azure tenant (PROJ-93), opt-in per tenant-admin with documented DPA".
- [ ] **AC-93.7 (Anti-Scope-Garantie)**: Tests beweisen, dass OpenAI-direkt, Anthropic, Google für Class-3 NIE wählbar sind — auch mit DPA-Feldern (die es für sie nicht gibt). Kein genereller „Cloud-für-Class-3"-Pfad.
- [ ] **AC-93.8 (Live-RPC-Smoke)**: Vor Approved: echter Class-3-Lauf gegen attestiertes Azure (oder dokumentierte Deviation) + Negativ-Probe (ohne Attest → Ollama-only/`external_blocked`). Memory-Konvention „Live-RPC-Smoke Pflicht".
- [ ] **AC-93.9 (PROJ-88-Vererbung)**: PROJ-88 (`proposal_stakeholders_from_context`) erbt die erweiterte Provider-Menge automatisch über den Resolver — die PROJ-88-Spec/Implementierung pinnt NICHT hart auf Ollama, sondern nutzt den Class-3-Resolver-Pfad (Hinweis in PROJ-88-Spec ergänzt).

## Edge Cases
- Attest vorhanden, aber Region nachträglich auf Nicht-EU geändert → class3_eligible kippt auf false; nächster Lauf fällt auf Ollama zurück (bzw. `external_blocked`).
- Attest widerrufen während ein Lauf läuft → laufender Lauf endet normal; nächster Lauf respektiert den Widerruf.
- Tenant hat Attest, aber keinen Ollama UND Azure-Key wird gelöscht → Class-3 → `external_blocked` mit actionable Meldung.
- Mehrere Azure-Configs (falls künftig möglich) → Attest gilt pro Config, nicht pro Tenant pauschal.

## Non-Goals / Out of Scope (CIA-Anti-Scope, verbindlich)
- Keine generische „Cloud-für-Class-3"-Option; kein OpenAI-direkt/Anthropic/Google für Class-3 (Shared-Processor ohne Kunden-Tenant-Isolation).
- Kein DPA-Dokument-Upload im MVP (→ Followup bei Pilot-Bedarf; vermeidet DSGVO-Retention-/RLS-Fläche).
- Kein tenant-übergreifender Azure-Default; opt-in pro Tenant, nie global.
- Kein Reduzieren der Defense-Layer — alle 3 bleiben, werden nur DPA-konditional.

## Dependencies
- Requires: PROJ-92 (Azure-Provider Class-1/2), PROJ-32 (Provider-/Audit-/Cost-Cap-Infrastruktur), PROJ-42 (Schema-Drift-Guard).
- Unblocks: Class-3-Features (PROJ-88, resource_swap) für Tenants ohne Ollama.

## CIA-Review (2026-06-10, Kurzfassung)
GO mit Pflicht-Guardrails: EU-Region-Allowlist, DPA-gebundener CHECK (nie pauschal), zentrale class3_eligible-Ableitung, ki_runs-Kennzeichnung, ADR + CLAUDE.md-Edit, kein Default-Shift. Offene CIA-Fragen für /architecture: statische vs. tenant-policy-basierte Region-Allowlist (MVP: statisch); welche Class-3-Purposes neben PROJ-88 in den 93-Testumfang (resource_swap/sentiment/coaching).

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
