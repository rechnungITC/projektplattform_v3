# PROJ-35: Stakeholder-Wechselwirkungs-Engine — Risiko-Score, Eskalations-Indikatoren & Tonalitäts-Empfehlungen

## Status: 35-α Backend Deployed (35-α Frontend + β + γ pending)
**Created:** 2026-05-02
**Last Updated:** 2026-05-02 (35-α Backend live in production; Tag v1.35.0-PROJ-35-alpha)

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

> **CIA-Review abgeschlossen** (2026-05-02). Alle 6 Open-Questions aus dem /requirements-Run gelockt. Gesamt-Empfehlung: **MVP-light bei Performance/Speicher, audit-strict bei Governance, domain-treu bei Datenmodell.** Detaillierter Review-Report wurde im /architecture-Skill konsumiert; Quintessenz unten als Architektur-Lock dokumentiert.

### 1. Big Picture in einem Satz

PROJ-35 baut eine **deterministische Berechnungs-Bibliothek** in TypeScript, die aus den schon vorhandenen Stakeholder-Profilen (PROJ-33-α/β/γ/δ) drei Sichten liefert: einen **Risk-Score** (0–10, farbkodiert), **Eskalations-Patterns** (4 Hochrisiko-Konstellationen) und eine **Tonalitäts-Empfehlung** (32-Quadranten-Lookup auf Big5). Plus ein Health-Dashboard, das diese drei Sichten projekt-weit aggregiert + ein Sparkline-Trend.

### 2. Komponenten-Struktur (was der Nutzer sieht)

```
Stakeholder-Detail (PROJ-8 + PROJ-33-Tabs, deployed)
├── Risk-Score-Banner (NEU — am Top des Profil-Tabs)
│   ├── Score (0-10) + Bucket-Farbe (rot/orange/gelb/grün)
│   └── Tooltip "Warum dieser Score?" → Formel-Aufschlüsselung
├── Eskalations-Pattern-Banner (NEU — 0-N Banner)
│   ├── Pattern-Key + Severity-Farbe
│   └── UI-Empfehlungstext
├── Tonalitäts-Empfehlung-Card (NEU)
│   ├── Tonalität + Detailtiefe + Kanal
│   └── 4 Notes als Bullet-List
├── Wahrnehmungslücke-Section (NEU — 0-2 Aggregate)
│   ├── Skill-Lücke (wenn min. 60% Skill-Self-Werte vorhanden)
│   └── Big5-Lücke (wenn min. 60% Big5-Self-Werte vorhanden)
├── Trend-Sparkline (NEU)
│   ├── Toggle 30/90/365 Tage (Default 90)
│   └── Score-Bucket-Achterbahn-Visualization

Stakeholder-Health-Dashboard (NEU — eigene Page + Sidebar-Tab)
├── Header
│   ├── Aggregat-Metriken (Bucket-Counts, Top-Score, Avg-Wahrnehmungslücke)
│   └── Filter-Bar (Bucket · with-patterns · on-critical-path)
├── Ranking-Tabelle (DESC nach Risk-Score)
│   ├── Stakeholder-Name + Bucket-Farbe
│   ├── Risk-Score + Top-Pattern + Critical-Path-Flag
│   └── Quick-Actions (Self-Assessment-Invite · Stakeholder öffnen)
└── Empty-State + Counter-Badge im Sidebar-Tab

Tenant-Settings (PROJ-17, deployed)
└── /settings/tenant/risk-score (NEU — Tenant-Admin only)
    ├── Multiplikator-Forms (attitude · conflict · authority · adversity_weight)
    ├── "Auf Defaults zurücksetzen"-Button
    └── Live-Preview-Pane (hypothetisches Stakeholder-Profil)
```

### 3. Datenmodell (Klartext)

**1 neue Spalte:**
- `tenant_settings.risk_score_overrides` — JSONB-Spalte mit Default `'{}'::jsonb`. Speichert tenant-spezifische Multiplikator-Overrides. Schema-validiert via Zod beim Schreiben (RBAC: nur tenant_admin schreibbar).

**1 neue Spalte (PROJ-19-Erweiterung in 35-β):**
- `phases.is_critical BOOLEAN NOT NULL DEFAULT false` — opt-in-Marker, den der PM manuell setzt. Domain-autoritativ. Migration ist trivial (alle Existing-Phasen bleiben `false`).

**Keine neuen Tabellen.** Risk-Score, Patterns, Tonalität werden alle **on-the-fly in TypeScript** berechnet (kein DB-View, keine Materialisierung). Trend-Sparkline liest aus existing Audit-Tabellen (`audit_log_entries` + `stakeholder_profile_audit_events`) ad-hoc.

**1 neues Audit-Event-Type:**
- `stakeholder_profile_audit_events.event_type='escalation_pattern_changed'` — wird via Trigger geschrieben wenn ein Pattern aktiviert/deaktiviert wird. Payload: `{ pattern_key, action: 'activated'|'deactivated', input_snapshot }`. Append-only via existing γ-Trigger.

### 4. Tech-Entscheidungen (das Warum für PM)

#### 4.1 Risk-Score in TypeScript, nicht in der Datenbank (CIA Fork 1)
**Entscheidung:** Compute-on-Read als pure TS-Funktion in `src/lib/risk-score/compute.ts`.

**Warum:** Tenant-Override-JSON aus `tenant_settings` ist in TypeScript trivial zu mergen, in einer SQL-View aber stateful (jeder Read müsste das JSON parsen + casten). 100 Stakeholder × 4 Multiplikatoren = 400 Multiplikationen — sub-millisekunden. Wir kippen erst auf DB-View ab **~2.000 aktiven Stakeholdern pro Tenant** ODER ab Listing-Pages mit > 500 Rows ohne Pagination — beides weit weg. Code ist deterministisch + side-effect-free, also später Drop-in materialisierbar.

#### 4.2 Trend-Sparkline ad-hoc, keine Materialisierung (CIA Fork 2)
**Entscheidung:** Sparkline berechnet pro Render aus existing Audit-Tabellen.

**Warum:** Materialisierung würde 36k Rows/Jahr/Tenant kosten + Backfill-Komplexität (zwei Audit-Quellen mergen) + Cron-Job für nächtliches Aggregieren. Bei 365 Events × 100 Stakeholder ist das eine indexierte Range-Query, kein Performance-Risiko. Wir kippen erst bei **~10.000 Audit-Events pro Stakeholder** (≈ 27 Jahre Historie). Frontend-Hook `useStakeholderRiskTrend` versteckt die Source — Materialisierung später ist friction-frei austauschbar.

#### 4.3 Wahrnehmungslücke in zwei getrennten Aggregaten (CIA Fork 3)
**Entscheidung:** `skill_perception_gap` + `big5_perception_gap` separat. Mindest-Coverage 60% pro Aggregate.

**Warum:** Die ursprüngliche Spec-Idee `max(|delta|)` über alle 10 Dimensionen produziert Falsch-Positive, wenn nur Skill-Self-Werte vorhanden sind aber 0 Big5-Self-Werte. Skill und Persönlichkeit sind unterschiedliche Achsen — fachlich UND juristisch (Big5 ist Class-2, Skill ist Class-2 aber kontextual anders). 60%-Coverage verhindert "Lücke wegen 1 von 5 Werten"-Noise. Threshold ist hardcoded für MVP (siehe OF-2 unten).

#### 4.4 Eskalations-Patterns als Audit-Events (CIA Fork 4)
**Entscheidung:** Pattern-Activation/Deactivation wird in `stakeholder_profile_audit_events` mit `event_type='escalation_pattern_changed'` geschrieben.

**Warum:** PROJ-33-γ hat append-only-Audit-Pattern bereits etabliert; Konsistenz schlägt Aufwand. Compliance-Wert ist hoch: bei einem späteren Stakeholder-Eskalations-Audit muss nachvollziehbar sein, **wann** ein Stakeholder als Hochrisiko geflagged wurde — Lazy-on-Read würde das fragmentieren. Trigger-Mechanismus wird auf existing Profile-Trigger aufgesetzt (~0.5 PT statt ~2 PT für separates Subsystem). Trigger fires NUR bei Änderung der relevanten Felder (`influence`, `impact`, `attitude`, `conflict_potential`, `decision_authority`, `agreeableness`, `emotional_stability`), nicht bei jedem `updated_at`-Bump.

#### 4.5 `phases.is_critical` als neue Spalte (CIA Fork 5)
**Entscheidung:** Migration `phases.is_critical BOOLEAN DEFAULT false` in 35-β + UI-Toggle im Edit-Phase-Dialog in 35-γ.

**Warum:** PM-Domain-Wissen ist autoritativ — die Heuristik (`milestone.target_date < project.planned_end_date - 14d`) ist eine Vermutung, kein Fakt. ERP-Projekte haben oft kritische Phasen *früh* (z.B. Datenmigration in Phase 2 von 5), die per Heuristik falsch-negative produzieren würden. Migration ist 1 Spalte mit `DEFAULT false`, kein Backfill-Pain. **Best-of-Both:** Heuristik greift als Fallback wenn alle Phasen `is_critical=false` (User hat noch nichts manuell markiert).

#### 4.6 Tenant-Config-Migration mit explizitem Default (CIA Fork 6)
**Entscheidung:** Atomic Migration `ALTER TABLE tenant_settings ADD COLUMN risk_score_overrides JSONB NOT NULL DEFAULT '{}'::jsonb` in 35-α. Plus serverseitiger Merge-Helper.

**Warum:** Lazy-on-Read ist ein bekanntes Anti-Pattern — verstreut Default-Logik über alle Read-Pfade und macht "config exists vs. config empty" untestbar. Migration ist 5 Zeilen SQL und stellt Existing-Tenants gleich. Override mit `null`-Wert für eine Multiplikator-Dimension fällt automatisch auf Default zurück (Default-Defense gegen Override-Drift).

#### 4.7 Sub-Decisions aus CIA-Open-Questions

- **OF-1 (Override-Scope tenant vs project):** **MVP = tenant-level**. Project-level-Override in PROJ-35.next wenn Multi-Domain-Tenants es validiert anfordern. Verhindert Premature-Generalization.
- **OF-2 (60%-Coverage hardcoded vs konfigurierbar):** **MVP = hardcoded `0.6`**. Tenant-Konfigurierbarkeit ist YAGNI — Threshold ist statistisch motiviert, nicht business-domain-spezifisch.

### 5. Phasen-Plan (verbindlich für /backend + /frontend)

| Phase | Inhalt | Migrationen | Aufwand |
|---|---|---|---|
| **35-α** | Compute-Bibliothek (Risk-Score · Wahrnehmungslücke · 32-Big5-Lookup · Pattern-Detector) + Tenant-Override-Migration + Tenant-Admin-Page `/settings/tenant/risk-score` + Audit-Event-Trigger für Patterns | 1 Migration: `tenant_settings.risk_score_overrides` + Erweiterung Audit-Event-Type-CHECK | ~3 PT |
| **35-β** | Critical-Path-Indikator (`phases.is_critical`-Migration + Backend-Compute-Erweiterung) + Stakeholder-Detail-UI (Risk-Banner · Pattern-Banner · Tonalitäts-Card · Wahrnehmungslücke-Section) | 1 Migration: `phases.is_critical` | ~3 PT |
| **35-γ** | Sparkline-Komponente + Stakeholder-Health-Dashboard (Page + Tab-Shortcut + Counter-Badge) + Phase-Edit-Dialog `is_critical`-Toggle | 0 Migrationen | ~2 PT |

**Total: ~8 PT** (CIA-bestätigt, MVP-light + audit-strict).

### 6. Cross-Phase-Synergien

- **α + β:** Compute-Bibliothek aus α wird in β für Critical-Path-Indikator wiederverwendet (DRY).
- **α + γ:** Pattern-Audit-Events aus α werden in γ optional als Sparkline-Marker gerendert (Wert für Health-Dashboard ohne Extra-Source).
- **β + γ:** `phases.is_critical`-Migration in β + UI-Toggle in γ (Migration vor UI ist die richtige Reihenfolge).

### 7. Anti-Patterns die NICHT in MVP rein

- ❌ **Materialized View für Risk-Score** — Trigger-Pflege, Refresh-Strategie, Override-Drift-Risiko.
- ❌ **`stakeholder_risk_score_history`-Tabelle** — 36k Rows/Jahr ohne Nachweis dass ad-hoc kippt.
- ❌ **Eigene Pattern-Engine-DSL** — 4 hardcoded Patterns + Tenant-Settings für Schwellwerte reichen.
- ❌ **Big5-Empfehlungs-LLM-Call** — 32-Lookup ist deterministisch + Class-2-konform.
- ❌ **Real-time-Push fürs Dashboard** — Polling alle 30s reicht; Realtime ist 1 PT für 0 validierten Need.

### 8. Component-Tree der TypeScript-Bibliothek

```
src/lib/risk-score/                    (NEU — ~3 PT in 35-α)
├── compute.ts                         (pure: stakeholder + profiles + config → score 0-10)
├── compute.test.ts                    (Snapshot + alle Multiplikator-Kombinationen)
├── defaults.ts                        (TS-Konstanten + ADR-Link)
├── merge-overrides.ts                 (deep-merge Defaults + tenant_settings)
├── merge-overrides.test.ts
├── escalation-patterns.ts             (Pattern-Detector pure-Function)
├── escalation-patterns.test.ts
├── perception-gap.ts                  (Skill-Lücke + Big5-Lücke separat)
├── perception-gap.test.ts
├── big5-tonality-table.ts             (32-Quadranten-Lookup-Konstante)
└── big5-tonality-table.test.ts        (Snapshot über alle 32 Einträge)

src/hooks/use-stakeholder-risk.ts      (NEU — Frontend-Hook in 35-β)
src/hooks/use-stakeholder-risk-trend.ts (NEU — Sparkline-Hook in 35-γ)

src/components/stakeholders/risk/      (NEU — UI-Komponenten in 35-β + γ)
├── risk-banner.tsx
├── escalation-pattern-banner.tsx
├── tonality-card.tsx
├── perception-gap-section.tsx
└── risk-trend-sparkline.tsx

src/components/projects/health/        (NEU — Health-Dashboard in 35-γ)
├── health-dashboard-page.tsx
├── health-ranking-table.tsx
├── health-aggregate-metrics.tsx
└── health-filter-bar.tsx

src/app/settings/tenant/risk-score/    (NEU — Tenant-Admin-Page in 35-α)
└── page.tsx + form.tsx + preview.tsx

src/app/api/tenants/[id]/settings/risk-score/  (NEU — Tenant-Config-API in 35-α)
└── route.ts (GET · PUT · DELETE)

docs/decisions/                        (NEU — 2 ADRs in 35-α)
├── risk-score-defaults.md             (Multiplikator-Werte mit Begründung)
└── big5-tonality-lookup.md            (32 Quadranten mit psychologischer Begründung)

docs/architecture/                     (NEU — 1 Architektur-Doc in 35-α)
└── stakeholder-risk-engine.md         (~1 Seite, Pipeline-Diagramm + Audit-Tabellen)
```

### 9. Dependencies (zu installieren)

**Keine neuen NPM-Packages.** Alle Komponenten sind reine TypeScript-Logik mit existing shadcn/ui-Komponenten (`Card`, `Alert`, `Badge`, `Tabs`, `Tooltip`, `Select`, `Input`) + recharts (bereits in PROJ-33-γ installiert für Radar-Charts; wird hier für Sparkline wiederverwendet).

### 10. Audit-Konsistenz

| Event | Tabelle | Trigger | Audit-Pattern-Source |
|---|---|---|---|
| qualitative Felder geändert (`attitude`, `influence`, ...) | `audit_log_entries` | existing PROJ-10 | unverändert |
| Skill-Profile geändert | `stakeholder_profile_audit_events` | existing PROJ-33-γ | unverändert |
| Big5-Profile geändert | `stakeholder_profile_audit_events` | existing PROJ-33-γ | unverändert |
| **Eskalations-Pattern aktiviert/deaktiviert (NEU)** | `stakeholder_profile_audit_events` | NEU in 35-α (Trigger-Erweiterung) | `event_type='escalation_pattern_changed'` |

CHECK-Constraint auf `event_type` muss in 35-α-Migration erweitert werden um den neuen Wert.

### 11. Performance-Budget

| Operation | Budget | Realistic Estimate |
|---|---|---|
| Risk-Score-Compute (1 Stakeholder) | < 5 ms | ~0.05 ms (sub-ms in V8 für 4 Multiplikationen) |
| Health-Dashboard-Query (100 Stakeholder) | < 200 ms | ~50-100 ms (1 indexed query + TS-Compute-Loop) |
| Sparkline-Render (90-Tage-Range, 1 Stakeholder) | < 100 ms | ~20-50 ms (~7-30 Audit-Events pro Stakeholder) |
| Tenant-Override-Save | < 300 ms | ~100 ms (1 UPDATE auf tenant_settings + Audit-Insert) |

### 12. Risiken (CIA-identifiziert + Mitigationen)

- **R1 — Override-Drift:** Tenant-Admin setzt invalide Multiplikator-Werte. **Mitigation:** Zod-Schema mit `min/max` in der API + Frontend-Form-Validation.
- **R2 — Audit-Volumen:** Pattern-Computation bei jedem Stakeholder-Touch erzeugt Audit-Spam. **Mitigation:** Trigger nur bei Änderung der relevanten Felder, nicht bei jedem `updated_at`-Bump.
- **R3 — `is_critical`-RBAC:** Spalte erbt `phases`-RLS, aber UPDATE muss `has_tenant_role(tenant_id, 'manager')` o.ä. erzwingen. **Mitigation:** API-Route mit `requireProjectAccess(..., "edit")`.

### 13. Approval-Empfehlung

**Ready for /backend (Phase 35-α).** Alle CIA-Forks gelockt, Phasenplan dokumentiert, Performance-Budget realistisch, Audit-Konsistenz mit PROJ-10 + PROJ-33-γ gewahrt. Migration-Risiko niedrig (1 Spalte additiv, 1 CHECK-Erweiterung). Keine neuen NPM-Packages.

### 14. Was NICHT in PROJ-35 ist (Architektur-Boundaries)

- ❌ KI-generierte Empfehlungstexte (das ist PROJ-36)
- ❌ Communication-Sentiment-Multiplikator (das ist PROJ-34)
- ❌ Project-level Risk-Score-Overrides (PROJ-35.next)
- ❌ Tenant-konfigurierbarer Coverage-Threshold (PROJ-35.next, YAGNI im MVP)
- ❌ Materialized Trend-History (PROJ-35.next bei Skalierungs-Trigger)
- ❌ Mid-Band-Lookup-Table (3⁵=243 Big5-Quadranten — PROJ-35.next)
- ❌ Tenant-konfigurierbare Eskalations-Patterns (PROJ-35.next)

## Implementation Notes

### Phase 35-α — Backend (2026-05-02)

**Entscheidungen vor /backend-Start:**
- Pattern-Activation/Deactivation: **DB-Trigger (PL/pgSQL)** statt API-Layer (User-Lock — abweichend von CIA-Empfehlung; Begründung: kein Update-Pfad kann Patterns überspringen, auch direkter SQL/MCP-Write)
- Big5-Tonalitäts-Lookup: **alle 32 Einträge komplett** befüllt mit psychologischer Begründung pro Quadrant
- Scope: **vollständige Phase 35-α** in einem Run

**Migration `supabase/migrations/20260502230000_proj35a_risk_score_engine.sql`** (live applied via MCP, version `20260502233032`):
- Neue Spalte `tenant_settings.risk_score_overrides JSONB DEFAULT '{}'::jsonb` (CIA-Fork-6 lock)
- Neue Spalte `stakeholders.current_escalation_patterns text[] DEFAULT array[]::text[]` (Snapshot für Diff-Audit)
- Audit-Event-CHECK erweitert:
  - `event_type` + `escalation_pattern_changed`
  - `actor_kind` + `system` (für Trigger-getriebene Events ohne user/stakeholder-Akteur)
  - `actor_consistency` 3-Wege-OR mit `system`-Branch
  - `profile_kind` + `escalation`
- Helper-Function `compute_escalation_patterns(p_attitude, p_conflict_potential, p_decision_authority, p_influence, p_agreeableness, p_emotional_stability) → text[]` — pure SQL `IMMUTABLE`, mirror der TS-Logik
- Trigger-Function `audit_escalation_patterns()` — joins stakeholders + stakeholder_personality_profiles, computes new patterns, writes activated/deactivated audit-events, updates snapshot column. `set search_path = 'public', 'pg_temp'` per Security-Rule
- 4 Triggers: `AFTER UPDATE OF` relevant cols + `AFTER INSERT` auf `stakeholders` + `stakeholder_personality_profiles`. `OF`-Klausel verhindert Recursion (snapshot-column ist nicht in der Liste)

**Compute-Bibliothek `src/lib/risk-score/`** (54 Vitest-Cases):
- `defaults.ts` — Multiplikator-Konstanten (`RISK_SCORE_DEFAULTS as const`) + Skala-Mapping (`riskBucket()` green/yellow/orange/red)
- `merge-overrides.ts` — `mergeRiskScoreConfig(overrides)` mit Zod-Schema (`riskScoreOverridesSchema`); per-key fallback auf Default bei DB-Drift; Mutation-frei
- `compute.ts` — `computeRiskScore(input, config) → { score, bucket, factors, big5_missing }`; Formel: `infW × infN × impW × impN × attF × cnfF × big5Mod × authF`; clamped 0..10, gerundet auf 2 Dezimalstellen
- `escalation-patterns.ts` — `detectEscalationPatterns(input) → key[]`; Mirror der PG-Function; `ESCALATION_PATTERN_META` mit Severity (1..5) + UI-Empfehlungstext + Label
- `perception-gap.ts` — `computeSkillGap()` + `computeBig5Gap()`; status `no_self|low_coverage|computed`; `COVERAGE_THRESHOLD=0.6`, `FLAG_DELTA_THRESHOLD=30`; Dimensionen sortiert nach `|delta|` DESC
- `big5-tonality-table.ts` — 32 Quadranten-Lookup-Konstante + `resolveTonality()` mit `preferred_channel`-Override + `high_communication_need`-Note-Append; Threshold `< 50 = low`

**API Route `src/app/api/tenants/[id]/settings/risk-score/route.ts`:**
- `GET` — returns `{ defaults, overrides, effective }` via `mergeRiskScoreConfig`
- `PUT` — Zod-validated Save; Tenant-Admin RBAC via `requireTenantAdmin`
- `DELETE` — clears overrides → effective = pure defaults

**ADRs:**
- `docs/decisions/risk-score-defaults.md` — Multiplikator-Werte mit Begründung
- `docs/decisions/big5-tonality-lookup.md` — 32 Quadranten mit psychologischer Begründung

**Architecture-Doc:**
- `docs/architecture/stakeholder-risk-engine.md` — Compute-Pipeline + Audit-Pipeline + Code-Layout + Skalierungs-Schwellwerte

**Verification:**
- `npx tsc --noEmit` exit 0
- `npm run lint` exit 0
- `npm test --run` **685/685** (+54 cases vom risk-score-Lib)
- `npm run build` green; neue Route `/api/tenants/[id]/settings/risk-score` im Manifest
- Live DB Smoke-Test (Supabase MCP): `compute_escalation_patterns()` returnt korrekt full-house (3 Patterns), no-patterns (leeres Array), unknown_critical isoliert

**Phase 35-α Backend complete. Frontend Tenant-Admin-Page (`/settings/tenant/risk-score`) folgt in `/frontend proj 35`. Danach `/qa proj 35` für 35-α.**

### Phase 35-β
_Not yet started._

### Phase 35-γ
_Not yet started._

## QA Test Results

### Phase 35-α (Backend Slice)

**Date:** 2026-05-02
**Phase:** 35-α (Compute-Bibliothek + Migration + Tenant-Config-API + Audit-Trigger + ADRs)
**Verdict:** **Approved** — 0 Critical / 0 High / 1 Medium (FIXED post-QA) / 1 Low / 2 Doc-Drift

### Automated Test Suite

| Layer | Result |
|---|---|
| TypeScript strict (`npx tsc --noEmit`) | ✅ exit 0 |
| ESLint (`npm run lint`) | ✅ exit 0 |
| Vitest (`npm test --run`) | ✅ **685/685** (+54 new cases vom risk-score-Lib) |
| Production Build (`npm run build`) | ✅ green; `/api/tenants/[id]/settings/risk-score` im Manifest |
| Supabase Advisors | ✅ **0 neue PROJ-35-α-class warnings** (alle gemeldeten WARN sind pre-existing oder nicht-Migration-bezogen) |

### Live DB Red-Team — 9 Tests, alle pass

| Test | Expected | Actual | Result |
|---|---|---|---|
| 1. Baseline-State des Test-Stakeholders | leeres `current_escalation_patterns`-Array | `[]` | ✅ Pass |
| 2. Activate `blocker_decider` via stakeholders UPDATE | Snapshot enthält `blocker_decider`; 1 Audit-Event mit `actor_kind=system, action=activated` | exact match | ✅ Pass |
| 3. Add `amplified_conflict` (zweiter Pattern) | NEW Audit-Event nur für neu aktiviertes Pattern (kein Re-Fire des bestehenden) | exakt 1 NEW Event für `amplified_conflict` | ✅ Pass |
| 4. Deactivate `blocker_decider` durch attitude-Wechsel | Snapshot reduziert; Audit-Event mit `action=deactivated` | exact match | ✅ Pass |
| 5. No-op-UPDATE + same-value-UPDATE | Trigger fired aber kein Event geschrieben (Idempotenz) | total_events unverändert bei 3 | ✅ Pass |
| 6. Cross-Table-Trigger-Fan-Out | personality_profile-UPDATE fires Trigger und joinst korrekt mit stakeholders | `dark_profile` korrekt zur Snapshot-Liste hinzugefügt | ✅ Pass |
| 7. TS↔SQL-Parität für `compute_escalation_patterns()` | gleiche Patterns wie TS-Implementation für 3 Fixtures | exakt match: full-house mit attitude=null, full-house mit blocking, isoliertes unknown_critical | ✅ Pass |
| 8. JSONB-Override-Persistenz | Override-Struktur persistiert + retrievable | exact match | ✅ Pass |
| 9. Cleanup auf Baseline | Stakeholder reset, Override geleert, Snapshot zurück auf `[]` | exact match | ✅ Pass |

### Live Security Audit — 7 Vectors

| Vector | Mitigation | Live-Verified |
|---|---|---|
| **Sec-1** search_path-Hardening | Beide Functions mit `set search_path = 'public', 'pg_temp'` | ✅ proconfig zeigt `search_path=public, pg_temp` |
| **Sec-2** SECURITY DEFINER (avoid) | Beide Functions sind nicht-DEFINER (regulär, INVOKER) | ✅ `prosecdef=false` |
| **Sec-3** Invalid event_type injection | CHECK-Constraint blockt `evil_event_type` | ✅ `ERROR 23514` |
| **Sec-4** actor_kind=system mit non-NULL user_id | actor_consistency CHECK blockt | ✅ `ERROR 23514` |
| **Sec-5** Audit-Tampering via DELETE | Append-only-Trigger blockt auch service_role | ✅ `ERROR 23514: append-only` |
| **Sec-6** RLS auf tenant_settings | SELECT=member, UPDATE=admin (Defense-in-Depth) | ✅ 2 Policies live verifiziert |
| **Sec-7** Cross-Module-Replay | Audit-Event mit ungültigem `event_type` aus PROJ-33 wird zurückgewiesen | ✅ CHECK ist explizit erlaubt-Liste |

### AC-Walkthrough — Phase 35-α-Scope (Backend-only)

| AC | Status | Note |
|---|---|---|
| **B1.1** Defaults als TS-Konstanten + ADR | ✅ Pass | `RISK_SCORE_DEFAULTS` mit `Object.freeze`; ADR `risk-score-defaults.md` |
| **B1.2** `tenant_settings.risk_score_overrides` JSONB-Spalte | ✅ Pass | Live verified (column_default `'{}'::jsonb`) |
| **B1.3** Zod-Schema-Validierung | ✅ Pass | `riskScoreOverridesSchema` mit min(0)/max(10) per numeric guard |
| **B1.4** Resolver pure-TS, kein DB-Call in Hot-Path | ✅ Pass mit Naming-Drift | Heißt `mergeRiskScoreConfig(overrides)` statt Spec-Name `resolveRiskScoreConfig(tenantId)`. Funktional identisch — siehe Doc-Drift-1 |
| **B1.5** Tenant-Admin-UI | ⏸ SKIPPED | Frontend, in `/frontend proj 35` |
| **B1.6** RBAC: GET=alle Member, PUT/DELETE=admin | 🟡 Bug-1 (Medium) | Aktuelle Route hat GET=admin-only. RLS ist korrekt (member kann SELECT) — Fix in /frontend oder API-Route-Tweak nötig |
| **B1.7** Override-Audit via PROJ-10 audit_log_entries | ✅ Pass | tenant_settings ist im audit-tracked-set (PROJ-17, deployed) |
| **B2.1** Pro Big5-Dim: delta=self-fremd | ✅ Pass | `computeBig5Gap` in perception-gap.ts |
| **B2.2** Pro Skill-Dim: delta=self-fremd | ✅ Pass | `computeSkillGap` in perception-gap.ts |
| **B2.3** Aggregat (architectural-overridden) | ✅ Pass | Tech-Design ändert das auf 2 separate Aggregate (CIA-Fork-3). Spec-AC ist veraltet — siehe Doc-Drift-2 |
| **B2.4** Flag bei `\|delta\| ≥ 30`, sortiert DESC | ✅ Pass | `FLAG_DELTA_THRESHOLD=30`, sort by `Math.abs(delta)` |
| **B2.5** Keine Self-Werte → Hinweis + CTA | ⏸ SKIPPED | Frontend |
| **B2.6** Risk-Score nutzt nur Fremd-Werte | ✅ Pass | `computeRiskScore` liest `agreeableness_fremd` only |
| **B3.1** Pattern-Detector pure-TS | ✅ Pass mit API-Shape-Drift | Returnt `EscalationPatternKey[]` statt `{key,severity,message}[]`. Meta liegt in separatem `ESCALATION_PATTERN_META` lookup — siehe Bug-2 (Low) |
| **B3.2** UI-Banner Alert-Variants | ⏸ SKIPPED | Frontend |
| **B3.3** Audit-Event bei Pattern-Activation/Deactivation | ✅ Pass | DB-Trigger live verified (Tests 2, 3, 4) |
| **B3.4** Tenant-Admins können Patterns nicht überschreiben | ✅ Pass | Patterns hardcoded in TS + PG, keine API zur Override |
| **B4.1** 32-Einträge-Lookup mit binärem Threshold | ✅ Pass | `BIG5_TONALITY_TABLE` hat exact 32 entries (Vitest-Coverage) |
| **B4.2** Pro Eintrag {tone,detail_depth,channel_preference,notes[]} mit ≥3 Notes | ✅ Pass | Vitest-Test "each entry has ... (≥3)" |
| **B4.3** `resolveTonality()` mit Fallback bei null | ✅ Pass | `TONALITY_FALLBACK` mit "unvollständig"-Hinweis |
| **B4.4** preferred_channel-Override | ✅ Pass | `applyOverrides` in big5-tonality-table.ts |
| **B4.5** UI-Card Output | ⏸ SKIPPED | Frontend |
| **B4.6** Vitest-Coverage alle 32 Einträge | ✅ Pass | "contains exactly 32 entries (2^5 quadrants)" + per-entry-shape-Coverage |
| **B4.7** ADR mit psychologischer Begründung | ✅ Pass | `docs/decisions/big5-tonality-lookup.md` |

### Bugs Found

#### Bug-1 — Medium — B1.6 RBAC-Inkonsistenz — **FIXED**
**Severity:** Medium (workaround vorhanden via DB-RLS)
**Steps to Reproduce:** GET `/api/tenants/[id]/settings/risk-score` als nicht-Admin Tenant-Member.
**Expected:** 200 OK mit aktueller Override-Config (für Tooltip "Warum dieser Score?").
**Actual (vor Fix):** 403 Forbidden — Route nutzte `requireTenantAdmin` auf GET.
**Fix Applied (2026-05-02, post-QA):**
- Neuer Helper `requireTenantMember()` in `src/app/api/_lib/route-helpers.ts` (mirrors `requireTenantAdmin`, accepts any role).
- GET-Handler in `src/app/api/tenants/[id]/settings/risk-score/route.ts` auf `requireTenantMember` umgestellt; PUT + DELETE bleiben Admin-only.
- Re-verified: tsc clean · lint clean · vitest 685/685 grün.

#### Bug-2 — Low — B3.1 API-Shape-Drift
**Severity:** Low (UI muss zusätzliches Lookup machen, kein Funktionsverlust)
**Discovered:** Code-Review.
**Spec sagt:** `detectEscalationPatterns()` returnt `Array von { pattern_key, severity, message }`.
**Implementation:** Returnt `EscalationPatternKey[]`. Severity/Label/Recommendation kommen via separatem `ESCALATION_PATTERN_META[key]`-Lookup.
**Impact:** UI-Code in 35-β muss `result.map(k => ({ key: k, ...ESCALATION_PATTERN_META[k] }))` mappen.
**Fix-Empfehlung:** Entweder (a) Detector-Funktion API erweitern um direkt-resolved Objects, oder (b) Spec-AC anpassen + Doc als "korrekt by-design" markieren. Beide Optionen ~5 Min.

#### Doc-Drift-1 — Trivial — B1.4 Naming
**Severity:** Trivial (kosmetisch, kein Functional-Bug)
**Discovered:** AC-Walkthrough.
Spec sagt `resolveRiskScoreConfig(tenantId)`, Implementation heißt `mergeRiskScoreConfig(overrides)`. Implementation-Name ist sauberer (Tenant-Lookup ist Aufrufer-Verantwortung). Spec-Update genügt.

#### Doc-Drift-2 — Trivial — B2.3 Aggregat-Strategie
**Severity:** Trivial (Spec wurde durch Tech-Design überschrieben, AC nicht synchronisiert)
**Discovered:** AC-Walkthrough.
Spec-AC sagt "max(\|delta\|) über alle 10 Dimensionen". CIA-Fork-3-Lock im Tech-Design ändert das auf 2 separate Aggregate (Skill + Big5) mit 60%-Coverage-Threshold. Implementation folgt Tech-Design (richtig). Spec-AC sollte synchronisiert werden.

### Regression Check

- ✅ Vitest **685/685** unverändert grün; kein PROJ-1..PROJ-33 Regress
- ✅ Existing PROJ-33-γ Audit-Trigger funktioniert weiterhin (skill_profile-/personality_profile-UPDATE schreibt fremd_updated/self_updated Events neben den neuen escalation_pattern_changed)
- ✅ Bestehende `actor_kind=user|stakeholder` Audit-Events bleiben gültig (3-Wege-OR im neuen actor_consistency-CHECK)
- ✅ `stakeholder_profile_audit_events.profile_kind` jetzt `skill|personality|escalation` — bestehende Rows mit skill/personality unangetastet
- ✅ Production Build green; neue Route im Manifest

### Production-Ready Decision

**Recommendation:** **APPROVED for `/deploy proj 35` (Phase 35-α — Backend only)**

- 0 Critical / 0 High Bugs.
- 1 Medium (RBAC) hat eindeutigen Workaround via DB-RLS und betrifft nur 35-β UI-Use-Case (Tooltip-Read als Member).
- 1 Low + 2 Trivial sind UI-Plan-Hinweise für 35-β oder Doc-Updates.
- Migration replayed + verifiziert (live applied via MCP, 11 Schema-Änderungen, 4 Triggers, 2 Functions).
- 9 Live-DB-Red-Team-Tests grün — inkl. Trigger-Idempotenz, Cross-Table-Fan-Out, TS↔SQL-Parität, Cleanup-Verhalten.
- 7 Security-Vectors abgedeckt + dokumentiert; alle CHECK-Constraints + RLS + search_path-Hardening live verifiziert.

**Suggested Fix-Order vor /deploy:**
- Optional: Bug-1 als Quick-Fix in API-Route (5 Min, GET → `requireTenantMember`) → eliminiert UI-Workaround in 35-β.
- Optional: Bug-2 als API-Refactor in escalation-patterns.ts (5 Min, return Object-Array) → cleaner UI-Konsumierung in 35-β.
- Optional: Doc-Drifts in Spec syncen.

Falls Bugs deferred: Production-ready für 35-α-Backend-only-Auslieferung. UI-Slice (35-β) muss die Open-Items adressieren.

### Suggested Next

1. **`/deploy proj 35`** — Phase 35-α Backend (Migration ist bereits live via MCP; Code-Push + Tag `v1.35.0-PROJ-35-alpha`).
2. **`/frontend proj 35`** — Tenant-Admin-Page `/settings/tenant/risk-score` (Form + Live-Preview-Pane für Multiplikator-Konfiguration). Adressiert Bug-1 + Bug-2 als pragmatischen Fix während des Builds.
3. **Phase 35-β** — `phases.is_critical`-Migration + Stakeholder-Detail-UI (Risk-Banner · Pattern-Banner · Tonalitäts-Card · Wahrnehmungslücke-Section).

## Deployment

### Phase 35-α — Backend (2026-05-02)

- **Migration:** `20260502230000_proj35a_risk_score_engine.sql` live applied via Supabase MCP. Schema verified: `tenant_settings.risk_score_overrides` JSONB-Spalte, `stakeholders.current_escalation_patterns` text[]-Spalte, 4 Triggers, 2 Functions, 4 erweiterte CHECK-Constraints.
- **Code-Push:** Commit `a839c10` (Phase 35-α Backend + QA + Bug-1-Fix) gepusht zu `origin/main`. Vercel Auto-Deploy triggered.
- **Tag:** `v1.35.0-PROJ-35-alpha` erstellt + gepusht.
- **Production URL:** `https://projektplattform-v3.vercel.app`.
- **Neue Route im Manifest:**
  - `GET/PUT/DELETE /api/tenants/[id]/settings/risk-score` (Tenant-Admin-Config; GET = Member-Read, PUT/DELETE = Admin-Only)
- **Was deployed wurde (Backend-Slice):**
  - Compute-Bibliothek `src/lib/risk-score/` (6 Module + 5 Test-Files, 54 Cases)
  - Tenant-Override-API mit RBAC + Zod-Validation
  - PG-Trigger-getriebene Pattern-Audit-Pipeline (4 Triggers)
  - 2 ADRs + 1 Architecture-Doc
- **Was NICHT deployed wurde:**
  - Tenant-Admin-Page UI (`/settings/tenant/risk-score`) — folgt in `/frontend proj 35`
  - Stakeholder-Detail-Banner + Pattern-Banner + Tonalitäts-Card — Phase 35-β
  - Health-Dashboard + Sparkline — Phase 35-γ
- **Deployment-Verification (User-Action empfohlen nach Vercel-Build-Done):**
  - Backend-only smoke: `curl https://projektplattform-v3.vercel.app/api/tenants/[your-tenant-id]/settings/risk-score` mit Auth → erwartet 200 mit `{ defaults, overrides, effective }`-JSON
  - Live DB Red-Team in Production: Trigger-Aktivierung via Stakeholder-UPDATE testen → Audit-Event mit `actor_kind=system` sollte erscheinen
  - Browser-Test sinnvoll erst nach `/frontend proj 35` (UI-Slice).

### Phase 35-α Frontend
_Pending — kommt in `/frontend proj 35` (Tenant-Admin-Page mit Live-Preview)._

### Phase 35-β
_Not yet started._

### Phase 35-γ
_Not yet started._
