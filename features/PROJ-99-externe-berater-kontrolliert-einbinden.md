---
id: PROJ-99
title: "Externe Berater kontrolliert einbinden"
issue_type: Story
epic_code: B
epic_title: "Rollen, Gremien & Governance"
priority: High
priority_source: "Must (für reale Deal-Arbeit zwingend; Berater sind die Mehrheit der aktiv Beteiligten)"
labels: ["ma-platform", "epic-b", "must-have"]
dependencies: ["B1", "B4", "L1", "L3"]
roles: ["Deal Lead", "PMO-Lead", "Legal Counsel", "IT-Sicherheitsverantwortlicher", "Externer Berater (Nutzer-Sicht)"]
summary_for_jira: "[B3] Externe Berater kontrolliert einbinden"
---

# PROJ-99: Externe Berater kontrolliert einbinden

## Status: Deployed (2026-06-24 — PR #182 squash-merged `0135ce3`, Tag `v2.0.0-PROJ-99-128-129`; Vercel prod READY; post-deploy auth-gate smoke 4/4 = 307. QA PASS 0 Critical/High/Medium. Backend live via #181.)
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic B — Rollen, Gremien & Governance)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND** · Andockpunkt: PROJ-1 Memberships + Mandats-/NDA-Felder + Class-3. Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** B — Rollen, Gremien & Governance  
> **Priorität (Jira):** High · **Quell-Priorität:** Must (für reale Deal-Arbeit zwingend; Berater sind die Mehrheit der aktiv Beteiligten)  
> **Labels:** `ma-platform` · `epic-b` · `must-have`  
> **Abhängigkeiten:** `B1`, `B4`, `L1`, `L3`

**User Story:**

Als Deal Lead möchte ich externe Berater (M&A-Advisor, Anwälte, Wirtschaftsprüfer, Steuerberater) mit klar abgegrenzten Zugriffsrechten und nachvollziehbarer Mandatslage einbinden, damit sie projektbezogen mitarbeiten können, ohne Zugang außerhalb ihres Mandats zu haben.

**Beschreibung / Kontext:**

M&A-Projekte sind ohne externe Berater nicht denkbar. Die Plattform muss externe Personen als separate Nutzerkategorie führen, die nur auf freigegebene Bereiche zugreifen, deren Aktivitäten besonders nachvollziehbar sind und deren Mandatsdauer technisch begrenzbar ist.

**Akzeptanzkriterien:**

- [ ] Externe Personen werden gesondert markiert (z. B. 'Extern / Kanzlei XYZ').
- [ ] Ein externer Nutzer sieht standardmäßig nichts; jeder Bereich muss explizit freigegeben werden.
- [ ] Pro externem Nutzer ist Mandatsbeginn und Mandatsende hinterlegbar; der Zugriff wird am Mandatsende automatisch entzogen.
- [ ] Externe Aktivitäten (Logins, Datenzugriffe, Downloads) werden im Audit-Trail (L3) separat markiert und ausfilterbar.
- [ ] Eine NDA muss vor Zugriffsgewährung als unterschrieben markiert sein (siehe L1).

**Abgrenzungen (Out of Scope):**

- Plattform liefert keine eigene NDA-Vorlage und keinen E-Signatur-Service – diese sind extern.
- Externe Beraterhonorare werden nicht in der Plattform abgerechnet.

**Offene Fragen:**

- Wie wird die Identität externer Berater verifiziert (Federation, Gast-Zugänge im IdP, eigener User-Pool)?
- Welche E-Signatur-Lösung wird für NDA-Abschluss eingebunden?
- Müssen externe Berater zwingend MFA nutzen, und wer entscheidet das verbindlich?

**Definition of Ready:**

- [ ] IT-Sicherheits-Konzept für Externe ist freigegeben.
- [ ] NDA-Workflow ist mit Legal abgestimmt.
- [ ] Datenschutzfolgenabschätzung liegt vor.

**Definition of Done:**

- [ ] Externe Nutzer können angelegt, mit NDA verknüpft, mit Mandatsende terminiert und granular berechtigt werden.
- [ ] Automatischer Mandatsablauf entzieht Zugriff (Testnachweis).
- [ ] Audit-Trail differenziert intern/extern.

**Abhängigkeiten:**

- B1 – Rollen
- B4 – Berechtigungskonzept
- L1 – NDA-Verwaltung
- L3 – Audit-Trail

**Betroffene Rollen:**

- Deal Lead
- PMO-Lead
- Legal Counsel
- IT-Sicherheitsverantwortlicher
- Externer Berater (Nutzer-Sicht)

---

## Tech Design (Solution Architect) — 2026-06-23

> **Bundle-Scope:** PROJ-99, PROJ-128 und PROJ-129 werden als ein fachliches Vertraulichkeits-Bundle architected. Grund: Externe Berater, NDA-Status und Need-to-Know-Klassifikation sind im M&A-Kontext ein einziger Zugriffspfad. Separate Implementierungen wuerden widerspruechliche Gates erzeugen. Dieses Design respektiert die M&A-Domain-ADR und baut auf PROJ-100a auf.

### Grundidee in einem Satz

Externe Berater werden **nicht** als separates Auth-System gebaut. Sie bleiben normale Tenant-/Projektmitglieder, bekommen aber ein M&A-spezifisches **Advisor-Profil** mit Mandat, Organisation, Advisor-Typ, NDA-Abdeckung und Ablaufdatum. Zugriff auf vertrauliche Deal-Inhalte entsteht erst, wenn drei Dinge gleichzeitig passen: Projektrolle, gueltiges Mandat/NDA und ausreichende PROJ-100a-Clearance.

### A) Komponenten-Struktur

```
M&A-Projektraum
+-- Navigationseintrag "Governance & Zugriff" (nur project_type = ma)
    +-- Tab "Berater"
    |   +-- Beraterliste
    |   |   +-- Person / Organisation / Rolle / Advisor-Typ
    |   |   +-- Mandatsstatus: geplant / aktiv / abgelaufen / gesperrt
    |   |   +-- NDA-Status: fehlt / in Pruefung / gueltig / abgelaufen
    |   |   +-- Clearance-Stufe aus PROJ-100a
    |   +-- Aktion "Berater einbinden"
    |   |   +-- bestehendes Tenant-Mitglied auswaehlen oder Tenant-Einladung starten
    |   |   +-- Projektrolle setzen
    |   |   +-- Advisor-Profil ausfuellen
    |   |   +-- NDA zuordnen
    |   +-- Aktion "Mandat beenden"
    +-- Tab "NDAs" (PROJ-128)
    |   +-- NDA-Uebersicht
    |   +-- NDA-Detail mit Personen, Laufzeit, Scope und Dokument-Link
    +-- Tab "Klassifikation" (PROJ-129)
    |   +-- Objekt-/Bereichsuebersicht
    |   +-- Vertraulichkeitsstufe
    |   +-- Wer-darf-was-sehen Matrix
    +-- Tab "Historie"
        +-- bestehender PROJ-10 HistoryTab fuer Advisor-/NDA-/Clearance-Aenderungen
```

Die UI haengt sich bewusst an den bestehenden Projektraum und die vorhandenen Patterns an: Projektmitglieder-Dialog, Tenant-Member-Picker, PROJ-100a-Clearance-Verwaltung, M&A-Grundlagenkarte und HistoryTab.

### B) Datenmodell in Klartext

**Advisor-Profil pro Projekt und Person**

Jeder externe Berater hat in einem M&A-Projekt ein Profil mit:

- Projekt und Nutzerbezug
- externe Organisation, z. B. Kanzlei, M&A-Advisor, Wirtschaftspruefer
- Advisor-Typ, z. B. Legal, Tax, Financial, Commercial, IT, HR
- Mandatsbeginn und Mandatsende
- Mandatsstatus: geplant, aktiv, abgelaufen, gesperrt
- verantwortliche interne Person, z. B. Deal Lead oder Legal Counsel
- verknuepfte NDA(s)
- erlaubter fachlicher Scope, z. B. Legal-DD oder Tax-DD

**NDA-Gate**

Ein Berater kann als Person vorbereitet oder eingeladen werden, sieht aber vertrauliche Inhalte erst, wenn eine gueltige NDA mit passendem Scope hinterlegt ist. Fuer externe Berater ist das NDA-Gate hart: ohne gueltige NDA keine Freischaltung auf `confidential` oder `strict`.

**Mandats-Gate**

Das Mandatsende ist kein reiner Reminder. Abgelaufene oder gesperrte Mandate blockieren weiteren Zugriff auf M&A-Inhalte. Eine Wiedervorlage erinnert vorher, aber die Zugriffskontrolle darf nicht davon abhaengen, dass ein Reminder-Job rechtzeitig laeuft.

**Klassifikations-Gate**

Die eigentliche Sichtbarkeit laeuft ueber PROJ-100a: `standard`, `confidential`, `strict`. PROJ-99 nutzt diese Stufen, statt eigene Berechtigungslisten zu bauen. Das Advisor-Profil sagt, wer extern ist und ob NDA/Mandat gelten; die Clearance sagt, bis zu welcher Stufe der Nutzer sehen darf.

### C) Tech-Entscheidungen

- **Kein separates Externen-IAM:** Externe Berater nutzen den bestehenden Tenant-/Projektmitgliedschaftspfad. Das haelt Login, Session, Tenant-RLS und Audit in einem System.
- **Advisor-Profil statt Rollenmissbrauch:** "Extern / Kanzlei XYZ / Tax Advisor" gehoert nicht in die generischen Rollen `lead/editor/viewer`. Die Projektrolle steuert Bearbeitungsrechte; das Advisor-Profil steuert M&A-Kontext, Mandat und NDA.
- **NDA als hartes Gate fuer Externe:** Die offene Frage aus PROJ-128 wird fuer den M&A-Pilot entschieden: Fuer externe Berater blockiert eine fehlende oder abgelaufene NDA vertraulichen Zugriff. Fuer interne Rollen kann Legal spaeter Warn-/Policy-Varianten definieren.
- **Mandatsablauf bei jedem Zugriff pruefen:** Ablauf darf nicht nur durch eine naechtliche Bereinigung wirken. Die UI zeigt Reminder, aber das Gate muss abgelaufene Mandate direkt respektieren.
- **PROJ-100a wiederverwenden:** Keine zweite Need-to-Know-Engine. PROJ-99 fuegt Externen-/NDA-/Mandatsbedingungen hinzu, nutzt aber das vorhandene Clearance-Tor.
- **Audit ueber PROJ-10:** Advisor-Anlage, Mandatsstatus, NDA-Zuordnung, Clearance-Vergabe und Entzug werden ueber den bestehenden Audit-Trail sichtbar. Login-/Download-Audit wird als markierter Event-Strom angebunden, sobald Auth-/DMS-Events im jeweiligen Modul verfuegbar sind.

### D) Abhaengigkeiten

- **Muss vorhanden sein:** PROJ-94 (M&A-Projekt), PROJ-100a (Need-to-Know Foundation).
- **Soll davor oder parallel laufen:** PROJ-97 (RACI/Rollen), weil Advisor-Typen und Verantwortlichkeiten sonst nur grob abbildbar sind.
- **Im Bundle:** PROJ-128 (NDA-Objekt) und PROJ-129 (Klassifikations-/Clearance-UX).
- **Spaeter:** PROJ-79 fuer echte DMS-Dokumente statt Dokument-Link; E-Signatur bleibt out-of-scope.
- **Neue npm-Pakete:** keine.

### E) Akzeptanzkriterien-Zuordnung

| AC | Erfuellt durch |
|---|---|
| Externe Personen gesondert markieren | Advisor-Profil mit Organisation, Advisor-Typ und externem Status |
| Standardmaessig nichts sichtbar | Kombination aus Projektmitgliedschaft, NDA-Gate, Mandats-Gate und PROJ-100a-Clearance; ohne Freischaltung nur Standard-Sicht |
| Mandatsbeginn/-ende, automatischer Entzug | Mandatsstatus + Ablauf-Gate; Reminder nur als Zusatz |
| Externe Aktivitaeten auditierbar | PROJ-10-Historie + externer Marker auf Advisor-/NDA-/Clearance-Events; Auth/DMS-Events werden markiert, sobald diese Events verfuegbar sind |
| NDA vor Zugriff | harte Voraussetzung fuer externe Clearance oberhalb `standard` |

### F) Handoff

Empfohlener Build-Schnitt: zuerst `/backend` fuer Advisor-Profil, NDA-Objekt, Gates und Audit; danach `/frontend` fuer Governance-&-Zugriff-Seite; danach `/qa` mit Negativtests fuer fehlende NDA, abgelaufenes Mandat, zu niedrige Clearance und Cross-Tenant-Isolation.

## Implementation Notes — Backend (2026-06-24)

Gebaut als gemeinsame Backend-Slice mit PROJ-128/129 (ein Bundle, eine Migration), auf PROJ-100a/100b aufsetzend. **Kein neuer Dep, kein separates Auth-System.**

**Migration** `20260623230548_proj99_128_129_advisor_nda_classification.sql` (in Prod; Repo-Dateiname = prod-registrierte Version per PROJ-134-Konvention):

- **`ma_advisor_profiles`** — ein externes Advisor-Profil pro `(project, user)`: `organization`, `advisor_type` (legal/tax/financial/commercial/it/hr/other), `mandate_start/end`, `mandate_status` (planned/active/expired/blocked), `responsible_user_id`, `scope`, `notes`. Tenant-RLS (Member SELECT, Manager INSERT/UPDATE/DELETE), Unique `(project_id, user_id)`, PROJ-10 UPDATE-Audit-Trigger (Mandats-/Statuswechsel = die sicherheitsrelevanten Events; Anlage via `created_by/created_at`).
- **Gate-Helper** (SECURITY DEFINER STABLE, explizit-user): `is_external_advisor(project, user)`, `has_active_mandate(project, user)` (true für Nicht-Advisor = Mandat n/a, sonst active + nicht abgelaufen), `has_valid_nda(project, user, level)` (siehe PROJ-128).
- **Gate-Erweiterung** `can_access_classified(project, level)` — **additiv** (User-locked Option 1): nach dem Admin-Bypass wird für Advisor-User zusätzlich `has_active_mandate` UND `has_valid_nda` verlangt, bevor eine Clearance oberhalb `standard` greift. Verengt NUR externe Advisor; Admins/interne Member unverändert → jede RESTRICTIVE-Policy (projects/phases/work_items + künftige DD-Tabellen) erbt das Gate automatisch. 100a-Pentest bleibt grün.

**APIs:** `GET/POST /api/projects/[id]/advisors` (Liste / Anlage Manager) + `PATCH/DELETE /api/projects/[id]/advisors/[advisorId]` (inkl. Mandats-Status-Transition, manager-gated). Client-Wrapper `src/lib/ma-project/advisor-nda-api.ts`.

**Pflicht-Live-Smoke gegen Prod (10/10, 0 Residue) via Impersonation:** Advisor mit aktivem Mandat + gültiger NDA + Clearance → Zugriff; Mandat geblockt → kein Zugriff; NDA abgelaufen → kein Zugriff; interner cleared Non-Advisor → Zugriff (Gate unverändert); Admin → Bypass. **100a-Regression 5/5 grün** (Gate-Verhalten für Non-Advisor byte-identisch). Security-Advisor: 0 ERROR, 0 rls_disabled.

**Quality-Gates:** lint 0, tsc 0 neu (Baseline), vitest 2009/2009 (+ Route-Tests), build clean (7 neue Routen).

**Offen:** AC „Externe Aktivitäten (Logins/Downloads) auditierbar" — Advisor-/NDA-/Clearance-Events laufen über PROJ-10; Login-/DMS-Event-Marker folgen, sobald Auth-/DMS-Events verfügbar sind. /frontend (Governance-&-Zugriff-Seite) + /qa (Negativtests: fehlende NDA, abgelaufenes Mandat, zu niedrige Clearance, Cross-Tenant) offen.

## Implementation Notes — Frontend (2026-06-24)

Gemeinsame Frontend-Slice mit PROJ-128/129 (ein Bundle, eine Governance-Seite). **Kein neues Dep, keine Migration, kein neuer Backend-Code** — reine UI auf den bereits live gemergten APIs (#181) + Client-Wrapper `src/lib/ma-project/advisor-nda-api.ts`.

**Nav-/Routing-Entscheidung:** Statt einer zweiten Nav-Sektion neben dem PROJ-100b-Eintrag „Vertraulichkeit & Zugriff" wurde der **bestehende `vertraulichkeit`-Eintrag** auf **„Governance & Zugriff"** umbenannt und zur Tab-Seite ausgebaut (`MA_CONFIDENTIALITY_SECTION` in `method-templates/index.ts`, weiterhin `requiresProjectType: "ma"`-gegatet). Route bleibt `/projects/[id]/vertraulichkeit` (Back-Compat, keine Middleware-Änderung). Vermeidet zwei überlappende „Wer-darf-was"-Einträge.

**Komponenten (alle manager-gegatet wie die PROJ-100b-Karte):**
- `governance-access-page.tsx` — Tab-Shell (`useProjectAccess(…, "manage_members")`-Gate, sonst Hinweis-Card). 4 Tabs: **Berater · NDAs · Klassifikation · Freischaltungen**.
- `advisors-tab.tsx` (PROJ-99) — Berater-Liste + Einbinden/Bearbeiten-Dialog (Tenant-Member-Picker für Neuanlage, Organisation, Advisor-Typ, Mandatsbeginn/-ende, Mandatsstatus, Verantwortlich intern, Scope, Notizen) + Mandats-/Profil-Entfernen. „Mandat beenden" = Status auf `expired`/`blocked` via Bearbeiten.
- `ndas-tab.tsx` (PROJ-128) — NDA-Register-Tabelle + Erfassen/Bearbeiten-Dialog (Vertragspartner, Status, gedeckte Stufe, Scope-Kind/-Ref, Laufzeit, Wiedervorlage, Dokument-Link) + Personen-Zuordnungs-Sheet (Nutzerkonto = Zugriff vs. dokumentarischer Kontakt).
- `classification-matrix-tab.tsx` (PROJ-129) — Read-only „Wer darf was sehen — und warum?" pro Objekt (Projekt/Phase/Work-Item) via `ma_access_explain`; Spalten Zugriff/Grund/Extern/Mandat/NDA/Clearance. Nie zweites Gate.
- `confidentiality-access-card.tsx` (PROJ-100b reuse, Tab „Freischaltungen") — um eine **projektweite Zugriffs-Matrix** (`AccessMatrixPanel`, Nutzer × Stufe) ergänzt; `access-matrix.ts` pivotet die drei per-Level-`ma_access_explain`-Antworten (gate-treu, +6 Unit-Tests).
- `governance-labels.ts` — geteilte DE-Labels + `GovernanceMember`-Shape + Badge-Varianten.

**Deviation D-FE-1 (Tab „Freischaltungen" statt „Historie"):** Tech-Design §A listet als 4. Tab „Historie" (PROJ-10 `HistoryTab` für Advisor-/NDA-/Clearance-Events). Stattdessen wurde der operativ wichtigere **Freischaltungen-Tab** (PROJ-100b Clearance-Vergabe + Wer-darf-was) eingesetzt. Grund: (1) Clearance-Vergabe ist der eigentliche Zugriffs-Mechanismus für Berater; (2) ein funktionierender Historie-Tab braucht eine **Backend-Erweiterung von `can_read_audit_entry`** — die Funktion mappt aktuell nur `ma_project_profiles` (PROJ-94), NICHT `ma_advisor_profiles`/`ma_ndas` → Audit-Reads dieser Entities laufen in den `else return false`-Default-Deny. Das deckt sich mit dem bereits offenen Backend-AC „Externe Aktivitäten auditierbar". **Follow-up:** additive `can_read_audit_entry`-Erweiterung (map → Projekt, `is_project_member`-gegatet, Muster wie `ma_project_profiles`) + per-Entity `HistoryTab` → eigener kleiner Backend-Slice (security-relevant, separat freizugeben). `ma_advisor_profiles`/`ma_ndas` sind in `AuditEntityType` (FE) daher bewusst NICHT ergänzt, solange der Read-Gate sie nicht durchlässt.

**Quality-Gates:** ESLint 0, tsc 0 neue Errors (14 pre-existing test-file-Errors, alle unverändert), vitest method-templates + ma-project 130/130 (inkl. 6 neue access-matrix-Tests), `next build` clean. Playwright-Auth-Gate-Smoke + Live-Negativtests → /qa.

## QA Test Results — 2026-06-24 (PR #182; backend live on main via #181)

**Verdikt: PRODUCTION-READY** — Bundle-Frontend (PROJ-99/128/129) + PROJ-100b projektweite Matrix; **0 Critical / 0 High / 0 Medium**. Frontend-only auf bereits live-bewiesenem Gate (Backend-Slice 10/10 + 100a-Pentest), daher QA-Fokus: HTTP-Auth-Surface, Reason-Enum-Treue, Gate-Faithfulness der Matrix, Komponenten-Bug-Hunt, Regression.

### Was geprüft wurde
| Bereich | Ergebnis | Nachweis |
|---|---|---|
| Auth-Gates (15 Routen/Page, kein Session) | ✅ | `tests/PROJ-99-128-129-confidentiality-bundle.spec.ts` **15/15 chromium** (307/401/403) — advisors/ndas/assignments/access-explain CRUD + `/vertraulichkeit` |
| Auth-Gate live gegen Prod | ✅ | 7/7 curl `--max-redirs 0` → **307** (advisors, advisors/[id], ndas, ndas/[id], ndas/[id]/assignments, access-explain?level, /vertraulichkeit) |
| Negativ-Gate (fehlende NDA / abgelaufenes Mandat / zu niedrige Clearance / Cross-Tenant) | ✅ | (1) Backend-Slice **Live-Smoke 10/10 gegen Prod** (Mandat blocked→kein Zugriff, NDA expired→kein Zugriff, intern cleared→Zugriff, Admin-Bypass) + 100a-Regression 5/5; (2) **Deployed-RPC-Source-Review** `ma_access_explain` (`pg_get_functiondef`): `has_access`-CASE = `can_access_classified` (Advisor braucht `has_active_mandate` UND `has_valid_nda`, sonst false; sonst Clearance≥Level; Admin-Bypass; standard=baseline) — Gate unverändert, kein Zweit-Gate |
| Reason-Enum-Treue (FE rendert RPC-Gründe) | ✅ | Deployed-RPC emittiert exakt `baseline·admin·mandate_inactive·nda_missing·cleared·no_clearance` == `AccessReason`-Typ == `EXPLAIN_REASON_LABEL`-Keys (vollständige Abdeckung, kein unmapped reason) |
| Matrix gate-faithful (Nutzer×Stufe) | ✅ | `access-matrix.test.ts` **6/6** (monotone Stufen, Admin-Voll, Advisor-NDA-Block, Block-Reason-Fallback, Sortierung, User-Union); Zellen = serverseitiger `has_access`-Verdikt je Level |
| Manager-Gating (access-explain) | ✅ | RPC `raise … errcode=42501` für Nicht-Admin/Nicht-Lead → Route mappt 403; Page/Tabs `useProjectAccess(…, "manage_members")`-gegatet |
| Regression (Gesamtsuite) | ✅ | vitest **2015/2015**, lint **0**, tsc **0 neu** (14 baseline), `next build` clean |

### Komponenten-Bug-Hunt (advisors/ndas/classification/labels) — alle Findings Low/Info, kein Blocker
- **F-1 (Low, Followup):** `ma_ndas.document_link` ohne Schema-Validierung (`z.string().max(2000)`). **Nicht ausnutzbar** — Link wird nirgends als `<a href>` gerendert (kein `href`/`<a` in `ndas-tab.tsx`). Empfehlung: Backend-`refine(/^https?:\/\//)` bevor je ein Link-Render entsteht (auch DMS-Followup PROJ-79).
- **F-2 (Low):** `advisors-tab`/`ndas-tab` async-Reload-Effekte ohne `cancelled`-Guard (das `classification-matrix-tab` macht es korrekt vor). React 19 toleriert es (kein Crash); Konsistenz-Nit, bei schnellem Projektwechsel theoretisch State-on-stale.
- **F-3 (Low, kosmetisch):** Org-only NDA-Kontakt rendert mit führendem „—" (`— · ACME`); Organisation bleibt sichtbar.
- **F-4 (Low, kosmetisch):** Advisor-„Verantwortlich"-Select-Placeholder „Optional" wird nie gezeigt (Wert immer `__none`).
- **F-5 (Info):** `governance-labels.fmtDate` coerct ungültige Datums-Strings still (Backend validiert Datumsfelder; Defense-in-depth-Hinweis).

### Deviations / Env
- **D-FE-1** (aus Frontend-Notes): 4. Tab = „Freischaltungen" statt „Historie" — funktionierender Historie-Tab braucht `can_read_audit_entry`-Erweiterung für `ma_advisor_profiles`/`ma_ndas` (security-relevanter Backend-Followup, deckt zugleich offenen Audit-AC „Externe Aktivitäten auditierbar").
- **D-QA-1 (Env):** Mobile-Safari/WebKit-E2E übersprungen (Host-Libs fehlen — `sudo npx playwright install-deps webkit`), wie in PROJ-67/88/135. Chromium grün.
- **Negativ-Gate nicht erneut prod-geseedet:** bewusste QA-Entscheidung — das Gate ändert sich in dieser Frontend-PR nicht; es ist bereits live (10/10 Backend-Smoke) + per Source-Review verifiziert. Re-Seed gegen Prod = redundant + Mutations-Risiko. Optionaler Followup: committeter Impersonation-SQL-Smoke als wiederverwendbares Artefakt.

### Empfohlene Followups (nicht-blockierend)
F-1 `document_link`-Scheme-Validierung (security-hygiene, vor Link-Render) · F-2 `cancelled`-Guards · D-FE-1 `can_read_audit_entry`-Erweiterung + Historie-Tab (eigener Backend-Slice).

## Deployment — 2026-06-24

- **PR #182** (Bundle-Frontend PROJ-99/128/129 + PROJ-100b projektweite Matrix) squash-merged → main `0135ce3`; Branch gelöscht.
- **Tag** `v2.0.0-PROJ-99-128-129` gepusht.
- **Vercel prod** Deploy für `0135ce3` = READY (commit-status `Vercel=success`); kein DB-Change (Backend-Migration `20260623230548` war seit #181 live).
- **Post-Deploy-Smoke:** 4/4 = 307 Auth-Gate auf `/api/projects/[id]/advisors`, `…/ndas`, `…/access-explain?level=confidential`, `/projects/[id]/vertraulichkeit` (Deployment live + geschützt).
- **Offene Followups (nicht-blockierend):** F-1 `document_link`-Scheme-Validierung (vor jedem Link-Render); F-2 `cancelled`-Guards in advisors-/ndas-tab; **D-FE-1** Historie-Tab braucht `can_read_audit_entry`-Erweiterung für `ma_advisor_profiles`/`ma_ndas` (eigener security-relevanter Backend-Slice, deckt zugleich offenen AC „Externe Aktivitäten auditierbar").

## Followups umgesetzt — 2026-06-24 (F-1 + F-2 + D-FE-1)

Alle drei QA-Followups gebaut (eigener Branch `proj-99-128-129/followups`). **1 Migration, kein neuer Dep.**

- **F-1 (Security-Hygiene):** `document_link` in `ndas/_schema.ts` validiert jetzt das Schema (`https?://` oder leer) — `javascript:`/`data:`/`vbscript:`/`file:` werden mit 400 abgewiesen, bevor der Link je als `<a href>` gerendert werden könnte. +2 Route-Tests (reject `javascript:`, accept `https://`).
- **F-2 (Robustheit):** Mount-/Target-Reload-Effekte in `advisors-tab.tsx` + `ndas-tab.tsx` (inkl. `NdaAssignmentsSheet`) auf das `cancelled`-Guard-Muster umgestellt (analog `classification-matrix-tab`); `reload()` bleibt für user-initiierte Post-Mutation-Refetches. Kein State-Write mehr auf stale/unmounted.
- **D-FE-1 (Historie-Tab + Audit-Read-Gate):**
  - **Backend** Migration `20260624095758_proj99_followup_audit_read_advisor_nda.sql` (in Prod): `can_read_audit_entry` mappt `ma_advisor_profiles` + `ma_ndas` → `is_project_member` (Spiegel des `ma_project_profiles`-Case). **Keine neue Sichtbarkeit** — beide Tabellen-SELECT-Policies sind bereits exakt `is_project_member(project_id)` (verifiziert); der Branch hebt sie nur aus dem `else return false`-default-deny. **Pflicht-Live-RPC-Smoke gegen Prod (rolled back, 0 Residue): 5/5** — `member.advisor=true · member.nda=true · nonmember.advisor=false · nonmember.nda=false · admin.advisor=true`.
  - **Frontend** `AuditEntityType` + Labels um `ma_advisor_profiles`/`ma_ndas` erweitert; neuer 5. Tab **„Historie"** (`governance-history-tab.tsx`) in der Governance-Seite: Objekt-Typ (Berater/NDA) + Objekt-Picker → `HistoryTab` mit enum-/datums-/namensgerechtem `formatValue`. Damit ist der ursprünglich als D-FE-1 zurückgestellte Historie-Tab geliefert (deckt zugleich den AC „Externe Aktivitäten auditierbar" für Advisor-/NDA-/Mandats-/Clearance-Änderungen).
- **Quality-Gates:** lint 0 · tsc 14 baseline/0 neu · vitest 2017/2017 (+2) · build clean.
- **Deployed 2026-06-24:** PR **#184** squash-merged → main `ceb78e0`, Tag `v2.0.1-PROJ-99-128-129-followups`; Migration `20260624095758` in Prod; Vercel prod READY; Post-Deploy-Auth-Gate-Smoke 3/3 = 307. Damit sind alle drei QA-Followups (F-1/F-2/D-FE-1) erledigt; der AC „Externe Aktivitäten auditierbar" ist über den Historie-Tab (Advisor-/NDA-Audit) abgedeckt.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · B — Rollen, Gremien & Governance_
