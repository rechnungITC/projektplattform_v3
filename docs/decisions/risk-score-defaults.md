# ADR — Risk-Score Default-Multiplikatoren

**Status:** Accepted (PROJ-35 Phase 35-α, 2026-05-02)
**Source-of-truth code:** `src/lib/risk-score/defaults.ts`

## Kontext

PROJ-35 berechnet einen Risk-Score pro Stakeholder als Produkt aus 6 Faktoren (Influence × Impact × Attitude × Conflict × Big5-Modifier × Authority). Multiplikatoren müssen tenant-konfigurierbar sein (Spec-Decision 1), brauchen aber sinnvolle Defaults.

## Entscheidung

| Faktor | Wert | Begründung |
|---|---|---|
| `influence_weight` | 1.0 | Neutraler Ausgangspunkt; Tenant kann amplifizieren wenn Influence in der Branche dominanter ist (z.B. Bauwesen). |
| `impact_weight` | 1.0 | Neutraler Ausgangspunkt analog. |
| `influence_norm.low` | 0.25 | Gleichmäßig 4-stufig 0.25/0.5/0.75/1.0 — bewährter Mendelow-Stil. |
| `influence_norm.medium` | 0.5 | (s.o.) |
| `influence_norm.high` | 0.75 | (s.o.) |
| `influence_norm.critical` | 1.0 | (s.o.) |
| `impact_norm.*` | 0.25 / 0.5 / 0.75 / 1.0 | Symmetrie zu influence_norm — beide tragen multiplikativ ohne Bias. |
| `attitude_factor.supportive` | 0.5 | Halbe Risiko-Belastung gegenüber neutral; Supporter sind Risiko-Reduktoren. |
| `attitude_factor.neutral` | 1.0 | Anker — keine Modifikation. |
| `attitude_factor.critical` | 1.5 | 50% Risiko-Aufschlag — kritischer Stakeholder kann Projekt erkennbar verzögern. |
| `attitude_factor.blocking` | 2.5 | 2.5× — blockierender Stakeholder ist der größte Single-Multiplier-Hebel der Formel. Begründet durch häufige Real-World-Eskalationen. |
| `conflict_factor.low` | 0.5 | Wie attitude — Symmetrie. |
| `conflict_factor.medium` | 1.0 | Anker. |
| `conflict_factor.high` | 1.5 | (s.o.) |
| `conflict_factor.critical` | 2.0 | Niedriger als blocking-attitude weil Konflikt-Potenzial nicht zwingend = aktive Blockade. |
| `authority_factor.none` | 0.5 | Stakeholder ohne Entscheidungs-Befugnis kann Risk halbieren auch wenn andere Faktoren hoch sind. |
| `authority_factor.advisory` | 0.8 | Beratende Rolle reduziert leicht. |
| `authority_factor.recommending` | 1.0 | Anker — Empfehlung kann sich durchsetzen oder nicht. |
| `authority_factor.deciding` | 1.5 | Entscheider können Projekt direkt steuern → 1.5× Risiko-Hebel. |
| `adversity_weight` | 0.3 | Big5-Modifier-Formel: `1 - agreeableness/100 × 0.3`. Bedeutet: niedrige Verträglichkeit (10) zieht Risk um max ~27% hoch, hohe (90) reduziert um max ~27%. Konservative Bandbreite — Big5 ist Class-2 und nicht klinisch valide. |

## Skala-Mapping

| Score-Range | Bucket | UI-Farbe | Action |
|---|---|---|---|
| `< 1` | green | grün | keine Action |
| `1 ≤ score < 3` | yellow | gelb | beobachten |
| `3 ≤ score < 6` | orange | orange | proaktiv ansprechen |
| `score ≥ 6` | red | rot | Eskalation/Steering |

Maximum-Score = 10 (clamp; bei extremen Tenant-Overrides möglich).

## Validierung

- Score-Range bei Default-Multiplikatoren: `0` (Stakeholder ohne Influence) bis `~9.4` (alle Faktoren auf Maximum).
- Worst-Case-Test: blocking + deciding + critical-influence + critical-impact + critical-conflict + agreeableness=5: erwarteter Score ~7.4 (red) — passt.
- Best-Case-Test: supportive + advisory + low-influence + low-impact + low-conflict + agreeableness=95: ~0.05 (green).

## Tenant-Override

Tenants können einzelne Multiplikator-Werte via `tenant_settings.risk_score_overrides` JSONB-Spalte überschreiben. Beispiele:

- **Bauwesen:** `decision_authority.deciding` von 1.5 auf 2.0 (Bauleiter-Entscheidungen sind direkter, später schwer reversibel).
- **Software:** `attitude.blocking` von 2.5 auf 2.0 (Software-Eskalationen häufiger lösbar als Hardware-/ERP-Konflikte).

Override-Validation via Zod (siehe `merge-overrides.ts`). Range-Limits: 0–10.

## Konsequenzen

- ✅ Defaults sind nachvollziehbar dokumentiert; keine "magic numbers".
- ✅ Tenant-Spielraum ohne Code-Change.
- ✅ Compute deterministisch + sub-millisekunden.
- ⚠️ Drift-Risiko bei Override → Defense-in-Depth via Zod-Schema bei Save UND Read-Time.
- ⚠️ Bei zukünftigen Multiplikator-Erweiterungen muss diese Tabelle gepflegt werden.

## Verwandte ADRs

- [Big5-Tonalität-Lookup](big5-tonality-lookup.md) — flankiert Risk-Score um Kommunikations-Empfehlung.
- [Stakeholder-vs-User](stakeholder-vs-user.md) — Risk-Score gilt nur für Stakeholder-Entitäten, nicht User.
