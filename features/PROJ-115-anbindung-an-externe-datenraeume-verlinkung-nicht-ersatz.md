---
id: PROJ-115
title: "Anbindung an externe Datenräume (Verlinkung, nicht Ersatz)"
issue_type: Story
epic_code: G
epic_title: "Due Diligence"
priority: Highest
priority_source: "Must (MVP) – manuelle Verlinkung; VDR-Schnittstelle: Could"
labels: ["ma-platform", "epic-g", "mvp"]
dependencies: ["G2", "G3", "C1", "D1", "B4", "L2"]
roles: ["Stream Leads", "PMO-Lead", "IT-Administration", "Externe Berater"]
summary_for_jira: "[G4] Anbindung an externe Datenräume (Verlinkung, nicht Ersatz)"
---

# PROJ-115: Anbindung an externe Datenräume (Verlinkung, nicht Ersatz)

## Status: Deployed (2026-07-29 — PR #280 → main, Tag v2.29.0-PROJ-115; QA PASS live pentest A–I 9/9, 0 Critical/High)
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic G — Due Diligence)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **REUSE** · Andockpunkt: PROJ-79 DMS + PROJ-14 Connector (nur Links, ADR Fork 4). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** G — Due Diligence  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP) – manuelle Verlinkung; VDR-Schnittstelle: Could  
> **Labels:** `ma-platform` · `epic-g` · `mvp`  
> **Abhängigkeiten:** `G2`, `G3`, `C1`, `D1`, `B4`, `L2`

**User Story:**

Als Stream Lead möchte ich aus jedem DD-Objekt (Frage, Finding, Aufgabe) auf den zugehörigen Dokumentenstand im externen Datenraum verlinken können, damit die Plattform der zentrale Steuerungsort bleibt, ohne den VDR zu ersetzen.

**Beschreibung / Kontext:**

Annahme A1 legt fest: Die Plattform ist kein VDR-Ersatz. Sie soll aber die Brücke zwischen Steuerungslogik und Dokumentensicht bilden. Das Modell macht klar, dass eine vollständige DD ohne Datenraumzugriff nicht funktioniert; eine saubere Verlinkung ist daher erfolgskritisch.

**Akzeptanzkriterien:**

- [ ] Pro Q&A-Eintrag (G2), Finding (G3), Aufgabe (C1) und Deliverable (D1) kann mindestens eine URL/Referenz zu einem externen Dokument hinterlegt werden.
- [ ] Die Plattform validiert das Linkformat und prüft beim Aufruf, ob der Link erreichbar ist (technischer Link-Check, keine inhaltliche Prüfung).
- [ ] Optional kann eine Schnittstelle zu mindestens einem führenden VDR-Anbieter konfiguriert werden (Auswahl: offene Frage).
- [ ] Sichtbarkeit von Links folgt dem Berechtigungskonzept (B4) und der Klassifikation (L2).

**Abgrenzungen (Out of Scope):**

- Keine Speicherung von DD-Originaldokumenten in der Plattform.
- Keine OCR, Texterkennung oder inhaltliche Auswertung von Dokumenten.

**Offene Fragen:**

- Mit welchem VDR-Anbieter wird zuerst integriert (Datasite, Intralinks, ansarada, andere)?
- Wird ein Single Sign-On in den VDR realisiert oder bleibt es bei Link-Sprung mit erneuter Anmeldung?

**Definition of Ready:**

- [ ] Linkmodell und Sichtbarkeitsregeln sind dokumentiert.
- [ ] Mindestens ein VDR-Anbieter für Pilot ist benannt (für optionale Schnittstelle).

**Definition of Done:**

- [ ] Manuelle Verlinkung funktioniert in allen relevanten Objekten.
- [ ] Link-Check meldet defekte Links.
- [ ] Berechtigungslogik ist getestet.

**Abhängigkeiten:**

- G2
- G3
- C1
- D1
- B4
- L2

**Betroffene Rollen:**

- Stream Leads
- PMO-Lead
- IT-Administration
- Externe Berater

---

## Tech Design (Solution Architect · CIA-reviewed 2026-07-28)

> **Klasse: REUSE + eine polymorphe Extension.** Zwei Forks CIA-geklärt (Architektur + SSRF-Security). Kein neues Dep, 1 Migration.

### Fork 1 — Linkmodell: **Option A (polymorphe `external_document_links`)** [CIA #1]
Die 4 Zielobjekte haben heterogene Link-Flächen (`deliverable_documents.url` ✓ · `work_item_documents.file_url` ✓ · `dd_questions.answer_link` Einzelfeld · `dd_findings` nichts). Statt 4 divergente Mechanismen zu erweitern → **eine neue polymorphe Tabelle** (EIN Vertrag, EINE Sichtbarkeitsregel, EIN Link-Check, EIN UI-Muster). Precedent: `raci_assignments.target_type`, `risk_links`, Audit-`entity_type`-Dispatch.

```
external_document_links(
  id, tenant_id NOT NULL,
  entity_type text CHECK IN (dd_question, dd_finding, work_item, deliverable),
  entity_id uuid,            -- polymorph, kein FK → Validierungs- + Delete-Cleanup-Trigger (risk_links-Muster)
  url text NOT NULL, label text,
  added_by, created_at)
```
- **Kein `confidentiality_level` an der Link-Zeile** — immer vom Parent geerbt (single source, kein Drift).
- **Need-to-know (AC4/B4/L2):** SECURITY-DEFINER-STABLE-Resolver `external_link_parent_ctx(entity_type, entity_id) → (project_id, level)` (CASE je Typ; alle 4 Parents tragen `project_id` + `confidentiality_level` direkt). Policies: permissive `is_project_member(ctx.project_id)` + Tenant-Anker; **RESTRICTIVE `can_access_classified(ctx.project_id, ctx.level)` auf allen 4 Achsen** (SELECT/INSERT-with-check/UPDATE/DELETE — dd_questions-Vollgate-Muster spiegeln, NICHT deliverables' SELECT-only-Lücke).
- **Umgeht bewusst** die Bestands-Need-to-know-Lücke von `work_item_documents` (F4, s.u.) — frische Tabelle = korrektes Gate von Tag 1.
- Audit: `external_document_links → [url,label]` in `_tracked_audit_columns` + `can_read_audit_entry`-Zweig **in derselben Migration** (M&A-EXTEND-Rezept, Grant-Drift vermeiden).
- Koexistenz mit `deliverable_documents`/`work_item_documents` bewusst (generischer Anhang vs. externe VDR-Referenz) — als UX-Hinweis dokumentiert (CIA-R3).

### Fork 2 — Link-Check / SSRF: **Option (a) im MVP, aktiver Check deferred** [CIA, SECURITY]
AC2-Hälfte „prüft beim Aufruf, ob erreichbar" = server-seitiger Outbound auf user-URL = **SSRF-Vektor** (169.254.169.254 Metadata, RFC1918, DNS-Rebinding). MVP baut **nur Statik-Validierung, keinen aktiven Server-Fetch** (der reale Erreichbarkeits-Nutzen entsteht beim User-Klick im eigenen Browser). Client-seitiger Check verworfen (CORS → False-Negatives).
- **AC-115-SEC-1:** URL muss parsen, **`https`-only** (kein http/file/ftp/gopher), keine Credentials-in-URL → 422.
- **AC-115-SEC-2:** Host als IP-Literal in reservierten Bereichen ablehnen: RFC1918, `127/8`, `169.254/16`, `::1`, `fc00::/7`, `fe80::/10`, `0.0.0.0`, `100.64/10`, IPv4-mapped IPv6 → 422 (Statik-Guard, kein Outbound).
- **AC-115-SEC-3:** persistierte URL wird nie server-seitig gefetcht; UI rendert `target=_blank rel="noopener noreferrer"`.

### Scope-Schnitt
| MVP (PROJ-115) | Deferred |
|---|---|
| Polymorphe `external_document_links`, alle 4 Typen, ≥1 URL + Label (AC1) | Aktiver Reachability-HEAD-Check (gehärtet, DNS-Pin/no-redirect/timeout) → **PROJ-Y-115a** |
| Need-to-know via Resolver + RESTRICTIVE-Gates (AC4) | VDR-Anbieter-Connector (AC3 „Could", PROJ-14) → **PROJ-Y-115b** |
| Statik-/https-/IP-Validierung (AC2-Format-Hälfte) | `work_item_documents`-Need-to-know-Gate-Fix (CIA-F4, Bestands-Leck, sicherheitsrelevant) → **PROJ-Y-115c** |
| Audit (`url,label` + read-grant in selber Migration) | Konvergenz Bestandstabellen (nicht nötig, Koexistenz) |

### Abhängigkeiten (verifiziert Deployed)
G2=PROJ-113 ✅ · G3=PROJ-114 ✅ · C1=PROJ-101/9 ✅ · D1=PROJ-104 ✅ · B4=PROJ-100 ✅ · L2=PROJ-129/100a ✅. Kein neues npm-Paket, 1 Migration.

### Pflicht bei /backend
Live-RPC/RLS-Pentest der Vererbung über **alle 4 `entity_type`** inkl. Aggregat-Leak-Probe (nicht-cleared Member sieht 0 Links aus strict-Parent) + Cross-Tenant-0 + `INSERT with check`-Gate + polymorphe Integrität (Validierungs-/Cleanup-Trigger). Handoff: `/backend` (Tabelle + Resolver + Policies + Trigger + CRUD-Routen + Statik-Validierung + Pentest) → `/frontend` (Link-Sektion je DD-Objekt) → `/qa` → `/deploy`. ~3 PT.

### Implementation Notes — /backend (2026-07-29)
**Migration `20260728120000_proj115_external_document_links.sql` in Prod-DB** (MCP-Version driftet ggf. zum Repo-Dateinamen — benign, idempotent). Umgesetzt:
- **`external_document_links`** (polymorph: entity_type dd_question/dd_finding/work_item/deliverable + entity_id + url + label + added_by; `url`-CHECK `https://%` als Defense-in-depth; RLS enabled).
- **Resolver** `external_link_parent_ctx(entity_type, entity_id) → (project_id, level)` (SECURITY DEFINER STABLE, CASE je Typ) — single source für Need-to-know.
- **Policies:** permissive SELECT/INSERT/DELETE (`is_project_member` via Resolver + Tenant-Anker) + **RESTRICTIVE `can_access_classified` auf allen 4 Achsen** (SELECT/INSERT-with-check/UPDATE/DELETE).
- **Integrität:** `_guard_external_document_link` (BEFORE INS/UPD: Parent existiert via Resolver → 23503; Tenant-Match → 23514) + `_cleanup_external_document_links` (AFTER DELETE-Trigger auf allen 4 Parents, entfernt verwaiste Links).
- **Audit:** entity_type-CHECK + `_tracked_audit_columns` (`[url,label]`) + `can_read_audit_entry`-Zweig (via Resolver) + `authenticated`-Grant re-granted (feedback_audit_fn_recreate_drops_grant) + AFTER-UPDATE-Trigger — alles in derselben Migration, Sibling-Entities erhalten.
- **SSRF (Fork 2 / Option a):** `src/lib/ma-project/external-link-validation.ts` (`validateExternalUrl`) — https-only, keine Creds-in-URL, reservierte IPv4/IPv6-Literale abgelehnt (RFC1918/loopback/link-local incl. 169.254.169.254/ULA/CGNAT/IPv4-mapped); **kein server-seitiger Fetch**. In POST erzwungen.
- **Route** `GET/POST/DELETE /api/projects/[id]/external-links` (session-client, `requireProjectAccess "view"`, RLS erzwingt Need-to-know; POST validiert URL + setzt tenant_id aus Projekt) + Client-Wrapper + Typen.

**Pflicht-Live-RLS-Pentest gegen Prod (`tests/sql/PROJ-115-external-links-pentest.sql`) A–I 9/9 PASS, 0 Residue:** Need-to-know-Vererbung über alle 4 entity_types (Admin 8 / nicht-cleared Member 4 standard / 0 strict = aggregat-leak-frei) · RESTRICTIVE-Insert-Gate (42501) · Guard (23503) · https-CHECK (23514) · Cross-Tenant 0 · Parent-Delete-Cleanup.

**Gates:** vitest +17 (8 Validierung + 9 Route), lint 0, tsc 0 neu, migration-naming 0 errors, build clean (Route registriert). Kein neues Dep. FE (Link-Sektion je DD-Objekt) → `/frontend`.

### Implementation Notes — /frontend (2026-07-29)
Wiederverwendbare `<ExternalLinksSection projectId entityType entityId canEdit compact?>` (`src/components/projects/ma/external-links-section.tsx`) — lädt Links via `listExternalLinks`, Liste (URL/Label als `target=_blank rel="noopener noreferrer"`-Link + Löschen), Add-Form (URL + optional Label) mit **client-seitiger `validateExternalUrl`-Vorprüfung** (spiegelt den Server-SSRF-Check). Ein Component, **vier Einbaustellen**:
- `deliverable-dialog.tsx` (entity_type `deliverable`, Edit-Modus, nach Dokumente-Sektion).
- `ma-task-dialog.tsx` (`work_item`, Edit-Modus, vor Footer).
- `dd-questions-sheet.tsx` → `QuestionDetailDialog` (`dd_question`, `canEdit`-Prop durchgereicht, compact).
- `dd-findings-panel.tsx` → Finding-Edit-Dialog (`dd_finding`, manager-gated, compact).
Need-to-know + Autorisierung serverseitig (RLS); `canEdit` steuert nur die Affordanzen. Reuse shadcn Input/Button/Label + lucide; kein neues Dep/Route/Migration.

**Gates:** lint 0, tsc 0 neu, build clean. Live-E2E (Auth-Gates) + Need-to-know-Pentest (bereits A–I 9/9) → `/qa`.

## QA Test Results (2026-07-29)

**Ergebnis: PRODUCTION-READY — 0 Critical / 0 High.**

### Acceptance Criteria
| AC | Status | Nachweis |
|----|--------|----------|
| AC1 — ≥1 URL/Referenz pro Q&A/Finding/Aufgabe/Deliverable | ✅ PASS | polymorphe `external_document_links` (4 entity_types) + `<ExternalLinksSection>` in allen 4 Surfaces; Pentest A: Links auf allen 4 Typen |
| AC2 — Linkformat-Validierung + (Erreichbarkeits-Check) | ✅ PASS (Split, CIA) | Statik-Validierung `validateExternalUrl` (https-only, keine Creds, reservierte IPs; Server + Client) + https-CHECK (Pentest G); aktiver Reachability-Check bewusst deferred → PROJ-Y-115a (SSRF-sicher, kein Server-Fetch) |
| AC3 — optionale VDR-Anbieter-Schnittstelle | ⏸ deferred | „Could" → PROJ-Y-115b (Pilot-Bedarf) |
| AC4 — Sichtbarkeit folgt B4 + L2 | ✅ PASS | Need-to-know via Resolver + RESTRICTIVE-Gates; Pentest B/C/D/H |

### Security — Live-RLS-Pentest (`tests/sql/PROJ-115-external-links-pentest.sql`, Impersonation, self-rollback)
**A–I 9/9 PASS, 0 Residue**, re-verifiziert gegen aktuellen Prod. Kern: **Need-to-know-Vererbung über ALLE 4 entity_types** — Admin sieht 8 Links, nicht-cleared Member sieht 4 (standard-Parent) / **0 strict-Parent** = aggregat-leak-frei (B/C); RESTRICTIVE-Insert-Gate blockt Member-INSERT auf strict-Parent (D, 42501); Parent-Existenz-Guard (F, 23503); https-CHECK (G, 23514); Cross-Tenant 0 (H); Parent-Delete-Cleanup (I). **SSRF:** URLs werden nie server-seitig gefetcht; Statik-Validierung lehnt http/Creds/reservierte IPs ab (Unit 8/8 inkl. 169.254.169.254, RFC1918, IPv6-loopback/ULA/mapped).

### Tests
- **Unit** (vitest): `external-link-validation.test.ts` 8/8 (SSRF-Statik) + `external-links/route.test.ts` 9/9 (401/400-entity/400-url-SSRF/201/403/404/GET/DELETE).
- **Playwright** `tests/PROJ-115-external-links.spec.ts` 4/4 chromium (Auth-Gates GET/POST/DELETE + malformed-id).
- **Regression:** volle vitest-Suite **2537/2537**, lint 0, tsc 0 neu, build clean.

### Deviations / Followups
- **PROJ-Y-115a** — gehärteter aktiver Reachability-HEAD-Check (SSRF-Slice, DNS-Pin/no-redirect/timeout, eigener Pentest).
- **PROJ-Y-115b** — VDR-Anbieter-Connector (AC3 „Could", Pilot-Bedarf).
- **PROJ-Y-115c** — CIA-F4: `work_item_documents` ohne Need-to-know-Gate (Bestands-Leck, sicherheitsrelevant, priorisieren).
- **Mobile-Safari-E2E** env-skipped (WebKit-Host-Libs, PROJ-67/F2); Chromium deckt Auth-Gates ab.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · G — Due Diligence_
