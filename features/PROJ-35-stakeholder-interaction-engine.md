# PROJ-35: Stakeholder-Wechselwirkungs-Engine — Risiko-Score, Eskalations-Indikatoren & Tonalitäts-Empfehlungen

## Status: Sketched (pending /requirements + /architecture)
**Created:** 2026-05-02
**Last Updated:** 2026-05-02

> ⚠️ **Spec-Entwurf** — dieser Entwurf wurde aus User-Feedback während PROJ-33-γ-QA generiert. Er ist NICHT durch einen formalen `/requirements`-Run gegangen und braucht vor Implementation:
> 1. `/requirements PROJ-35` (Locks für Formel-Parameter, Override-Möglichkeiten, Dashboard-Scope)
> 2. `/architecture PROJ-35` mit CIA-Review (kreuzt PROJ-9/19/20 deployed)

## Summary

PROJ-33 (Phase α/β/γ) hat die **Daten-Schicht** für reichhaltige Stakeholder-Profile geliefert: qualitative Bewertung (`influence`, `impact`, `attitude`, `conflict_potential`, `decision_authority`, `communication_need`, `preferred_channel`), Skill-Profil (5 Dimensionen), Big5/OCEAN-Persönlichkeitsprofil (5 Dimensionen). Diese Daten stehen heute **isoliert nebeneinander** — die Plattform leitet daraus keine Aussagen ab.

PROJ-35 schließt das: berechnet aus den vorhandenen Daten **abgeleitete Indikatoren** für Stakeholder-Risiko, Wahrnehmungslücken, Eskalations-Bedarf und Kommunikations-Empfehlungen. Liefert ein "Stakeholder-Health-Dashboard" pro Projekt + Inline-Hinweise im Stakeholder-Detail. Wird Datenbasis für PROJ-36 KI-Coaching.

## Dependencies

- **Requires:**
  - **PROJ-33-α** (qualitative Felder: influence, impact, attitude, conflict_potential, decision_authority, communication_need, preferred_channel) — deployed
  - **PROJ-33-γ** (skill_profiles + personality_profiles fremd-Werte) — ready for deploy
  - **PROJ-9** (Work-Items, deployed) — für Stakeholder×Work-Item-Verknüpfung
  - **PROJ-19** (Phases & Milestones, deployed) — für Critical-Path-Berechnung
- **Influences:**
  - **PROJ-33-δ** (Self-Assessment) — wenn Self-Werte vorhanden, geht "Wahrnehmungslücke" in Risiko-Score ein
  - **PROJ-36** (KI-Coaching) — nutzt PROJ-35 Indikatoren als Eingabe für personalisierte Drafts + Eskalations-Empfehlungen
  - **PROJ-34** (Communication-Tracking) — wenn Sentiment-Daten vorhanden, gehen sie als Multiplikator in Risk-Score

## User Stories

### US-1 — Projektmanager: Stakeholder-Risiko-Übersicht
**Als** Projektmanager
**möchte ich** auf einen Blick sehen, welche Stakeholder ein erhöhtes Risiko-Profil haben
**damit** ich sie proaktiv ansprechen kann, bevor das Projekt darunter leidet.

### US-2 — Wahrnehmungslücke
**Als** Projektmanager
**möchte ich** beim Stakeholder gezeigt bekommen, wo ich (Fremdbewertung) und der Stakeholder (Self-Assessment) deutlich abweichen
**damit** ich den Trainings- oder Gesprächsbedarf erkenne.

### US-3 — Eskalations-Indikator
**Als** Projektmanager
**möchte ich** automatische Warnungen wenn ein Stakeholder gleichzeitig blockierende Haltung + hohe Entscheidungsbefugnis + niedrige Verträglichkeit hat
**damit** ich solche Konstellationen rechtzeitig im Steering Committee adressieren kann.

### US-4 — Tonalitäts-Empfehlung
**Als** Projektmanager
**möchte ich** eine Empfehlung sehen, **wie** ich einen Stakeholder ansprechen sollte (Stil, Detailtiefe, Kommunikationskanal)
**damit** meine Kommunikation auf das Persönlichkeitsprofil passt.

### US-5 — Critical-Path-Risk
**Als** Projektmanager
**möchte ich** sehen, ob Stakeholder mit hohem Risiko-Score auf einem kritischen Work-Item sitzen
**damit** ich Ressourcen-Konflikt früh erkenne.

### US-6 — Veränderung über Zeit
**Als** Projektmanager
**möchte ich** sehen, wie sich der Risiko-Score eines Stakeholders über Zeit entwickelt hat (Trend-Linie aus Audit-Events)
**damit** ich Eskalation oder Beruhigung früh erkenne.

## Acceptance Criteria (Skizze, /requirements lockt im Detail)

### Block 1 — Risiko-Score-Berechnung

**Risk-Score-Formel (Vorschlag, Parameter müssen lock-bar sein):**

```
risk = 
    influence_weight   × influence_norm(0..1)
  × impact_weight      × impact_norm(0..1)
  × attitude_factor    (supportive=0.5, neutral=1.0, critical=1.5, blocking=2.5)
  × conflict_factor    (low=0.5, medium=1.0, high=1.5, critical=2.0)
  × big5_modifier      (1 - agreeableness/100 × 0.3 — niedrige Verträglichkeit erhöht Risk)
  × authority_factor   (none=0.5, advisory=0.8, recommending=1.0, deciding=1.5)
```

Skala: `0` (komplett harmlos) bis `~9` (extreme Hochrisiko-Konstellation). Bucket-Categorize:
- `< 1`: grün, keine Action
- `1-3`: gelb, beobachten
- `3-6`: orange, proaktiv ansprechen
- `≥ 6`: rot, Eskalation/Steering

Werte sind Vorschläge — `/requirements` lockt finale Multiplikatoren via Tenant-Konfiguration mit Override.

### Block 2 — Wahrnehmungslücke (Self vs Fremd)

- Pro Big5-Dimension: berechne `delta = self - fremd`
- Pro Skill-Dimension: berechne `delta = self - fremd`
- Aggregat: max(|delta|) über alle 10 Dimensionen
- Flagge ab `|delta| ≥ 30` mit Differenz-Liste sortiert nach absoluter Abweichung

### Block 3 — Eskalations-Indikator (Hochrisiko-Konstellationen)

Hard-coded Patterns die zu einem "Hochrisiko"-Banner im Stakeholder-Detail führen:

| Pattern | Condition |
|---|---|
| **Blockierender Entscheider** | `attitude=blocking AND decision_authority=deciding` |
| **Verstärktes Konflikt-Potenzial** | `conflict_potential=critical AND influence ∈ {high,critical}` |
| **Dunkler Profil-Match** | `agreeableness < 30 AND emotional_stability < 30 AND attitude ∈ {critical,blocking}` |
| **Unbekannte Variable** | `attitude=null AND influence=critical` (PM hat noch keine Bewertung gemacht aber Stakeholder ist kritisch) |

Jedes Pattern hat einen Severity-Score und einen UI-Empfehlungstext.

### Block 4 — Tonalitäts-Empfehlung

Ableitungen aus Big5 + qualitativer Bewertung:

| Big5-Profil | Empfehlung |
|---|---|
| **Hoch Conscientiousness (≥70)** | Analytisch, datengetrieben, mit Fakten. Detail-Tiefe hoch. |
| **Niedrig Agreeableness (<30)** | Direkt, ohne Floskeln, ergebnisorientiert. |
| **Hoch Openness (≥70)** | Offen für unkonventionelle Lösungsansätze, bring kreative Optionen mit. |
| **Niedrig Extraversion (<30)** | Schriftlich vor mündlich, Zeit zum Reflektieren geben. |
| **Niedrig Emotional Stability (<30)** | Druck reduzieren, Eskalation vermeiden, in Ruhe sprechen. |

Plus qualitative Adjustierung:
- `preferred_channel=email` → schriftlich first
- `communication_need=critical` → höhere Frequenz, früher informieren
- `attitude=blocking` → 1:1-Gespräch vor Group-Setting

Output: 2-3 Sätze als Tooltip/Card im Stakeholder-Detail. PROJ-36 wird das KI-gestützt erweitern.

### Block 5 — Critical-Path-Indikator

- Kombiniere Stakeholder ↔ Work-Item-Assignments (PROJ-9 + PROJ-11)
- Wenn Work-Item auf kritischem Pfad (PROJ-19 Phase mit `is_critical=true` ODER Milestone target_date < project_planned_end_date - 14d)
  AND Stakeholder hat `risk_score ≥ 3`
  → "Critical-Path-Risk"-Banner mit Empfehlung "Diese Person blockt einen kritischen Pfad — Backup planen"

### Block 6 — Trend-Analyse

- Aus `audit_log_entries` (PROJ-10) für qualitative Felder
- Aus `stakeholder_profile_audit_events` (PROJ-33-γ) für Skill+Big5
- Compute Risk-Score retroaktiv für jedes Audit-Event-Datum
- Render als Sparkline im Stakeholder-Detail mit Letzten 30/90/365 Tagen

### Block 7 — Stakeholder-Health-Dashboard (Projekt-Level)

- Pro Projekt eine Dashboard-Sektion `/projects/[id]/stakeholder-health`
- Ranking-Liste aller Stakeholder nach Risk-Score (DESC)
- Buckets-Filter (rot/orange/gelb/grün)
- Aggregat-Metriken: Anzahl pro Bucket, höchster aktiver Risk-Score, durchschnittliche Wahrnehmungslücke

## Edge Cases

- **EC-1: Kein Big5-Profil vorhanden** → Risk-Score wird ohne `big5_modifier` berechnet (= 1.0); UI zeigt Hinweis "Risk-Score ohne Persönlichkeits-Profil ungenau, bitte ergänzen"
- **EC-2: Self-Werte in Big5 absurd anders als Fremd** (z.B. Self=90, Fremd=10) → Wahrnehmungslücke flagged ABER Risk-Score nutzt nur Fremd (PM-Sicht ist autoritativ)
- **EC-3: Stakeholder hat sich gerade geändert** (z.B. neuer attitude="supportive" eingetragen) → Risk-Score recomputiert sofort, Trend-Sparkline zeigt Knick
- **EC-4: Tenant deaktiviert KI-Coaching** → PROJ-35 ist davon **unabhängig** (rein deterministische Formeln, keine externe API)
- **EC-5: Multiple Stakeholder gleicher Risk-Score** → sortiere sekundär nach influence DESC, dann name ASC
- **EC-6: Big5-Werte alle null** → big5_modifier = 1.0 (neutral); kein false-Negative

## Out of Scope (für PROJ-35)

- ❌ KI-generierte Empfehlungstexte (das ist PROJ-36)
- ❌ Communication-History-Sentiment-Multiplikator (das ist PROJ-34, kann später als Faktor ergänzt werden)
- ❌ Tenant-konfigurierbare Pattern (Phase 2; MVP nutzt hardcoded Patterns aus Block 3)
- ❌ Eskalations-Workflow mit Approval-Gate (das wäre PROJ-31-Erweiterung)
- ❌ Cross-Tenant-Benchmarking ("dein Tenant hat 23% mehr Hochrisiko-Stakeholder als der Durchschnitt")

## Technical Requirements (Skizze)

- **Performance:** Risk-Score-Berechnung pro Stakeholder < 5ms (pure function); Dashboard-Query < 200ms für 100 Stakeholder
- **Determinismus:** Identische Eingabe → identischer Score; keine Random-Komponente
- **No-AI:** Alle Berechnungen lokal; keine externe API-Calls; keine Class-3-Routing-Sorgen
- **Audit:** Score-Berechnungen sind transparent (kein Black-Box); UI kann "Warum dieser Score?" Tooltip zeigen mit Formel-Aufschlüsselung
- **Privacy:** Risk-Score selbst ist Class-2 (abgeleitet aus Class-2/3 Daten — bleibt Class-2 weil nicht direkt personenbezogen)

## Aufwandsschätzung (Indikation, /architecture refined)

- **Backend** (Risk-Score-Function pure-TS + DB-View für Dashboard-Query + Audit-basierte Trend-Computation): ~2 PT
- **Frontend** (Stakeholder-Detail Risk-Banner + Tonalitäts-Empfehlung + Critical-Path-Hinweis + Health-Dashboard-Page + Sparkline): ~3 PT
- **QA** (Unit-Tests für jede Formel, Edge-Cases-Coverage, UI-Visual-Regression): ~1 PT
- **Total**: ~6 PT

## Offene Fragen für `/requirements`-Run

1. Sind die Risk-Score-Multiplikatoren **tenant-konfigurierbar** oder hardcoded?
2. Welche **Eskalations-Patterns** sind absolut critical (Pflicht-MVP) vs. nice-to-have?
3. Wie viel **Big5-Wissenschaft** soll ins Tonalitäts-Modell? Reichen die 5 Faustregeln aus Block 4 oder lookup-Table mit allen 32 Kombinationen?
4. **Trend-Sparkline** — über welchen Zeitraum default? 30/90/365 Tage gleichzeitig oder Toggle?
5. **Health-Dashboard** — eigene Page `/projects/[id]/stakeholder-health` oder Tab im existierenden Stakeholder-Tab?
6. **CIA-Review-Themen:**
   - Risk-Score in DB-View oder Compute-on-Read? (Performance vs Aktualität)
   - Sparkline in einer neuen Tabelle materialisiert oder ad-hoc berechnet aus audit_log_entries?
   - Wahrnehmungslücke + Eskalations-Patterns: in JSON-Config (tenant_settings) oder hardcoded?

## Beziehung zu PROJ-36 (KI-Coaching)

PROJ-35 liefert die **deterministische Daten-Basis** für PROJ-36's KI-Coaching-Layer:

- PROJ-35 sagt: "Stakeholder X hat Risk-Score 5.2 (orange), Wahrnehmungslücke 45% in Conscientiousness, Eskalations-Pattern 'Blockierender Entscheider'"
- PROJ-36 nimmt diese Indikatoren als Eingabe + Stakeholder-Big5 + Decision-Body und generiert: "Schreibe einen sachlich-detailorientierten 1:1-Gesprächsleitfaden, der Maxine die Möglichkeit gibt, ihre Bedenken über die Migrations-Spec zu artikulieren, ohne Druck."

PROJ-35 darum ist die **Logik**; PROJ-36 ist die **Sprache**. PROJ-35 muss vor PROJ-36 deployen.

---

<!-- Sections below to be added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture (CIA-Review zwingend)._

## Implementation Notes
_To be added by /backend + /frontend._

## QA Test Results
_To be added by /qa._

## Deployment
_To be added by /deploy._
