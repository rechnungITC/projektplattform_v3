# Decision Record — Trusted-Processor Provider-Klasse (Class-3 auf attestiertem EU-Azure)

**V3-original (kein V2-Erbe)** · Stand: 2026-07-03 · Betrifft: PROJ-93 (baut auf PROJ-32 Multi-Provider + PROJ-92 Azure)

**Input:** PO-Entscheidung 2026-06-10 (kontrollierte Lockerung der Invariante #3) · Requirements-CIA 2026-06-10 (GO mit Guardrails) · Architektur-CIA 2026-07-03 (GO mit blocking Locks).
**Status:** Accepted.

---

## Kontext

Architektur-Invariante #3 (siehe [data-privacy-classification.md](data-privacy-classification.md)) blockt Class-3-Daten (personenbezogen) technisch von allen externen Modellen — kein Bypass, auch nicht für Tenant-Admins. Der Block liegt in drei Schichten: dem Resolver-Default-Order-Clamp, dem `LOCAL_ONLY`-Clamp (defense-in-depth) und dem DB-CHECK `class3_local_only` auf der Priority-Matrix.

Das ist absichtlich streng, blockt aber auch **Azure OpenAI im eigenen Azure-Tenant des Kunden, EU-Region, mit Microsoft-DPA** — ein Setup, das rechtlich oft vertretbar ist. Pilotkunden ohne eigene Ollama-Infrastruktur können dadurch keine Class-3-Features (Stakeholder-Extraktion PROJ-88, `resource_swap`) nutzen. Der PO hat eine kontrollierte, **opt-in** Öffnung entschieden — ausschließlich für attestierte EU-Azure-Endpoints, pro Tenant.

## Entscheidung

Es wird eine **Trusted-Processor-Provider-Klasse** eingeführt: ein Class-3-Purpose darf **zusätzlich zu Ollama** einen Azure-Provider wählen, **genau dann**, wenn

1. `provider = 'azure'` (nie OpenAI-direkt/Anthropic/Google — kein Shared-Processor ohne Kunden-Tenant-Isolation), **und**
2. der Tenant-Admin ein **DPA-Attest** hinterlegt hat (Datum, Referenz, bestätigender Admin — append-only auditiert; kein Dokument-Upload im MVP), **und**
3. `azure_region` in der EU-Allowlist liegt (`AZURE_EU_REGIONS`, Server-Konstante).

Ohne Attest ändert sich **exakt nichts**: `defaultProviderOrder(3)` bleibt `['ollama']`. Die Öffnung ist opt-in pro Tenant, nie global, jederzeit widerrufbar.

### Enforcement (defense-in-depth, alle drei Layer bleiben — nur DPA-konditional)

- **Autoritativer Gate = TS-Resolver zur Laufzeit.** `isClass3TrustedEligible(record, trustedFlag)` = Attest + EU-Region ist die **einzige logische Eligibility-Autorität** und wird bei **jeder** Anfrage neu ausgewertet. Deshalb wirkt ein Widerruf sofort ab dem nächsten Lauf, ohne dass die Priority-Matrix angefasst werden muss (architecture-CIA R-1).
- **Attest-Status member-sichtbar** über den member-callable `SECURITY DEFINER`-Helper `tenant_has_class3_trusted_processor(tenant_id)` — der Routing-Pfad läuft als Tenant-*Member*, `tenant_ai_providers` ist admin-only RLS; ein direkter Select würde fail-open oder feature-broken (architecture-CIA R-2). Fail-closed: Helper-Fehler ⇒ Azure nicht eligible.
- **DB-Schicht = notwendige-aber-nicht-hinreichende Vorschicht.** Der `class3_local_only`-CHECK wird zum strukturellen **Anti-Scope-Floor** `provider_order <@ ['ollama','azure']` (openai/anthropic/google bleiben für Class-3 DB-seitig unmöglich, selbst bei Trigger-Ausfall) **plus** einem BEFORE-INSERT/UPDATE-Trigger, der `azure` in einer Class-3-Zeile nur bei vorhandenem Attest zulässt. Der Trigger prüft bewusst nur das Attest (die verschlüsselte `azure_region` ist DB-seitig unlesbar); die EU-Region erzwingen der Write-Path (PROJ-92) und der Resolver.
- **DPA-Metadaten als plaintext-Spalten** auf `tenant_ai_providers` (`dpa_confirmed_at`/`dpa_confirmed_by`/`dpa_reference`); der Azure-Key + `azure_region` bleiben in `encrypted_config`. Attest/Widerruf laufen nur über admin-gated `SECURITY DEFINER`-RPCs mit append-only Audit (`dpa_attest`/`dpa_revoke`) — kein direkter UPDATE.
- **Provenienz:** Class-3-Läufe über Azure tragen die Region in `ki_runs.provider_region` (DSGVO-Audit: Ollama- von Azure-Läufen unterscheidbar).

## Konsequenzen

- **Invariante #3 wird präzisiert, nicht aufgeweicht:** Class-3 → local-only, **außer** DPA-attestiertes Azure OpenAI im EU-Kunden-Tenant (opt-in pro Tenant-Admin, dokumentierte DPA). Nie OpenAI-direkt/Anthropic/Google, nie global. CLAUDE.md-Invariante #3 ist entsprechend angepasst.
- **PROJ-88 & künftige Class-3-Purposes erben** die erweiterte Provider-Menge automatisch über den Resolver — kein Hard-Pin auf Ollama.
- **Reversibel:** Ohne Attest ist das Verhalten byte-identisch zum Prä-PROJ-93-Zustand; ein Tenant kann jederzeit widerrufen.

## Non-Goals

- Kein genereller „Cloud-für-Class-3"-Pfad; kein DPA-Dokument-Upload im MVP; kein tenant-übergreifender Azure-Default; keine Reduktion der drei Defense-Layer.

## Referenzen

- Spec: [`features/PROJ-93-trusted-eu-processor-class3.md`](../../features/PROJ-93-trusted-eu-processor-class3.md)
- Basis: [data-privacy-classification.md](data-privacy-classification.md) (Invariante #3), PROJ-32 (Multi-Provider), PROJ-92 (Azure Class-1/2)
- Live-Regression: `tests/sql/PROJ-93-trusted-processor-pentest.sql`
