---
id: PROJ-100
title: "Berechtigungskonzept nach Need-to-know umsetzen"
issue_type: Story
epic_code: B
epic_title: "Rollen, Gremien & Governance"
priority: Highest
priority_source: "Must (MVP – ohne dieses Konzept ist die Plattform für reale M&A-Arbeit nicht einsetzbar)"
labels: ["ma-platform", "epic-b", "mvp"]
dependencies: ["A1", "B1", "L3"]
roles: ["IT-Sicherheitsverantwortlicher", "Datenschutzbeauftragter", "Compliance", "PMO-Lead", "Deal Lead"]
summary_for_jira: "[B4] Berechtigungskonzept nach Need-to-know umsetzen"
---

# PROJ-100: Berechtigungskonzept nach Need-to-know umsetzen

## Status: In Review (100a backend gebaut 2026-06-16; QA-Pentest 2026-06-18: alle 6 SEC-Vektoren PASS, ABER 1 HIGH-Bug H-1 blockiert Approval — grant/revoke-RPC scheitert in Prod am Audit-Constraint). 100b deferred.
**Created:** 2026-06-10

## Implementation Notes — 100a backend (2026-06-16)

**Migration `20260616100000_proj100a_need_to_know_rls.sql` in Prod-DB angewendet** (via MCP, name = Repo-Dateiname-Stamm → kein Versions-Drift):
- **Geordneter enum** `ma_confidentiality_level` (`standard` < `confidential` < `strict`).
- **`confidentiality_level`-Spalte** (NOT NULL DEFAULT `standard`) auf `projects`/`phases`/`work_items` — Bestandsdaten bleiben unverändert sichtbar (Gate ist no-op bei `standard`).
- **`ma_confidentiality_clearances`** (Inner-Circle-Freischaltung, multi-tenant-invariant: `tenant_id NOT NULL REFERENCES tenants ON DELETE CASCADE`, unique `(tenant_id,project_id,user_id)`, optionales `valid_until`). RLS-SELECT nur für tenant-admin/project-lead (Inner-Circle-Komposition nicht für alle sichtbar); **kein** direktes INSERT/UPDATE/DELETE für `authenticated` → blockiert Selbst-Freischaltung strukturell.
- **`can_access_classified(project_id, level)`** SECURITY DEFINER STABLE (Muster wie `is_tenant_member`): `standard`→true, tenant-admin→true (Bootstrap + Admin), sonst nicht-abgelaufene Freischaltung ≥ level. Liest Freischaltung als Owner → keine RLS-Rekursion.
- **9 RESTRICTIVE Policies** (SELECT/UPDATE/DELETE × projects/phases/work_items): UND-verknüpft mit den bestehenden permissiven Tenant-Policies — **kein Umschreiben**, kann nur einschränken; default-deny oberhalb `standard`. INSERT ungated (Default `standard`); Hochklassifizieren ist UPDATE und braucht Clearance für die neue Stufe.
- **`grant_/revoke_confidentiality_clearance`-RPCs** (SECURITY DEFINER): Autorität tenant-admin OR project-lead, Cross-Tenant-Grant blockiert, Audit-Zeile in `audit_log_entries` (PROJ-10) je Grant/Revoke (der UPDATE-only `record_audit_changes`-Trigger kann INSERT/DELETE nicht erfassen → RPC schreibt in dasselbe eine Audit-System).
- **`confidentiality_level`** zu `_tracked_audit_columns` für projects/phases/work_items hinzugefügt → Reklassifizierung ist field-level auditiert (AC3, Wiederverwendung PROJ-10).

**API (thin wrappers über die RPCs, `manage_members`-Gate für saubere 403):** `POST /api/projects/[id]/clearances` (grant) + `GET` (list, managers) + `DELETE …/[userId]` (revoke).

**Live-Smoke gegen Prod (read-only / RPC-raise-vor-write, 0 Residue):** standard-open ✓, default-deny confidential+strict für non-member ✓, unknown-project→deny ✓, tenant-admin-bypass ✓, Self-Grant via RPC → 42501 blockiert ✓, Class-3-Orthogonalität strukturell bestätigt (kein `privacy_class` auf den Gate-Tabellen) ✓.

**Quality-Gates:** lint 0; tsc 13 baseline/0 neu; vitest **1852/1852** (+11 clearance-Route-Tests); build clean.

**Offen für /qa (AC-100a-SEC Pentest):** der non-admin-MIT-Clearance-Positiv-Pfad (Clearance-Lookup-Zweig) ist live nicht geprüft, weil im E2E-Seed nur ein tenant-admin existiert (der via Bypass nie den Lookup-Zweig erreicht) — QA muss einen non-admin User + Clearance seeden und alle 6 AC-100a-SEC-Vektoren rollenbasiert (SET ROLE authenticated) verifizieren.
**Origin:** M&A-Platform Backlog (Epic B — Rollen, Gremien & Governance)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND-Foundation** · Andockpunkt: Need-to-Know RLS-Sublayer (ADR Fork 2) — split 100a/100b; Pentest-Pflicht. Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** B — Rollen, Gremien & Governance  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP – ohne dieses Konzept ist die Plattform für reale M&A-Arbeit nicht einsetzbar)  
> **Labels:** `ma-platform` · `epic-b` · `mvp`  
> **Abhängigkeiten:** `A1`, `B1`, `L3`

**User Story:**

Als IT-Sicherheitsverantwortlicher möchte ich Berechtigungen auf Projekt-, Phasen-, Workstream-, Dokument- und Feldebene nach dem Need-to-know-Prinzip steuern können, damit Vertraulichkeit, Vorabinformationsverbote und regulatorische Pflichten eingehalten werden.

**Beschreibung / Kontext:**

Vertraulichkeit ist in M&A-Projekten essenziell. Das Modell nennt Need-to-know explizit als Kommunikationsprinzip. Die Plattform muss feingranulare Berechtigungen mit klarer Auditierbarkeit unterstützen.

**Akzeptanzkriterien:**

- [ ] Berechtigungen sind auf den Ebenen Projekt, Phase, Workstream, Deliverable und einzelnen Dokumenten setzbar.
- [ ] Vorgefertigte Berechtigungsprofile (z. B. 'SteerCo lesend', 'DD-Stream Legal voll', 'externer Berater Tax') sind verfügbar.
- [ ] Jede Berechtigungsänderung wird im Audit-Trail (L3) protokolliert.
- [ ] Eine Übersicht 'Wer darf was sehen?' pro Objekt ist verfügbar.
- [ ] Ein 4-Augen-Prinzip kann optional für besonders sensitive Rechte aktiviert werden.

**Abgrenzungen (Out of Scope):**

- Plattform implementiert kein eigenes IAM – Authentifizierung läuft über den Unternehmens-IdP.
- Keine automatische Klassifikation von Dokumenten.

**Offene Fragen:**

- Welche Vorab-Berechtigungsprofile sind aus Compliance-Sicht verbindlich?
- Müssen Berechtigungen mit Geheimhaltungsvermerken aus dem DMS automatisch verknüpft werden?
- Wie wird 'temporäre Berechtigung' (z. B. nur für die nächsten 5 Tage) abgebildet?

**Definition of Ready:**

- [ ] Berechtigungsmodell ist mit IT-Sicherheit, Datenschutz und Compliance abgestimmt.
- [ ] Rollen-Berechtigungs-Matrix ist dokumentiert.

**Definition of Done:**

- [ ] Berechtigungen sind auf allen genannten Ebenen technisch wirksam.
- [ ] Audit-Trail erfasst jede Vergabe und jeden Entzug.
- [ ] Penetrationstest auf Rechte-Eskalation bestanden.

**Abhängigkeiten:**

- A1 – Projektanlage
- B1 – Rollen
- L3 – Audit-Trail

**Betroffene Rollen:**

- IT-Sicherheitsverantwortlicher
- Datenschutzbeauftragter
- Compliance
- PMO-Lead
- Deal Lead

---

## Tech Design (Solution Architect) — 2026-06-16

> Architektur-Grundlage gelockt in [ma-domain-architecture.md](../docs/decisions/ma-domain-architecture.md) Fork 2 + Fork 3. Dieses Design verfeinert nur die Umsetzung — die Grundsatzentscheidung (RLS-Sublayer statt Tenant-RLS-Ersatz) wird hier NICHT neu aufgemacht.

### Grundidee in einem Satz

Need-to-Know ist ein **zweites Tor innerhalb des Mandanten**: Jede Anfrage muss schon heute durch das **Tenant-Tor** (gehört der Nutzer zum Mandanten?). Künftig kommt ein **Vertraulichkeits-Tor** dazu (ist der Nutzer für *dieses* Objekt auf *dieser* Stufe freigeschaltet?). **Beide Tore müssen „ja" sagen** — das neue Tor kann Zugriff nur weiter einschränken, nie erweitern. Die Mandanten-Trennung bleibt die äußere, unverhandelbare Schranke.

### Slice-Aufteilung (gemäß ADR)

| Slice | Inhalt | Status |
|---|---|---|
| **100a (dieser Slice, Release 0)** | Vertraulichkeits-Stufen-Modell + Freischaltungs-Liste + das wiederverwendbare „Vertraulichkeits-Tor" + Anwendung auf die heute existierenden Foundation-Objekte + Pentest | **Architected** |
| **100b (späterer Slice)** | Vorgefertigte Berechtigungsprofile (AC2), 4-Augen-Workflow für besonders sensible Rechte (AC5), „Wer darf was sehen?"-Übersicht pro Objekt (AC4) | deferred |

100a ist der **Foundation-Knoten**: ~15 spätere DD-/Vertraulichkeits-Specs (112/113/114/108/118/119/128/129 …) hängen daran. Sie klassifizieren ihre eigenen Objekte später, indem sie das in 100a gebaute Tor wiederverwenden — sie bauen kein eigenes Berechtigungssystem.

### A) Komponenten-/Wirkungsstruktur (100a)

```
Vertraulichkeits-Tor (neuer, geteilter Baustein)
+-- Stufen-Modell        (geordnete Vertraulichkeits-Stufen, z. B. Standard < Vertraulich < Streng vertraulich / Inner Circle)
+-- Objekt-Einstufung    (jedes geschützte Objekt trägt eine Stufe; Default = Standard)
+-- Freischaltungs-Liste (welcher Nutzer ist in welchem Projekt bis zu welcher Stufe freigeschaltet)
+-- Tor-Prüffunktion     ("Darf der aktuelle Nutzer dieses Objekt auf dieser Stufe sehen?")
+-- Anbindung an die bestehenden Zugriffsregeln der Foundation-Tabellen
    +-- wird ZUSÄTZLICH zur bestehenden Mandanten-Prüfung verlangt (UND-Verknüpfung)
    +-- Grundhaltung: im Zweifel kein Zugriff (default-deny oberhalb von „Standard")
+-- Audit-Anbindung (Wiederverwendung PROJ-10): jede Einstufung + jede Freischaltung/Entzug wird protokolliert
```

### B) Datenmodell (in Worten, kein Code)

- **Vertraulichkeits-Stufe**: ein kleiner, **geordneter** Stufen-Katalog (Need-to-Know-Tiers). Geordnet, weil M&A-Vertraulichkeit hierarchisch ist („wer Streng-vertraulich darf, darf auch Vertraulich"). Bewusst KEINE frei zusammensetzbaren Einzel-Rechte-Listen pro Objekt in 100a — das wäre teurer, schwerer auditierbar und ist für den Pilot nicht nötig (verschoben, falls Pilot es verlangt).
- **Objekt-Einstufung**: jedes geschützte Objekt (in 100a: Projekt, Phase, Work-Item — die heute existierenden Foundation-Ebenen) bekommt eine Stufe. Fehlt eine explizite Einstufung, gilt **Standard**.
- **Freischaltung (Inner-Circle-Membership)**: pro Projekt + Nutzer die höchste Stufe, für die er freigeschaltet ist. Optional zeitlich befristbar (greift die „temporäre Berechtigung"-Offene-Frage auf — als Feld vorgesehen, Durchsetzung kann in 100a simpel sein).
- **Trennung zu Class-3 (Fork 3):** Die Vertraulichkeits-Stufe ist **etwas anderes** als die Datenschutz-Klasse (`privacy_class`). Ein Objekt kann „Inner Circle" + Class-1 sein (streng vertraulich, aber ohne Personendaten) oder „Standard" + Class-3 (Personendaten). **Zwei unabhängige Achsen, zwei unabhängige Tore** — sie werden nirgends vermischt.

### C) Durchsetzungs-Pattern

Das Vertraulichkeits-Tor wird als **geteilte Prüffunktion** gebaut — nach demselben bewährten Muster wie die deployten Mandanten-Helfer aus PROJ-1 (`is_tenant_member` & Co.): die Funktion liest die Freischaltungs-Liste **als Eigentümer** und ist damit innerhalb der Zugriffsregeln nutzbar, ohne sich selbst rekursiv auszusperren. In den Zugriffsregeln der geschützten Tabellen wird sie **zusätzlich** zur bestehenden Mandanten-Prüfung verlangt. Wichtig: **kein Umschreiben** der bestehenden Regeln — nur eine zusätzliche UND-Bedingung. Damit bleibt die Mandanten-Trennung unangetastet und der neue Layer ist isoliert testbar.

Für künftige Slices liefert 100a ein **dokumentiertes Rezept** „So macht man eine neue Tabelle need-to-know-fähig" (eine Spalte + eine zusätzliche UND-Bedingung), damit DD-Streams/Findings/Kommunikation den Layer konsistent wiederverwenden.

### D) Tech-Entscheidungen (WARUM)

- **Additiver Sublayer statt Neubau:** Die Multi-Tenant-Invariante (jede Regel geht durch die etablierten Helfer) darf nicht aufgeweicht werden. Ein zusätzliches, UND-verknüpftes Tor ist die minimale, prüfbare Änderung mit der kleinsten Angriffsfläche.
- **Geteilte Eigentümer-Prüffunktion:** spiegelt das in Produktion bewährte PROJ-1-Pattern, vermeidet RLS-Rekursion, hält die Logik an einer Stelle (eine Stelle zu auditieren statt N Policies).
- **Geordnete Stufen statt Objekt-ACLs:** einfacher, auditierbar, deckt Need-to-Know-Tiers ab; frei zusammensetzbare ACLs sind teurer und verschoben.
- **Default-deny oberhalb Standard:** im M&A-Kontext ist die sichere Grundhaltung Pflicht — ein vergessenes Einstufen darf nicht zu Über-Sichtbarkeit führen.
- **Audit über PROJ-10 wiederverwenden (AC3):** kein zweites Audit-System; Einstufungen/Freischaltungen laufen über den existierenden Field-Level-Audit-Trail.

### E) Akzeptanzkriterien-Zuordnung

- **AC1 (Ebenen-Berechtigung):** 100a liefert das Tor + Anwendung auf Projekt/Phase/Work-Item; Deliverable-/Dokument-Ebene folgt automatisch, sobald diese Tabellen (PROJ-104/79-Familie) das Rezept anwenden.
- **AC3 (Audit):** 100a (Wiederverwendung PROJ-10).
- **AC2 (Profile) / AC4 (Wer-darf-was-View) / AC5 (4-Augen):** 100b.

### F) Pentest-Pflicht-AC für 100a (security-kritisch)

- [ ] **AC-100a-SEC**: Penetrationstest besteht alle folgenden Angriffe: (1) Cross-Clearance-Leak — Nutzer mit niedriger Stufe sieht kein höher eingestuftes Objekt; (2) Selbst-Freischaltung / Rechte-Eskalation ist blockiert (nur befugte Rolle vergibt Freischaltungen); (3) Cross-Tenant bleibt trotz passender Stufe verwehrt (äußeres Tenant-Tor unberührt); (4) default-deny: nicht eingestufte Objekte oberhalb Standard sind nicht sichtbar; (5) das Tor lässt sich nicht über Rekursion/RLS-Bypass umgehen; (6) Class-3-Achse bleibt unabhängig (Vertraulichkeits-Freischaltung hebelt den Class-3-Block NICHT aus).

### G) Abhängigkeiten / neue Pakete

**Keine neuen npm-Pakete.** Reiner Postgres-RLS-Layer + Wiederverwendung des deployten PROJ-10-Audits und der PROJ-1-Helfer-Patterns. Migration (neue Spalte + Tabelle + Prüffunktion + zusätzliche Policy-Bedingung) folgt im `/backend`-Slice.

### H) Offene Fragen — Einordnung

- *Verbindliche Compliance-Profile* → 100b (Profile-Slice), nicht 100a.
- *Automatische Verknüpfung mit DMS-Geheimhaltungsvermerken* → später, wenn DMS-Klassifikation (PROJ-79/129) steht; 100a stellt nur den Mechanismus bereit.
- *Temporäre Berechtigung* → als Befristungs-Feld in der Freischaltung vorgesehen; einfache Durchsetzung in 100a, ausgefeilte Ablauf-Automatik optional später.

---

## QA Test Results — 100a Need-to-Know-RLS-Pentest (2026-06-18)

**Tester:** QA Engineer / Red-Team · **Methode:** Live, rollenbasiert gegen Prod-DB (`iqerihohwabyjzkpcujq`) via `SET ROLE authenticated` + `request.jwt.claims.sub`. Markierte Testdaten geseedet (Tenant `P100A-PENTEST-*`), getestet, restlos entfernt — **0 Residue verifiziert** (alle Residual-Counts = 0; `session_replication_role` nur für den Teardown auf `replica`, danach `origin`).

**Test-Topologie:** 2 Tenants (T1, T2), 3 User — UA (T1-Admin), UN (T1-`member` + Projekt-`editor`, cleared **confidential** auf P_conf), UX (T2-Admin). 4 Projekte (P_conf=`confidential`, P_strict=`strict`, P_std=`standard` in T1; P_t2=`confidential` in T2), Phase (`strict`) + 2 Work-Items (`confidential`/`strict`) in P_conf.

> Diese Topologie schließt genau die vom Backend dokumentierte Lücke: der **non-admin-MIT-Clearance-Positiv-Pfad** (Clearance-Lookup-Zweig in `can_access_classified`), den der Backend-Live-Smoke nicht erreichte, weil dort nur ein Tenant-Admin existierte (Bypass-Zweig).

### AC-100a-SEC — Penetrationstest: 6/6 Vektoren PASS

| # | Vektor | Probe | Ergebnis |
|---|--------|-------|----------|
| 1 | Cross-Clearance-Leak | UN (cleared `confidential`) listet P100A-Objekte | ✅ sieht nur `P100A Conf` + `P100A Std` + `WI Conf`; **kein** `strict`-Objekt (P_strict / WI Strict / Phase Strict) |
| 2 | Selbst-Freischaltung / Eskalation | UN ruft `grant_confidentiality_clearance(self, strict)` | ✅ `42501 not authorized` |
| 2b | " | UN: direkter `INSERT` in `ma_confidentiality_clearances` | ✅ `42501 RLS policy violation` (keine INSERT-Policy) |
| 2c | " | UN: `UPDATE project_memberships SET role='lead'` (self-promote → würde `is_project_lead` freischalten) | ✅ **0 Zeilen** |
| 3 | Cross-Tenant | UX (T2-Admin) listet P100A-Objekte | ✅ sieht nur `P100A T2 Conf`; **nichts** aus T1; `can_access_classified(T1-Projekt,*)`=false → Gate prüft **Projekt**-Tenant, nicht Aufrufer-Tenant |
| 4 | default-deny | strict-Objekte ohne ausreichende Clearance | ✅ unsichtbar (Teil von Vektor 1) |
| 5 | RLS-Bypass | UN: `UPDATE projects SET confidentiality_level='standard'` auf P_strict (Gate-Escape via Downgrade) | ✅ **0 Zeilen** — UPDATE-`USING` prüft die **aktuelle** (strict) Stufe |
| 5b | " | UN: `UPDATE` auf strict-WI / strict-Phase | ✅ **0 / 0 Zeilen** |
| 5c | " | UN liest `ma_confidentiality_clearances` (managers-only SELECT) | ✅ **0 Zeilen**, auch nicht die eigene → Inner-Circle-Komposition verborgen |
| 6 | Class-3-Orthogonalität | Struktur-Check Gate-Tabellen + Gate-Funktion | ✅ keine `privacy_class`-Spalte auf projects/phases/work_items; `can_access_classified` referenziert `privacy_class` nicht → zwei unabhängige Achsen |

**Zusätzliche Positiv-/Edge-Pfade verifiziert:**
- **Non-admin-Clearance-Lookup (vorher ungetestet):** UN sieht exakt seine freigegebene Stufe — `can_access_classified(P_conf,'confidential')`=true, `(P_conf,'strict')`=false. ✅
- **Admin-Bypass:** UA (T1-Admin) sieht alle T1-Stufen inkl. `strict`, aber **nicht** T2. ✅
- **Befristung (`valid_until`):** abgelaufene strict-Clearance → `can_access_classified`=false, P_strict unsichtbar. ✅ (greift die Spec-Offene-Frage „temporäre Berechtigung" auf)

### Bugs

#### 🔴 H-1 (HIGH) — grant/revoke-RPC in Prod funktionsunfähig: Audit-Entity-Type nicht im CHECK-Constraint

- **Reproduktion:** Als befugter Admin/Lead `select grant_confidentiality_clearance(<project>, <user>, 'confidential');`
- **Ist:** `ERROR 23514: new row for relation "audit_log_entries" violates check constraint "audit_log_entity_type_check"` — der RPC bricht beim Audit-INSERT (`entity_type = 'ma_confidentiality_clearances'`) ab und rollt die komplette Vergabe zurück.
- **Ursache:** Die Migration `20260616100000` schreibt in `audit_log_entries` mit `entity_type='ma_confidentiality_clearances'`, **erweiterte aber den `audit_log_entity_type_check`-Constraint nicht** (44 erlaubte Typen, dieser fehlt). Betrifft **grant UND revoke** (beide schreiben Audit) → der gesamte Schreibpfad ist tot.
- **Impact:** Über die unterstützte API/RPC kann **keine** Clearance vergeben oder entzogen werden. Folge: die Inner-Circle-Tabelle bleibt leer → **nur Tenant-Admins** (via Bypass) sehen je klassifizierte Objekte; **kein non-admin kann je freigeschaltet werden**. Das Kern-Feature (Need-to-Know-Freischaltung) ist in Prod nicht nutzbar. AC3 (Audit jeder Vergabe/Entzug) ist damit ebenfalls nicht erfüllt.
- **Sicherheits-Einordnung:** Kein Leak — das System **fail-closed** (über-restriktiv). Daher HIGH (Funktion + DoD-AC3 gebrochen), nicht Critical.
- **Warum vom Backend-Live-Smoke verfehlt:** der Smoke testete nur den **Block**-Pfad (self-grant → `42501`, geworfen in Zeile 13 **vor** dem Audit-INSERT in Zeile 33) und Read-/default-deny-Pfade. Ein **autorisierter erfolgreicher Grant** — der einzige Pfad, der den Audit-INSERT erreicht — wurde nie ausgeführt. Die geseedete Clearance dieses Pentests umging die RPC (direkter INSERT als `postgres`) und traf den Constraint daher ebenfalls nicht.
- **Fix (→ `/backend`):** `audit_log_entity_type_check` um `'ma_confidentiality_clearances'` erweitern (eigene Mini-Migration; `ALTER TABLE audit_log_entries DROP CONSTRAINT … ; ADD CONSTRAINT … CHECK (entity_type = ANY(ARRAY[… , 'ma_confidentiality_clearances']))`). Danach grant/revoke + AC3-Audit live re-verifizieren (autorisierter Grant → Audit-Zeile vorhanden; Revoke → zweite Audit-Zeile).
- **Folge-AC:** AC3 (Audit) bleibt **unbewiesen**, bis H-1 gefixt ist — der Audit-INSERT konnte nie erfolgreich laufen.

### Produktionsreife-Empfehlung: ❌ NOT READY

Die RLS-Durchsetzung (das eigentliche „Tor") ist **wasserdicht** — alle 6 Angriffsvektoren + Edges bestanden. Aber **H-1 (HIGH)** macht den Vergabe-/Entzugs-Mechanismus in Prod unbenutzbar und lässt AC3 (Audit) unbewiesen. **Status bleibt In Review.** Nach dem `/backend`-Fix für H-1 (+ Live-Re-Verify grant/revoke/Audit) ist 100a production-ready.

### Reproduzierbares Pentest-Skript

Der vollständige rollenbasierte Pentest (Seed → 6 Vektoren + Edges → Teardown mit 0-Residue-Check) ist als wiederverwendbares SQL in `tests/sql/PROJ-100a-need-to-know-pentest.sql` abgelegt — re-runbar gegen Prod oder eine Shadow-DB nach jedem Touch der Gate-Migration.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · B — Rollen, Gremien & Governance_
