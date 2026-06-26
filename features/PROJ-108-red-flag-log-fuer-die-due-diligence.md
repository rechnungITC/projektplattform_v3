---
id: PROJ-108
title: "Red-Flag-Log für die Due Diligence"
issue_type: Story
epic_code: E
epic_title: "Risiken & Red Flags"
priority: Highest
priority_source: "Must (MVP für die DD-Phase)"
labels: ["ma-platform", "epic-e", "mvp"]
dependencies: ["E1", "G1", "G3", "I2", "J1"]
roles: ["DD-Stream-Leads", "Deal Lead", "Legal Counsel", "CFO / Finance Lead", "Steering Committee"]
summary_for_jira: "[E2] Red-Flag-Log für die Due Diligence"
---

# PROJ-108: Red-Flag-Log für die Due Diligence

## Status: Superseded by PROJ-114 (Bookkeeping-Closure 2026-06-26, CIA-reviewed)
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic E — Risiken & Red Flags)
**Priority:** P1

> ## ⚠️ Superseded by PROJ-114 (DD-Findings) — 2026-06-26
>
> CIA-Review 2026-06-26 (analog PROJ-44-δ/ε → PROJ-70): Der fachliche Kern dieses
> Specs ist durch das **deployte** PROJ-114 (`dd_findings`) bereits live und
> QA-gehärtet abgedeckt. Ein „Red Flag" ist in diesem Datenmodell **kein
> eigenständiges Konzept**, sondern ein hochsevere(s) `dd_finding`
> (`severity ∈ {hoch, deal_breaker}`). Eine separate `dd_red_flags`-Tabelle wäre
> Duplikat-Anti-Pattern (Verletzung der Shared-Core-Invariante: zweiter
> Eskalations-/Audit-/Need-to-know-Pfad). **Kein eigener 108-Build.**
>
> **Rest-Transfer (kein Scope-Verlust):**
>
> | 108-AC | Disposition | Ziel |
> |---|---|---|
> | AC1 Felder (Stream/Beschreibung/Schweregrad/Empfehlung/Owner) | ✅ erfüllt | PROJ-114 `dd_findings` (severity inkl. `deal_breaker` + `recommended_treatment`) |
> | AC1-Gap „Quelle/Dokumentenverweis" | offen → kleiner 114-Followup | **PROJ-Y-1** (`source_ref`/`document_link`-Feld an `dd_findings`) |
> | AC2 zwingend DD-Stream-zugeordnet | ✅ erfüllt | PROJ-114 (`dd_stream_id NOT NULL`) |
> | AC3 Übernahme in Bewertung (I2) + SPA-Issues (J1) | transferiert (Zielobjekte nicht gebaut) | **PROJ-120/121** (Bewertung/Kaufpreis-Bridge) + **PROJ-122** (SPA Issues) — als AC „akzeptiert ein `dd_finding` als Quelle" beim jeweiligen `/requirements` ergänzen |
> | AC4 dedizierter Red-Flag-Report (PDF/Excel, SteerCo) | transferiert | **PROJ-116** (DD-Berichte/Red-Flag-Report; bereits Owner laut Reuse-Matrix) |
> | AC5 Deal-Breaker → Pflicht-Info Deal Lead + Sponsor | ✅ erfüllt | PROJ-114 (`dd_finding_escalations` via RPC) |
> | Red-Flag-Lens (Filter-Sicht `severity ≥ hoch` + EUR-Summe) | optionaler FE-only-Followup | **PROJ-Y-2** |
> | Offene Frage „Red Flag nach Closing → PMI-Risikoregister" | transferiert | **PROJ-125/127** (PMI) |
>
> Followups in [`OPEN-DEFERRED-STATUS.md`](OPEN-DEFERRED-STATUS.md) gelistet. Der
> ursprüngliche Spec-Text bleibt unten als historischer Kontext erhalten.

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND** · Andockpunkt: DD-spezifisch auf PROJ-20 risks. Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** E — Risiken & Red Flags  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP für die DD-Phase)  
> **Labels:** `ma-platform` · `epic-e` · `mvp`  
> **Abhängigkeiten:** `E1`, `G1`, `G3`, `I2`, `J1`

**User Story:**

Als DD-Verantwortlicher möchte ich während der Due Diligence Red Flags strukturiert erfassen und ihnen einen Schweregrad (potenzieller Deal Breaker, kaufpreisrelevant, vertraglich abdeckbar, akzeptierbar) zuordnen, damit die DD-Findings die Verhandlung und Bewertung konsequent steuern.

**Beschreibung / Kontext:**

Das Modell hebt das Red-Flag-Log als zentrales Steuerungsinstrument der DD-Phase hervor. Red Flags sind eine Sonderform von Risiken mit eigenem Workflow und besonderem Bezug zu Bewertung und Vertrag.

**Akzeptanzkriterien:**

- [ ] Red Flag anlegbar mit: DD-Stream, Beschreibung, Quelle/Dokumentenverweis, Schweregrad, Empfehlung (Abbruch / Nachverhandeln / Vertrag / Akzeptieren), Owner.
- [ ] Red Flags sind zwingend einem DD-Stream (G1) zugeordnet.
- [ ] Red Flags können in die Bewertungslogik (I2) und SPA-Issues-Liste (J1) übernommen werden.
- [ ] Ein dedizierter Red-Flag-Report ist exportierbar (PDF/Excel) für SteerCo-Vorlagen.
- [ ] Schweregrad 'potenzieller Deal Breaker' löst Pflicht-Information an Deal Lead und Sponsor aus.

**Abgrenzungen (Out of Scope):**

- Inhaltliche Bewertung bleibt fachliche Verantwortung der DD-Teams.
- Keine automatische Verknüpfung zu rechtlichen Quellsystemen.

**Offene Fragen:**

- Wer entscheidet final über die Klassifikation als 'Deal Breaker'?
- Wie wird ein Red Flag nach Closing weitergeführt (Übernahme in PMI-Risikoregister)?
- Sollen Red Flags in einer separaten Sicht für SteerCo zusammengefasst werden?

**Definition of Ready:**

- [ ] Klassifikationsschema und Eskalationsregeln sind freigegeben.

**Definition of Done:**

- [ ] Red-Flag-Log ist funktional, exportierbar, mit Bewertung und SPA-Issues-Liste verknüpfbar.
- [ ] Eskalation bei Deal Breaker funktioniert.

**Abhängigkeiten:**

- E1 – Risikoregister
- G1, G3 – DD-Streams, Findings
- I2 – Kaufpreis-Bridge
- J1 – SPA Issues List

**Betroffene Rollen:**

- DD-Stream-Leads
- Deal Lead
- Legal Counsel
- CFO / Finance Lead
- Steering Committee

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · E — Risiken & Red Flags_
