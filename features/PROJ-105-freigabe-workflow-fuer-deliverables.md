---
id: PROJ-105
title: "Freigabe-Workflow für Deliverables"
issue_type: Story
epic_code: D
epic_title: "Deliverables & Artefakte"
priority: Medium
priority_source: "Should"
labels: ["ma-platform", "epic-d", "should-have"]
dependencies: ["D1", "B1", "L3"]
roles: ["PMO-Lead", "Workstream Leads", "Deal Lead", "Geschäftsführung (als Freigeber)"]
summary_for_jira: "[D2] Freigabe-Workflow für Deliverables"
---

# PROJ-105: Freigabe-Workflow für Deliverables

## Status: Deployed
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic D — Deliverables & Artefakte)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **DUP→REUSE** · Andockpunkt: PROJ-31 Approval-Gates. Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** D — Deliverables & Artefakte  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should  
> **Labels:** `ma-platform` · `epic-d` · `should-have`  
> **Abhängigkeiten:** `D1`, `B1`, `L3`

**User Story:**

Als Verantwortlicher eines Deliverables möchte ich es zur Review einreichen, kommentieren lassen und durch den definierten Freigeber freigeben lassen, damit Deliverables nachvollziehbar autorisiert werden.

**Beschreibung / Kontext:**

Viele Deliverables (LOI, indikatives Angebot, DD-Bericht, SPA) müssen formell durch festgelegte Rollen freigegeben werden. Diese Freigabe muss dokumentiert und auditierbar sein.

**Akzeptanzkriterien:**

- [ ] Pro Deliverable kann ein Freigabeworkflow konfiguriert werden (1- oder mehrstufig).
- [ ] Beim Einreichen werden definierte Reviewer benachrichtigt.
- [ ] Reviewer können kommentieren, freigeben oder zur Überarbeitung zurückweisen.
- [ ] Finaler Freigabestatus inkl. Datum und freigebender Person wird gespeichert.
- [ ] Eine Freigabehistorie ist je Deliverable einsehbar (auch im Audit-Trail L3).

**Abgrenzungen (Out of Scope):**

- Keine inhaltliche Online-Bearbeitung des Dokuments.
- Keine elektronische Signatur (gehört zu J3).

**Offene Fragen:**

- Müssen mehrstufige parallele Freigaben (Legal und Tax parallel) unterstützt werden?
- Soll die Freigabe an ein gesellschaftsrechtlich verbindliches Beschlussformat gekoppelt sein?
- Wie wird mit Rückweisungen umgegangen (neue Versionsnummer? siehe D3)?

**Definition of Ready:**

- [ ] Workflow-Varianten sind abgestimmt.
- [ ] Benachrichtigungsregeln liegen vor.

**Definition of Done:**

- [ ] Freigabe-Workflow funktioniert einstufig und mehrstufig.
- [ ] Audit-Trail enthält Freigaben.

**Abhängigkeiten:**

- D1 – Deliverable-Katalog
- B1 – Rollen
- L3 – Audit-Trail

**Betroffene Rollen:**

- PMO-Lead
- Workstream Leads
- Deal Lead
- Geschäftsführung (als Freigeber)

---

## Tech Design (Solution Architect) — 2026-07-03

> **Reuse-Klasse:** DUP→REUSE. **CIA-Review 2026-07-03: GO-mit-Auflagen** (A1–A8 unten sind verbindlich, in dieses Design gefaltet). Kein neuer voller CIA-Pass nötig, kein neues Dependency, keine offene Architekturentscheidung — der Fork ist durch **PROJ-100c** präzedenziert.

### Grundsatzentscheidung (der Fork)

Wir bauen die Freigabe als **eigene, parallele Datenschicht** (`deliverable_approval_*`), die die bewährten Bausteine von PROJ-31 **nachbaut** — Stufen-Approver, append-only Ereignis-Log, Unveränderlichkeit, (später) Magic-Link. Wir fassen die live `decision_*`-Engine von PROJ-31 **nicht** an. Genau so hat PROJ-100c (4-Augen-Freigabe) es gemacht. Grund: die Decision-Engine anzufassen hätte hohen Blast-Radius auf laufende Governance-Features; eine isolierte Kopie hat keinen.

**Warum überhaupt eine eigene RPC?** PROJ-104 hat den Deliverable-Status `approved` bewusst gesperrt: die öffentliche „Status ändern"-Funktion wirft einen Fehler, wenn jemand `approved` setzen will, und behandelt `approved` als Endzustand. Diese Sperre ist der Andockpunkt: nur ein interner, für alle Rollen gesperrter System-Helfer darf `approved` setzen — und der läuft ausschließlich, wenn der Freigabe-Workflow vollständig durchlaufen ist.

### Gelockter MVP-Scope (User + CIA)

1. **Sequenziell, ein- oder mehrstufig**, genau **ein Freigeber pro Stufe**. Stufe 2 öffnet erst, wenn Stufe 1 freigegeben hat. **Kein paralleles Quorum** (Legal ∥ Tax) im MVP → Followup.
2. **Rückweisung** setzt das Deliverable auf `in_progress` zurück, **keine neue Version** (Versionierung bleibt PROJ-106).
3. **Reine Deliverable-Freigabe**, keine Kopplung an einen gesellschaftsrechtlichen Beschluss (PROJ-111) → Followup.

### Zwei Sub-Slices (CIA-Auflage A6)

- **α — Interne Freigabe (voll auth-/RLS-testbar):** Freigeber sind **Stakeholder mit verknüpftem Benutzerkonto** (`linked_user_id`). Sie sehen ihre offene Freigabe in „My Work" und reagieren in der App. Komplett innerhalb von Auth + RLS testbar.
- **β — Externe Freigabe per Magic-Link:** unauthentifizierter HMAC-Token-Pfad (`/deliverable-approval/[token]`) + E-Mail über die bestehende `communication_outbox`, für Freigeber ohne Plattform-Account (z. B. Geschäftsführung). Eigene, fokussierte Angriffsflächen-Prüfung. **Falls der erste Pilot-Freigeber keinen Account hat, muss β vor dem Pilot rein** — die Trennung isoliert nur die externe Fläche sauber ab.

### Status-Fluss des Deliverables

```
in_progress ──(Lead: „bereit zur Review")──▶ in_review
   ▲                                             │
   │                                   (Lead: „zur Freigabe einreichen")
   │                                             ▼
   │                                     [Freigabe läuft: pending]
   │                                   Stufe 1 → Stufe 2 → … (sequenziell)
   │                                             │
   ├───────(Rückweisung in einer Stufe)─────────┤
   │                                             ▼
   │                                   (alle Stufen freigegeben)
   │                                             ▼
   └──────────────────────────────────────▶ approved  (Endzustand, System-Helfer)
```

Solange eine Freigabe **läuft (pending)**, ist der Deliverable-Status **eingefroren**: die normale „Status ändern"-Funktion verweigert Übergänge, bis die Freigabe zurückgezogen oder abgeschlossen ist (CIA-Auflage: verhindert „pending Freigabe auf suspended Deliverable"-Inkonsistenz).

### Datenmodell (Klartext, 3 neue Tabellen)

**Freigabe-Vorgang** (`deliverable_approvals`) — ein laufender Vorgang je Deliverable:
- gehört zu einem Deliverable (und damit Tenant/Projekt)
- Status: läuft / freigegeben / zurückgewiesen / zurückgezogen
- wer hat eingereicht, wann eingereicht, wann entschieden, welche Stufe ist gerade aktiv
- **maximal ein laufender Vorgang pro Deliverable** gleichzeitig

**Freigabe-Stufe** (`deliverable_approval_stages`) — die sequenziellen Stufen eines Vorgangs (bei Einreichung als Momentaufnahme angelegt, **nicht** als Vorlage — CIA-Auflage A2/Q2):
- Reihenfolge-Nummer (eindeutig je Vorgang)
- **ein Freigeber-Stakeholder** je Stufe (in α: muss ein verknüpftes Benutzerkonto haben)
- Antwort (offen / freigegeben / zurückgewiesen), Zeitpunkt, Kommentar
- (β) Magic-Link-Token + Ablauf

**Freigabe-Ereignis** (`deliverable_approval_events`) — lückenloses, **unveränderliches** Protokoll (eingereicht / Stufe reagiert / freigegeben / zurückgewiesen / zurückgezogen), mit Unveränderlichkeits-Schutz wie bei PROJ-31/100c. Dies ist die **Freigabehistorie** für AC5.

Alle drei Tabellen **erben die Vertraulichkeit** des Deliverables über die Need-to-know-Logik (`can_access_classified`), gespiegelt vom Muster der `deliverable_documents` — niemand sieht oder bearbeitet eine Freigabe zu einem Deliverable, das er nicht sehen darf.

### Server-Funktionen (WAS sie tun, keine Implementierung)

| Funktion | Rolle | Verhalten |
|---|---|---|
| **Zur Freigabe einreichen** | Lead/Admin | Precondition: Deliverable ist `in_review`. Legt Vorgang + Stufen + (β) Tokens an, protokolliert, benachrichtigt **nur** den Freigeber der aktiven Stufe. **SoD-Block:** ein Freigeber, dessen Konto = Einreicher, wird hart abgelehnt (CIA-Auflage A4). |
| **Auf Freigabe reagieren** | aktiver Freigeber | Nur zulässig, wenn es die **aktuelle** Stufe ist. Freigabe → nächste Stufe öffnen (+ benachrichtigen); letzte Stufe freigegeben → interner System-Helfer setzt Deliverable auf `approved`. Rückweisung → Vorgang „zurückgewiesen", Deliverable zurück auf `in_progress`. Der handelnde Nutzer wird **aus der Anmeldung abgeleitet** (`auth.uid()`), **nie** als Parameter übergeben (CIA-Auflage A2 — verhindert Identitäts-Fälschung wie im PROJ-94-Vorfall). Race-sicher über Sperre auf dem Vorgang. |
| **Freigabe zurückziehen** | Einreicher/Lead | Beendet einen laufenden Vorgang; Deliverable bleibt `in_review`. |
| **System-Helfer** (`_system_set_deliverable_status`) | intern, für **alle** Rollen gesperrt | Der einzige Weg, `approved`/`in_progress` zu setzen, den die öffentliche Status-Funktion blockt. Setzt vorher einen Audit-Grund (`proj105_approved`/`proj105_rejected`), damit der bestehende Audit-Trigger einen sinnvollen Eintrag schreibt. |

### Benachrichtigung (AC2)

- **α (intern):** offene Freigaben erscheinen in der **„My Work"-Inbox** (PROJ-64) — gespiegelt vom bestehenden Approvals-Muster (offene Zeile des Freigebers + laufender Vorgang). Die My-Work-Abfrage respektiert die Vertraulichkeit (kein Leak von Deliverable-Namen quer zur Freigabestufe — CIA R5).
- **β (extern):** E-Mail mit Magic-Link über die bestehende `communication_outbox`.

Es wird **immer nur der Freigeber der aktuell aktiven Stufe** benachrichtigt; die nächste Stufe erst, wenn die vorige freigegeben hat.

### Freigabehistorie & Audit (AC5 — CIA-Auflage A3)

Zwei sich ergänzende Quellen, **ohne** das generische Audit-Trio (`can_read_audit_entry` etc.) neu zu erzeugen:
1. Der Statuswechsel `→ approved` auf dem Deliverable wird bereits vom bestehenden Audit-Trigger erfasst (der `deliverables`-Zweig existiert schon).
2. Das granulare Wer/Wann/Kommentar-Protokoll lebt in der **eigenen `deliverable_approval_events`-Tabelle** mit eigener Lese-RLS (genau wie PROJ-100c seine `ma_clearance_request_events` surft).

Der neue Audit-Eintragstyp für die Events-Tabelle wird **non-destruktiv** in die Audit-CHECK-Liste injiziert (PROJ-100c-Muster), **nicht** durch Voll-Neuanlage der Liste (PROJ-104-Muster) — verhindert das Verlieren parallel hinzugefügter Typen (CIA-Auflage A1).

### Frontend-Oberfläche

- **Deliverables-Seite / Deliverable-Dialog:** neuer Abschnitt „Freigabe" je Deliverable — Stufen-Freigeber wählen, „Zur Freigabe einreichen", Live-Status je Stufe (offen/freigegeben/zurückgewiesen + Kommentar), „Zurückziehen". Reagier-Buttons (Freigeben/Zurückweisen/Kommentar) nur für den Nutzer, wenn er der **aktive** Freigeber ist.
- **My Work (PROJ-64):** offene Deliverable-Freigaben.
- **(β)** externe Seite `/deliverable-approval/[token]` analog `/approve/[token]`.

Kein neuer Nav-Eintrag nötig — die Freigabe hängt an der bestehenden Deliverables-Fläche.

### Verbindliche Hardening-Akzeptanzkriterien (aus CIA)

- **H1** Audit-CHECK-Typ **non-destruktiv** injizieren (nicht voll-recreaten). *(A1)*
- **H2** Kein `actor_user_id`-Parameter — Handelnder aus `auth.uid()`. Magic-Link-Impersonation (β) ausschließlich über separaten, für alle Rollen gesperrten System-Helfer, der nur von der token-validierten externen Route (service-role) aufgerufen wird. *(A2)*
- **H3** Freigabehistorie über eigene Events-Tabelle + eigene RLS; generisches `can_read_audit_entry`-Trio **nicht** anfassen. Falls doch nötig: LIVE-Def rekreieren **+ `authenticated`-Grant re-emittieren** + in derselben Migration verifizieren. *(A3)*
- **H4** Alle Schreib-Funktionen `revoke from public, anon`; nur einreichen/reagieren/zurückziehen an `authenticated`; System-Helfer von **allen** Rollen gesperrt. *(H4)*
- **H5** Unveränderlichkeits-Trigger auf der Events-Tabelle (Spiegel PROJ-100c). *(H5)*
- **H6 — Live-RPC-Smoke Pflicht gegen Prod, 0 Residue** (7 Vektoren): mehrstufiger Happy-Path → Deliverable-Status `approved` in Prod · SoD-Block · Nicht-Freigeber-Block · Nicht-aktive-Stufe-Block · Pending-Freeze auf Status-Funktion · Vertraulichkeits-Gate · anon-Revoke · Ereignis-Unveränderlichkeit. *(A5)*
- **H7** `gitnexus_impact` auf `transition_deliverable_status` **vor** dem Gate-Patch; Verhalten außer dem Pending-Freeze byte-identisch; PROJ-104-QA muss grün bleiben. *(A7)*

### Bekannte Grenze (CIA-Auflage A8)

`approved` ist in PROJ-104 ein **Endzustand**. Ein bereits freigegebenes Deliverable, das nachbearbeitet werden muss, hat im MVP **keinen Rückweg** — das ist PROJ-106-Territorium (Versionierung). Bewusst so, um Pilot-Überraschungen zu vermeiden hier dokumentiert.

### Dependencies

**Keine neuen.** (β) spiegelt die HMAC-Token-Logik von `src/lib/decisions/approval-token.ts` in eine kleine eigene Modul-Kopie — bewusst **keine** Generalisierung der PROJ-31-Lib (null Blast-Radius auf live PROJ-31).

### Abgrenzung / Followups

- Paralleles Quorum (Legal ∥ Tax gleichzeitig, M-von-N) — Followup (PROJ-31-Quorum-Muster macht es später sauber).
- Neue Version bei Rückweisung — PROJ-106.
- Kopplung an gesellschaftsrechtlichen Beschluss — PROJ-111.
- Persistente Freigabe-Vorlagen je Deliverable-Typ — PROJ-96.
- Elektronische Signatur — Epic J3 (bereits Out-of-Scope in der Spec).

### Handoff

α zuerst: `/backend` (Migration + RPCs + APIs + Live-RPC-Smoke) → `/frontend` (Freigabe-Abschnitt + My-Work) → `/qa` (7 Hardening-Vektoren + Playwright). β (Magic-Link) als eigene Sub-Slice danach, mit separatem Pentest.

---

## Implementation Notes

### α /backend gebaut 2026-07-03 (in eigener Worktree `../projektplattform_v3-proj105`, Branch `proj-105/backend`)

**Migration `20260703130000_proj105_deliverable_approvals` — in Prod-DB angewendet (project iqerihohwabyjzkpcujq).**
- 3 Tabellen: `deliverable_approvals` (Workflow-Instanz, partial-unique max 1 pending je Deliverable), `deliverable_approval_stages` (sequenzielle Stufen, 1 Approver/Stufe, `magic_link_token`/`_expires_at` β-forward), `deliverable_approval_events` (append-only + Immutability-Trigger `enforce_deliverable_approval_event_immutability`).
- RLS SELECT auf allen 3 über Join auf `deliverables` mit `is_project_member` + `can_access_classified` (Need-to-know, Muster `deliverable_documents`). Schreiben ausschließlich über SECURITY-DEFINER-RPCs (kein INSERT/UPDATE/DELETE-Policy → default-deny).
- 4 RPCs: `submit_deliverable_for_approval(uuid, uuid[])` (Precondition in_review, Rolle lead/admin, Need-to-know, α-Approver = Projekt-Member mit `linked_user_id`, **SoD harter Block** submitter≠approver), `record_deliverable_approval_response(uuid, text, text)` (**H2: kein actor-Param → auth.uid()**, advisory-lock, nur aktive Stufe, letzte Stufe→approved / reject→in_progress), `withdraw_deliverable_approval(uuid)`, `_system_set_deliverable_status(uuid, text)` (von ALLEN Rollen revoked; einziger Weg zum von PROJ-104 gesperrten `approved`; setzt `audit.change_reason` proj105_approved/proj105_rejected → bestehender Deliverable-Update-Trigger auditiert AC5).
- **Gate-Patch** `transition_deliverable_status`: byte-identisch zur PROJ-104-Def + Pending-Freeze-Guard (raist nur wenn eine pending Freigabe existiert → **H7**: alle Bestands-Transitions unverändert; Blast-Radius = einziger Caller `status/route.ts`).
- **H1/H3 erfüllt ohne Audit-Trio-Anfassen:** Freigabe-Historie lebt in der eigenen events-Tabelle → weder `audit_log_entity_type_check` noch `can_read_audit_entry` rekreiert (kein Re-Grant-Risiko). Deliverable-`status→approved` läuft über den bestehenden `deliverables`-Audit-Zweig.

**API (4 Routen):** `…/deliverables/[did]/approval` (GET Liste+Historie / POST submit), `…/approval/respond` (POST), `…/approval/withdraw` (POST), `…/dashboard/deliverable-approvals` (GET My-Work aktive-Stufe-Surface, AC2, RLS-vertraulichkeitsgefiltert). Client-Wrapper `src/lib/ma-project/deliverable-approvals-api.ts`, Typen `src/types/deliverable-approval-workflow.ts`.

**Gates:** ESLint 0; tsc 14 baseline/**0 neu**; vitest **2235/2235** (+21 neue Route-Tests); build clean (12.4s, alle 4 Routen registriert). Security-Advisors 0 ERROR / 0 rls_disabled — die einzigen Findings auf neuen Objekten sind die von PROJ-100c akzeptierten Muster (`0029` SECURITY-DEFINER-executable-by-authenticated by design; `0011` search_path auf der pure-`raise`-Immutability-Trigger-Funktion, identisch zu `enforce_clearance_event_immutability`).

**H6 Live-RPC-Smoke (Pflicht) gegen Prod — `tests/sql/PROJ-105-deliverable-approvals-pentest.sql`, 11/11 PASS, 0 Residue:** submit(2 Stufen pending) · A mehrstufiger Happy-Path → **Deliverable `approved` in Prod** (events=4) · B SoD-Block · C1 Nicht-aktive-Stufe-Block · C2 Nicht-Approver-Block · D Pending-Freeze · E 1/2 pending + Deliverable bleibt in_review · F Need-to-know (nicht-cleared Member sieht strict-Approval nicht) · G anon-Execute-Revoke · H Event-Immutability · I Cross-Tenant-Isolation.

### α /frontend gebaut 2026-07-03 (gleiche Worktree/Branch `proj-105/backend`)

- **Freigabe-Sheet** `src/components/projects/ma/deliverable-approval-sheet.tsx` (shadcn `Sheet`): laufende Freigabe (Stufenliste mit Status-Badge je Stufe, aktive Stufe hervorgehoben), Reagier-Block (Freigeben/Zurückweisen + Kommentar) **nur** für den aktiven Freigeber (`stakeholder.linked_user_id === currentUser`), Zurückziehen (Einreicher/Lead/Admin), Einreichen-Formular (sequenzielle Freigeber-Picker aus Stakeholdern mit `linked_user_id`, „+ Stufe", nur bei `in_review` + `canManage`), und **Freigabehistorie** (alle Vorgänge + Events, AC5).
- **Deliverables-Seite** `deliverables-page.tsx`: neue „Freigabe"-Aktion (ShieldCheck) je Zeile (für alle Mitglieder sichtbar — Approver brauchen sie), Sheet-Verdrahtung, Stakeholder-Fetch, `canManage = useProjectAccess(manage_members)`, Deep-Link-Auto-Open via `?freigabe=<deliverable_id>` (ref-guarded, `window.location`, kein `useSearchParams`/Suspense).
- **My-Work-Surface (AC2):** Hook `use-my-deliverable-approvals.ts` + Panel `deliverable-approval-inbox-panel.tsx` (Card „Deliverable-Freigaben", nur aktive-Stufe-Zeilen des aktuellen Users), in `dashboard-client.tsx` in alle 3 Presets neben dem Decision-Approvals-Panel eingehängt; Klick → `/projects/{id}/deliverables?freigabe=…`.
- shadcn-first (Sheet/Select/Button/Badge/Textarea/Label/Card), kein neues Dep. Deep-Link/one-shot-Effekte über die etablierte `eslint-disable react-hooks/set-state-in-effect`-„one-shot"-Konvention (Präzedenz: `clearance-profile-form-dialog`, `stakeholder-proposal-tab`).
- **Gates:** ESLint 0; tsc 14 baseline/**0 neu**; vitest **2235/2235** (unverändert — UI-Pfade werden in `/qa` per Playwright abgedeckt, konsistent mit den Geschwister-Slices); build clean (12.3s, alle Routen registriert).

**Offen:** `/qa` (Playwright-Auth-Gates auf den 4 Routen + Freigabe-Sheet-Smoke + Live-Pentest-Re-Run `tests/sql/PROJ-105-deliverable-approvals-pentest.sql`). β Magic-Link als eigene Sub-Slice danach.

---

## QA Test Results — 2026-07-03 (α)

**Verdikt: PRODUCTION-READY — 0 Critical / 0 High.**

### Akzeptanzkriterien (Spec)
- **AC1 (1-/mehrstufiger Workflow konfigurierbar):** ✅ sequenzielle Stufen bei Einreichung, 1 Freigeber/Stufe; Live-Pentest `submit` (2 Stufen pending) + mehrstufiger Durchlauf.
- **AC2 (Reviewer werden benachrichtigt):** ✅ My-Work-Panel „Deliverable-Freigaben" (nur aktive-Stufe-Zeilen des Users, RLS-vertraulichkeitsgefiltert) + Deep-Link ins Freigabe-Sheet. (β: E-Mail-Magic-Link separat.)
- **AC3 (kommentieren / freigeben / zurückweisen):** ✅ Reagier-Block im Sheet (nur aktiver Freigeber) + Kommentar; Live-Pentest E (1/2 pending) + A (final → approved) + reject-Pfad.
- **AC4 (finaler Freigabestatus + Datum + Person):** ✅ `deliverable_approvals.status/decided_at` + Deliverable `status='approved'` via `_system`-Helfer (Live: `deliv=approved`); Event `approved` mit `actor_user_id`.
- **AC5 (Freigabehistorie je Deliverable, auch Audit-Trail):** ✅ append-only `deliverable_approval_events` (Sheet-Historie) + Deliverable-`status→approved` über bestehenden PROJ-10-Audit-Trigger (`audit.change_reason=proj105_approved`).

### Hardening-ACs
- **H1** kein Audit-CHECK/Trio angefasst (Historie eigene Tabelle) ✅ · **H2** `record_response` ohne actor-Param, `auth.uid()` ✅ (Live C1/C2) · **H3** kein `can_read_audit_entry`-Recreate → kein Re-Grant-Risiko ✅ · **H4** Schreib-RPCs revoke public/anon; `_system` all-roles-revoked ✅ (Live G + Red-Team J) · **H5** Event-Immutability ✅ (Live H) · **H6** Live-RPC-Smoke ✅ · **H7** Pending-Freeze byte-identisch sonst ✅ (Live D).

### Live-RPC-Pentest gegen Prod — `tests/sql/PROJ-105-deliverable-approvals-pentest.sql`, **11/11 PASS, 0 Residue**
submit · A mehrstufiger Happy-Path → **Deliverable `approved` in Prod** (events=4) · B SoD-Block · C1 Nicht-aktive-Stufe · C2 Nicht-Approver · D Pending-Freeze · E 1/2 pending + in_review · F Need-to-know (nicht-cleared Member sieht strict nicht) · G anon-Revoke · H Event-Immutability · I Cross-Tenant.

### Red-Team-Zusatz (Bypass-Vektoren) gegen Prod — **J–M 4/4 PASS, 0 Residue**
- **J** Auch ein **Admin** kann `_system_set_deliverable_status(…,'approved')` NICHT direkt aufrufen (Deliverable bleibt `in_review`) — der reservierte `approved`-Bypass ist geschlossen.
- **K** Direkter INSERT in `deliverable_approvals` (gefälschte Freigabe) durch `authenticated` → RLS-deny.
- **L** Direkter UPDATE einer Stage-`response` (Vote-Fälschung) durch `authenticated` → RLS-deny (0 Zeilen).
- **M** Nicht-autorisiertes Mitglied kann laufende Freigabe nicht zurückziehen (42501, bleibt pending).

### E2E / Regression
- Playwright `tests/PROJ-105-deliverable-approval.spec.ts` **6/6 chromium** (Auth-Gates auf allen 4 neuen Routen + My-Work-Route + `?freigabe=`-Deep-Link-Seite). **D-1:** Mobile-Safari skipped (WebKit-Host-Libs fehlen — bekanntes Env-Issue PROJ-67/F2, kein Produkt-Bug).
- vitest **2235/2235**; ESLint 0; tsc 14 baseline/0 neu; build clean.
- Supabase-Advisors: 0 ERROR / 0 rls_disabled. **Info (akzeptiert, PROJ-100c-präzedenziert):** `0029` (SECURITY-DEFINER executable-by-authenticated — by design, RPCs gaten intern) auf submit/record/withdraw; `0011` (search_path) auf der pure-`raise`-Immutability-Trigger-Funktion (identisch zu `enforce_clearance_event_immutability`).

**Bugs:** keine (0 Critical / 0 High / 0 Medium / 0 Low). **Empfehlung:** Approved → `/deploy`. β Magic-Link (externe Freigeber) als eigene Sub-Slice mit separatem Pentest.

### Deploy — 2026-07-05

**Deployed: Tag `v2.10.0-PROJ-105`** auf `b583f9a` (PR #234 squash-merge → main). Migration `20260703130000` seit `/backend` in Prod. Merge-Tree-Gates grün (vitest 2255/2255, ESLint 0, build clean); Required-Checks (Schema-Drift, Migration-Naming, SELECT-Columns, npm-audit, Snyk) grün. Vercel-Prod-Deploy von b583f9a READY. **Post-Deploy-Smoke: 6/6 = 307 Auth-Gate** (approval GET/POST · respond · withdraw · dashboard/deliverable-approvals · `?freigabe=`-Deep-Link-Seite). Kein neues Dep/Env. β Magic-Link (externe Freigeber) offen — vor dem Pilot einplanen, falls Freigeber ohne Plattform-Account.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · D — Deliverables & Artefakte_
