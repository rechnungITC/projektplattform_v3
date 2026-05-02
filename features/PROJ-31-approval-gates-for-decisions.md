# PROJ-31: Approval-Gates für formale Decisions

## Status: Architected
**Created:** 2026-05-02
**Last Updated:** 2026-05-02

## Summary
Erweitert PROJ-20 (Decisions, deployed) um einen **parallelen Quorum-Approval-Workflow**. Welche Decisions Gate-pflichtig sind, ergibt sich aus dem PROJ-6 Methoden-/Phasen-Catalog (Wasserfall: Decisions in Spec/Abnahme-Phasen; Scrum: explizit als "Steering"-Decision markierte). Approver werden aus dem Stakeholder-Pool gezogen (PROJ-8) — auch **externe Stakeholder ohne Plattform-Account** können via signed Magic-Link approven. Append-only `decision_approval_events`-Tabelle persistiert jede State-Transition und Approver-Aktion.

PROJ-31 schließt die PRD-Erfolgsmetrik **"100% der formalen Decisions haben einen traceable Audit-Trail"** und liefert das erste konkrete Governance-Workflow-Pattern, das später auf Budget-Approvals (PROJ-22), Phasen-Abnahmen (PROJ-19) und Risiko-Akzeptanz (PROJ-20) übertragbar ist.

## Dependencies
- **Requires:**
  - **PROJ-20** (Decisions Catalog, deployed) — Erweitert die `decisions`-Tabelle um Approval-Felder + Workflow-State-Machine.
  - **PROJ-19** (Phases & Milestones, deployed) — Phase-Transition triggert Decisions in dieser Phase als pending.
  - **PROJ-6** (Project Types, Methods Catalog, Rule Engine, deployed) — Liefert Methoden-/Phasen-spezifische Gate-Regeln (`requires_approval`-Boolean pro Methode×Phase).
  - **PROJ-8** (Stakeholders, deployed) — Stakeholder-Pool ist Quelle für Approver. Erweitert um `is_approver`-Flag.
  - **PROJ-13** (Communication Center, deployed) — Email-Versand für Magic-Link-Approval-Mails an externe Approver.
  - **PROJ-1** (Auth, Tenants, RLS, deployed) — Multi-Tenant-Invariant + RLS-Helpers (`is_tenant_member`, `has_project_role`).
- **Influences:**
  - **PROJ-22** (Budget) — Budget-Approval-Gate kann das gleiche Pattern wiederverwenden (Bookings > X € pflicht-approval).
  - **PROJ-19** (Phases) — Phase-Abnahme als Approval-Workflow ist eine spätere Slice (PROJ-31b oder eigene Spec).
  - **PROJ-32** (Multi-Provider Tenant-Keys) — keine direkte Beziehung, aber die in PROJ-31 etablierte Magic-Link-Token-Pattern ist analog zur Provider-Key-Storage-Sicherheits-Schicht.

## V2 Reference Material
- **V2-ADR `decisions-immutability.md`** (in V3 unter `docs/decisions/`) — Decisions sind immutable, Revisionen via `supersedes_decision_id`. PROJ-31 respektiert das: eine Revision startet einen frischen Approval-Workflow; der alte Audit-Trail bleibt unverändert.
- **V2-Code `apps/api/src/decisions/approval.py`** (V2 hatte einen Single-Approver-Workflow) — als Negativ-Referenz (zu rigide); V3 setzt auf Quorum.
- **V2-Migration `0024_decision_approvals.sql`** — kann als Inspiration für die Tabellenstruktur dienen, muss aber für Multi-Tenancy + RLS umgeschrieben werden.

## User Stories

### US-1 — Projektmanager: Approver für Decision nominieren
**Als** Projektmanager
**möchte ich** eine Decision als "formal" markieren, N Approver aus dem Stakeholder-Pool nominieren und das erforderliche Quorum (M von N) festlegen
**damit** klare Governance-Verantwortung dokumentiert ist und das Quorum die Entscheidungs-Tiefe matcht (z.B. operativ M=1, strategisch M=3 von 5).

### US-2 — Methoden-/Phasen-getriebener Auto-Gate
**Als** Projektmanager (Wasserfall-Methode)
**möchte ich**, dass Decisions, die während der Spec-Abnahme-Phase erstellt werden, automatisch als gate-pflichtig markiert werden (per PROJ-6 Catalog-Regel)
**damit** ich kein "vergessenes" formales Approval bekomme und die Audit-Coverage 100% erreicht.

### US-3 — Interner Approver: Pending-Decisions im Dashboard
**Als** interner Stakeholder mit `is_approver=true`-Flag und Plattform-Account
**möchte ich** offene Approval-Anfragen in meinem persönlichen Dashboard sehen und mit einem Klick zustimmen oder ablehnen, optional mit Kommentar
**damit** ich nicht durch externe Email-Flows gehen muss.

### US-4 — Externer Approver: Magic-Link-Approval ohne Login
**Als** externer Stakeholder ohne Plattform-Account (z.B. Steering-Committee-Mitglied der Kundenfirma)
**möchte ich** einen signed Magic-Link per Email bekommen, der mich auf eine token-authentifizierte Approval-Seite führt
**damit** ich ohne Account-Setup zustimmen oder ablehnen kann.

### US-5 — Voller Audit-Trail pro Decision
**Als** Projektmanager (oder Auditor in einer ISO-9001-Prüfung)
**möchte ich** den vollständigen, immutable Audit-Trail jeder Decision sehen — wer wann mit welchem Kommentar wie entschieden hat
**damit** die PRD-Erfolgsmetrik "100% Audit bei formalen Decisions" verifiziert ist.

### US-6 — Decision-Revision löst frischen Workflow aus
**Als** Projektmanager
**möchte ich** eine bestehende Decision revidieren (via `supersedes_decision_id`), wodurch automatisch ein **frischer** Approval-Workflow für die neue Decision startet — der alte Audit der vorherigen Decision bleibt erhalten
**damit** die V2-Immutability-Invariante respektiert ist.

### US-7 — Pending-Decision zurückziehen
**Als** Projektmanager
**möchte ich** eine pending Decision zurückziehen können (Status: `withdrawn`), bevor das Quorum erreicht wird (z.B. Sachlage hat sich geändert, Decision ist gegenstandslos)
**damit** ich nicht "verbrannte" Decision-Hülsen im System habe und Approver entlastet sind.

## Acceptance Criteria

### Block 1: Datenmodell
- [ ] `decisions`-Tabelle erweitert um: `requires_approval: boolean` (default false), `approval_status: text` (`draft` | `pending` | `approved` | `rejected` | `withdrawn`), `quorum_required: int` (nullable, nur bei requires_approval=true).
- [ ] Neue Tabelle `decision_approvers (id, tenant_id, decision_id, stakeholder_id, magic_link_token, magic_link_expires_at, response: text|null (`approve` | `reject` | `null`), responded_at, comment)`.
- [ ] Neue Tabelle `decision_approval_events (id, tenant_id, decision_id, event_type: text (`created` | `submitted_for_approval` | `approver_responded` | `quorum_reached` | `quorum_unreachable` | `withdrawn` | `revised`), actor_user_id|null, actor_stakeholder_id|null, payload: jsonb, created_at)`.
- [ ] `stakeholders`-Tabelle erweitert um `is_approver: boolean` (default false).
- [ ] Alle neuen Tabellen tragen `tenant_id` + RLS-Policies via `is_tenant_member(tenant_id)`.
- [ ] Eine Migration legt das alles in einem Schritt an, mit Backfill: bestehende deployed Decisions behalten `requires_approval=false`, `approval_status=draft`.

### Block 2: Methoden-/Phasen-Gate-Logik (PROJ-6 Integration)
- [ ] PROJ-6 Catalog erweitert um `decision_approval_rules` pro Methode×Phase. Mindestens initial: Wasserfall × Spec-Phase = `requires_approval=true`. Scrum × * = `requires_approval=false` (manuell markierbar).
- [ ] Beim Anlegen einer Decision wird der Gate-Trigger berechnet: `requires_approval = catalog.lookup(method, phase) || user_explicit_flag`.
- [ ] UI zeigt im Decision-Form klar an, ob/warum eine Decision Gate-pflichtig ist (Tooltip mit Catalog-Quelle).

### Block 3: Approver-Nomination + Quorum
- [ ] Decision-Form zeigt bei `requires_approval=true` einen Approver-Selector (Multi-Select aus Stakeholder-Pool, gefiltert auf `is_approver=true`).
- [ ] PM setzt `quorum_required` (Integer, 1 ≤ M ≤ N).
- [ ] Submit-Button heisst "Zur Genehmigung einreichen" (statt "Decision speichern") wenn `requires_approval=true`. Setzt `approval_status='pending'` und triggert Magic-Link-Versand.
- [ ] Mindestens **ein** Approver muss nominiert sein.

### Block 4: Magic-Link für externe Approver
- [ ] Bei "Submit for Approval" wird pro Approver-Eintrag ein signed Token (HMAC-SHA256 mit Server-Secret, payload: `{decision_id, stakeholder_id, expires_at}`) generiert und in `decision_approvers.magic_link_token` persistiert.
- [ ] Magic-Link-Mail an alle Approver via PROJ-13 Communication-Center mit Subject "Genehmigungs-Anfrage: [Decision-Title]" und Link-URL `/approve/[token]`.
- [ ] Token-Lebensdauer: 7 Tage. Nach Ablauf: Approval-Page zeigt "Link abgelaufen" mit PM-Kontakt.
- [ ] Approval-Page (token-authentifiziert, **kein Plattform-Login nötig**) zeigt: Decision-Title, decision_text, rationale, "Zustimmen" + "Ablehnen" + Kommentar-Textarea.
- [ ] Klick auf "Zustimmen" oder "Ablehnen" persistiert in `decision_approvers.response` + `responded_at` + `comment` und appended Event in `decision_approval_events`.
- [ ] Idempotenz: ein Token kann mehrmals geklickt werden, aber nur die **erste** Antwort wird persistiert. Folgeklicks zeigen "Sie haben bereits geantwortet".
- [ ] PM kann Tokens manuell revoken (z.B. Stakeholder hat Job gewechselt) → revokierter Token zeigt "Approval zurückgezogen".

### Block 5: Quorum-Berechnung
- [ ] **approved-Trigger:** sobald `count(response='approve')` ≥ `quorum_required` → `decision.approval_status='approved'` + Event `quorum_reached`.
- [ ] **rejected-Trigger:** sobald `count(response='reject')` ≥ `(N - quorum_required + 1)` → Quorum unmöglich erreichbar → `decision.approval_status='rejected'` + Event `quorum_unreachable`.
- [ ] Approval-Status wird **nicht zurückgenommen**, wenn nach approved/rejected weitere Approver antworten — Audit-Trail dokumentiert die Antwort, Status bleibt eingefroren.
- [ ] Konkurrenz-Sicherheit: Multiple Approver klicken gleichzeitig → DB-Trigger oder Edge-Function-Lock berechnet Quorum konsistent (idealerweise via PostgreSQL `LOCK TABLE` oder advisory-lock pro Decision).

### Block 6: Internes Dashboard
- [ ] Neue Page `/dashboard/approvals` (oder Tab in `/dashboard`): listet alle pending Decisions, bei denen der eingeloggte User als Approver nominiert ist (über Stakeholder→User-Mapping in PROJ-8).
- [ ] Klick auf Eintrag → Decision-Detail mit Approve/Reject-Buttons (kein Magic-Link nötig, RLS-authorized).
- [ ] Empty-State wenn keine pending Approvals: "Keine offenen Genehmigungen — gut gemacht!"

### Block 7: Decision-Revision (Reapproval)
- [ ] Wenn eine Decision mit `supersedes_decision_id` erstellt wird, wird die **neue** Decision in den Approval-Workflow eingespeist (sofern `requires_approval=true` durch Gate-Logik berechnet).
- [ ] Der alte Decision-Audit bleibt erhalten und sichtbar; Event-Tabelle bekommt einen `revised`-Event mit Pointer auf den Nachfolger.
- [ ] UI zeigt im Decision-Detail beide Audit-Trails (alt + neu).

### Block 8: Withdraw
- [ ] Decision-Detail-Page zeigt bei `approval_status='pending'` einen "Decision zurückziehen"-Button (nur für created_by-User oder Project-Manager).
- [ ] Withdraw setzt `approval_status='withdrawn'`, schreibt Event, invalidates alle Magic-Link-Tokens.
- [ ] Approver, die noch nicht geantwortet haben, sehen beim Klick auf den Magic-Link: "Diese Decision wurde zurückgezogen — keine Aktion nötig".

### Block 9: Audit-Trail-UI
- [ ] Decision-Detail-Page hat Tab "Audit-Trail" mit Timeline aller Events: created → submitted → [approver-responses] → quorum_reached/unreachable.
- [ ] Jeder Event zeigt: Timestamp, Aktor (User oder Stakeholder), Aktion, Kommentar (falls vorhanden).
- [ ] Audit-Trail ist exportierbar als PDF (via PROJ-21 Output-Rendering Pattern) — wichtig für ISO-Audits.
- [ ] Audit-Trail ist nicht editierbar — keine PATCH-Routes.

### Block 10: RBAC + Multi-Tenant
- [ ] Approver-Pool-Auswahl ist tenant-scoped (kein Cross-Tenant-Leak von Stakeholder-Listen).
- [ ] Magic-Link-Tokens enthalten `tenant_id` und werden serverseitig gegen den Decision-Datensatz gegen-validiert.
- [ ] Approve/Reject-Routes prüfen: (a) Token-Signatur, (b) `tenant_id`-Match, (c) Token nicht abgelaufen, (d) Decision nicht withdrawn/approved/rejected.
- [ ] RLS-Policies stellen sicher: User können nur Approvals der eigenen Tenants sehen + bearbeiten.

## Edge Cases

### EC-1 — Approver verlässt Projekt während pending
Stakeholder wird gelöscht oder `is_approver=false` gesetzt, während eine Decision pending ist und er noch nicht geantwortet hat. **Verhalten:** sein `decision_approvers`-Eintrag wird als `response='withdrawn'` markiert (per Trigger), Event geschrieben, andere Approver bleiben unberührt; PM bekommt Notification "Approver X nicht mehr verfügbar — Quorum jetzt M von (N-1), evtl. unerreichbar".

### EC-2 — N=1, M=1 (de-facto Single-Approver)
Edge-Case: Quorum-Topology degeneriert zu Single-Approver. **Verhalten:** funktioniert ohne Sonderlogik. Eine Person, ein Klick, Decision approved/rejected. Kein zusätzlicher Code-Pfad nötig.

### EC-3 — Quorum bereits erreicht, aber weiterer Approver lehnt ab
N=5, M=3. Drei Approver stimmen zu → Decision approved. Vierter Approver lehnt ab. **Verhalten:** Decision bleibt approved. Event `approver_responded` wird trotzdem geschrieben (Audit-Trail vollständig), aber `approval_status` ändert sich nicht.

### EC-4 — Externer Approver klickt nach Token-Ablauf
Approver klickt Magic-Link nach 7 Tagen. **Verhalten:** Approval-Page zeigt "Token abgelaufen". PM kann auf Decision-Detail-Page einen "Token erneuern"-Button drücken, der einen frischen Token generiert und neue Mail versendet. Audit-Event `token_renewed`.

### EC-5 — PROJ-6-Catalog-Regel ändert sich rückwirkend
Tenant-Admin ändert die Catalog-Regel "Wasserfall × Spec = approval-required" zu "false". **Verhalten:** bestehende Decisions in `pending`-Status bleiben in pending (idempotent — keine retroaktive Status-Änderung). Nur **neu** angelegte Decisions folgen der neuen Regel. Wenn Audit-Compliance verletzt wird, ist das ein Tenant-Policy-Problem, kein technisches.

### EC-6 — Phase-Transition triggert pending Decisions massiv
PROJ-19 schaltet Phase auf `active` → laut Catalog-Regel werden alle `draft`-Decisions in dieser Phase potentiell approval-pflichtig. **Verhalten:** PROJ-31 macht **keinen Auto-Submit** — der PM muss die Decision manuell submit-en. Phase-Transition zeigt nur ein Hinweis-Banner: "5 Decisions in dieser Phase brauchen ggf. formelle Genehmigung". Pull-Mechanismus, kein Push.

### EC-7 — Race-Condition: zwei Approver klicken gleichzeitig
Zwei Approver klicken gleichzeitig "Zustimmen" — nach M=2 würde Quorum erreicht. **Verhalten:** Quorum-Berechnung läuft in einer DB-Transaktion mit advisory-lock pro Decision-ID. Beide Klicks werden sequentialisiert; der zweite triggert das `quorum_reached`-Event. Kein Doppel-Status-Wechsel.

### EC-8 — Approver klickt zweimal
Approver klickt "Zustimmen", dann unmittelbar nochmal. **Verhalten:** zweiter Klick ist No-Op (Idempotenz via `decision_approvers.response IS NOT NULL`-Check). UI zeigt "Sie haben bereits zugestimmt am DD.MM.YYYY".

### EC-9 — Decision wird revidiert, alter Workflow noch pending
Eine pending Decision wird via supersedes_decision_id revidiert, bevor der alte Workflow abgeschlossen ist. **Verhalten:** Alter Workflow wird automatisch `withdrawn` (Event `revised` zeigt auf Nachfolger), neuer Workflow startet frisch. Approver der alten Decision bekommen "Decision zurückgezogen — Nachfolger bereits eingereicht".

### EC-10 — Magic-Link wurde geleakt (Sicherheits-Edge)
Token landet in falschen Händen (Email-Forwarding etc.). **Verhalten:** Token ist signed (HMAC) und enthält stakeholder_id — er funktioniert nur für die spezifische Approver-Stakeholder-Kombination. PM kann via "Token revoken" sofort invalidieren. Audit-Event dokumentiert den Revoke-Grund.

## Out of Scope (PROJ-31b/c-Kandidaten)
- ❌ **Sequenzieller Multi-Step-Workflow** (Decision durchläuft PM → Steering → Sponsor in fester Reihenfolge) — Quorum-Pattern ist mächtiger und einfacher; sequentiell ist Sonderfall.
- ❌ **Eskalations-/SLA-Mechanik** (Approver hat 7 Tage, sonst auto-escalated) — separater Slice nach Pilot-Feedback.
- ❌ **KI-Coaching für Approval-Entscheidungen** (Class-3-Risk: KI bekommt Decision-Body inkl. Personenbezug) — bewusst aus PROJ-31 raus, eigene Privacy-Spec nötig.
- ❌ **Crypto-Signatur / Hash-Chain** der Audit-Events — DB-Felder reichen für ISO 9001 / DSGVO; Hash-Chain-Erweiterung als separate "PROJ-31-Signature"-Spec wenn Kunde mit BSI-Grundschutz-Anforderung kommt.
- ❌ **Bulk-Approval** (mehrere Decisions gleichzeitig in einem Klick) — UX-Bequemlichkeit, kein MVP-Feature.
- ❌ **Approval auf Budget-Bookings** (PROJ-22) — gleiches Pattern wiederverwendbar, aber andere Daten + andere Trigger-Logik. Eigener Slice (PROJ-31c oder Budget-Erweiterung).
- ❌ **Approval auf Phasen-Abnahme** (PROJ-19) — analog.
- ❌ **Email-Reply-to-Approve** (Approver antwortet per Email, System parst) — Tool-Komplexität (PROJ-13 Inbound-Mail-Parser nötig).

## Technical Requirements
- **Performance:** Approval-Page (Magic-Link) lädt in <500 ms (kritisch für externe Stakeholder-UX, kein Cold-Start tolerierbar).
- **Security:** Token-Signatur via HMAC-SHA256, Server-Secret in Vercel-Env-Var (`APPROVAL_TOKEN_SECRET`), 256-bit Mindestlänge. Tokens enthalten `tenant_id`-Claim + Server-side Cross-Check.
- **Privacy:** Decision-Texte können personenbezogene Daten enthalten (Class-2/3 nach PROJ-12 Registry). Magic-Link-Mails enthalten **keinen** Decision-Body, sondern nur Title + Link. Approval-Page rendert Body nur nach Token-Validierung.
- **Audit:** Append-only `decision_approval_events`-Tabelle ohne PATCH/DELETE-Routes. RLS verbietet Updates.
- **Multi-Tenant:** Alle neuen Tabellen tragen `tenant_id`, RLS via `is_tenant_member`.
- **Browser-Support:** Approval-Page muss auf alten Browsern (IE11 ist nicht relevant, aber alte Outlook-Webview) funktionieren — kein React-Heavy-Code, server-side-rendering bevorzugt.

## Success Verification (für /qa)
- [ ] Vitest-Coverage: Quorum-Berechnung (approved/rejected/edge-cases EC-3/EC-7), Magic-Link-Token-Signatur + Validierung, Idempotenz EC-8, Withdraw EC-9, Class-3-Schutz (Email enthält keinen Body).
- [ ] E2E-Test (Playwright + Auth-Fixture aus PROJ-29): voller Happy-Path Single-Approver, voller Happy-Path Quorum-3-von-5, Reject-via-Quorum-Unmöglichkeit.
- [ ] Manuelle Red-Team-Tests: Token-Forgery (HMAC-Bruch), Token-Replay, Cross-Tenant-Leak via gestolenem Token, Decision-Body-Leak in Email.
- [ ] PRD-Erfolgsmetrik-Verifikation: 100% der mit `requires_approval=true` markierten Decisions haben einen kompletten Audit-Trail.

---

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

> **CIA-validiert** vor Architecture-Design (Briefing in Section 6 unten).
> Alle 4 Locked Decisions aus /requirements bleiben — die Architektur löst sie ohne Stack-Erweiterung.

### 1. Big Picture in einem Satz

Decisions bleiben **unveränderbar** (V2-Invariante, durch DB-Trigger erzwungen). Approval-Status läuft **daneben** in einer eigenen 1:1-Tabelle. Externe Approver bekommen einen 7-Tage-gültigen Einmal-Pass per Email. Quorum-Berechnung ist eine atomare DB-Operation, kein App-Code.

### 2. UI-Komponenten (was der Nutzer sieht)

```
PROJ-31 Oberflächen
│
├── Decision-Form (erweitert — bestehende Component)
│   ├── "Formal" Indikator (auto-gesetzt durch PROJ-6-Regel oder manuell flagbar)
│   ├── Approver-Selector
│   │   ├── Multi-Select aus Stakeholder-Pool
│   │   ├── Filter: nur Stakeholders mit "Genehmigungs-Berechtigung"
│   │   └── Visuelle Trennung "Intern (Plattform-Account) / Extern (Magic-Link)"
│   ├── Quorum-Slider (1 von N bis N von N)
│   └── Submit-Button "Zur Genehmigung einreichen" (statt "Speichern")
│
├── Decision-Detail-Page (erweitert — bestehende Component)
│   ├── Approval-Status-Banner (oben: pending / approved / rejected / withdrawn)
│   ├── Approver-Liste (mit Status pro Person: pending / approved / rejected / withdrawn)
│   ├── Audit-Trail-Tab (neu — Timeline aller Events, immutable)
│   └── Withdraw-Button (nur sichtbar für Owner+PM, nur wenn Status = pending)
│
├── Magic-Link-Approval-Page  (NEU — public, token-authentifiziert, kein Login)
│   ├── Token-Validierung (Server-Side, vor Render)
│   ├── Decision-Body (Title, Decision-Text, Rationale)
│   ├── Approve-Button + optionale Kommentar-Textarea
│   ├── Reject-Button  + optionale Kommentar-Textarea
│   └── Confirmation-State (nach Klick: idempotent, zweiter Klick zeigt "bereits geantwortet")
│
└── Internes Approval-Dashboard  (NEU)
    ├── Liste pending Approvals für eingeloggten User
    │   (Stakeholder.linked_user_id = auth.uid())
    ├── Click-Through zur Decision-Detail-Page
    └── Empty-State "Keine offenen Genehmigungen"
```

### 3. Datenmodell (Klartext, keine SQL)

**Bleibt unverändert:**
- `decisions` — der Decision-Body bleibt absolut unangetastet. Der existierende Immutability-Trigger bleibt scharf.

**Erweitert (1 Spalte):**
- `stakeholders` bekommt eine **Genehmigungs-Berechtigung** (Boolean). Default: nein.

**Neu (3 Tabellen):**

1. **`decision_approval_state`** — eine Zeile pro Decision, die Genehmigung braucht:
   - Welche Decision (Pointer)
   - Status (pending / approved / rejected / withdrawn)
   - Quorum (z.B. "3 von 5 müssen zustimmen")
   - Tenant-Pointer für Multi-Tenant-Isolation

2. **`decision_approvers`** — eine Zeile pro nominierten Approver pro Decision:
   - Welche Decision, welcher Stakeholder
   - Magic-Link-Token (signiertes Geheimnis, in DB persistiert als zweite Validierungs-Schicht)
   - Token-Ablaufdatum (7 Tage nach Versand)
   - Antwort: zustimmen / ablehnen / noch offen
   - Antwort-Zeitpunkt + optionaler Kommentar

3. **`decision_approval_events`** — Append-only Audit-Log:
   - Welche Decision, welcher Event-Typ (eingereicht / Approver-geantwortet / Quorum erreicht / Quorum unmöglich / zurückgezogen / revidiert)
   - Wer hat es ausgelöst (Plattform-User ODER Stakeholder, beide möglich)
   - Zeitstempel + JSON-Payload mit Detail
   - **Keine Updates, keine Deletes** — nur Inserts erlaubt (per RLS-Policy)

**Approval-Regeln** (Methode × Phase → braucht Approval?) sind **kein DB-Inhalt**, sondern eine TypeScript-Konstante in `src/lib/decisions/approval-rules.ts`. Begründung: PROJ-6 Catalog ist heute auch ein TS-Modul (kein DB-Catalog). Konsistenz mit der bestehenden Rule-Engine. Tenant-Overrides können später als DB-Schicht draufgelegt werden, sind aber nicht MVP.

### 4. Tech-Entscheidungen (das Warum für PM)

#### 4.1 Warum **getrennte Tabellen** statt Spalten an Decisions?
Decisions sind seit V2 als unveränderbar zementiert — der DB-Trigger blockt jedes UPDATE. Wenn wir Approval-Felder direkt an `decisions` ran-bauen, würde **jede Quorum-Status-Änderung sofort von der DB abgelehnt**. Die saubere Lösung: Decision-Body bleibt eingesperrt, der Approval-Workflow läuft in eigener Tabelle. Anderer Vorteil: ein neuer Approval-Workflow-Typ (z.B. später für Budget) kann dasselbe Pattern wiederverwenden.

#### 4.2 Warum **Magic-Link** statt Plattform-Account für externe Approver?
Steering-Committee-Mitglieder oder externe Sponsoren genehmigen vielleicht 4× im Jahr eine Decision. Ihnen einen vollen Account, Login-Onboarding und Tenant-Membership aufzudrücken ist Reibung ohne Mehrwert. Ein 7-Tage-Token per Email ist der pragmatische Mittelweg: signiert mit Server-Secret, in DB persistiert, einzeln revoke-bar.

#### 4.3 Warum **HMAC-Signatur** und nicht JWT?
Beide funktionieren. Aber: wir speichern den Token sowieso in der DB (als zweite Validierungs-Schicht — selbst wenn das Server-Secret später rotiert wird, gilt der Token nur, wenn er auch in der DB steht). Damit fallen die Stateless-Vorteile von JWT weg. HMAC mit der Node-Standard-Library ist eine Handvoll Zeilen Code; eine JWT-Bibliothek wäre Dependency-Bloat ohne Nutzen.

#### 4.4 Warum **DB-Funktion** für die Quorum-Berechnung?
Wenn 5 Approver gleichzeitig auf "Zustimmen" klicken, müssen alle 5 den gleichen Quorum-Status sehen — keiner darf einen veralteten Stand bekommen. In der App-Schicht zu locken (Redis, Mutex etc.) ist Stack-Erweiterung. Die billigste, atomare Lösung ist eine PostgreSQL-Funktion mit "Advisory-Lock" pro Decision-ID — die DB serialisiert konkurrierende Calls automatisch. Etabliert das erste Lock-Pattern im Projekt; spätere Race-Condition-Stellen können es wiederverwenden.

#### 4.5 Warum **bestehendes Mail-Outbox-Pattern** (PROJ-13) und keine eigene Mail-Pipeline?
PROJ-13 ist deployed mit Retry-Logik, Audit-Trail, Class-3-Hard-Block. Approval-Mails wären eine zweite parallel laufende Mail-Pipeline — Wartungs-Albtraum. Stattdessen: Approval-Mail-Insert in dieselbe Outbox, mit explizitem Marker für den Versand-Zweck.

**Wichtige Konstruktionsregel** (CIA R2): Der Class-3-Block in der Outbox ist heute KI-Run-getrieben (greift nur wenn `metadata.ki_run_id` gesetzt ist). Eine Approval-Mail ist kein KI-Run und würde am Block vorbei. **Lösung:** Eine dedizierte Builder-Funktion `buildApprovalOutboxRow()` mit strenger Eingabe-Whitelist (Title + Token + Empfänger — niemals Decision-Body). Code-Review-pflicht: niemand darf an dieser Funktion vorbei direkt in `communication_outbox` einfügen.

#### 4.6 Warum **`stakeholders.linked_user_id`** und kein neues Approver-User-Mapping?
PROJ-8 hat das Mapping bereits: jeder Stakeholder kann optional einen `linked_user_id`-Pointer auf einen Plattform-Account haben. Internes Dashboard-Filter wird zu einer Zeile JOIN. Stakeholder ohne `linked_user_id` aber mit Genehmigungs-Berechtigung sind ausschließlich externe Approver — die UI muss das visuell trennen, das Datenmodell muss nichts ändern.

### 5. Workflow-Diagramm (Decision-Lifecycle)

```
[Decision wird erstellt]
        │
        ▼
[Gate-Check: PROJ-6-Regel + manueller Flag]
        │
        ├─── requires_approval = false ──► [Decision direkt nutzbar]
        │
        ▼
   requires_approval = true
        │
[Status: draft]
        │
        ▼
[PM nominiert N Approver, setzt Quorum M]
        │
        ▼
[Submit → Tokens generiert → Mails versendet]
        │
[Status: pending]
        │
        ├──► [Approver klickt approve]  ┐
        │           ▼                   │
        │    [Counter erhöht]           │
        │    [DB-Lock-Berechnung]       │ Race-Condition-frei
        │           ▼                   │ via Advisory-Lock
        │    [M erreicht?]              │
        │           ├── ja ──► [Status: approved]
        │           └── nein ──► [warte]
        │                              │
        ├──► [Approver klickt reject]   │
        │           ▼                   │
        │    [Counter erhöht]           │
        │    [N - M + 1 erreicht?]      │
        │           ├── ja ──► [Status: rejected (Quorum unmöglich)]
        │           └── nein ──► [warte]
        │
        ├──► [PM klickt withdraw] ──► [Status: withdrawn]
        │
        └──► [Decision wird via supersedes_decision_id revidiert]
                    ──► [alter Workflow: status=withdrawn, Event=revised]
                    ──► [neue Decision startet eigenen Workflow]

                    Jede Transition schreibt einen Event in
                    decision_approval_events (append-only Audit-Trail).
```

### 6. CIA-Findings (Risiken die das Design entschärft)

| ID | Risiko | Severity | Im Design entschärft durch |
|----|--------|----------|---------------------------|
| R1 | Decisions-Immutability-Trigger blockt Spalten-Erweiterung | **HIGH** | Eigene Tabelle `decision_approval_state` (1:1) statt Spalten an `decisions` |
| R2 | PROJ-13-Class-3-Block ist KI-Run-getrieben, greift nicht für Approval-Mails | **HIGH** | Dedizierter `buildApprovalOutboxRow`-Builder mit Eingabe-Whitelist; Architektur-Vorgabe als Code-Review-Pflicht |
| R3 | Stakeholder-Soft-Delete-Pattern fehlt (Approver verlässt Projekt mid-flight) | **MID** | Cascading-Trigger auf `stakeholders.is_approver` UPDATE/DELETE → invalidiert offene Approvals |
| R4 | Magic-Link-Replay nach Decision-Revision | **MID** | Token-Validierungs-Reihenfolge: HMAC → tenant_id → expires_at → approval_status → is_revised |
| R5 | Quorum-Konkurrenz ohne etabliertes Lock-Pattern | **MID** | PostgreSQL `pg_advisory_xact_lock` in DB-Funktion `record_approval_response()` |

**Out-of-spec-Funde** (CIA O1-O3) als spätere PROJ-X-Kandidaten markiert:
- O1: Privacy-Class-Marker auf `decisions.decision_text` fehlt → PROJ-32-Spike "Governance-Tabellen Privacy-Klassifizierung"
- O2: Stakeholder-Soft-Delete-Pattern als Cross-Cutting-Architektur-Entscheidung dokumentieren (für PROJ-22 Budget, PROJ-19 Phasen wiederverwendbar)
- O3: Stakeholder.linked_user_id-Wechsel cascading auf `decision_approvers` → kleiner Trigger in derselben Migration

### 7. Dependencies

**Neue npm-Packages:** keine.
- HMAC-Signatur via `node:crypto` (Standard-Library)
- Mail-Versand via existierendes `resend` (PROJ-13)
- DB-Locks via PostgreSQL-Builtins

**Neue Env-Variablen:** eine.
- `APPROVAL_TOKEN_SECRET` (256-bit min, in Vercel-Env-Vars)

**Touched-but-unchanged-Code** (zur Awareness, nicht für /backend):
- `src/lib/decisions/` (neu): `approval-rules.ts` (TS-Konstanten), `approval-mail.ts` (Whitelist-Builder), `token.ts` (HMAC sign/verify)
- `src/app/api/projects/[id]/decisions/[did]/approval/` (neu): Routes für Submit, Withdraw, Approver-Response
- `src/app/approve/[token]/` (neu): Public Approval-Page (kein Auth)
- `src/app/dashboard/approvals/` (neu): Internes Approval-Dashboard
- `src/components/projects/decisions/` (erweitert): `decision-form.tsx`, `decisions-tab-client.tsx`
- `supabase/migrations/`: 1 neue Migration mit allen 3 Tabellen + 1 RPC + 2 Trigger + RLS-Policies

### 8. Aufwandsschätzung (Indikation)

- **Backend** (Migration + RPC + Routes + Mail-Builder + Token-Sign/Verify): ~2 Personentage
- **Frontend** (Decision-Form-Erweiterung + Approval-Page + Dashboard + Audit-Trail-Tab): ~2 Personentage
- **QA** (Vitest + Playwright + Red-Team-Tests für Token-Forgery, Cross-Tenant-Leak, Body-Leak): ~1 Personentag
- **Total**: ~5 Personentage. Vergleichbar mit PROJ-30-Komplexität.

### 9. Was NICHT in PROJ-31 ist (Architektur-Boundaries)

- Kein neuer Catalog-DB-Refactor (Approval-Regeln bleiben TS-Modul)
- Kein neues Mail-Backend (Outbox-Wiederverwendung)
- Kein Crypto-Hash-Chain für Audit (DB-Felder reichen)
- Kein App-Layer-Lock (DB-Advisory-Lock)
- Kein neues npm package
- Kein KI im Approval-Flow (Class-3-Risk; eigene Spec wenn nötig)

### 10. Approval-Empfehlung

**Umsetzbar mit aktueller Architektur, ohne Stack-Erweiterung.** Die einzige nicht-triviale Risiko-Entschärfung (R2 Mail-Body-Whitelist) ist eine Konstruktionsregel, kein technischer Filter — Architekt + /backend-Phase müssen gemeinsam wachsam sein. Der Rest ist Standard-Pattern-Anwendung.

## Implementation Notes
_To be added by /frontend + /backend_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
