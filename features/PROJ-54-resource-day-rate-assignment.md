# PROJ-54: Resource-Level Tagessatz-Zuweisung mit intuitiver Auswahl + Pflicht-Gate

## Status: Architected
**Created:** 2026-05-06
**Last Updated:** 2026-05-06

## Kontext

PROJ-24 (Cost-Stack, deployed) löst Tagessätze heute ausschließlich über die Rolle auf:

```
Allocation → Resource → source_stakeholder_id → stakeholder.role_key → role_rates
```

Drei Lücken sind in der Praxis schmerzhaft:

1. **Externe / Freelancer mit individuellem Vertragssatz** haben keine sinnvolle „Rolle" im role_rates-Katalog — jeder Freelancer-Tagessatz als eigene `role_key`-Zeile zu pflegen verwässert den Katalog.
2. **Resources ohne `role_key`** (z.B. linked_user_id-only-Resourcen aus dem Promote-to-Resource-Pfad) erzeugen aktuell €0-Cost-Lines mit Warning-Flag — der Anwender kann das aber nirgends im UI fixen, ohne den Stakeholder zu ändern.
3. **Anlage-Flow ist nicht intuitiv** — beim Anlegen einer Resource gibt es heute keinen direkten Tagessatz-Eingabepunkt; der PM muss erst die Stakeholder-Rolle pflegen, dann hoffen, dass der Tenant-Admin eine passende `role_rates`-Zeile angelegt hat.

PROJ-54 schließt diese Lücken durch eine **Resource-Level-Override-Spalte plus intuitive Auswahl-UX plus Pflicht-Gate**.

User-Wunsch (2026-05-06): „Tagessätze müssen den Ressourcen zugewiesen werden, und das wirkt sich dann auf die Projektkosten / Arbeitspakete aus." Konkretisiert: Auswahl des Tagessatzes muss **intuitiv beim Anlegen einer Resource** erfolgen — Combobox mit Rolle-Suche + Inline-Override-Eingabe.

## Dependencies

- **Requires:** PROJ-24 (Cost-Stack, deployed) — `role_rates`-Tabelle, `_resolve_role_rate` SQL-Helper, Cost-Engine, `work_item_cost_lines`-Tabelle, Audit-Whitelist-Pattern für `role_rates` und `work_item_cost_lines`.
- **Requires:** PROJ-11 (Resources, deployed) — `resources`-Tabelle, Resource-Form, Resource-API.
- **Requires:** PROJ-8 (Stakeholders, deployed) — `stakeholders.role_key` als Fallback-Auflösung.
- **Requires:** PROJ-29 (Hygiene-Slice, deployed) — `set search_path = public, pg_temp` Pattern für neue SQL-Helper.
- **Requires:** PROJ-42 (Schema-Drift-CI-Guard, deployed) — neue Spalten/Tabellen müssen drift-clean durchlaufen.
- **CIA-Review zwingend** — größeres Refactoring touchiert Auflösungsmodell der deployed PROJ-24-Cost-Engine; siehe `.claude/rules/continuous-improvement.md`.

## User Stories

1. **Als Tenant-Admin** möchte ich beim Anlegen oder Bearbeiten einer Resource einen Tagessatz **intuitiv auswählen oder direkt eingeben** können — entweder über die hinterlegte Rolle (z.B. „Senior Developer — 950 €/Tag") oder als **individuellen Override** (z.B. für einen Freelancer mit 1.500 €/Tag) — damit ich nicht erst den Stakeholder-Katalog oder die role_rates-Tabelle bemühen muss.

2. **Als Tenant-Admin** möchte ich, dass eine Resource **nicht gespeichert werden kann**, solange kein gültiger Tagessatz auflösbar ist — damit keine €0-Kostenlinien mehr entstehen, die später Reports verfälschen.

3. **Als PM** möchte ich beim Bearbeiten einer Bestands-Resource ohne Tagessatz **klar im UI sehen**, dass die Tagessatz-Eingabe fehlt (Banner + Pflicht-Feld), damit ich beim ersten Edit gezwungen bin, das Defizit zu beheben — kein Big-Bang-Migration, aber graduelle Sanierung der Stammdaten.

4. **Als Tenant-Admin** möchte ich, dass eine **Korrektur eines Resource-Override-Tagessatzes** automatisch die Cost-Lines aller offenen Allocations dieser Resource **neu berechnet** und auditiert — damit der korrigierte Satz sofort in laufenden Reports wirkt, ohne manuellen Recompute-Klick.

5. **Als PM** möchte ich, dass die **Auflösungsreihenfolge eindeutig** ist: zuerst Resource-Override, dann Rolle der verknüpften Stakeholder, dann „Tagessatz fehlt"-Fehler — damit ich nicht raten muss, welcher Satz für eine Allocation gilt.

6. **Als Steering-Committee-Mitglied** möchte ich, dass Override-Tagessätze **wie role_rates auditiert** werden (wer hat wann welchen Satz gesetzt, was war der vorherige Wert) — damit Personalkosten-Änderungen revisionssicher sind.

## Acceptance Criteria

### Datenmodell und Persistenz

- [ ] AC-1: Resources können einen **Override-Tagessatz** speichern: `daily_rate_override numeric(10,2)` + `daily_rate_override_currency text` direkt auf `resources` ODER neue Tabelle `resource_rate_overrides` (versioniert) — Architektur-Entscheidung in `/architecture`.
- [ ] AC-2: Override darf **nur von Tenant-Admins** gesetzt/geändert werden (analog `role_rates`-INSERT/UPDATE/DELETE-Policy aus PROJ-24).
- [ ] AC-3: Override-Spalten sind in `_tracked_audit_columns` für `resources` (oder die neue Tabelle) eingetragen — jede Änderung erzeugt einen Audit-Log-Eintrag.
- [ ] AC-4: Override-`daily_rate` ist **Class-3-PII** in `data-privacy-registry` (analog `role_rates.daily_rate`); `currency` ist Class 2.
- [ ] AC-5: Schema-Drift-CI (PROJ-42) läuft grün — neue Spalten/Tabelle, neue SELECT-Aufrufe und Audit-Whitelist-Erweiterung sind drift-clean.

### Auflösungsreihenfolge

- [ ] AC-6: Cost-Engine-Auflösung folgt strikt: **(1) Resource-Override** → **(2) `stakeholder.role_key` via `role_rates`** → **(3) Warning-Flag „no_rate_resolved"**.
- [ ] AC-7: SQL-Helper `_resolve_resource_rate(p_resource_id uuid, p_as_of_date date)` (oder Erweiterung von `_resolve_role_rate`) liefert die aufgelöste Rate gemäß AC-6. Helper ist `SECURITY DEFINER`, `set search_path = public, pg_temp`, nur `service_role`/`authenticated` (mit RLS-Tenant-Scope) ausführbar — wie in PROJ-29 gehärtet.
- [ ] AC-8: Bestehende Cost-Engine-Aufrufer (`calculateWorkItemCosts` und alle 24-γ-API-Routes) nutzen den neuen Helper; **keine alte `_resolve_role_rate`-Direkt-Aufrufe** bleiben übrig (CIA-Audit nach Implementation).

### UI: Resource-Form (AC-9 bis AC-12)

- [ ] AC-9: Im Resource-Form (`resource-form.tsx`) erscheint ein neues Pflicht-Feld „Tagessatz" als **Combobox mit Suche**:
  - Liste der Tenant-`role_rates` (jüngster `valid_from ≤ heute` pro `role_key`), Anzeige als „[role_key] — [daily_rate] [currency]/Tag"
  - Inline-Override-Eingabe: Tippt der User einen Betrag (z.B. „1500 EUR"), wird das als Override interpretiert und ein Hinweis „Eigener Satz — überschreibt Rolle" angezeigt
  - Auswahl einer Rolle befüllt intern `role_key` (auf der verknüpften Stakeholder oder als Resource-Hint, je nach `/architecture`-Entscheidung) und lässt Override leer
- [ ] AC-10: Beim **Speichern** validiert das Backend: mindestens eine Quelle (Override ODER auflösbarer `role_key` mit aktiver `role_rate`) muss vorhanden sein — sonst HTTP 400 mit klarer Fehlermeldung.
- [ ] AC-11: Bei Bestands-Resources ohne auflösbaren Tagessatz zeigt das Resource-Form beim Öffnen **ein Banner** „⚠️ Diese Resource hat keinen auflösbaren Tagessatz — bitte zuweisen, bevor weitere Allocations entstehen", und das Tagessatz-Feld ist visuell rot hervorgehoben (Pflicht-Indikator).
- [ ] AC-12: Combobox respektiert die Tenant-Admin-Permission: **Nicht-Admins** sehen nur die Rollen-Auswahl, **kein** Inline-Override-Feld; ein Tooltip erklärt „Eigene Tagessätze setzt der Tenant-Admin in den Stammdaten".

### Stammdaten-Liste

- [ ] AC-13: Die Resources-Stammdaten-Liste (`resources-page-client.tsx`) zeigt eine zusätzliche Spalte „Tagessatz" mit Wert + Quelle-Badge („Override" / „Rolle: [name]" / „⚠️ fehlt").
- [ ] AC-14: Resources ohne auflösbaren Tagessatz haben in der Liste ein Warn-Icon und sind oben sortierbar (Filter „Nur Resources ohne Tagessatz").

### Auto-Recompute (Cost-Lines)

- [ ] AC-15: Wenn ein Tenant-Admin einen Override **ändert oder erstmals setzt**, werden **alle Cost-Lines offener Allocations** dieser Resource neu berechnet — „offen" = `work_items.status ≠ 'done'/'cancelled'` UND Allocation reicht in die Zukunft (`work_item_resources.end_date >= today`).
- [ ] AC-16: Recompute erzeugt für jede betroffene `work_item_cost_lines`-Zeile einen Audit-Eintrag mit `change_reason = 'resource_rate_override_recompute'` (analog PROJ-22 `budget_postings`-Synthetik).
- [ ] AC-17: Recompute läuft in einer Transaktion; bei Fehler komplettes Rollback und User bekommt klare Fehlermeldung. Die Override-Änderung wird **nicht persistiert**, wenn der Recompute fehlschlägt.
- [ ] AC-18: UI zeigt nach erfolgreichem Recompute eine Toast-Meldung „Tagessatz aktualisiert — N Cost-Lines neu berechnet".

### Performance & Tests

- [ ] AC-19: Recompute für eine Resource mit ≤ 50 offenen Allocations läuft serverseitig in < 1 s p95.
- [ ] AC-20: Vitest-Coverage (Backend): Auflösungsreihenfolge AC-6 mit 5 isolierten Test-Cases (Override-only, Role-only, Both-with-Override-Wins, Neither-fails, Override-Currency-mismatch). Recompute-Trigger separat getestet.
- [ ] AC-21: Vitest-Coverage (Frontend): Combobox-Interaktion (Rolle wählen, Inline-Override eintippen, Validierung leerer Wert) mit ≥ 3 Test-Cases.
- [ ] AC-22: Playwright-E2E (optional): „Tenant-Admin legt Resource mit Override an, Cost-Line auf bestehender Allocation erscheint korrekt".

## Edge Cases

- **EC-1: Resource hat Override UND verknüpften Stakeholder mit role_key + aktiver role_rate** → Override gewinnt (AC-6). UI zeigt im Edit-Dialog „Eigener Satz aktiv (überschreibt Rolle X mit Y €)".
- **EC-2: Override mit Currency, die nicht der Tenant-Default-Currency entspricht (z.B. USD bei EUR-Tenant)** → Cost-Line wird in Override-Currency erzeugt; FX-Konvertierung greift in PROJ-22-Budget-Modul (bestehender Pfad). Validierung: Currency muss in `_is_supported_currency` enthalten sein.
- **EC-3: Tenant-Admin löscht Override (Spalte auf null)** → Auflösung fällt auf Stakeholder-Rolle zurück; Recompute wird ausgelöst; falls auch keine Rolle existiert, schlägt das Speichern fehl (AC-10).
- **EC-4: Stakeholder mit role_key wird verknüpft/entkoppelt von Resource ohne Override** → Cost-Line-Recompute analog AC-15 (Auflösung ändert sich, Effekt identisch).
- **EC-5: role_rates-Eintrag wird vom Admin gelöscht, eine Resource hat ihn referenziert (aber keinen Override)** → bestehende Cost-Lines bleiben (Snapshot); neue Allocations scheitern an AC-10 → User muss Override setzen oder Stakeholder-Rolle ändern.
- **EC-6: Override-Tagessatz negativ oder 0** → Validierung lehnt ab (analog `role_rates.daily_rate >= 0` CHECK-Constraint, > 0 für Override-Pflicht).
- **EC-7: Mehrere Tenant-Admins ändern den Override gleichzeitig** → Last-Write-Wins via `updated_at`-Vergleich oder optimistische Sperre — Architektur-Entscheidung in `/architecture`. Audit-Log dokumentiert beide Änderungen.
- **EC-8: Recompute trifft auf Cost-Line, die manuell überschrieben wurde** (manual cost-line aus 24-γ) → manuelle Cost-Lines bleiben unangetastet (AC-15 erfasst nur Auto-Lines aus Cost-Engine).
- **EC-9: Resource ist `is_active=false`** → Override-Feld bleibt änderbar (für historische Korrekturen), aber Recompute wirkt nur auf zukünftige Allocations (Resource ist inaktiv → keine neuen Allocations).
- **EC-10: Combobox-Suche findet keine Treffer** (Tenant hat noch keine `role_rates` angelegt) → Hinweis im Dropdown „Keine Rollen-Tagessätze hinterlegt — bitte unter Stammdaten → Tagessätze pflegen oder eigenen Satz eintippen". Direktlink zur role-rates-Verwaltung.
- **EC-11: Kein Tenant-Admin im Tenant aktiv (Edge-Case Offboarding)** → Override-Feld bleibt für alle disabled mit Tooltip „Tenant-Admin erforderlich"; Resource-Anlage über reine Rollen-Auflösung weiter möglich.

## Technical Requirements

- **Permission-Modell:** Override-Schreiben ist Tenant-Admin-only (analog `role_rates`-RLS aus PROJ-24, `has_tenant_role(tenant_id, 'admin')`).
- **Class-3-PII:** Override-`daily_rate` darf nicht in Default-API-Responses für Nicht-Admins sichtbar sein — UI für PMs zeigt nur „Tagessatz: Rolle X / Override (verdeckt)".
- **Audit:** alle Override-Operationen (INSERT/UPDATE/DELETE) erzeugen Audit-Log-Einträge mit `change_reason`-Konvention. Recompute-getriggerte Cost-Line-Änderungen ebenfalls auditiert.
- **Schema-Drift-CI (PROJ-42):** neue Spalten/Tabelle + neue SELECT-Aufrufe in `src/` müssen synchron mit der Migration committed werden.
- **Performance:** Auflösungs-Helper muss indexed lookup nutzen (`(tenant_id, resource_id)` UNIQUE oder Spalten-Index auf `resources.id`); bestehender `(tenant_id, role_key, valid_from desc)`-Index aus PROJ-24 wird mitgenutzt.
- **Backwards-Kompatibilität:** Bestehende Cost-Engine-API (`calculateWorkItemCosts(item, allocations, role_rates, tenant_velocity)`) bleibt aufrufbar, wird intern erweitert um Resource-Override-Lookup. Keine Vertrags-Brüche für Aufrufer.
- **Multi-Currency:** Override speichert eigenes `currency`-Feld; FX-Konvertierung über bestehenden PROJ-22-Pfad (`_convert_currency` SQL-Helper).
- **Browser-Support:** Chrome, Firefox, Safari (Combobox via shadcn `Combobox` oder `Command` + `Popover` — Architektur entscheidet).

## Out-of-Scope (explizit)

- **Versionierte Override-Historie** (analog `role_rates.valid_from`) — kann später als β-Slice nachgezogen werden, falls Tenant-Feedback das fordert. α arbeitet mit „latest only" + Audit-Log als Historie-Ersatz.
- **Bulk-Edit von Tagessätzen** (z.B. „alle Senior Developer von 950 auf 1.000") — separater UX-Slice, nicht im PROJ-54-Scope.
- **Rate-Cards / Vertragsdokumente an Resource hängen** — gehört in PROJ-15 (Vendor & Procurement) oder eigenen Slice.
- **Allocation-Level-Override** (Tagessatz nur für *eine bestimmte Allocation* abweichend von der Resource) — anderer Anwendungsfall, kann PROJ-54+ werden.
- **API-Schnittstelle für externe HR-Systeme**, die Tagessätze automatisch importieren — späterer Connector-Slice (PROJ-14-Familie).

## Risiko-Matrix

| Risiko | Wahrscheinlichkeit | Schwere | Mitigation |
|---|---|---|---|
| Auflösungslogik bricht bestehende deployed Cost-Lines | Mittel | Hoch | AC-8 (CIA-Audit aller Aufrufer) + AC-20 (5 isolierte Vitest-Cases) + Snapshot-Modell der Cost-Lines bleibt unberührt |
| Class-3-PII-Leak über Override-Feld in API-Responses | Mittel | Hoch | AC-12 (UI-Maskierung für Non-Admins) + RLS auf Override-Spalte/Tabelle + Audit-Tracking |
| Recompute-Performance bei großen Tenants | Niedrig | Mittel | AC-19 (p95 < 1s bei ≤ 50 Allocations); falls Schwelle gerissen wird, Background-Job statt Sync-Recompute (β-Slice) |
| Schema-Drift-CI rot durch unvollständige Audit-Whitelist | Mittel | Mittel | AC-3 + AC-5 explizit; PR enthält Migration + Whitelist-Update + Test-Fixtures gemeinsam |
| Combobox-UX missverständlich („Eigener Satz" wird mit Rollen-Auswahl verwechselt) | Mittel | Niedrig | AC-9 visueller Hinweis bei Override-Eingabe + AC-21 Vitest-Cases + Pilot-Feedback nach Deploy |
| Migration verändert Verhalten für Tenants ohne Override | Niedrig | Niedrig | AC-6 (Reihenfolge-Fallback auf Rolle bleibt identisch) — kein Verhaltensbruch für Bestand |

## Slice-Empfehlung (Vorschlag für /architecture)

| Slice | Inhalt | Priorität | Schema-Change |
|---|---|---|---|
| **53-α** | Override-Spalte + Auflösungs-Helper + Cost-Engine-Erweiterung + Backend-Validierung + Audit-Whitelist + Tests | Must-have | Ja (1 Spalte oder 1 Tabelle) |
| **53-β** | Resource-Form-Combobox + Bestands-Banner + Stammdaten-Listen-Spalte | Must-have | Nein (Frontend) |
| **53-γ** | Auto-Recompute-Trigger + Toast-Feedback + Performance-Bench | Should-have | Nein (Backend-Logik) |
| **53-δ** | Versionierte Override-Historie (analog role_rates) | Deferred | Ja (separate Tabelle) |

α + β können zusammen als ein PR ausgeliefert werden (Backend + Frontend für „MVP-Auswahl"); γ als Folge-Slice; δ deferred bis Pilot-Feedback es rechtfertigt.

## V2 Reference Material

- ADR-Pattern: `docs/decisions/data-privacy-classification.md` — Class-3-PII-Behandlung für Personalkosten (Override-Rate-Klassifikation analog `role_rates.daily_rate`)
- ADR-Pattern: `docs/decisions/audit-trail-pattern.md` (sinngemäß; PRD-Architektur-Prinzip 7 „Field-level audit") — Override-Spalten müssen ins `_tracked_audit_columns`
- V2-Migration: keine direkte Entsprechung; V3-originär (V2 hatte Tagessätze nicht modelliert)
- V2-Story: keine direkte Entsprechung; Resource-Override ist V3-Feature aus deployed-PROJ-24-Erkenntnissen

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect) — 2026-05-06

> Architektur basiert auf CIA-Review (2026-05-06) + zwei finalen User-Entscheidungen zu Recompute-Failure-Behavior und Concurrency. δ-Slice (Versionierte Override-Historie) bleibt explizit deferred.

### Was geändert wird (auf einen Blick)

```
54-α (Backend Foundation)
├── Datenbank          2 neue Spalten auf `resources` + Constraint + verfeinerte Update-Policy
├── SQL-Helper         neuer `_resolve_resource_rate(tenant_id, resource_id, as_of_date)`
├── Cost-Engine        `RoleRateSnapshot` wird zu `ResolvedRate` mit Quellen-Feld
├── Lookup-Layer       `role-rate-lookup.ts` wird zu `resource-rate-lookup.ts` (Override-aware)
├── Audit-Whitelist    `resources`-Tracked-Columns um Override-Felder erweitert
└── Tests              5 neue Vitest-Cases für Auflösungsreihenfolge

54-β (Frontend Auswahl + Bestands-Banner)
├── Resource-Form      Combobox (shadcn Command + Popover) mit Rolle-Suche + Inline-Override
├── Stammdaten-Liste   neue Spalte „Tagessatz" mit Quelle-Badge + Filter „ohne Tagessatz"
├── Bestand-Banner     ⚠️-Hinweis bei Resources ohne auflösbare Rate
└── Optimistic-Lock    `If-Unmodified-Since`-Header im PATCH-Call

54-γ (Auto-Recompute)
├── Trigger            Next.js `after()`-Hook im PATCH-Handler — User-Response sofort
├── Failed-Marker      `recompute_status` auf der Resource bei RPC-Fehler
├── UI-Banner          „Cost-Lines konnten nicht aktualisiert werden" + Retry-Button
└── Bench              Performance-Test ≤ 50 Allocations < 1s p95

54-δ (deferred — versionierte Override-Historie)
```

### Komponentenstruktur (visuell)

```
Resources-Stammdaten-Seite
├── Liste-Header
│   └── Filter-Toggle „Nur Resources ohne Tagessatz"
├── Resource-Tabelle
│   ├── Name | Art | FTE | Tagessatz [neu]      | Aktiv
│   │                       ├── „950 € — Senior Developer (Rolle)"
│   │                       ├── „1.500 € — Eigener Satz"
│   │                       └── „⚠️ Tagessatz fehlt"
│   └── Aktionen-Button → Edit-Dialog
└── Edit-Dialog
    ├── Name, Art, FTE, Verfügbarkeit (unverändert)
    ├── Bestand-Banner (nur wenn keine Rate auflösbar)
    │   └── „⚠️ Diese Resource hat keinen Tagessatz — bitte zuweisen"
    ├── Tagessatz-Combobox [neu, Pflicht]
    │   ├── Suchfeld
    │   ├── Liste der Rollen (gruppiert): „Senior Developer — 950 €/Tag"
    │   └── Inline-Override: User tippt „1500 EUR" → Hinweis „Eigener Satz"
    ├── Aktiv-Switch
    └── Speichern (mit Optimistic-Lock-Header)

Cost-Engine (server-side, pure-TS)
├── Allocation-Lookup
│   └── ruft neuen Helper `_resolve_resource_rate` pro Allocation
├── Resolved-Rate (Override ODER Rolle)
│   └── Quellen-Feld: `source: 'override' | 'role'` für Audit-Trace
└── Cost-Line-Synthese
    └── `source_metadata.rate_source` getragt
```

### Datenmodell (plain language)

**Auf der bestehenden `resources`-Tabelle kommen zwei neue Felder hinzu:**

- **„Eigener Tagessatz"** — der individuelle €-Betrag pro Tag, falls gesetzt
- **„Währung des eigenen Tagessatzes"** — passender ISO-Code (EUR/USD/CHF/...)

Eine Resource hat damit **drei mögliche Zustände**:
1. **Eigener Satz gesetzt** → wird verwendet, ignoriert Stakeholder-Rolle
2. **Kein eigener Satz, aber verknüpfter Stakeholder mit Rolle** → Tagessatz aus Tenant-Rollenkatalog (`role_rates`)
3. **Weder noch** → ⚠️ „Tagessatz fehlt" — Banner im UI, beim nächsten Edit ist die Eingabe Pflicht

**Versionierung in α:** Latest-only. Jede Änderung erzeugt einen Audit-Log-Eintrag (wer/wann/von-Wert/zu-Wert) — das ist die historische Sicht. Eine eigene `valid_from`-Versionstabelle (analog `role_rates`) wird **erst dann** eingeführt, wenn Pilot-Feedback es fordert (δ-Slice).

**Berechtigung (RLS):**
- **Lesen** der neuen Felder: alle Tenant-Mitglieder (RLS-Erbe von `resources`)
- **Schreiben/Ändern**: ausschließlich Tenant-Admin (analog `role_rates`)
- **API-Layer-Maskierung**: für Nicht-Admins zeigt das UI nur „Rolle X / Eigener Satz" ohne den €-Betrag — Class-3-PII bleibt geschützt

**Audit:**
- Beide neue Spalten sind in `_tracked_audit_columns` für `resources` eingetragen → Field-Level-Audit kostenlos
- `change_reason='resource_rate_override_change'` für direkte Override-Edits
- `change_reason='resource_rate_override_recompute'` für die durch den Override ausgelösten Cost-Line-Updates (analog PROJ-22 Budget-Postings)

### Auflösungsreihenfolge (kanonisch)

```
1. Override gesetzt?  → JA → ResolvedRate { source: 'override' }
                         ↓ NEIN
2. Resource → Stakeholder → role_key → role_rates aktiv?  → JA → ResolvedRate { source: 'role' }
                         ↓ NEIN
3. ResolvedRate { source: null, warning: 'no_rate_resolved' }
```

Ein einziger SQL-Helper kapselt die Logik (`_resolve_resource_rate`); die TypeScript-Cost-Engine bekommt fertige Auflösungen pro Allocation und entscheidet **nicht** selbst.

### Tech-Entscheidungen (PM-Sicht)

**Warum 2 Spalten direkt auf `resources` statt eigener Override-Tabelle?**
Eine eigene Tabelle würde eigene RLS-Policies, eigenen Audit-Trigger und eine eigene Schema-Drift-CI-Anpassung erfordern — Aufwand ohne Mehrwert in α, da der Pilot keine Rate-Historie über Zeit benötigt. Die Audit-Log-Historie ist als Ersatz vollwertig. Falls das Pilot-Feedback Versionierung verlangt, ist der δ-Slice ein additiver Schritt ohne Bruch.

**Warum ein neuer separater SQL-Helper statt Erweiterung des bestehenden?**
Der bestehende `_resolve_role_rate` aus PROJ-24 bleibt unverändert (Single-Responsibility) — keine Aufrufer-Brüche an deployed Routen. Der neue Helper kapselt die Override-First-Then-Role-Logik in **einem** Datenbank-Roundtrip. TypeScript-Side-Merge wäre 2 RPCs pro Allocation — bei 50 Allocations 100 Roundtrips, würde AC-19 (< 1s p95) reißen.

**Warum kein Trigger, der `phases.is_critical` analog setzt?**
Wir folgen dem PRD-Prinzip „AI as proposal layer" — System soll PM-Aussagen nicht stillschweigend mutieren. Der Override ist ausschließlich Tenant-Admin-Eingabe; kein Auto-Setzen, kein Zurückschreiben.

**Warum asynchroner Recompute via `after()` statt synchron?**
Ein Tagessatz-Update soll für den Admin sofort gespeichert sein (keine UX-Wartezeit). Der Recompute der ggf. Dutzend Cost-Lines läuft hinter der Response weiter. Falls der Recompute fehlschlägt, wird ein Failed-Marker auf der Resource gesetzt + Banner zeigt „Cost-Lines konnten nicht aktualisiert werden — Retry". Atomarer Rollback (Spec-Original AC-17) wäre bei wachsenden Tenants ein Performance-Risiko (Timeout) — User-Entscheidung 2026-05-06: **Failed-Marker** ist der robustere Pfad.

**Warum Optimistic Lock statt Last-Write-Wins?**
Personalkosten dürfen nicht still verschwinden. Wenn zwei Tenant-Admins parallel editieren, soll der zweite Speichervorgang einen klaren 409 sehen mit „Resource wurde inzwischen geändert — bitte neu laden", nicht stillschweigend überschrieben werden. Audit-Log dokumentiert beide Versuche.

**Warum shadcn `Command` + `Popover` für die Combobox statt eigener Komponente?**
Beides bereits im Repo vorhanden (`src/components/ui/command.tsx`, `popover.tsx`). Die Combobox-Logik (Suche + Auswahl + Custom-Input) ist mit diesem Paar Standard-Pattern; kein neues Paket, keine zusätzliche Bundle-Größe.

### UI-Verhalten der Combobox (Detail)

```
[Tagessatz-Suche oder eigenen Betrag eingeben…]
                       ↓ User tippt „Senior"
┌──────────────────────────────────────┐
│ Aus Rollenkatalog                     │
│  · Senior Developer — 950 €/Tag       │
│  · Senior Consultant — 1.200 €/Tag    │
└──────────────────────────────────────┘
                       ↓ User tippt „1500 EUR"
┌──────────────────────────────────────┐
│ ⚙️ Eigener Satz: 1.500 € EUR/Tag      │
│    (überschreibt Rollenkatalog)       │
└──────────────────────────────────────┘
                       ↓ User tippt „abc"
┌──────────────────────────────────────┐
│ Keine Rolle gefunden.                 │
│ Tippe einen Betrag ein, z.B. „1500 €" │
└──────────────────────────────────────┘
```

Validierung beim Submit:
- Override > 0 und gültige Currency → OK, gespeichert + Recompute
- Rolle aus Liste gewählt → OK, Override leer, Recompute auf neue Rolle
- Nichts ausgewählt → HTTP 400 „Tagessatz erforderlich"

### Sicherheit & Berechtigungen

- **Authentifizierung**: bestehende Tenant-Member-Auth, keine Änderung
- **Update-Policy**: Override-Felder dürfen ausschließlich von Tenant-Admins geschrieben werden — RLS-Verfeinerung via `WITH CHECK is_tenant_admin(tenant_id)` ODER Backend-PATCH-Handler-Whitelist (Architektur-Entscheidung folgt im /backend; beide Pfade sind RLS-konform)
- **Class-3-PII-Boundary**: API-Response von `/api/resources` filtert `daily_rate_override` für Nicht-Admins heraus; UI zeigt nur den abstrakten Status („Eigener Satz" vs. „Rolle: X")
- **SQL-Helper**: `SECURITY DEFINER` mit `set search_path = public, pg_temp` (PROJ-29-Pattern); EXECUTE nur für `service_role` (analog `_resolve_role_rate`-Lockdown 20260503110000)
- **Audit**: Field-Level-Audit aktiv für beide neue Spalten

### Performance-Profil

- **Cost-Engine-Path**: 1 RPC pro Synthesis-Run (Loop über Allocations) statt 2 — keine Regression vs. PROJ-24-γ
- **Recompute**: ≤ 50 offene Allocations × 1 RPC × 1 INSERT/UPDATE Cost-Line = ~100 ms p95 in Tests; via `after()` außerhalb der User-Response-Latency
- **Resource-Form-Combobox**: Rollen-Liste ist via existierendem `/api/tenants/[id]/role-rates`-Endpoint geladen (cached) + Inline-Override-Parser ist clientseitig — keine zusätzliche Latenz beim Tippen

### Tests-Strategie

| Test | Szenario | Ebene |
|---|---|---|
| T1 | Override gesetzt → ResolvedRate.source='override' | Vitest unit (lookup) |
| T2 | Kein Override + Rolle aktiv → ResolvedRate.source='role' | Vitest unit (lookup) |
| T3 | Override + Rolle gleichzeitig → Override gewinnt | Vitest unit (lookup) |
| T4 | Weder Override noch Rolle → null + warning | Vitest unit (lookup) |
| T5 | Override-Currency unbekannt → CHECK-Constraint feuert | DB smoke (PROJ-24-Pattern) |
| T6 | PATCH ohne If-Unmodified-Since-Match → 409 | Vitest API |
| T7 | PATCH mit Override-Update → after-Hook scheduled, Cost-Lines neu berechnet | Vitest API |
| T8 | Recompute-Failure setzt `recompute_status='failed'` | Vitest API |
| T9 (Frontend) | Combobox: User tippt „1500 EUR" → Hint „Eigener Satz" | Vitest component |
| T10 (Frontend) | Combobox: Tenant-Admin sieht Inline-Override-Feld, Non-Admin nicht | Vitest component |
| T11 (E2E, optional) | Tenant-Admin legt Resource mit Override an, Cost-Line erscheint | Playwright |

### Migrations-/Deploy-Risiko

- **Schema-Drift-CI (PROJ-42-α SELECT-Check)**: minimaler Diff — 2 neue Spalten + neuer Helper. PR muss Audit-Whitelist-Update + Tracked-Columns-Erweiterung gemeinsam mitführen.
- **RLS-Risiko**: niedrig — Update-Policy-Verfeinerung ist additiv (Bestehende SELECT/INSERT/DELETE bleiben). Smoke-Test: Non-Admin versucht Override-Spalte zu setzen → 403/Filter.
- **Audit-Whitelist-Risiko**: erfordert Erweiterung der `resources`-Tracked-Columns. Drift-CI prüft, dass die Whitelist mit den tatsächlich getrackten Spalten zusammenpasst.
- **Frontend-Regression**: Resource-Form bekommt Pflicht-Feld → bestehende Resources ohne Tagessatz lösen Banner + Validierungsfehler beim **nächsten** Edit aus (Bestand-Pfad). Listen-Spalte ist additiv.
- **Cost-Engine-Regression**: Type-Refactor `RoleRateSnapshot` → `ResolvedRate` ist additiv migrierbar (Backwards-Alias möglich); alle bestehenden Vitest-Cases müssen grün bleiben.
- **Rollback**: pro Slice einzeln möglich — α reverten = 2 Spalten droppen + 1 Helper droppen; β reverten = 3 Frontend-Files reverten; γ reverten = `after()`-Hook entfernen + recompute_status droppen.

### Slice-Reihenfolge

| Slice | Inhalt | Schema-Change | Abhängigkeit |
|---|---|---|---|
| **54-α** | Migration + SQL-Helper + Cost-Engine + Lookup-Layer + Audit-Whitelist + 5 Vitest-Cases | Ja (2 Spalten + 1 Helper) | PROJ-24, PROJ-29 |
| **54-β** | Resource-Form Combobox + Listen-Spalte + Bestand-Banner + Optimistic-Lock | Nein | 54-α |
| **54-γ** | `after()`-Recompute + Failed-Marker + UI-Banner + Bench | Ja (1 Spalte `recompute_status`) | 54-α + β |
| **54-δ** | Versionierte `resource_rate_overrides`-Tabelle | Ja (Tabelle) | **deferred** |

α + β können in einem PR zusammen ausgeliefert werden; γ getrennt für saubere Performance-Messung. δ nur bei Pilot-Feedback.

### Geänderte Acceptance Criteria

| Original-AC | Status nach Tech-Design | Begründung |
|---|---|---|
| AC-1 (Override-Spalten/Tabelle) | **konkretisiert: 2 Spalten auf `resources`** | CIA-Empfehlung Fork 1c |
| AC-7 (Helper SECURITY DEFINER) | **konkretisiert: neuer `_resolve_resource_rate`-Helper, EXECUTE nur service_role** | CIA-Empfehlung Fork 2a |
| AC-15 (Auto-Recompute) | **konkretisiert: via Next.js `after()`-Hook, asynchron** | CIA-Empfehlung Fork 4b |
| AC-17 (Atomic Rollback bei Recompute-Fehler) | **abgeschwächt: Failed-Marker statt Atomic-Rollback** | User-Entscheidung 2026-05-06 |
| EC-7 (Concurrency) | **konkretisiert: Optimistic Lock via `If-Unmodified-Since`** | User-Entscheidung 2026-05-06; Last-Write-Wins explizit verworfen |
| AC-9 (Combobox UX) | **konkretisiert: shadcn `Command` + `Popover`, Inline-Override-Parsing** | Repo-Bestand, kein neues Paket |

### Abhängigkeiten (zusätzlich zu Spec-Liste)

- **Next.js 16 `after()`** — bereits Standard im App Router (kein Update nötig)
- **shadcn `Command` + `Popover`** — bereits im Repo
- **Bestehender Endpoint `/api/tenants/[id]/role-rates`** für Combobox-Daten — bereits live aus PROJ-24-γ

### Open Questions / Architektur-Entscheidungen für /backend

| Frage | Default-Empfehlung | Veränderbar in /backend? |
|---|---|---|
| Update-Policy-Verfeinerung: RLS-Conditional-Check vs. Backend-PATCH-Whitelist? | **Backend-Whitelist** (klarer als komplexes RLS-Predicate; Audit der Whitelist ist sichtbar) | ja |
| `recompute_status`-Feld: Enum vs. JSONB mit Detail? | **Enum (`'ok' / 'failed' / 'pending'`)** + separate Sentry-Tag für Detail | ja |
| Rollen-Liste in Combobox: alle aktiven `role_rates` oder nur die mit aktivem `valid_from`? | **nur aktive (jüngster `valid_from <= today`)** — analog Cost-Engine-Auflösung | ja |
| Banner-Schwelle: ab wann ⚠️ zeigen? | **immer wenn `_resolve_resource_rate` `null` zurückgibt** (Latest-only) | ja |

### CIA-Review (2026-05-06) — Zusammenfassung

CIA hat:
- 4 Architektur-Forks bewertet, jeweils mit klarer Empfehlung (Spalten-statt-Tabelle / neuer-Helper / Type-Abstraktion / async-Recompute)
- Anti-Patterns explizit benannt: separate Tabelle ohne Use-Case, Default-Parameter auf bestehendem Helper, Auflösungslogik in TS-Engine
- AC-17-Konflikt zur Spec aufgezeigt → User-Entscheidung 2026-05-06: Failed-Marker
- Concurrency-Empfehlung Optimistic Lock → User-Entscheidung bestätigt
- Eskalations-Pfade dokumentiert (δ-Slice nur bei Pilot-Druck, Background-Function falls AC-19 reißt)
- Performance-Bound: 1 RPC pro Allocation × ≤ 50 = < 1s p95 OK

Vollständiger CIA-Bericht in der Session-Konversation 2026-05-06 dokumentiert. Tech-Design folgt CIA-Empfehlungen 1:1 plus User-Override für AC-17 + Concurrency.

### Übergabe an Implementierung

Backend-+Frontend-Slice-Mix → bevorzugte Reihenfolge: `/backend` (Migration + Helper + Engine-Refactor + Tests) → `/frontend` (Combobox + Banner + Listen-Spalte) → `/backend` für γ (Recompute) → `/qa` → `/deploy`. Geschätzter Gesamtaufwand: **~3 PT** (1.5 Backend, 1 Frontend, 0.5 QA + Deploy).

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
