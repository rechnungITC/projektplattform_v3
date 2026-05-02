# PROJ-35: Stakeholder-Wechselwirkungs-Engine — Risiko-Score, Eskalations-Indikatoren & Tonalitäts-Empfehlungen

## Status: Planned
**Created:** 2026-05-02
**Last Updated:** 2026-05-02 (Decisions locked via /requirements)

## Summary

PROJ-33 (Phase α/β/γ/δ deployed) hat die **Daten-Schicht** für reichhaltige Stakeholder-Profile geliefert: qualitative Bewertung (`influence`, `impact`, `attitude`, `conflict_potential`, `decision_authority`, `communication_need`, `preferred_channel`), Skill-Profil (5 Dimensionen), Big5/OCEAN-Persönlichkeitsprofil (5 Dimensionen, fremd + self via Magic-Link). Diese Daten stehen heute **isoliert nebeneinander** — die Plattform leitet daraus keine Aussagen ab.

PROJ-35 schließt das: berechnet aus den vorhandenen Daten **abgeleitete Indikatoren** für Stakeholder-Risiko, Wahrnehmungslücken, Eskalations-Bedarf und Kommunikations-Empfehlungen. Liefert ein "Stakeholder-Health-Dashboard" pro Projekt + Inline-Hinweise im Stakeholder-Detail. Wird Datenbasis für PROJ-36 KI-Coaching.

## Dependencies

- **Requires:**
  - **PROJ-33-α** (qualitative Felder: influence, impact, attitude, conflict_potential, decision_authority, communication_need, preferred_channel) — deployed
  - **PROJ-33-γ** (skill_profiles + personality_profiles fremd-Werte) — deployed
  - **PROJ-33-δ** (Self-Assessment self-Werte) — deployed
  - **PROJ-9** (Work-Items, deployed) — für Stakeholder×Work-Item-Verknüpfung
  - **PROJ-19** (Phases & Milestones, deployed) — für Critical-Path-Berechnung
  - **PROJ-17** (Tenant-Settings, deployed) — für tenant-konfigurierbare Risk-Score-Multiplikatoren
- **Influences:**
  - **PROJ-36** (KI-Coaching) — nutzt PROJ-35 Indikatoren als Eingabe für personalisierte Drafts + Eskalations-Empfehlungen
  - **PROJ-34** (Communication-Tracking) — wenn Sentiment-Daten vorhanden, gehen sie als Multiplikator in Risk-Score (PROJ-35-β später)

## V2 Reference Material

- V2 hatte **kein** vergleichbares Feature — Stakeholder-Risiko-Berechnung ist V3-Original.
- Inspiration: V2-Stakeholder-Modell (Influence-Impact-Matrix nach Mendelow) wurde in PROJ-8 importiert; V3 erweitert um Big5 + Konflikt-Potenzial + Authority-Faktoren.

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
**möchte ich** automatische Warnungen wenn ein Stakeholder eine Hochrisiko-Konstellation aufweist
**damit** ich solche Konstellationen rechtzeitig im Steering Committee adressieren kann.

### US-4 — Tonalitäts-Empfehlung
**Als** Projektmanager
**möchte ich** eine differenzierte Empfehlung sehen, **wie** ich einen Stakeholder ansprechen sollte (Stil, Detailtiefe, Kommunikationskanal) — auf Basis seines vollständigen Big5-Profils
**damit** meine Kommunikation präzise auf das Persönlichkeitsprofil passt.

### US-5 — Critical-Path-Risk
**Als** Projektmanager
**möchte ich** sehen, ob Stakeholder mit hohem Risiko-Score auf einem kritischen Work-Item sitzen
**damit** ich Ressourcen-Konflikt früh erkenne.

### US-6 — Veränderung über Zeit
**Als** Projektmanager
**möchte ich** sehen, wie sich der Risiko-Score eines Stakeholders über Zeit entwickelt hat (Trend-Linie aus Audit-Events)
**damit** ich Eskalation oder Beruhigung früh erkenne.

### US-7 — Tenant-Admin: Risk-Score-Multiplikatoren
**Als** Tenant-Admin
**möchte ich** die Multiplikatoren der Risk-Score-Formel an unsere Branche/Methodik anpassen können (z.B. Bauwesen gewichtet `decision_authority` höher als IT)
**damit** der Risk-Score zu unseren Realitäten passt und nicht generisch bleibt.

### US-8 — Health-Dashboard pro Projekt
**Als** Projektmanager
**möchte ich** auf einer eigenen Page (mit Quick-Access aus dem Project-Room) alle Stakeholder eines Projekts nach Risk-Score sortiert sehen
**damit** ich vor Steering-Meetings priorisieren kann, wer adressiert werden muss.

## Acceptance Criteria

### Block 1 — Risiko-Score-Berechnung (DECISION 1: tenant-konfigurierbar)

**Risk-Score-Formel:**

```
risk =
    influence_weight   × influence_norm(0..1)
  × impact_weight      × impact_norm(0..1)
  × attitude_factor    (per attitude-Wert)
  × conflict_factor    (per conflict_potential-Wert)
  × big5_modifier      (1 - agreeableness/100 × adversity_weight)
  × authority_factor   (per decision_authority-Wert)
```

**Default-Multiplikatoren** (TS-Konstanten in `src/lib/stakeholders/risk-score-defaults.ts`):

| Faktor | Wert | Range |
|---|---|---|
| `influence_weight` | 1.0 | normalisiert via influence_norm-Tabelle |
| `impact_weight` | 1.0 | normalisiert via impact_norm-Tabelle |
| `influence_norm` | low=0.25, medium=0.5, high=0.75, critical=1.0 | 0..1 |
| `impact_norm` | low=0.25, medium=0.5, high=0.75, critical=1.0 | 0..1 |
| `attitude_factor` | supportive=0.5, neutral=1.0, critical=1.5, blocking=2.5 | — |
| `conflict_factor` | low=0.5, medium=1.0, high=1.5, critical=2.0 | — |
| `authority_factor` | none=0.5, advisory=0.8, recommending=1.0, deciding=1.5 | — |
| `adversity_weight` | 0.3 | für big5_modifier-Formel |

**Skala** (wird auf `0..10`-Bucket gemapped):
- `< 1`: 🟢 grün — keine Action
- `1-3`: 🟡 gelb — beobachten
- `3-6`: 🟠 orange — proaktiv ansprechen
- `≥ 6`: 🔴 rot — Eskalation/Steering

**Tenant-Konfiguration (DECISION 1 LOCKED — tenant-konfigurierbar):**

- [ ] **B1.1** Defaults liegen als TS-Konstanten + ADR `docs/decisions/risk-score-defaults.md`. Code-Konstanten sind `as const` und durch Vitest-Snapshot-Tests gegen Drift gesichert.
- [ ] **B1.2** `tenant_settings.risk_score_overrides JSONB DEFAULT '{}'::jsonb` neue Spalte. Speichert tenant-spezifische Multiplikator-Overrides.
- [ ] **B1.3** Schema-Validierung des Override-JSON via Zod beim Speichern: `risk_score_overrides_schema = z.object({ attitude_factor: z.record(z.number().min(0).max(10)).optional(), ... })`. Invalid → 400.
- [ ] **B1.4** Resolver-Funktion `resolveRiskScoreConfig(tenantId)` merged Defaults + Tenant-Overrides (deep-merge mit Override-Priority). Pure-TS, keine DB-Calls in der Hot-Path-Compute (Config wird einmal gefetcht und cached pro Request).
- [ ] **B1.5** Tenant-Admin-UI unter `/settings/tenant/risk-score` mit:
  - Form für jeden Multiplikator-Bucket (attitude_factor, conflict_factor, authority_factor, adversity_weight)
  - "Auf Defaults zurücksetzen"-Button (DELETE-Endpoint löscht Overrides → fallback auf TS-Defaults)
  - Live-Preview-Pane: zeigt Beispiel-Risk-Score für ein hypothetisches Stakeholder-Profil mit aktuellen Overrides
- [ ] **B1.6** RBAC: nur `tenant_admin` darf POST/DELETE; alle Member dürfen GET-Read der aktuellen Config (für Risk-Score-Tooltip "Warum dieser Score?").
- [ ] **B1.7** Audit-Trail: Override-Änderungen via PROJ-10 `audit_log_entries` (existing pattern); Tenant-Setting ist bereits im audit-tracked-set.

### Block 2 — Wahrnehmungslücke (Self vs Fremd)

- [ ] **B2.1** Pro Big5-Dimension: `delta = self - fremd` berechnet wenn beide Werte vorhanden, sonst `null`.
- [ ] **B2.2** Pro Skill-Dimension: `delta = self - fremd` analog.
- [ ] **B2.3** Aggregat: `max(|delta|)` über alle 10 Dimensionen wo beide Werte vorhanden.
- [ ] **B2.4** UI flagged ab `|delta| ≥ 30` mit Differenz-Liste sortiert nach absoluter Abweichung DESC.
- [ ] **B2.5** Wenn keine Self-Werte vorhanden: kein Flag, UI zeigt nur Hinweis "Self-Assessment noch ausstehend — Magic-Link versenden?" (Link zu PROJ-33-δ-Invite).
- [ ] **B2.6** Wahrnehmungslücke ist read-only-Anzeige; Risk-Score nutzt nur Fremd-Werte (PM-Sicht ist autoritativ — siehe EC-2).

### Block 3 — Eskalations-Indikatoren (DECISION 2: alle 4 Patterns sind MVP-Pflicht)

Hard-coded Patterns die zu einem "Hochrisiko"-Banner im Stakeholder-Detail führen. **Alle 4 Patterns sind MVP-Pflicht** (DECISION 2 LOCKED):

| Pattern-Key | Condition | Severity | UI-Empfehlung |
|---|---|---|---|
| **`blocker_decider`** | `attitude='blocking' AND decision_authority='deciding'` | 5 (rot) | "Dieser Stakeholder kann das Projekt blockieren. Eskalation in Steering empfohlen — 1:1-Gespräch vor Group-Setting." |
| **`amplified_conflict`** | `conflict_potential='critical' AND influence IN ('high','critical')` | 4 (orange) | "Hohes Konflikt-Potenzial bei großer Reichweite. Frühzeitig Konfliktklärung suchen, Mediation erwägen." |
| **`dark_profile`** | `agreeableness < 30 AND emotional_stability < 30 AND attitude IN ('critical','blocking')` | 4 (orange) | "Schwierige Persönlichkeits-Konstellation: niedrige Verträglichkeit + niedrige emotionale Stabilität + kritisch gegenüber Projekt. Druck reduzieren, sachlich-vorsichtig kommunizieren." |
| **`unknown_critical`** | `attitude IS NULL AND influence='critical'` | 3 (gelb) | "Stakeholder ist kritisch für das Projekt aber noch nicht qualitativ bewertet. Bewertung durchführen für saubere Risiko-Sicht." |

- [ ] **B3.1** Pattern-Detector als pure-TS-Funktion `detectEscalationPatterns(stakeholder, profiles)`. Returnt Array von `{ pattern_key, severity, message }`.
- [ ] **B3.2** UI rendert Patterns als `Alert variant="destructive"` (severity≥4) oder `Alert variant="default"` (severity<4) am Top des Stakeholder-Drawers/Profile-Tabs.
- [ ] **B3.3** Patterns werden in `stakeholder_profile_audit_events.payload` mit-protokolliert wenn neuer Pattern aktiv wird (nicht jedes Re-Render — nur Activation/Deactivation).
- [ ] **B3.4** Tenant-Admins können Patterns nicht überschreiben oder deaktivieren (MVP-Lock — Phase 2 evtl tenant-konfigurierbar).

### Block 4 — Tonalitäts-Empfehlung (DECISION 3: 32-Kombinations-Lookup-Table)

**Lookup-Table mit allen 2⁵=32 Big5-Quadranten** (DECISION 3 LOCKED):

- [ ] **B4.1** Lookup-Table `BIG5_TONALITY_TABLE` als TS-Konstante: 32 Einträge, Key = Tuple `(O_band, C_band, E_band, A_band, S_band)` mit Band ∈ {`'low'`, `'high'`}. Threshold: `low` wenn Wert < 50, `high` sonst (lazy-binär für MVP; mid-Band als Phase-2-Erweiterung).
- [ ] **B4.2** Pro Eintrag: `{ tone: string, detail_depth: string, channel_preference: string, notes: string[] }`. Beispiel:
  ```ts
  // Hoch O, hoch C, hoch E, hoch A, hoch S — der "ideale Diskussionspartner"
  ['high','high','high','high','high']: {
    tone: 'kollegial-offen',
    detail_depth: 'mittel-detailliert',
    channel_preference: 'Meeting + Folge-Mail',
    notes: ['Offen für unkonventionelle Lösungsansätze', 'Kann Druck gut absorbieren']
  }
  ```
- [ ] **B4.3** Resolver-Funktion `resolveTonality(big5_fremd)` lookup'd den passenden Eintrag. Wenn Big5-Werte unvollständig (`null`-Werte): fall-back auf neutrale Default-Empfehlung mit Hinweis "Big5-Profil unvollständig — diese Empfehlung ist generisch".
- [ ] **B4.4** Qualitative Adjustierung overrided das Channel-Preference (z.B. wenn `preferred_channel='email'` gesetzt, wird das prefereriert über Big5-Empfehlung).
- [ ] **B4.5** Output als 2-3-zeilige Card im Stakeholder-Detail mit Heading "Empfohlener Kommunikationsstil" + 3 Sub-Felder (Tonalität, Detailtiefe, Kanal) + max. 4 Notes als Bullet-List.
- [ ] **B4.6** Vitest-Coverage: alle 32 Lookup-Einträge müssen mindestens einmal getestet werden (snapshot-test reicht — kein Branch-Logic).
- [ ] **B4.7** Lookup-Table-Inhalte werden in eigenem ADR `docs/decisions/big5-tonality-lookup.md` dokumentiert mit psychologischer Begründung pro Quadrant (kurzer Satz pro Eintrag).

### Block 5 — Critical-Path-Indikator

- [ ] **B5.1** Kombiniere Stakeholder ↔ Work-Item-Assignments (PROJ-9 + PROJ-11 resource-assignments).
- [ ] **B5.2** "Kritischer Pfad" = Phase mit `is_critical=true` (PROJ-19 Erweiterung — wenn Spalte fehlt, lazy-add via Phase-α-Migration) ODER Milestone target_date < `project.planned_end_date - 14d`.
- [ ] **B5.3** Wenn Stakeholder Risk-Score ≥ 3 (orange/rot) UND auf einem Work-Item innerhalb eines critical-path-elements zugewiesen → "Critical-Path-Risk"-Banner mit Empfehlung "Diese Person sitzt auf einem zeitkritischen Item — Backup-Person planen".
- [ ] **B5.4** Banner verlinkt zu Stakeholder-Profile + zum betroffenen Work-Item.
- [ ] **B5.5** Compute-Strategy: lazy on Dashboard-Query, nicht real-time (akzeptable Latenz für Use-Case ist 1 Reload).

### Block 6 — Trend-Analyse

- [ ] **B6.1** Aus `audit_log_entries` (PROJ-10) für qualitative Felder (attitude, influence, impact, conflict_potential, decision_authority).
- [ ] **B6.2** Aus `stakeholder_profile_audit_events` (PROJ-33-γ) für Skill+Big5.
- [ ] **B6.3** Compute Risk-Score retroaktiv für jedes Audit-Event-Datum (ad-hoc, nicht materialisiert — Phase-2 wenn perfomance-kritisch).
- [ ] **B6.4** Render als Sparkline im Stakeholder-Detail mit **Toggle 30/90/365 Tage** (Default 90).
- [ ] **B6.5** Sparkline zeigt Score-Bucket-Farbe in Achterbahn-Form (rot/orange/gelb/grün-Zonen).
- [ ] **B6.6** Wenn keine Audit-Events im gewählten Range → "Keine Veränderungen im Zeitraum"-Empty-State.

### Block 7 — Stakeholder-Health-Dashboard (DECISION 4: Page + Tab als Shortcut)

**Beides — eigene Page + Tab-Shortcut** (DECISION 4 LOCKED):

- [ ] **B7.1** Eigene Page unter `/projects/[id]/stakeholder-health` mit:
  - Header: Projekt-Name + Aggregat-Metriken (Anzahl pro Bucket, höchster aktiver Risk-Score, durchschnittliche Wahrnehmungslücke wenn Self-Werte vorhanden)
  - Filter-Bar: Buckets-Filter (rot/orange/gelb/grün), Show-only-with-Patterns-Toggle, Show-only-on-critical-path-Toggle
  - Ranking-Tabelle: Stakeholder nach Risk-Score DESC, Spalten: Name, Risk-Score (mit Bucket-Farbe), Top-Pattern, Critical-Path-Flag, Wahrnehmungslücke-Indicator, Quick-Action-Button (Self-Assessment versenden / Stakeholder öffnen)
  - Sortierung: Risk-Score DESC primär, Influence DESC sekundär, Name ASC tertiär (siehe EC-5)
- [ ] **B7.2** Tab-Shortcut im Project-Room-Sidebar (PROJ-23/PROJ-28 — Method-aware Navigation): "Stakeholder-Health" mit Bucket-Counter-Badge (z.B. "3" wenn 3 rote Stakeholder vorhanden).
- [ ] **B7.3** Counter-Badge wird via lazy-fetch geladen (kein Blocker für Sidebar-Render).
- [ ] **B7.4** RBAC: alle Project-Member sehen Dashboard-Read; nur tenant_admin oder project_lead sieht Quick-Action-Buttons.
- [ ] **B7.5** Performance-Budget: Dashboard-Query < 200ms für 100 Stakeholder; pro Stakeholder Risk-Score-Berechnung < 5ms.
- [ ] **B7.6** Empty-State wenn 0 Stakeholder im Projekt: "Noch keine Stakeholder im Projekt. → Stakeholder anlegen" (deep-link zu PROJ-8 Stakeholder-Form).

## Edge Cases

- **EC-1: Kein Big5-Profil vorhanden** → Risk-Score wird ohne `big5_modifier` berechnet (= 1.0). UI zeigt Hinweis "Risk-Score ohne Persönlichkeits-Profil ungenau, bitte ergänzen → Profile-Tab öffnen".
- **EC-2: Self-Werte in Big5 absurd anders als Fremd** (z.B. Self=90, Fremd=10) → Wahrnehmungslücke flagged ABER Risk-Score nutzt nur Fremd (PM-Sicht ist autoritativ). Wahrnehmungslücke-Card zeigt expliziten Hinweis "Diese Differenz hat keinen Einfluss auf den Risk-Score — sie zeigt nur den Trainings-/Gesprächsbedarf."
- **EC-3: Stakeholder hat sich gerade geändert** (z.B. neue attitude="supportive" eingetragen) → Risk-Score recomputiert sofort beim nächsten Render, Trend-Sparkline zeigt Knick beim entsprechenden Datum.
- **EC-4: Tenant deaktiviert KI-Coaching** → PROJ-35 ist davon **unabhängig** (rein deterministische Formeln, keine externe API). Risk-Score, Tonalität, Patterns funktionieren ohne KI.
- **EC-5: Multiple Stakeholder gleicher Risk-Score** → Sortierung: Risk-Score DESC primär, Influence DESC sekundär, Name ASC tertiär.
- **EC-6: Big5-Werte alle null** → big5_modifier = 1.0 (neutral); kein false-Negative. UI zeigt Hinweis (siehe EC-1).
- **EC-7: Tenant-Override JSON ist invalid** → Save-Endpoint returnt 400 mit Schema-Error; Risk-Score-Compute falls back auf Defaults bei Read-Time wenn ein Override-Wert das Schema verletzt (Defense-in-Depth gegen DB-Drift).
- **EC-8: Stakeholder ist `is_active=false`** → Wird aus Dashboard-Ranking ausgeschlossen, aber Risk-Score ist im Detail-View noch sichtbar (für Audit-Zwecke).
- **EC-9: Stakeholder hat Project-Zuweisung gewechselt** → Dashboard zeigt nur Stakeholder des aktuell betrachteten Projekts; Risk-Score-Audit-History bleibt erhalten.
- **EC-10: Big5-Wert exakt = 50** (Threshold-Edge) → Band='high' (`>= 50` = high) per Konvention; in Lookup-Table ist das immer der gleiche Eintrag — keine Inkonsistenz.
- **EC-11: Pattern wird über Zeit aktiv → inaktiv → aktiv** → audit_event nur bei state-change, nicht jedes Re-Render. Activation/Deactivation jeweils 1 Event.
- **EC-12: Tenant-Admin überschreibt `attitude_factor` mit `0`** → Risk-Score ignoriert attitude komplett (mathematische Konsequenz). Erlaubt — aber UI zeigt Warnung beim Speichern: "Wert 0 deaktiviert diesen Faktor — sicher?".

## Out of Scope (für PROJ-35)

- ❌ KI-generierte Empfehlungstexte (das ist PROJ-36)
- ❌ Communication-History-Sentiment-Multiplikator (das ist PROJ-34)
- ❌ Tenant-konfigurierbare Eskalations-Patterns (Phase 2; MVP nutzt hardcoded Patterns)
- ❌ Eskalations-Workflow mit Approval-Gate (das wäre PROJ-31-Erweiterung)
- ❌ Cross-Tenant-Benchmarking
- ❌ Materialisierte Risk-Score-Tabelle (Phase 2 wenn Performance-Budget B7.5 nicht hält)
- ❌ Historischer Replay mit alten Multiplikator-Configs (Trend nutzt aktuelle Multiplikatoren auch für Historie — explicit out-of-scope für MVP)
- ❌ Lookup-Table-Mid-Band (alle 3⁵=243 Kombinationen) — MVP nutzt 2-Band-Binär (low/high), Mid-Band ist Phase-2

## Technical Requirements

- **Performance:** Risk-Score-Berechnung pro Stakeholder < 5ms (pure function); Dashboard-Query < 200ms für 100 Stakeholder
- **Determinismus:** Identische Eingabe + identischer Multiplikator-Config → identischer Score; keine Random-Komponente
- **No-AI:** Alle Berechnungen lokal; keine externe API-Calls; keine Class-3-Routing-Sorgen
- **Audit:** Score-Berechnungen sind transparent (kein Black-Box); UI kann "Warum dieser Score?"-Tooltip zeigen mit Formel-Aufschlüsselung
- **Privacy:** Risk-Score selbst ist Class-2 (abgeleitet aus Class-2/3 Daten — bleibt Class-2 weil nicht direkt personenbezogen identifizierend)
- **Tenant-Isolation:** Risk-Score-Multiplikatoren liegen in `tenant_settings`, kein cross-tenant-Lookup

## Empfohlene interne Phasierung (nicht-bindend für /architecture)

| Phase | Scope | Migration | UI | Aufwand |
|---|---|---|---|---|
| **35-α** | Block 1 (Risk-Score + Tenant-Config) + Block 2 (Wahrnehmungslücke) + Tonalitäts-Lookup-Table (Block 4) | 1 Migration (tenant_settings.risk_score_overrides + Big5-tonality-Seeds) | Tenant-Config-Page + Stakeholder-Detail Risk-Banner + Tonalitäts-Card + Wahrnehmungslücke-Section | ~3 PT |
| **35-β** | Block 3 (Eskalations-Patterns als Banner) + Block 5 (Critical-Path-Indikator) | 0-1 Migration (`phases.is_critical` lazy-add wenn fehlt) | Pattern-Banner + Critical-Path-Banner | ~2 PT |
| **35-γ** | Block 6 (Trend-Sparkline) + Block 7 (Health-Dashboard inkl. Tab-Shortcut) | 0 Migrations | Health-Page + Tab-Shortcut + Sparkline-Component | ~3 PT |

**Total: ~8 PT** (vs. 6 PT pre-decisions — Tenant-Config + 32-Lookup-Table erhöhen Komplexität um ~2 PT).

## Aufwandsschätzung (CIA-bestätigung empfohlen bei /architecture)

- **Backend** (Risk-Score-Function + Resolver + DB-View für Dashboard + Audit-basierte Trend-Computation + Tenant-Config-Endpoints): ~3 PT
- **Frontend** (Stakeholder-Detail Risk-Banner + Tonalitäts-Card + Critical-Path-Banner + Health-Dashboard-Page + Tab-Shortcut + Sparkline + Tenant-Config-UI): ~4 PT
- **QA** (Unit-Tests für jede Formel, Snapshot-Tests für 32-Lookup-Table, Edge-Cases-Coverage, UI-Visual-Regression): ~1 PT
- **Total**: ~8 PT

## Open Questions for /architecture (CIA-Review-Themen)

Diese Themen sind explizit für /architecture mit CIA-Review markiert (kreuzt PROJ-9, PROJ-19, PROJ-20, PROJ-17 deployed):

1. **Risk-Score in DB-View vs Compute-on-Read?** — Performance vs Aktualität: bei 100 Stakeholdern ist on-the-fly TS-Compute am realistischsten, aber wenn das Dashboard auf >500 Stakeholder skaliert, brauchen wir Materialized View oder DB-Function. CIA soll Schwellwert empfehlen.
2. **Sparkline materialisiert oder ad-hoc aus audit_log?** — MVP-Default: ad-hoc-Compute (max. ~365 Audit-Events pro Stakeholder, akzeptabel). Phase 2: Materialisiert wenn 1000er Stakeholder oder lange Historien. CIA soll bewerten.
3. **Wahrnehmungslücke-Formel bei nur teilweisen Daten** — wenn 3 von 5 Skill-Dimensionen Self-Werte haben, aber 0 von 5 Big5: ist das Aggregat sinnvoll oder zeigen wir 2 separate Aggregate (Skill-Lücke + Big5-Lücke)? Spec aktuell: max(|delta|) über ALLE 10. CIA soll prüfen ob das in Edge-Cases falsch-positiv-flagged.
4. **Eskalations-Pattern-Audit-Granularität** — Schreiben wir Pattern-Activation als Audit-Event (siehe B3.3) oder reicht es Patterns lazy-on-Read zu computen? Trade-off: Audit-Trail-Klarheit vs Compute-Overhead bei jeder Stakeholder-Änderung.
5. **`phases.is_critical`-Spalte hinzufügen oder nicht?** — Block 5 braucht den Marker. PROJ-19 hat das nicht. Architektur-Entscheidung: Spalte hinzufügen (Migration in PROJ-35-β) oder critical-path-Detection rein per `target_date < project.end_date - 14d`-Heuristik?
6. **Tenant-Config-Migration-Strategy** — Existing Tenants haben `risk_score_overrides='{}'::jsonb` als Default. Sollen wir per Migration für alle Existing-Tenants den Default explizit setzen oder lazy-on-first-Read?

## Beziehung zu PROJ-36 (KI-Coaching)

PROJ-35 liefert die **deterministische Daten-Basis** für PROJ-36's KI-Coaching-Layer:

- PROJ-35 sagt: "Stakeholder X hat Risk-Score 5.2 (orange), Wahrnehmungslücke 45% in Conscientiousness, Eskalations-Pattern 'Blockierender Entscheider', Tonalitäts-Empfehlung 'sachlich-direkt + 1:1 + email'."
- PROJ-36 nimmt diese Indikatoren als Eingabe + Stakeholder-Big5 + Decision-Body und generiert: "Schreibe einen sachlich-detailorientierten 1:1-Gesprächsleitfaden, der Maxine die Möglichkeit gibt, ihre Bedenken über die Migrations-Spec zu artikulieren, ohne Druck."

PROJ-35 darum ist die **Logik**; PROJ-36 ist die **Sprache**. PROJ-35 muss vor PROJ-36 deployen.

## Success Verification (für /qa)

- [ ] Vitest: Risk-Score-Formel pure-Function-Coverage (alle Multiplikator-Kombinationen), Tenant-Override-Resolver, 32-Big5-Lookup-Snapshot, Eskalations-Pattern-Detector pro Pattern, Wahrnehmungslücke-Aggregat-Logik
- [ ] Live-DB-Red-Team (Supabase MCP): Tenant-Config-Override applied, Cross-Tenant-Isolation der Configs, RLS auf Risk-Score-Reads
- [ ] E2E (Playwright + Auth-Fixture): Health-Dashboard rendert, Tab-Shortcut zeigt Counter-Badge, Tenant-Admin kann Override speichern + zurücksetzen, Stakeholder-Detail zeigt Risk-Banner + Tonalitäts-Card + Wahrnehmungslücke-Section
- [ ] Performance: Dashboard-Query gemessen < 200ms für 100 Stakeholder; Risk-Score-Compute < 5ms
- [ ] Visual-Regression: Buckets-Farben (rot/orange/gelb/grün) in Light + Dark Mode

---

<!-- Sections below to be added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture (CIA-Review zwingend — kreuzt PROJ-9/19/20/17 deployed; lockt 6 Open-Questions oben)._

## Implementation Notes
_To be added by /backend + /frontend._

## QA Test Results
_To be added by /qa._

## Deployment
_To be added by /deploy._
