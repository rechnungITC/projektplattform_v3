# PROJ-100c: 4-Augen-Prinzip für besonders sensible Vertraulichkeits-Freischaltungen

## Status: Planned
**Created:** 2026-06-24
**Last Updated:** 2026-06-24
**Origin:** AC5 aus [PROJ-100](PROJ-100-berechtigungskonzept-nach-need-to-know-umsetzen.md); aus [PROJ-100b](PROJ-100b-berechtigungsprofile-und-sichtbarkeit.md) ausgegliedert (eigene Genehmigungs-State-Machine, CIA-schwer).

> **V3 Core Reuse:** Klasse **EXTEND** — kombiniert die deployte **Need-to-know-Foundation** (PROJ-100a/b: `ma_confidentiality_clearances`, `grant_confidentiality_clearance`, `apply_clearance_profile`, `can_access_classified`-Tor) mit dem deployten **Approval-Pattern** (PROJ-31: paralleles M-von-N-Quorum, Magic-Link für externe Approver, `record_approval_response`, append-only Audit). **KEINE neue Approval-Engine und KEIN zweites Vertraulichkeits-Tor** — 100c schiebt nur einen Genehmigungs-Gate *vor* den bestehenden grant-Pfad. ADR-Bindung: [ma-domain-architecture.md](../docs/decisions/ma-domain-architecture.md) Fork 2 (Need-to-know = additiver RLS-Sublayer) bleibt unverändert.

## Dependencies
- **Requires:** PROJ-100a (Vertraulichkeits-Tor + `ma_confidentiality_clearances` + `grant_/revoke_confidentiality_clearance`-RPCs) — die genehmigte Freischaltung wird am Ende über den **bestehenden** grant-Pfad wirksam.
- **Requires:** PROJ-100b (Berechtigungsprofile + `apply_clearance_profile`) — eine Profil-Anwendung, die eine sensible Stufe vergibt, muss denselben 4-Augen-Gate durchlaufen wie eine direkte Freischaltung.
- **Requires:** PROJ-31 (Approval-Gates für Decisions) — Quorum-Mechanik, Magic-Link-Token für externe Approver, `record_approval_response`, append-only Approval-Audit als wiederverwendbares Muster.
- **Requires:** PROJ-10 (Audit-Trail) — jede Anfrage, Stimme, Genehmigung/Ablehnung und das finale Wirksamwerden ist nachvollziehbar.
- **Requires:** PROJ-1 (Tenant/Rollen-RBAC) — Anfrage und Genehmigung sind tenant-admin/project-lead-gated; Externe nur via Magic-Link.

## User Stories
- Als **IT-Sicherheitsverantwortlicher** möchte ich, dass eine Freischaltung auf eine besonders sensible Vertraulichkeitsstufe (z. B. `strict` / Inner Circle) **erst nach Bestätigung durch eine zweite berechtigte Person** wirksam wird, damit keine einzelne Person allein Inner-Circle-Zugriff vergeben kann (Separation of Duty).
- Als **Tenant-Admin** möchte ich das 4-Augen-Prinzip pro Mandant **ein- oder ausschalten** und festlegen, **ab welcher Stufe** es greift, damit die Governance zu meinem Risikoappetit passt (das Prinzip ist optional, nicht erzwungen).
- Als **Deal Lead / PMO-Lead** möchte ich eine sensible Freischaltung **beantragen** und sehen, dass sie „wartet auf Genehmigung" ist, damit transparent ist, dass der Zugriff noch nicht aktiv ist.
- Als **zweiter Approver** möchte ich offene Freischaltungs-Anfragen sehen, ihren Kontext (wer, für wen, welche Stufe, welches Projekt, Begründung) prüfen und **genehmigen oder ablehnen**, damit ich meine Mitverantwortung wahrnehmen kann.
- Als **Auditor / IT-Sicherheit** möchte ich für jede sensible Freischaltung den vollständigen Genehmigungsverlauf (Antrag, Stimmen, Ergebnis, Wirksamwerden) **lückenlos nachvollziehen** können.

## Acceptance Criteria

### Konfiguration (optional, tenant-gesteuert)
- [ ] **AC-100c-1:** Das 4-Augen-Prinzip ist eine **tenant-weite, standardmäßig deaktivierte** Einstellung. Ist es deaktiviert, verhält sich der grant-/apply-profile-Pfad **exakt wie heute** (PROJ-100a/b unverändert — keine Verhaltensänderung, kein Regressionsrisiko).
- [ ] **AC-100c-2:** Ist es aktiviert, ist die **Auslöse-Schwelle tenant-konfigurierbar** (Default `≥ strict`; wählbar auch `≥ confidential`). Freischaltungen unterhalb der eingestellten Schwelle laufen weiterhin direkt (kein Gate). _(Requirements-Lock 2026-06-24: „einstellbar".)_

### Antrag & Genehmigung (State-Machine)
- [ ] **AC-100c-3:** Vergibt ein berechtigter Verwalter (tenant-admin/project-lead) eine Freischaltung **auf/oberhalb der Schwelle**, wird statt einer sofortigen Freischaltung eine **Freischaltungs-Anfrage** im Zustand `pending` erzeugt; der Zugriff ist **noch nicht** wirksam (`can_access_classified` lässt den Nutzer NICHT durch, solange die Anfrage nicht genehmigt ist).
- [ ] **AC-100c-4:** Eine Anfrage trägt mindestens: Projekt, Ziel-Nutzer, beantragte Stufe (+ ggf. angewandtes Profil), Antragsteller, Begründung/Notiz, Status (`pending`/`approved`/`rejected`/`cancelled`), Zeitstempel.
- [ ] **AC-100c-5:** **Separation of Duty:** Der Antragsteller kann seine eigene Anfrage **nicht** selbst genehmigen. Die **erforderliche Personenzahl ist pro Stufe konfigurierbar** (M-von-N, analog PROJ-31): Default **4-Augen = 1 zusätzlicher Approver** (2 Personen), optional **6-Augen = 2 zusätzliche Approver** (3 Personen) für die höchste Stufe. _(Requirements-Lock 2026-06-24: konfigurierbare Augenzahl/M-von-N pro Stufe.)_
- [ ] **AC-100c-5b:** Die genehmigungsberechtigten Approver werden aus einer **explizit benannten Approver-Liste** pro Projekt/Tenant aufgelöst (PROJ-31-`approver_stakeholder_ids`-Muster); externe Approver auf der Liste genehmigen via Magic-Link. _(Requirements-Lock 2026-06-24: benannte Liste, nicht „jeder Admin/Lead".)_
- [ ] **AC-100c-6:** Wird das Quorum erreicht (`approved`), wird die Freischaltung **über den bestehenden `grant_confidentiality_clearance`-Pfad** wirksam (kein Parallel-Insert an der RLS vorbei; Provenance „über 4-Augen-Anfrage" festgehalten). Erst dann lässt das Tor den Nutzer durch.
- [ ] **AC-100c-7:** Wird die Anfrage abgelehnt (`rejected`) oder abgebrochen (`cancelled`), entsteht **keine** Freischaltung; bestehende Freischaltungen des Nutzers bleiben unberührt.
- [ ] **AC-100c-8:** Externe Approver (Stakeholder ohne Plattform-Konto) können per **Magic-Link** (PROJ-31-Muster, zeitlich begrenzt, single-purpose) genehmigen/ablehnen, ohne vollen App-Zugang.

### Sicherheit & Audit
- [ ] **AC-100c-9:** Alle 100a-Invarianten bleiben in Kraft: strikte **Tenant-Isolation** (keine Cross-Tenant-Anfragen/-Genehmigungen), **Class-3-Orthogonalität** (4-Augen ändert nichts an der AI-/Privacy-Achse), das **Tor bleibt die einzige Sichtbarkeitslogik** (kein Zweit-Gate). `tests/sql/PROJ-100a-need-to-know-pentest.sql` + `PROJ-100b-clearance-profiles-pentest.sql` bleiben **unverändert grün**.
- [ ] **AC-100c-10:** Antrag, jede Stimme (Approve/Reject inkl. Approver-Identität), Ergebnis und das finale Wirksamwerden sind **append-only auditierbar** (PROJ-10 / PROJ-31-Approval-Audit). Keine Stimme ist nachträglich änderbar.
- [ ] **AC-100c-11:** Genehmigen/Ablehnen ist auf **berechtigte Approver** beschränkt (tenant-admin/project-lead bzw. explizit benannte Approver/Stakeholder); anon/nicht-autorisierte Aufrufer werden abgewiesen (fail-closed, defense-in-depth wie PROJ-100b-AC-10).

## Edge Cases
- **4-Augen deaktiviert während eine Anfrage `pending` ist:** offene Anfragen bleiben gültig und müssen normal abgeschlossen werden (kein stilles Wirksamwerden ohne Genehmigung); neue Freischaltungen laufen wieder direkt.
- **Antragsteller ist gleichzeitig der einzige verfügbare Approver:** Anfrage kann nicht genehmigt werden (SoD) → klare Meldung „zweiter Approver erforderlich"; Anfrage bleibt `pending` (kein Self-Approve-Bypass).
- **Doppelte Anfrage für denselben (Projekt, Nutzer, Stufe):** keine zweite `pending`-Anfrage; bestehende offene Anfrage wird referenziert (idempotent).
- **Ziel-Nutzer hat bereits eine ≥ beantragte Stufe:** Anfrage unnötig → entweder ablehnen/no-op (kein Downgrade, analog PROJ-100b-Downgrade-Schutz).
- **Profil-Anwendung (PROJ-100b) vergibt sensible Stufe:** muss denselben 4-Augen-Gate auslösen wie eine direkte Freischaltung (kein Umgehen über den Profil-Pfad).
- **Approver verliert Berechtigung / verlässt Tenant, bevor er abstimmt:** seine ausstehende Stimme zählt nicht; Quorum muss aus aktuell Berechtigten erreicht werden.
- **Magic-Link abgelaufen/bereits verwendet:** Genehmigung über den Link wird abgewiesen (PROJ-31-Token-Semantik).
- **Revoke einer bereits genehmigten/wirksamen Freischaltung:** läuft über den bestehenden `revoke`-Pfad (kein 4-Augen für Entzug im MVP — Entzug ist die sichere Richtung).

## Out of Scope
- **Genereller Stage-Gate-Zwang** für nicht-sensible Freischaltungen (unterhalb der Schwelle) — bewusst nicht.
- **4-Augen für `revoke`** (Entzug) — Entzug reduziert Zugriff, kein Genehmigungsbedarf im MVP.
- **Per-Objekt-Sensitivitäts-Policy** (einzelne Objekte als „immer 4-Augen" markieren, unabhängig von der Stufe) — Kandidat für einen Folge-Slice (siehe Open Questions); MVP triggert rein über die Stufen-Schwelle.
- **Eskalations-/Erinnerungs-Automatik** für überfällige Anfragen (Reminder-Cron) — späteres Polish.
- **Eigene IAM-/Login-Mechanik** — Authentifizierung über den bestehenden IdP; Externe nur via Magic-Link.
- Änderung des Stufenmodells (`standard`/`confidential`/`strict`) — bleibt PROJ-100a.

## Requirements-Locks (2026-06-24, User-bestätigt)
Diese vier Forks wurden vor `/architecture` entschieden:
1. **Auslöse-Modell → tenant-konfigurierbare Stufen-Schwelle** (Default `≥ strict`, wählbar `≥ confidential`). Per-Objekt-„sensibel"-Markierung bleibt **Out of Scope / Later**. (AC-100c-2)
2. **Quorum → konfigurierbare Personenzahl (M-von-N) pro Stufe**: Default 4-Augen (1 zusätzlicher Approver), optional 6-Augen (2 zusätzliche) für die höchste Stufe. (AC-100c-5)
3. **Approver-Kreis → explizit benannte Approver-Liste** pro Projekt/Tenant (PROJ-31-`approver_stakeholder_ids`-Muster), externe via Magic-Link. (AC-100c-5b)
4. **Pending-Semantik → keine Clearance bis Genehmigung** (Anfrage erzeugt gar keine Clearance-Zeile; Tor `can_access_classified` bleibt unverändert → kein Regressionsrisiko). (AC-100c-3/6)

## Open Questions (für /architecture + CIA)
- **Verhältnis zu PROJ-110** (M&A Stage-Gate-Workflow): Soll 100c seine Genehmigungs-State-Machine mit dem generischen Stage-Gate aus PROJ-110 teilen, oder bewusst getrennt bleiben (Vertraulichkeits-Freischaltung ≠ Phasen-Gate)? _(CIA-Frage; Vorschlag: getrennt — eigene Semantik, aber PROJ-31-Primitive teilen.)_
- **Approver-Listen-Verwaltung:** Wo wird die benannte Approver-Liste gepflegt (pro Projekt vs. tenant-weit; eigene Tabelle vs. Reuse einer bestehenden Stakeholder-/Member-Struktur)? _(CIA-Frage bei /architecture.)_
- **Per-Stufe-Konfiguration (Schwelle + Quorum + Liste):** Datenmodell der Tenant-/Stufen-Konfiguration (eine Policy-Zeile pro Stufe?) — Detail für /architecture.

## Technical Requirements
- **Security:** Anfrage/Genehmigung tenant-admin/project-lead-gated; SoD (Antragsteller ≠ Approver) hart erzwungen; alle 100a/100b-Invarianten (Tenant-Isolation, Self-Grant-Block, Class-3-Orthogonalität, Tor = einzige Sichtbarkeitslogik) bleiben in Kraft. Wirksamwerden NUR über den bestehenden `grant_confidentiality_clearance`-Pfad.
- **Audit:** Wiederverwendung PROJ-10 + PROJ-31-Approval-Audit (append-only) — keine Parallel-Audit-Struktur.
- **Reuse:** PROJ-31-Quorum/Magic-Link/`record_approval_response`-Muster soweit möglich; keine zweite Approval-Engine.
- **Regression-Pflicht:** `tests/sql/PROJ-100a-need-to-know-pentest.sql` + `tests/sql/PROJ-100b-clearance-profiles-pentest.sql` müssen nach 100c **unverändert grün** bleiben; bei deaktiviertem 4-Augen ist der grant-/apply-profile-Pfad byte-identisch zu heute.
- **Migration-Hygiene:** PROJ-134-Konvention; Pflicht-Live-RPC-Smoke für neue/erweiterte RPCs (Antrag → 2. Stimme → Wirksamwerden; Reject → keine Clearance; SoD-Block).
- **CIA:** Pflicht-Review bei `/architecture` (eigene Genehmigungs-State-Machine + Verzahnung mit PROJ-31/100a/b; Auslöse-Modell + Quorum + Approver-Kreis sind Architektur-Forks).

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect) — 2026-06-24 (CIA-reviewed)

> **CIA-Pflicht-Review erfolgt** (eigene Genehmigungs-State-Machine, security-relevant, Verzahnung PROJ-31 + PROJ-100a/b). Verdikt: **Fork B**. Reuse-Klasse **EXTEND** auf PROJ-100a/b-Foundation + **Primitiven-Sharing** mit PROJ-31. Keine Code-/SQL-Snippets.

### 0. Worum es geht (ein Absatz)
PROJ-100c schiebt einen **optionalen, tenant-aktivierten Genehmigungs-Gate VOR** den bereits deployten Freischaltungs-Pfad. Vergibt jemand eine Freischaltung auf/oberhalb der konfigurierten Schwelle, entsteht zunächst **keine** Freischaltung, sondern eine **Genehmigungs-Anfrage**; die Freischaltung wird erst wirksam, wenn die konfigurierte Anzahl zweiter Personen zugestimmt hat. Ist der Gate (pro Mandant) nicht aktiviert, verhält sich alles **exakt wie heute**.

### 1. Architektur-Grundsatzentscheidung (CIA-gelockt): **Fork B**
- **Fork A (verworfen):** die deployte PROJ-31-Approval-Engine (`decision_*`-Tabellen + `record_approval_response`) polymorph machen. **Abgelehnt** — hoher Blast-Radius auf drei live, pentest-/audit-kritische, an `decisions` FK-gebundene Tabellen; das Subjekt divergiert fachlich (Decision-Quorum vs. schwellen-getriggerte Clearance mit SoD).
- **Fork B (gewählt):** **parallele, muster-spiegelnde** Genehmigungs-Tabellen für Clearance-Anfragen. „Keine zweite Engine" wird über **Primitiven-Sharing** erfüllt (Magic-Link-Token-Mechanik, Immutability-Trigger-Muster, Quorum-Zähllogik), **nicht** über Tabellen-Sharing. Isoliert, **null PROJ-31-Regressionsrisiko**.

### 2. Komponenten-Struktur
```
PROJ-100c 4-Augen-Gate
├── Backend
│   ├── Policy-Tabelle „Genehmigungs-Richtlinie" (pro Tenant × Stufe)        ← NEU
│   │     {aktiviert (default AUS), erforderliche Personenzahl, Approver-Bezug}
│   ├── Genehmigungs-Anfrage „sensible Freischaltung"                         ← NEU
│   │     (Projekt, Ziel-Nutzer, beantragte Stufe, Antragsteller, Status, Quorum)
│   ├── Approver-Zuordnung je Anfrage + append-only Ereignis-Log (immutable)  ← NEU (PROJ-31-Muster)
│   ├── Gate-Einbau am KOPF des bestehenden grant-Pfads                       ← ERWEITERUNG
│   │     (Policy aus? → unveränderter Pfad; Policy an & ≥ Schwelle? → Anfrage statt Freischaltung)
│   ├── System-Grant-Helper (definer-intern) bei Quorum-Erfüllung            ← NEU
│   │     (schreibt Freischaltung + Audit identisch zum Bestandspfad — NICHT über die öffentliche grant-RPC)
│   └── REUSE: grant_confidentiality_clearance, can_access_classified (UNVERÄNDERT), approval-token, PROJ-10-Audit
└── Frontend
    ├── Anfrage-Liste „Wartet auf Genehmigung" + Genehmigen/Ablehnen (manager-gated)   ← NEU
    ├── Magic-Link-Genehmigungsseite für externe Approver (PROJ-31-Muster)             ← REUSE/ERWEITERUNG
    ├── Policy-Verwaltung (Tenant-Admin): Gate an/aus, Schwelle, Personenzahl, Approver ← NEU
    └── REUSE: Projekt-Raum-Karte „Vertraulichkeit & Zugriff" (PROJ-100b) — Freischaltung zeigt „pending"-Zustand
```

### 3. Datenmodell in Klartext (keine neue Tor-Logik)
- **Genehmigungs-Richtlinie:** eine Zeile pro `(Tenant, Stufe)` mit `{aktiviert (Default AUS), erforderliche Personenzahl, Approver-Bezug}`. **Leere Tabelle ⇒ keine Policy ⇒ unveränderter Freischaltungs-Pfad** → Default-off ist **strukturell** garantiert (nicht nur konfiguratorisch).
- **Genehmigungs-Anfrage:** Tenant, Projekt, Ziel-Nutzer, beantragte Stufe (+ ggf. angewandtes Profil), Antragsteller, Status (`pending`/`approved`/`rejected`/`cancelled`), erforderliches Quorum, geplante Befristung.
- **Approver-Zuordnung + Ereignis-Log:** wer darf abstimmen; jede Stimme append-only + unveränderbar (gleiches Immutability-Muster wie PROJ-31).
- **Keine** Änderung an `ma_confidentiality_clearances` oder `can_access_classified` → die 100a/100b-Pentests bleiben byte-identisch grün.

### 4. Gate-Wiring (das Warum) — CIA-präzisiert
- Der Gate sitzt **am Kopf der bestehenden `grant_confidentiality_clearance`-RPC**, NACH der Autoritätsprüfung. `apply_clearance_profile` (PROJ-100b) delegiert in genau diese RPC → **erbt den Gate automatisch, keine Doppelverdrahtung** (das ist der einzige Schreibpfad auf Clearances).
- **Policy aus/fehlt → früher Rücksprung in den unveränderten Insert-Pfad** (kein neuer Code-Pfad berührt). **Policy an & beantragte Stufe ≥ Schwelle → Anfrage anlegen statt Freischaltung**; Rückgabe ohne Clearance.
- **Quorum erreicht →** eine dedizierte Antwort-RPC ruft den **System-Grant-Helper definer-intern** (NICHT die öffentliche grant-RPC), damit die Freischaltung auch dann entsteht, wenn der letzte Approver weder Admin noch Lead ist (vermeidet eine Re-Authority-Falle). Erst dann lässt das Tor den Nutzer durch.

### 5. Aufgelöste Open Questions (CIA)
- **Approver-Listen-Storage:** **tenant-weite Approver-Liste pro Stufe** (MVP) — Approver sind eine **Governance-Rolle**, kein Projekt-Stakeholder (Invariante #4 „Stakeholder ≠ User"); kein Reuse der Stakeholder-/Member-Tabellen als Approver-Quelle. Pro-Projekt-Override → Followup.
- **Verhältnis zu PROJ-110:** **getrennt halten**, nur PROJ-31-Primitive teilen (Token/Immutability/Quorum-Zählung). PROJ-110 ist eine Phasen-State-Machine (anderes Subjekt) — jetzt zu antizipieren wäre Über-Engineering.
- **Per-Stufe-Policy-Datenmodell:** eine Policy-Zeile pro `(Tenant, Stufe)` (s. §3).

### 6. Hardening-Akzeptanzkriterien (CIA-Pflicht, zusätzlich zu AC-100c-1..11)
- **AC-C1 (Regression):** Bei deaktivierter/fehlender Policy ist der grant-Pfad byte-identisch; `tests/sql/PROJ-100a-need-to-know-pentest.sql` + `PROJ-100b-clearance-profiles-pentest.sql` bleiben unverändert grün (Gate vor Approved).
- **AC-C2 (SoD):** `Antragsteller ≠ Approver` als CHECK **und** RPC-Guard; Pentest-Vektor „Selbst-Genehmigung → reject".
- **AC-C3 (Default-off):** Live-Smoke — frischer Tenant ohne Policy-Zeile → grant erzeugt sofort Clearance (kein pending).
- **AC-C4 (Tenant-Isolation):** Cross-Tenant-Anfrage-Sicht/-Genehmigung → 0 rows / reject (Pentest-Vektor).
- **AC-C5 (Class-3-Orthogonalität):** Gate triggert NUR auf `ma_confidentiality_level ≥ Schwelle`, nie auf `privacy_class`; Class-3-Block-Pfad unberührt.
- **AC-C6 (Immutability):** Ereignis-Log append-only; UPDATE/DELETE → reject (Trigger-Smoke).
- **AC-C7 (System-Grant-Pfad):** Quorum-Erfüllung erzeugt Clearance auch wenn finaler Approver weder Admin noch Lead ist.
- **AC-C8 (Pending = keine Clearance):** Während `pending` liefert `can_access_classified` für den Ziel-Nutzer `false`.
- **AC-C9 (Live-RPC-Smoke Pflicht):** Antwort-RPC + System-Grant gegen Prod mit Rollback-Marker, 0 Residue.

### 7. Dependencies (Pakete)
**Keine neuen npm-Pakete.** Reuse: PROJ-100a/b-Foundation, PROJ-31-Approval-Primitive (Token/Immutability/Quorum-Muster), PROJ-10-Audit, PROJ-1-RBAC.

### 8. Risiko + Trade-off (CIA)
| Risiko | Sev | Mitigation |
|---|---|---|
| Gate-Einbau ändert deployte grant-RPC → 100a/100b-Pentest-Regression | Hoch | AC-C1: Policy-Absence = früher Return; Pentests als Pflicht-Regression-Gate |
| Quorum-Grant scheitert, wenn finaler Approver ≠ admin/lead | Mittel | AC-C7: System-Grant-Helper definer-intern (GUC-Bypass-Muster wie PROJ-70-β) |
| SoD-Lücke (Selbst-Genehmigung) | Hoch | AC-C2: CHECK + RPC-Guard + Pentest-Vektor |
| Class-3-Achse versehentlich gekoppelt | Mittel | AC-C5: Gate nur auf `ma_confidentiality_level` |
| Tenant-Isolation in neuen Tabellen | Hoch | `tenant_id NOT NULL` + RLS-Helper + Pentest-Vektor (AC-C4) |

### 9. PROJ-Y Followups (CIA, nicht-blockierend)
- **PROJ-Y-1:** Pro-Objekt-„sensibel"-Markierung (in 100c als „Later" gelockt).
- **PROJ-Y-2:** Pro-Projekt-Approver-Override (MVP = tenant-weit).
- **PROJ-Y-3:** Extraktion der geteilten Approval-Primitive (Token/Immutability/Quorum) in ein gemeinsames Modul — **nur falls PROJ-110 dieselben Bausteine braucht**, als Refactor mit CIA-Review, nicht spekulativ jetzt.

### Locked design decisions (für /backend + /frontend)
1. **Fork B** — parallele Tabellen, Primitiven-Sharing; PROJ-31-`decision_*` unangetastet.
2. **Gate am Kopf von `grant_confidentiality_clearance`**; `apply_clearance_profile` erbt automatisch; Policy-aus = byte-identisch.
3. **System-Grant-Helper definer-intern** bei Quorum-Erfüllung (nicht öffentliche grant-RPC).
4. **Policy pro (Tenant, Stufe)**, Default AUS (strukturell garantiert durch leere Tabelle).
5. **Tenant-weite Approver-Liste pro Stufe**; Governance-Rolle, kein Stakeholder-Reuse.
6. **Getrennt von PROJ-110**; nur Primitive teilen.
7. **9 Hardening-ACs (C1–C9)** + 100a/100b-Pentest-Regression sind Pflicht vor Approved.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
