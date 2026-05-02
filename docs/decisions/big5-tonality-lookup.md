# ADR — Big5-Tonalitäts-Lookup-Table

**Status:** Accepted (PROJ-35 Phase 35-α, 2026-05-02)
**Source-of-truth code:** `src/lib/risk-score/big5-tonality-table.ts`

## Kontext

Big5/OCEAN-Profile (PROJ-33-γ, deployed) liefern 5-dimensionale Persönlichkeits-Indikatoren pro Stakeholder. PROJ-35 leitet daraus eine **Tonalitäts-Empfehlung** ab: wie soll der PM diesen Stakeholder ansprechen (Stil, Detailtiefe, Kanal)?

Drei Optionen wurden in /requirements diskutiert:
1. 5 Faustregeln (eine pro Dimension) — zu generisch.
2. Vollständige Lookup-Table mit allen 32 = 2⁵ Quadranten — gewählt.
3. 3-Stufen-Skala mit 243 Kombinationen — zu komplex für MVP.

## Entscheidung

**Option 2** — binäre Lookup-Table mit 32 Einträgen. Threshold: `< 50 = low`, `≥ 50 = high`.

Reihenfolge der 5 Bänder im Tuple-Key: `[O, C, E, A, S]`
- O = Openness (Offenheit)
- C = Conscientiousness (Gewissenhaftigkeit)
- E = Extraversion
- A = Agreeableness (Verträglichkeit)
- S = Emotional Stability (Emotionale Stabilität)

## Quadranten + psychologische Begründung

> Reihenfolge: O / C / E / A / S — pro Eintrag tone, detail_depth, channel und Notes-Highlights.

### All-low-Familie (introvertiert + konservativ)

| Quadrant | Profil | Begründung |
|---|---|---|
| `low/low/low/low/low` | Konservativ + chaotisch + introvertiert + skeptisch + sensibel | Klassischer "abwartender Skeptiker". Wenig Vertrauensvorschuss; muss schrittweise gewonnen werden. |
| `low/low/low/low/high` | Konservativ + chaotisch + introvertiert + skeptisch + stabil | Robuster Solitär. Argumente schlagen Beziehung. |
| `low/low/low/high/low` | Konservativ + chaotisch + introvertiert + kooperativ + sensibel | Konfliktscheu + sensibel — Eskalationen früh. |
| `low/low/low/high/high` | Konservativ + chaotisch + introvertiert + kooperativ + stabil | Verlässlich, wenig kommunikativ-aktiv. |

### Niedrig O+C, hoch E (extravertiert + chaotisch + konservativ)

| Quadrant | Profil | Begründung |
|---|---|---|
| `low/low/high/low/low` | Konservativ + chaotisch + extravertiert + skeptisch + sensibel | Reaktiv-emotional, kompetitiv, kann Bühne suchen — Rolle klar abgrenzen. |
| `low/low/high/low/high` | Konservativ + chaotisch + extravertiert + skeptisch + stabil | Klassischer Performer. Direkt, ergebnisorientiert. |
| `low/low/high/high/low` | Konservativ + chaotisch + extravertiert + kooperativ + sensibel | Sozial aktiv, aber emotional anfällig. Sandwich-Kritik. |
| `low/low/high/high/high` | Konservativ + chaotisch + extravertiert + kooperativ + stabil | Stabiler Networker — Multiplikator. |

### Hoch C, niedrig O (konservativ-strukturiert)

| Quadrant | Profil | Begründung |
|---|---|---|
| `low/high/low/low/low` | Strukturiert + konservativ + introvertiert + skeptisch + sensibel | Pflichtbewusst aber rigide unter Druck. Schriftliche Vorlagen. |
| `low/high/low/low/high` | Strukturiert + konservativ + introvertiert + skeptisch + stabil | Klassischer Skeptiker mit Selbstdisziplin. Argumente + Daten. |
| `low/high/low/high/low` | Strukturiert + konservativ + introvertiert + kooperativ + sensibel | Loyaler Detail-Mensch, konfliktscheu. Sicheres Setting. |
| `low/high/low/high/high` | Strukturiert + konservativ + introvertiert + kooperativ + stabil | Verlässlicher Detail-Anker. Audit/Compliance-Rolle ideal. |
| `low/high/high/low/low` | Strukturiert + konservativ + extravertiert + skeptisch + sensibel | Perfektionist mit Stress. Druck baut sich schnell auf. |
| `low/high/high/low/high` | Strukturiert + konservativ + extravertiert + skeptisch + stabil | Effektivität-Person mit harter Linie. |
| `low/high/high/high/low` | Strukturiert + konservativ + extravertiert + kooperativ + sensibel | Sozial + pflichtbewusst, aber emotional anfällig. |
| `low/high/high/high/high` | Strukturiert + konservativ + extravertiert + kooperativ + stabil | Idealer Co-Pilot. Verlässlich aber wenig Innovation. |

### Hoch O, niedrig C (visionär + chaotisch)

| Quadrant | Profil | Begründung |
|---|---|---|
| `high/low/low/low/low` | Kreativ + chaotisch + introvertiert + skeptisch + sensibel | Konzepte ja, Operatives schwer. Flow-State erlauben. |
| `high/low/low/low/high` | Kreativ + chaotisch + introvertiert + skeptisch + stabil | Innovativer Solitär. Kein Team-Player. |
| `high/low/low/high/low` | Kreativ + chaotisch + introvertiert + kooperativ + sensibel | Visionär aber emotional anfällig. Vertrauensbasis kritisch. |
| `high/low/low/high/high` | Kreativ + chaotisch + introvertiert + kooperativ + stabil | Stabiler Querdenker mit Team-Anschluss. |
| `high/low/high/low/low` | Kreativ + chaotisch + extravertiert + skeptisch + sensibel | Sprudelnde Ideen, wenig Strukturierung. Co-Pilot nötig. |
| `high/low/high/low/high` | Kreativ + chaotisch + extravertiert + skeptisch + stabil | Innovation-Driver, kompetitiv. |
| `high/low/high/high/low` | Kreativ + chaotisch + extravertiert + kooperativ + sensibel | Visionär + sozial, aber stress-anfällig. |
| `high/low/high/high/high` | Kreativ + chaotisch + extravertiert + kooperativ + stabil | Idealer Networker + Innovation-Sponsor. |

### Hoch O + hoch C (visionär + strukturiert)

| Quadrant | Profil | Begründung |
|---|---|---|
| `high/high/low/low/low` | Architekt + introvertiert + skeptisch + sensibel | Schreibt sehr gut, redet weniger gerne. |
| `high/high/low/low/high` | Senior-Architekt + introvertiert + skeptisch + stabil | Hohe Selbstführung, fordert Gleichbehandlung. |
| `high/high/low/high/low` | Strukturierter Visionär + kooperativ + sensibel | Klare Erwartungen + Vorlauf. |
| `high/high/low/high/high` | Verlässlicher Senior-Sparringspartner | Vision + Struktur + Sozial + Stabil. Liefert Qualität. |
| `high/high/high/low/low` | Treiber-Typ, stress-anfällig | Kompetitiv unter Druck. Eskalationen früh adressieren. |
| `high/high/high/low/high` | Power-Profil — alle hoch außer Verträglichkeit | Kompromisslos im Anspruch. Steering-Dominanz möglich. |
| `high/high/high/high/low` | Idealer Diplomat mit Detail-Tiefe + sensibel | Sehr gute Bridge-Person. |
| `high/high/high/high/high` | Idealer Diskussionspartner — alle Bänder hoch | Strategische Partner-Rolle. |

## Threshold-Wahl

`< 50 = low / ≥ 50 = high`. Big5-Werte sind 0–100. Threshold bei 50 ist Median-konsistent und mit der Slider-UI in PROJ-33-γ aligned (50 ist der Default-Slider-Wert beim Aufmachen).

Konsequenz: ein Wert von genau 50 wird als "high" eingestuft. Edge-Case dokumentiert in PROJ-35 EC-10.

## Override-Mechanik

- Wenn `stakeholders.preferred_channel` gesetzt → überschreibt `channel_preference` aus Lookup.
- Wenn `stakeholders.communication_need='critical'` → eine zusätzliche Notiz wird angehängt: "Höhere Frequenz, früher informieren."

Diese Overrides werden in `resolveTonality()` angewendet (siehe `big5-tonality-table.ts`).

## Limitationen

- **Binäre Bänder** verlieren Mittelbereich-Nuancen (40 vs 60 sind beide "auf der Grenze"). Phase-2-Erweiterung: 3-Bänder-Skala (low/mid/high → 243 Quadranten).
- **Big5 ist statistisch, nicht klinisch.** Empfehlungen sind heuristisch — kein Therapie-Ersatz.
- **Keine kulturelle Adjustierung** im MVP. Big5 ist über Kulturen relativ stabil aber nicht universell.
- **Kein KI-Refinement** im MVP — PROJ-36 wird die statische Empfehlung KI-gestützt erweitern.

## Konsequenzen

- ✅ Deterministisch + Class-2-konform (kein KI-Call).
- ✅ Vollständige 32-Coverage = jedes Big5-Profil bekommt eine spezifische Empfehlung.
- ✅ Vitest-Snapshot-Test sichert die Tabelle gegen Drift.
- ⚠️ Wartungs-Overhead bei Erweiterung (z.B. Bandbreiten-Adjustierung).
- ⚠️ "Kontext-Blindheit" — Lookup kennt nur Big5, nicht Stakeholder-Historie. Mitigation: PROJ-36 ergänzt Kontext.

## Verwandte ADRs

- [Risk-Score-Defaults](risk-score-defaults.md)
- [Stakeholder-vs-User](stakeholder-vs-user.md)
- PROJ-12 KI-Privacy-Routing (`docs/architecture/ai-privacy-routing.md` — Big5 ist Class-2)
