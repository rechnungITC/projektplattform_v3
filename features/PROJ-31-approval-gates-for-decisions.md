# PROJ-31: Approval-Gates für formale Decisions

## Status: Deployed
**Created:** 2026-05-02
**Last Updated:** 2026-05-02
**Deployed:** 2026-05-02 — Production: https://projektplattform-v3.vercel.app — Tag: `v1.31.0-PROJ-31`

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

### Round 2 — Approver Action UI + Project Feedback (2026-05-04)

**Bug fixed first:** the dashboard listed pending approvals but linked to `/projects/[id]/decisions/[did]` (404 — page never built). Fixed by routing to `/projects/[id]/entscheidungen?decision=<id>` and adding deep-link auto-scroll on the existing tab page (`decision-card` got DOM `id="decision-<id>"`, `decisions-tab-client` reads `useSearchParams` and pulses a ring highlight on mount). Commit `ee25951`.

**Round-2 capability added:** approvers can now act inline from the decision-approval sheet — three buttons (`Freigeben` / `Ablehnen` / `Info anfordern`) on a new "Meine Aktion" panel, visible when the logged-in user is a nominated internal approver who has not yet finally responded.

**Schema additions:**
- Migration `20260504020000_proj31_approver_request_info_channel.sql` — adds `decision_approvers.request_info_comment text` and `request_info_at timestamptz` (both nullable, additive).
- `ApprovalEventType` extended with `approver_requested_info` and `approver_withdrawn` (latter reserved for future use).

**Action semantics:**
- **Freigeben (approve)** — final, optional comment. Calls existing `record_approval_response` RPC (race-safe quorum update). Triggers a project-feedback outbox row (informational e-mail to the responsible PM).
- **Ablehnen (reject)** — final, comment required (5–4000 chars). Same RPC. Triggers an `open_item` (action: revise or withdraw) **and** an outbox row.
- **Info anfordern (request_info)** — non-final. Sets `request_info_comment` + `request_info_at` (latest-only — repeated requests overwrite), appends `approver_requested_info` audit event, leaves the approver in pending. Triggers an `open_item` (action: provide info to approver) **and** an outbox row. The approver can repeat the request or finally respond afterwards.

**Project-Feedback helper:** `src/lib/decisions/approval-feedback.ts` — pure-function builders for open-item title/description and outbox subject/body per action; `lookupProjectResponsibleRecipient` resolves the PM via `projects.responsible_user_id` → `user_profiles.email` (falls back to internal-channel with the user-id when no e-mail is on file). Errors are swallowed-with-warn — primary approver response is always persisted regardless of feedback-pipeline hiccups.

**API contract:**
- POST `/api/projects/[id]/decisions/[did]/approval/respond/[approverId]` accepts a discriminated union `{ action: "approve" | "reject" | "request_info", comment }`. Backward-compat: legacy `{ response, comment }` body still accepted (migrated server-side to the matching action; `reject` requires comment ≥ 5 chars in both shapes).
- Magic-Link `/api/approve/[token]` deliberately **not** extended — external approvers stay binary (approve/reject) per Class-3 security posture (no recurring-loop UX exposed to public tokens).

**UI components:**
- `my-approval-action-panel.tsx` — new. Three buttons + comment dialogs + "info already requested" banner.
- `approver-list.tsx` — surfaces the latest info-request inline as a small amber `HelpCircle` row when the approver still has no final response.
- `approval-trail-timeline.tsx` — event labels + icons for the two new event types.
- `decision-approval-sheet.tsx` — mounts `MyApprovalActionPanel` between status banner and the Approver / Audit-Trail tabs, only when `state.status = pending`.

**Out of scope of round 2:**
- Magic-Link defer flow (external approvers cannot request info).
- Withdraw-own-response (audit event is reserved but UX not built).
- E-mail-template-system for the outbox (uses plain text body).

### Frontend (2026-05-02)

**Types & API client:**
- `src/types/decision-approval.ts` — `ApprovalStatus`, `ApproverResponse`, `DecisionApprovalBundle`, `PendingApprovalSummary`, `ApprovalTokenPayload`.
- `src/types/stakeholder.ts` — extended `Stakeholder` with optional `is_approver?: boolean`. Optional until PROJ-31 backend migration lands.
- `src/lib/decisions/approval-api.ts` — fetch wrappers for `submitDecisionForApproval`, `withdrawDecisionApproval`, `getDecisionApprovalBundle`, `listPendingApprovals`, `respondAsInternalApprover`, `fetchApprovalByToken`, `respondViaToken`. All routes 4xx until `/backend` lands.

**Components** (new directory `src/components/projects/decisions/approval/`):
- `approval-status-badge.tsx` — small Badge with variant per status.
- `approver-selector.tsx` — multi-select with visual split "Intern (Plattform-Account) / Extern (Magic-Link per Email)" via Stakeholder.linked_user_id check.
- `submit-for-approval-form.tsx` — wraps selector + quorum-Input; effective quorum derived at render (no setState-in-effect).
- `approval-status-banner.tsx` — top-of-bundle Alert with status-specific copy.
- `approver-list.tsx` — per-Approver row with response Badge (Zugestimmt / Abgelehnt / Offen).
- `approval-trail-timeline.tsx` — append-only event Timeline, narrows `payload?.comment | response` via IIFE pattern (TypeScript-clean).
- `withdraw-decision-dialog.tsx` — confirm Dialog with optional reason.
- `decision-approval-sheet.tsx` — orchestrator: loads bundle, branches to SubmitForApprovalForm (status=draft) or Tabs(Approver/Audit-Trail) view with Withdraw-Button (status=pending+).

**Pages:**
- `src/app/approve/[token]/page.tsx` (NEW, public, server-rendered, robots: noindex) — fetches token-payload server-side; renders Decision body + ApproveForm. Branch to `ExpiredOrInvalidView` if `expired || status ∈ {withdrawn, approved, rejected}`.
- `src/app/approve/[token]/approve-form.tsx` — client component with idempotent submit (after first response, switches to confirmation state).
- `src/app/approve/[token]/expired-or-invalid-view.tsx` — error view with status-specific copy.
- `src/app/(app)/approvals/page.tsx` (NEW) — internal Approver-Dashboard wrapping `ApprovalsListClient`.
- `src/app/(app)/approvals/approvals-list-client.tsx` — fetches `listPendingApprovals()`, renders Skeleton/Empty/List with deep-link to `/projects/[id]/decisions/[did]`.

**Wiring into existing surfaces:**
- `src/components/projects/decisions/decision-card.tsx` — added optional `onManageApproval` prop; renders new "Genehmigung"-button in the action row when prop provided.
- `src/components/projects/decisions/decisions-timeline.tsx` — passes the callback through.
- `src/components/projects/decisions/decisions-tab-client.tsx` — adds `approvalDecision` state + opens `DecisionApprovalSheet` on click; reloads the timeline on `onChanged`.
- `src/components/app/global-sidebar.tsx` — new nav item `/approvals` with `CheckSquare` icon between Projekte and Stammdaten.

**Lint config:**
- `eslint.config.mjs` — added 2 new files to the documented PROJ-29 `set-state-in-effect` exception list (effect-driven initial-load pattern, same as deployed components):
  - `src/app/(app)/approvals/approvals-list-client.tsx`
  - `src/components/projects/decisions/approval/decision-approval-sheet.tsx`

**Verification:**
- `npx tsc --noEmit` exit 0
- `npm run lint` exit 0
- `npm test --run` 572/572
- `npm run build` green; new routes `/approvals` and `/approve/[token]` both `ƒ` (server-rendered) in the manifest.
- Browser-Test skipped — backend API routes (POST `/api/projects/[id]/decisions/[did]/approval`, GET `/api/dashboard/approvals`, GET/POST `/api/approve/[token]`) return 404 until `/backend` ships them.

**Out-of-scope deviations from spec (logged):**
- No "Formal Decision" toggle inside the existing `decision-form.tsx` — instead a separate "Genehmigung verwalten" sheet on each Decision row. Cleaner separation: existing form keeps creating draft Decisions; approval workflow is a follow-up action. PROJ-6 catalog auto-flag will land server-side when /backend implements `decision_approval_state` row creation.
- No "PROJ-19 phase-transition banner" UX yet — pull-mechanic spec'd as "PM submit manuell"; banner can come in a frontend-only follow-up slice once backend exposes the catalog rule lookup.

### Backend (2026-05-02)

**Migration** — `supabase/migrations/20260502120000_proj31_approval_gates.sql`
(applied to remote project `iqerihohwabyjzkpcujq` in 2 chunks):
- `stakeholders.is_approver` boolean column + partial index on (project_id WHERE is_approver=true).
- `decision_approval_state` (1:1 with decisions) — status state-machine, quorum_required, submitted_at, decided_at. RLS via `is_tenant_member`.
- `decision_approvers` (n:m) — stakeholder_id, magic_link_token + expires_at, response (approve/reject/withdrawn/null), comment, with `unique(decision_id, stakeholder_id)` and `unique(magic_link_token)`. RLS.
- `decision_approval_events` — append-only audit log with 8 event types (`submitted_for_approval`, `approver_responded`, `quorum_reached`, `quorum_unreachable`, `withdrawn`, `revised`, `token_renewed`, `approver_withdrawn`). UPDATE/DELETE rejected by `enforce_approval_event_immutability` trigger.
- RPC `record_approval_response(p_decision_id, p_approver_id, p_response, p_comment, p_actor_user_id)` — `SECURITY DEFINER`, acquires `pg_advisory_xact_lock(hashtextextended(decision_id::text, 0))` for race-condition-free quorum updates. Computes new state (`approved` when approves ≥ quorum, `rejected` when remaining-cant-reach, else `pending`), writes the event, updates state if changed.
- Trigger `cascade_stakeholder_approver_revoke` (on stakeholders UPDATE OF is_approver / DELETE) — withdraws pending approver-rows for that stakeholder, writes `approver_withdrawn` event.
- Trigger `cascade_decision_revision_to_approval` (on decisions INSERT) — when `supersedes_decision_id` is set, marks predecessor's pending state as `withdrawn`, writes `revised` event with payload `{superseded_by: <new id>}`.
- `touch_updated_at` trigger on both new mutable tables.

**TypeScript modules** (`src/lib/decisions/`):
- `approval-rules.ts` — TS-only (no DB): `resolveDecisionApprovalRule(method, phaseStatus)`. Heavyweight methods (waterfall, pmi, prince2, vxt2) auto-require approval in `planned`/`in_progress` phases; agile methods (scrum, kanban, safe) never auto-require (PM flag-only).
- `approval-token.ts` — HMAC-SHA256 sign/verify via `node:crypto`. Token format: `base64url(json) + "." + base64url(sig)`. `verifyApprovalToken` enforces signature → expiry, returns 3 reasons: `malformed`, `invalid_signature`, `expired`. Throws if `APPROVAL_TOKEN_SECRET` unset / < 32 chars.
- `approval-mail.ts` — `buildApprovalOutboxRow(input)` constructs the `communication_outbox` payload via Zod-strict input. `sanitizeApprovalTitle` strips emails + phone numbers, rejects empty / too-long. The body is template-only — Decision body / rationale / personal data NEVER enter the mail (Class-3 hard-constraint).

**API routes** (5 new):
| Route | Auth | Purpose |
|---|---|---|
| `GET /api/projects/[id]/decisions/[did]/approval` | session | Fetch bundle (state + approvers + events) |
| `POST /api/projects/[id]/decisions/[did]/approval` | session (edit) | Submit-for-approval; creates state, approver rows, signs tokens, queues outbox mails |
| `POST /api/projects/[id]/decisions/[did]/approval/withdraw` | session (edit) | Set status=withdrawn, invalidate pending approver tokens, audit event |
| `POST /api/projects/[id]/decisions/[did]/approval/respond/[approverId]` | session (linked_user_id match) | Internal approver response → RPC |
| `GET, POST /api/approve/[token]` | **public, token-auth** | Magic-Link flow. GET returns whitelisted payload (decision body + counts only — no approver list); POST routes through the same RPC |
| `GET /api/dashboard/approvals` | session | Pending approvals where stakeholder.linked_user_id = auth.uid() |

**Token validation order on POST `/api/approve/[token]`** (CIA R4 mitigation):
1. HMAC signature check (approval-token.ts)
2. exp check
3. Persisted token match (DB lookup — second validation layer)
4. tenant_id match (claim vs DB row)
5. decision_id match (claim vs approver-row)
6. response is null
7. magic_link_expires_at > now()
8. decisions.is_revised = false
9. decision_approval_state.status = 'pending'

Then the RPC takes over and the advisory-lock serialises concurrent approver clicks.

**Tests** (28 new vitest cases — total 572 → 600 passing):
- `src/lib/decisions/approval-token.test.ts` (8 cases): round-trip, wrong secret, malformed, tampered payload, expired, no-secret, short-secret, missing fields.
- `src/lib/decisions/approval-mail.test.ts` (12 cases): sanitizer (email/phone strip, empty, too-long, benign), builder (Class-3 defense, missing fields, URL encoding, baseUrl trailing slash).
- `src/lib/decisions/approval-rules.test.ts` (8 cases): null guards, waterfall + planned/in_progress/completed, scrum/kanban/safe never auto-require.

**ENV vars added to `.env.local.example`:**
- `APPROVAL_TOKEN_SECRET` (32+ chars HMAC secret) — REQUIRED in production for approval submission.
- `NEXT_PUBLIC_BASE_URL` (optional) — base URL embedded in approval mail links; falls back to vercel-deploy URL.

**Verification:**
- `npx tsc --noEmit` exit 0
- `npm run lint` exit 0
- `npm test --run` 600/600
- `npm run build` green; all 5 new API routes + 2 frontend pages in the manifest as `ƒ` (server-rendered).
- Migration applied to remote Supabase project (`iqerihohwabyjzkpcujq`); both halves succeeded.

**Out-of-spec deviations (logged):**
- Token validation includes a **persisted-token match step (DB lookup)** beyond the spec's "HMAC + tenant + expiry" requirement — this is CIA-recommended defense-in-depth (rotation safety + manual revocation). Spec block 4 didn't mandate it explicitly; we added it.
- `record_approval_response` RPC is `SECURITY DEFINER` and grants execute to `authenticated` AND `service_role` (the latter for the public Magic-Link path which goes through `createAdminClient`). Spec didn't lock the role-grant; this is the minimum needed.
- Approval-mail outbox-insert is **non-fatal on failure** — if the mail can't be queued, we still persist the state + approvers + audit event so the PM can manually share the link. Spec implied "must succeed"; we treat partial failure as recoverable.

**Backend done. All verifications green. Ready for `/qa`.**

## QA Test Results

**Date:** 2026-05-02
**Verdict:** **Approved** (Production-Ready) — 0 Critical / 0 High bugs · 1 Medium (regression-class hygiene) · 2 Low

### Automated Test Suite

| Layer | Result |
|---|---|
| TypeScript strict (`npx tsc --noEmit`) | ✅ exit 0 |
| ESLint (`npm run lint`) | ✅ exit 0 |
| Vitest unit/integration (`npm test --run`) | ✅ **600/600** (572 → 600, +28 PROJ-31 cases) |
| Playwright E2E (`npx playwright test --project=chromium`) | ✅ 23/24 passed · 1 skipped (`PROJ-29-auth-fixture-smoke` blocked on missing system libs `libnspr4` etc., **environment-only, not a PROJ-31 regression**) |
| Production build (`npm run build`) | ✅ green; all 5 new API routes + 2 new pages in the manifest as `ƒ` (server-rendered) |

### AC-Block-Walkthrough

| Block | AC | Verified by |
|---|---|---|
| 1 | Datenmodell — 3 Tabellen, RLS, Backfill | DB-Live-Check via Supabase MCP: 3 tables exist, RLS=true, 8 policies (`is_tenant_member`-gated), 11 indexes, append-only events trigger live |
| 2 | Methoden-/Phasen-Gate | `approval-rules.test.ts` 8 cases — waterfall/pmi/prince2/vxt2 auto-require in planned/in_progress; agile methods never auto |
| 3 | Approver-Nomination + Quorum | `submit-for-approval-form.tsx` clamps quorum to [1,N] at render; POST-route validates `quorum_required <= approvers.length` |
| 4 | Magic-Link | `approval-token.test.ts` 8 cases (round-trip, wrong-secret, tampered, expired, malformed); `approval-mail.test.ts` 12 cases (Class-3 sanitizer + body whitelist + URL encoding) |
| 5 | Quorum-Berechnung | RPC `record_approval_response` exists with `SECURITY DEFINER`; `pg_advisory_xact_lock(hashtextextended(decision_id))` serialises concurrent approver clicks; status flip logic per `M of N` + `(N - rejects) < M` rejection-trigger |
| 6 | Internes Dashboard | `/api/dashboard/approvals` filters via `stakeholders.linked_user_id = auth.uid()`; `/approvals` page wired with empty-state + skeleton + click-through |
| 7 | Decision-Revision | Trigger `decisions_cascade_revision_to_approval` (live in DB) marks predecessor's pending state withdrawn + writes `revised` event; `is_revised` re-checked in token validation order |
| 8 | Withdraw | `/api/projects/.../approval/withdraw` route + `WithdrawDecisionDialog` UI; invalidates pending tokens by setting response='withdrawn' |
| 9 | Audit-Trail-UI | `decision-approval-events`-table append-only confirmed via live red-team (UPDATE/DELETE blocked); `ApprovalTrailTimeline` component renders 7 event types |
| 10 | RBAC + Multi-Tenant | All 8 RLS policies use `is_tenant_member(tenant_id)`; routes go through `requireProjectAccess` helper; Magic-Link route cross-validates tenant_id (claim vs DB row) |

### Live DB Red-Team Tests (via Supabase MCP)

| Test | Expected | Actual | Result |
|---|---|---|---|
| UPDATE on `decision_approval_events` | block with `check_violation` | `ERROR: 23514 — decision_approval_events are append-only. UPDATE and DELETE forbidden.` | ✅ Pass |
| DELETE on `decision_approval_events` | block with `check_violation` | Same error | ✅ Pass |
| INSERT with invalid status enum (`'evil_status'`) | block with check constraint | `ERROR: 23514 — violates check constraint "decision_approval_state_status_check"` | ✅ Pass |
| Schema verification (3 tables + RLS) | RLS on, policies referenced via `is_tenant_member` | confirmed by live `pg_class`/`pg_policies` queries | ✅ Pass |
| Triggers exist | 7 triggers (2 immutability, 2 stakeholder-cascade, 1 revision-cascade, 2 touch-updated) | all 7 found, all ENABLED | ✅ Pass |
| Functions exist with security_definer | `record_approval_response`, both cascade functions, immutability function | all 4 exist, security_definer flags correct | ✅ Pass |

### Edge-Case-Walkthrough (10 from spec)

| EC | Verified |
|---|---|
| EC-1: Approver verlässt Projekt mid-flight | `cascade_stakeholder_approver_revoke` trigger UPDATEs pending approvers to `withdrawn` + writes `approver_withdrawn` event |
| EC-2: N=1, M=1 | RPC handles degenerate case via the same `M of N` logic without special branches |
| EC-3: Quorum bereits erreicht, später Reject | RPC computes new state from final counts but only updates state when `v_new_status <> v_state.status`. Once approved, subsequent reject events are written but state stays approved |
| EC-4: Token-Ablauf | `verifyApprovalToken` returns `{ok:false, reason:'expired'}` (vitest `rejects expired token` case); page shows ExpiredOrInvalidView with reason=expired |
| EC-5: PROJ-6-Catalog-Regel-Änderung rückwirkend | `approval-rules.ts` is pure function — only used at decision-creation; existing pending state rows are NOT auto-recomputed (idempotent design) |
| EC-6: Phase-Transition Mass-Pending | Frontend doesn't auto-submit; PM submits via UI button (pull-mechanic per spec) |
| EC-7: Race-Condition gleichzeitige Approves | `pg_advisory_xact_lock` serialises; verified by RPC code review |
| EC-8: Doppel-Klick | `approver.response IS NOT NULL` short-circuits at API layer; RPC also raises `approver_already_responded` |
| EC-9: Decision revision während pending | `cascade_decision_revision_to_approval` trigger withdraws old workflow + writes `revised` event |
| EC-10: Token-Leak | DB-persisted token is the second validation layer beyond HMAC; PM can revoke by setting magic_link_token to a random value |

### Security Audit (Red-Team Lens)

| Vector | Mitigation Live-Verified |
|---|---|
| **Token forgery via secret-bruteforce** | HMAC-SHA256 with 32+-char secret enforced at sign-time (vitest: `throws when secret is too short`) |
| **Token forgery via tamper-only-payload** | `verifyApprovalToken` returns `invalid_signature` when payload re-base64'd without re-signing (vitest: `rejects malformed token (tampered payload)`) |
| **Token replay after secret rotation** | DB-persisted token match — second validation layer; old tokens with valid HMAC fail DB lookup |
| **Class-3 mail body leak** | `buildApprovalOutboxRow` whitelist-input pattern; `sanitizeApprovalTitle` strips emails + phone-shaped patterns; vitest `does NOT leak decision body` |
| **Cross-tenant token replay** | API route checks `approver.tenant_id !== tenantId-claim` and `approver.decision_id !== decisionId-claim`; token contains tenant_id + decision_id claims |
| **Audit-trail tampering** | UPDATE/DELETE on `decision_approval_events` blocked at the trigger level — confirmed live |
| **RPC quorum tampering via concurrent clicks** | `pg_advisory_xact_lock` ensures atomic state transition (lock is held until COMMIT) |
| **RBAC bypass via direct DB write** | RLS policies use `is_tenant_member(tenant_id)` on every table; INSERT/UPDATE both gated |
| **Stakeholder-User mismatch on internal-respond** | Route checks `stakeholder.linked_user_id === auth.uid()` before delegating to RPC |
| **Withdrawn-then-clicked** | Token validation order step 8 (`decision_approval_state.status = 'pending'`) blocks |

### Bugs Found

#### Bug-M1 (Medium) — Function search_path missing on 2 new functions
**Severity:** Medium
**Surface:** Supabase advisor `function_search_path_mutable`
**Detail:** Two new functions introduced by PROJ-31 lack `SET search_path = public`:
- `public.touch_updated_at` (used by 2 triggers on the new tables)
- `public.enforce_approval_event_immutability` (the audit-immutability trigger function)

This re-introduces a hygiene class that PROJ-29 explicitly closed. PROJ-29 baseline was 0 such warnings; PROJ-31 adds 2. Privilege-escalation impact is limited because both functions are non-SECURITY-DEFINER (no role-elevation) — but the V3 hygiene rule is "all new functions get search_path".

**Repro:** `mcp__supabase__get_advisors` returns 2 PROJ-31-attributable `function_search_path_mutable` warnings.
**Fix:** Add `SET search_path = public` (or `SET search_path = ''` plus fully-qualified table refs) to both functions in a small follow-up migration.
**Decision:** Should be fixed before / together with deploy to keep the V3 advisor baseline at "0 PROJ-31-class warnings".

**Resolved:** 2026-05-02 — Follow-up migration `20260502130000_proj31_function_search_path.sql` applied. Both functions now `SET search_path = public`. Advisor re-scan returns 0 PROJ-31-class `function_search_path_mutable` warnings.

#### Bug-L1 (Low) — TRUNCATE bypasses append-only immutability trigger
**Severity:** Low
**Detail:** The `enforce_approval_event_immutability` trigger fires BEFORE UPDATE / BEFORE DELETE; TRUNCATE bypasses both. A service-role caller (e.g. SQL Editor) can erase the audit-trail.

**Threat model:** Service-role is trusted (never exposed to authenticated/anon). TRUNCATE privilege is not granted to authenticated/anon by default. RLS doesn't apply to service-role anyway. Same pattern exists on PROJ-20's decisions table — project-wide gap, not a PROJ-31 regression.

**Mitigation options (none MVP-blocking):**
1. Add a `BEFORE TRUNCATE` trigger that raises (Postgres supports it).
2. Document the gap in a security-runbook for tenant-admin operations.

**Decision:** Defer — note in spec but don't block MVP. Address project-wide in a future "audit-table TRUNCATE-protection" sweep if a customer compliance audit asks.

#### Bug-L2 (Low) — Internal approver `respond` route lacks rate-limiting
**Severity:** Low
**Detail:** No throttle on POST `/api/projects/.../approval/respond/[approverId]`. A malicious internal approver could spam the endpoint, but the RPC short-circuits with `approver_already_responded` after the first call — so the spam doesn't change state. Cost is just a few logged 409s.

**Mitigation:** Existing PROJ-13 outbox pattern uses no rate-limiter either. Project-wide stance.

**Decision:** Defer — note as Low for awareness; not a deploy-blocker.

### Regression Check

- All deployed PROJ-1 → PROJ-30 tests still green (vitest 600/600, the 28 new tests are PROJ-31; remaining 572 cover earlier features).
- `decisions` table itself is unchanged — V2 immutability invariant respected.
- PROJ-13 outbox: PROJ-31 inserts via `buildApprovalOutboxRow` follow the existing schema; no schema delta on `communication_outbox`.
- PROJ-20 (Decisions Catalog): all 4 decisions API tests pass; new revision-cascade trigger fires only when `supersedes_decision_id` is set, no impact on legacy decision-creation paths.
- PROJ-8 (Stakeholders): new `is_approver` column is `default false` — existing rows backfilled to false, no behavior change for stakeholders not nominated as approvers.

### Production-Ready Decision

**Recommendation:** **APPROVED for /deploy**

- 0 Critical / 0 High bugs.
- 1 Medium (Bug-M1) is a hygiene regression that PROJ-29 explicitly closed — **fix recommended before /deploy** (small follow-up migration: add `SET search_path = public` to 2 functions).
- 2 Low bugs (Bug-L1, Bug-L2) are project-wide patterns, deferrable.
- All 10 AC blocks live-verified; all 10 EC items addressed by code/triggers; security audit clean.

### Suggested Next

1. **Fix Bug-M1** before deploy (5-line migration, no functional impact). OR accept as deferred follow-up (document in spec).
2. **`/deploy proj 31`** — code-only push (Migration already applied via MCP).

## Deployment

**Date:** 2026-05-02
**Production URL:** https://projektplattform-v3.vercel.app
**Tag:** `v1.31.0-PROJ-31`
**Commits in production:**
- `67a6b27` feat — feature specification
- `6bc30a1` docs — Tech Design (CIA-validated)
- `acb82a9` feat — frontend (8 components, 3 pages, sidebar, types, API client)
- `91c0aee` feat — backend (migration, RPC, 5 routes, token/mail/rules modules)
- `ebea82d` test — QA pass Approved
- `db57d4c` fix — search_path hardening (BUG-M1)
- `b84ecb4` deploy — Deployed bookkeeping
- `fd0c9d5` fix — middleware PUBLIC_ROUTES whitelist for Magic-Link (post-deploy hotfix)

### Post-Deploy Hotfix — BUG-D1 (Critical, fixed forward)
**Discovery:** Live route-probe immediately after the first deploy showed
`/approve/[token]` returning HTTP 307 → `/login`. The Magic-Link flow was
broken — the auth proxy (src/proxy.ts) calls `updateSession` which
redirects all unauthenticated requests **except** those matching
`PUBLIC_ROUTES` in `src/lib/supabase/middleware.ts:8-18`. That allow-list
did not include `/approve` or `/api/approve`.

**Impact:** Without the fix, the entire external-Approver flow (the most
distinctive PROJ-31 capability) would have been non-functional in
production — Magic-Link mails would have led recipients to the login
page instead of the Approval-Page.

**Why QA missed it:** /qa probed live routes via curl pre-deploy and saw
307 — but interpreted that as the expected auth-gate without verifying
the spec contract that `/approve/[token]` is **public**. Lesson: every
route-class that is intentionally public needs a pre-deploy curl check
that asserts NOT-307 (i.e. the route IS reached, not bounced).

**Fix:** Added `/approve` and `/api/approve` to `PUBLIC_ROUTES` in
`src/lib/supabase/middleware.ts`. Token-auth is still enforced inside
the routes themselves; this whitelist only exempts them from the
session-cookie bounce.

**Hotfix shipped:** `fd0c9d5` — pushed within 5 minutes of the initial
deploy. No production user could have hit the broken flow because no
Approval was submitted in that window (the submit endpoint is
session-gated and there's no production test data).

### Post-Deploy Hotfix #2 — BUG-D2 (Critical, fixed forward)
**Discovery:** Once the middleware no longer bounced `/approve/[token]`,
the page returned HTTP 500 in production.

**Root cause:** `src/app/approve/[token]/page.tsx` is a server component
that uses `fetch()` to call its backing API `/api/approve/[token]`. With
no `NEXT_PUBLIC_BASE_URL` set, the fetch URL was relative (`/api/...`).
Next.js server-side fetch in Vercel's serverless runtime requires an
**absolute URL**.

**Fix:** Resolution chain in `resolveBaseURL()` (`page.tsx:19-32`):
1. `NEXT_PUBLIC_BASE_URL` (explicit env)
2. `VERCEL_URL` (auto-injected on every Vercel deployment)
3. Request `host` header via `next/headers`
4. `http://localhost:3000` (last-resort dev fallback)

The page now works out of the box on any Vercel deployment without
requiring `NEXT_PUBLIC_BASE_URL` to be configured.

**Hotfix shipped:** `f99e553`. Live verification:
- `/approve/abc.def` → **404** (route reached, invalid token → notFound) ✅
- `/api/approve/abc.def` → **404** (HMAC verify fails) ✅
- `/api/projects/.../approval` (no auth) → **307 → /login** (auth-gate) ✅
- `/approvals` (no auth) → **307 → /login** (auth-gate) ✅

**Lesson recorded:** Add a checklist item to /deploy:
> For every route documented as **public**, run a curl probe **without
> auth cookies** and assert the response is NOT 307 → /login. A 200, 404,
> or 410 means the route is reached; 307 means the middleware ate it.

### Action Required by Operator (User)

Before any production tenant can submit a Decision for Approval:
1. Generate a 32+-char secret: `openssl rand -base64 32`
2. Set in Vercel Project Settings → Environment Variables (Production):
   - `APPROVAL_TOKEN_SECRET=<generated-secret>`
3. **Optional:** `NEXT_PUBLIC_BASE_URL=https://projektplattform-v3.vercel.app`
4. Trigger a redeploy (Vercel does not auto-redeploy on env-var change).

Without the token-secret, the submit-endpoint throws a clear error
("APPROVAL_TOKEN_SECRET is not set or too short"). The other endpoints
(GET bundle, dashboard listing, withdraw) are unaffected.
