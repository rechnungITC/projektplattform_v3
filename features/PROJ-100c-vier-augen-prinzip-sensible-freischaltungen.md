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
- [ ] **AC-100c-2:** Ist es aktiviert, ist die **Auslöse-Schwelle** konfigurierbar — MVP: „ab `strict`" (jede Freischaltung, die `strict` vergibt) ODER „ab `confidential`". Freischaltungen unterhalb der Schwelle laufen weiterhin direkt (kein Gate).

### Antrag & Genehmigung (State-Machine)
- [ ] **AC-100c-3:** Vergibt ein berechtigter Verwalter (tenant-admin/project-lead) eine Freischaltung **auf/oberhalb der Schwelle**, wird statt einer sofortigen Freischaltung eine **Freischaltungs-Anfrage** im Zustand `pending` erzeugt; der Zugriff ist **noch nicht** wirksam (`can_access_classified` lässt den Nutzer NICHT durch, solange die Anfrage nicht genehmigt ist).
- [ ] **AC-100c-4:** Eine Anfrage trägt mindestens: Projekt, Ziel-Nutzer, beantragte Stufe (+ ggf. angewandtes Profil), Antragsteller, Begründung/Notiz, Status (`pending`/`approved`/`rejected`/`cancelled`), Zeitstempel.
- [ ] **AC-100c-5:** **Separation of Duty:** Der Antragsteller kann seine eigene Anfrage **nicht** selbst genehmigen. Mindestens **eine** zweite, distinct berechtigte Person muss zustimmen (Quorum = 2 Personen insgesamt, M-von-N konfigurierbar analog PROJ-31; MVP-Default: 1 zusätzlicher Approver).
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

## Open Questions
- **Auslöse-Modell:** Reicht die Stufen-Schwelle (`≥ strict`) als alleiniger Trigger, oder braucht der Pilot zusätzlich eine **per-Objekt-„sensibel"-Markierung** (z. B. einzelne DD-Findings/Reports unabhängig von der Objektstufe)? (MVP-Vorschlag: nur Stufen-Schwelle; Per-Objekt → Folge-Slice.)
- **Quorum-Größe:** Default „1 zusätzlicher Approver" (4-Augen i. e. S.) — soll M-von-N (z. B. 2-von-3 für `strict`) pro Tenant/Stufe konfigurierbar sein, oder genügt fix „+1" im MVP?
- **Approver-Kreis:** Jeder tenant-admin/project-lead ≠ Antragsteller, ODER eine explizit benannte Approver-Liste pro Projekt/Tenant (analog PROJ-31 `approver_stakeholder_ids`)? (CIA-Frage: Reuse vs. eigene Kandidatenauflösung.)
- **Wirksamkeits-Semantik bei `pending`:** Anfrage erzeugt **gar keine** Clearance bis Genehmigung (bevorzugt, einfachstes Tor-Verhalten) — bestätigen vs. „pending-Clearance mit Effektiv-Flag".
- **Verhältnis zu PROJ-110** (M&A Stage-Gate-Workflow): Soll 100c seine State-Machine mit dem generischen Stage-Gate aus PROJ-110 teilen, oder bewusst getrennt bleiben (Vertraulichkeits-Freischaltung ≠ Phasen-Gate)?

## Technical Requirements
- **Security:** Anfrage/Genehmigung tenant-admin/project-lead-gated; SoD (Antragsteller ≠ Approver) hart erzwungen; alle 100a/100b-Invarianten (Tenant-Isolation, Self-Grant-Block, Class-3-Orthogonalität, Tor = einzige Sichtbarkeitslogik) bleiben in Kraft. Wirksamwerden NUR über den bestehenden `grant_confidentiality_clearance`-Pfad.
- **Audit:** Wiederverwendung PROJ-10 + PROJ-31-Approval-Audit (append-only) — keine Parallel-Audit-Struktur.
- **Reuse:** PROJ-31-Quorum/Magic-Link/`record_approval_response`-Muster soweit möglich; keine zweite Approval-Engine.
- **Regression-Pflicht:** `tests/sql/PROJ-100a-need-to-know-pentest.sql` + `tests/sql/PROJ-100b-clearance-profiles-pentest.sql` müssen nach 100c **unverändert grün** bleiben; bei deaktiviertem 4-Augen ist der grant-/apply-profile-Pfad byte-identisch zu heute.
- **Migration-Hygiene:** PROJ-134-Konvention; Pflicht-Live-RPC-Smoke für neue/erweiterte RPCs (Antrag → 2. Stimme → Wirksamwerden; Reject → keine Clearance; SoD-Block).
- **CIA:** Pflicht-Review bei `/architecture` (eigene Genehmigungs-State-Machine + Verzahnung mit PROJ-31/100a/b; Auslöse-Modell + Quorum + Approver-Kreis sind Architektur-Forks).

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture (CIA-Pflicht-Review)_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
