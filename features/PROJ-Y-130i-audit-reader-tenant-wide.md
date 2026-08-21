# PROJ-Y-130i — Die Revisions-Freigabe erreicht auch die mandantenweiten Zweige

## Status: Deployed
## Deployment Scope: full

Followup aus **PROJ-130-γ2**, dort als bewusste Grenze notiert. γ2 hat die Freigabe
`audit_reader_grants` eingeführt und im Lesetor `can_read_audit_entry` an **einer** Stelle verdrahtet:
dem gemeinsamen Ausgang. Zweige, die vorher zurückgeben, erreichen ihn nicht — ein Prüfer ohne
Mandanten-Mitgliedschaft sah die mandantenweiten Änderungen also nicht.

Der Grundsatz aus γ2 bleibt unangetastet: **die Freigabe ersetzt die Mitgliedschaft, nicht die
Klassifikation.** Diese Slice zieht ihn nur in die Zweige nach, die den gemeinsamen Ausgang nicht
erreichen.

---

## Was die Messung am Zuschnitt geändert hat

Die Notiz sprach von „9 weiteren Einzel-Ersetzungen". Live sind es **10** — `construction_trades` kam
mit PROJ-45-α zwei Tage nach γ2 hinzu. Die Zahl wächst mit jeder Slice, die einen mandantenweiten
Katalog anlegt; die Migration zählt deshalb ihre Treffer, statt sich auf eine Zahl zu verlassen.

Wichtiger ist die zweite Messung. Die frühen Rückgaben teilen sich in drei Formen:

| Form | Zweige | Audit-Zeilen in Prod |
|---|---|---|
| **A** `return is_tenant_member(p_tenant_id)` | 10 Kataloge | **6** |
| **B** `return is_tenant_admin(p_tenant_id)` | 2 Skill-Kataloge | 0 |
| **C** `return false` | u. a. `tenants`, `tenant_settings`, `resources` | **126** |

Der registrierte Umfang war Klasse A und trägt in Prod sechs Zeilen. Klasse C trägt 126 — darunter
**fünf Umschaltungen von `audit_lifecycle_exempt`**, also genau des Schalters, den PROJ-Y-130h
auditpflichtig gemacht hat mit der ausdrücklichen Begründung, „wer die Ausnahme setzt, kann seine eigene
Spur nicht verwischen". Lesen durfte diese Zeilen bisher **nur die Mandanten-Administration** — dieselbe
Gruppe, die den Schalter setzt. Ein eingesetzter Prüfer sah sie nicht. **Das ist der eigentliche Befund
dieser Slice**, und er lag außerhalb des registrierten Umfangs.

## Nutzer-Entscheid

**A plus die mandantenweite Konfiguration, ohne `resources` und ohne die zwei Skill-Kataloge.**

- `tenants` / `tenant_settings` / die zwei Overrides sind Konfiguration. Inhalt live geprüft, nicht
  vermutet: Branding, Sprache, `active_modules`, `privacy_defaults`, `ai_provider_config`
  (Modell + Anbieter, **kein** Schlüsselmaterial) und die exempt-Umschaltungen. Keine Personendaten.
- `resources` bleibt draußen: dort stehen `display_name` und Tagessätze. Die Redaktion existiert
  **nur** im Export und **nur** für `stakeholders` (`CLASS_3_STAKEHOLDER_FIELDS`), während Bericht und
  Verlauf überhaupt nicht redigieren — ein Zweig hier wäre Klartext an einen möglicherweise externen
  Prüfer.
- Die zwei Skill-Kataloge bleiben draußen, weil sie an `is_tenant_admin` hängen: die Freigabe ersetzt die
  Mitgliedschaft, nicht die Rolle. Dieselbe Linie zieht γ4 beim Export, wo `redaction_off`
  Admin-Vorbehalt bleibt.

## Zwei Formen, zwei Bedeutungen

Klasse A wird zu `is_tenant_member(...) or has_audit_reader_grant(...)` — die Mitgliedschaft bleibt der
reguläre Weg, die Freigabe tritt daneben. Klasse C wird zu **nur** `has_audit_reader_grant(...)`: diese
Zweige sind absichtlich nicht mitglieds-sichtbar, ein `or is_tenant_member` hätte jedem Mitglied die
Konfigurationshistorie geöffnet — eine Ausweitung, die niemand beschlossen hat. Die Administration kommt
weiterhin über den Kurzschluss in Zeile 1 herein.

Übersprungen wird nichts: `_audit_entry_classified_ok` hat 24 Zweige und kennt **keinen** der 14
betroffenen Typen (live gezählt = 0). Die frühen Rückgaben umgehen also keine existierende Prüfung.

---

## Akzeptanzkriterien

- [x] **AC-Y130i.1** — Die 10 Katalog-Zweige (Klasse A) akzeptieren neben der Mitgliedschaft die
      Freigabe. Zahl gemessen, nicht angenommen.
- [x] **AC-Y130i.2** — Die vier Konfigurations-Zweige (`tenants`, `tenant_settings`, beide Overrides)
      akzeptieren die Freigabe — und **nur** sie, nicht die Mitgliedschaft.
- [x] **AC-Y130i.3** — `resources` bleibt geschlossen; belegt im Verhalten (P2) **und** durch eine
      Post-Condition, die eine spätere unachtsame Ersetzung laut fehlschlagen lässt.
- [x] **AC-Y130i.4** — Die zwei Skill-Kataloge bleiben an `is_tenant_admin`.
- [x] **AC-Y130i.5** — γ1 bleibt unberührt: `strict` ohne Freischaltung bleibt für den Prüfer unsichtbar
      (γ1-Vektor E), die Klassifikationsprüfung steht weiter hinter dem gemeinsamen Ausgang.
- [x] **AC-Y130i.6** — Anker sind whitespace-tolerant und gezählt; ein nicht treffender Anker bricht die
      Migration laut ab statt still nichts zu tun (PROJ-Y-115c-Lehre).
- [x] **AC-Y130i.7** — Geschwister-Zweige erhalten: 64 `when`-Zweige vor und nach der Migration,
      Re-Grant in derselben Migration, `anon` bleibt entzogen.
- [x] **AC-Y130i.8** — Live-Verhaltensnachweis gegen Prod mit **0 Rückständen**, geführt unter einem
      Nicht-Mitglied (für Administratoren kurzschließt das Tor — eine Probe unter Admin wäre falsch-grün).

## Definition of Done

- [x] Migration in Prod und im Repo; Zustand unabhängig nachgemessen statt den Post-Conditions geglaubt.
- [x] Pentest `tests/sql/PROJ-Y-130i-audit-reader-tenant-wide-pentest.sql` **33/33 PASS, 0 FAIL**.
- [x] Regressionen: γ2 **11/11 wörtlich**, γ1 **11/11** (nach dem G2-Umbau, siehe F-1).
- [x] Gates: ESLint 0 · tsc 13 = Baseline / 0 neu · vitest 3414/3414 · Build clean · migration-naming 0 ·
      index-scope 0.
- [x] CI-Lauf grün, gemergt, getaggt, Zustand nach dem Merge erneut gemessen.

---

## Nachweise

**Verhaltensprobe, sechs Phasen, 33 Zusicherungen, alles zurückgerollt.** Tragend sind die
**negativen** Zeilen, nicht die positiven:

| Phase | Was sie belegt |
|---|---|
| P0 | Der Prüfer ist **kein** Mitglied und die Impersonation greift — ohne das wäre alles Folgende bedeutungslos |
| P1 | Ohne Freigabe sieht er **nichts**, auch nicht die Kataloge |
| P2 | Mit Freigabe: 9 Zweige offen — **und `resources`, beide Skill-Kataloge, der unbekannte Typ bleiben zu** |
| P3 | Eine abgelaufene Freigabe wirkt nicht (die Frist wird bei jedem Lesen geprüft, nicht beim Erteilen) |
| P4 | Die Freigabe gilt genau für ihren Mandanten |
| P5 | Ein gewöhnliches Mitglied sieht Klasse A, aber **nicht** die Konfiguration — die Gegenrichtung |
| P6 | Der Administrator sieht unverändert alles (Kurzschluss intakt) |

Die Probe braucht **keine** echten Audit-Zeilen: die geänderten Zweige schauen `p_entity_id` gar nicht
an. Zufallskennungen sind darum kein Behelf, sondern genau richtig — und halten die Probe von Kundendaten
fern. Rückstände anschließend über fünf Zähler geprüft; dass die neueste
`tenant_memberships`-Audit-Zeile sieben Tage alt ist, belegt unabhängig, dass der Rollback nichts
hinterlassen hat.

Zustand in Prod unabhängig nachgemessen: Klasse A **10** kombiniert / **0** blank übrig, Konfigurations-
Zweige **4**, `has_audit_reader_grant` **15** Vorkommen (1 gemeinsamer Ausgang + 10 + 4), `when`-Zweige
**64 unverändert**, `resources` weiter geschlossen, 2 Skill-Zweige weiter admin-gegatet, Klassifikation
und `else`-Zweig intakt, `authenticated` ja / `anon` nein, DEFINER + STABLE.

---

## Funde

**F-1 (Bestandsbefund, nicht diese Slice) — γ1s Vektor G2 nagelte eine absolute Zahl und war rot.**
Der Vektor prüfte „genau 60 `when`-Zweige"; live sind es 64. **Nicht** durch meine Änderung: meine erste
Messung *vor* der Migration ergab bereits 64, und die vier Zweige sind namentlich zugeordnet —
`construction_defects` (PROJ-45-β), `construction_acceptances` (PROJ-45-γ), `document_extractions` und
`document_summaries` (PROJ-80-α1), belegt über die Migrationsdateien, die das Lesetor anfassen.
60 + 4 = 64.

Die Datei hatte diesen Ausgang selbst vorhergesagt: ihr Kommentar vom 2026-08-13 hielt fest, dass die
absolute Zahl „das falsche Mittel" sei, „weil sie bei jeder legitimen Erweiterung fehlschlägt", und
verwies auf einen eigenen Followup. Statt die Zahl ein zweites Mal hochzuschieben ist G2 jetzt eine
**Untergrenze** (≥ 60, fängt *verlorene* Zweige) plus **G2b**, das 30 Geschwister-Zweige **namentlich**
prüft — ein Clobber, der einer Feature-Familie den Zweig nimmt, fällt damit auf, während eine legitime
Erweiterung nichts kaputt macht. Dieselbe Lehre, die PROJ-130-α für Migrations-Zusicherungen gezogen hat
(Delta statt Absolutwert). **Rot-Grün ausgeführt:** ein erfundener Zweigname in der Liste ergibt 29/30 →
FAIL, der Vektor greift also nicht ins Leere.

**F-2 (Info) — die Prosa in γ2s Notiz beschrieb die Formen ungenau.** Sie nannte
„`is_tenant_member(...)`/`return false`"-Zweige in einem Atemzug; das sind zwei verschiedene
Berechtigungsstufen, und die Unterscheidung entscheidet, ob eine Ersetzung Mitgliedern etwas öffnet oder
nicht. In dieser Spec sind sie getrennt (A/B/C).

---

## Abweichungen

- **D-Y130i.1 — der Umfang ist größer als registriert.** Die Notiz nannte nur Klasse A; der Nutzer-
  Entscheid nimmt die mandantenweite Konfiguration dazu, weil dort die exempt-Umschaltungen liegen.
  Begründung und Datenlage oben; `resources` und die Skill-Kataloge bleiben bewusst draußen.
- **D-Y130i.2 — die Redaktionslücke wird nicht in dieser Slice geschlossen.** Gemessen: `[redacted:class-3]`
  existiert nur in der Export-Route und nur für `stakeholders`; Bericht und Verlauf redigieren gar nicht.
  Das ist der Grund, `resources` auszunehmen — aber es bleibt eine eigene Frage für die Flächen, die schon
  heute Personendaten zeigen (Mitglieder mit Projektbezug). Eigener Followup **PROJ-Y-130r**.
- **D-Y130i.3 — Registrierter Migrationsname trägt den Dateistamm, der Rumpf in Prod trägt einen
  gekürzten Kopfkommentar.** Der Repo-Dateikopf begründet die Entscheidung ausführlich; die registrierte
  Fassung verweist darauf. Reiner Kommentar, keine semantische Abweichung — die ausführbaren Anweisungen
  sind identisch.
- **D-Y130i.4 — kein Anwendungscode.** Die Sichtbarkeit entscheidet die RLS über dieses Tor; keine Route,
  kein Hook, kein Test in `src/` musste sich ändern. Die Revisions-Sicht aus PROJ-Y-130o/130p zeigt die
  neuen Zeilen ohne Zutun.

---

## Deployment

**Deployed 2026-08-20: PR #425 (squash) → main `37380d7`, Tag `v2.70.0-PROJ-Y-130i`.**

- Die Migration liegt seit dem Bau in Prod, registriert unter dem **Dateistamm**
  `20260820140000_projy130i_audit_reader_tenant_wide` (PROJ-134-konform). Beim Merge gab es **keine**
  Laufzeit-Änderung an der Datenbank.
- Post-Deploy erneut gegen Prod gemessen, nicht aus dem Bau-Lauf übernommen: Klasse A **10**,
  Konfigurations-Zweige **4**, `resources` weiter **zu**, Skill-Kataloge weiter **admin-gegatet**,
  `when`-Zweige **64**, `authenticated` ja / `anon` nein, **0** Freigaben als Rückstand.
- Der Merge liefert **keinen** Anwendungscode aus (kein `src/`-Diff) — ein HTTP-Smoke wäre gegenstandslos.
  Tragender Nachweis bleibt der Verhaltens-Pentest (33/33 unter einem Nicht-Mitglied) plus die beiden
  wörtlich grünen Regressionen.
- Der Versions-Teil des Tags ist wie schon einmal im Bestand doppelt belegt (`v2.70.0-PROJ-45-gamma` aus
  einer parallelen Lane); die Tag-**Namen** bleiben eindeutig.

### Warum `full`

Alle acht Akzeptanzkriterien sind belegt, nichts ist zurückgestellt. **PROJ-Y-130r** ist keine
zurückgestellte Anforderung dieser Slice, sondern eine **neu entdeckte** Nachbarfrage: die Redaktion war
nie Teil des Auftrags, und ihre Enge ist genau der Grund, `resources` bewusst auszuschliessen — eine
Entscheidung, nicht eine Auslassung. Geliefert ist eine rechte-setzende Migration mit Post-Conditions,
also keine Werkzeug-Ebene.
