# PROJ-Y-130s — Geisterspalten in der Audit-Whitelist

## Status: In Review
## Deployment Scope: —

Followup zu PROJ-130. Registriert in [`OPEN-DEFERRED-STATUS.md`](OPEN-DEFERRED-STATUS.md).

## Problem

`_tracked_audit_columns` nennt **58 Spalten, die es nicht gibt**. Die Feldänderungen dahinter
werden lautlos nicht protokolliert — kein Fehler, keine Meldung, kein Log.

**Mechanismus, am Funktionskörper belegt:** `record_audit_changes` macht
`v_old := to_jsonb(OLD) -> v_col`. Für einen fehlenden Schlüssel liefert `->` SQL-`NULL` statt
eines Fehlers, und `NULL is distinct from NULL` ist `false` — die Zeile wird übersprungen.
Genau deshalb ist der Defekt seit PROJ-130-α unbemerkt geblieben.

**Ursprung (nicht Schema-Drift, sondern Whitelist-Regression):** PROJ-11
(`20260429240000`) hat die Whitelist am 2026-04-29 gegen das *reale* Schema geschrieben.
Zwei Tage später hat PROJ-21 (`20260501140000_proj21_report_snapshots.sql`, Z. 165–168) sie
gegen ein **fiktives** Schema neu geschrieben. Das Schema war stabil; die Whitelist wurde
falsch überschrieben.

## Messung (live gegen Prod, 2026-08-27)

| | |
|---|---|
| Objektarten mit Geistern | **14** |
| Geisterspalten gesamt | **58** |
| davon wirksam (Tabelle hat `record_audit_changes`-Trigger) | **54** auf 13 Tabellen |
| davon wirkungslos (`budget_postings`, per PROJ-130-α ohne Feld-Trigger) | 4 |
| Objektarten zu **100 %** Geister | 3 — `tenant_method_overrides` (5/5), `tenant_project_type_overrides` (5/5), `work_item_resources` (4/4) |

**Die Registerzahl 53 ist falsch — es sind 58.** Alle *Einzel*zahlen der Registerzeile
stimmen (`resources` 7, `vendors` 5, `vendor_invoices` 5, `work_items` 1, die drei
100-%-Tabellen 5/5/4, `budget_postings` 4); nur die Summe wurde nie nachgerechnet. Folglich
sind auch die dort genannten „49 wirksamen" falsch: es sind **54**. Dieselbe Klasse wie
PROJ-45-β D-45β-DEPLOY-1 („sechs Trigger", real fünf) — eine Zahl, die niemand nachgezählt
hat. Register und diese Spec sind korrigiert.

**Eine Vermutung aus der Voranalyse ist widerlegt.** Der Verdacht, spätere Anker-Migrationen
hätten die Whitelist in Prod bereits repariert (weil `display_name`/`allocation_pct` im Trail
auftauchen), trägt nicht: alle diese Zeilen datieren auf den **2026-04-29**, also in das
Zwei-Tage-Fenster vor der PROJ-21-Regression. Die Live-Definition trägt alle 53 Geister.

**Nebenbefund, eigene Klasse:** zehn Feldnamen im Trail sind **reale** Spalten, die
protokolliert wurden und heute nicht mehr getrackt sind. Sechs stammen aus dem 29.04.-Fenster;
vier auf `work_items` (`planned_start`, `planned_end`, `wbs_code`, `release_id`) wurden **nach**
der Regression noch protokolliert — `release_id` bis 2026-06-10. Die `work_items`-Whitelist
wurde also *später* zusätzlich beschnitten: die Clobber-Klasse, vor der CLAUDE.md warnt.

## Zuschnitt

**α (diese Slice):** 58 Geister entfernen, PII-freie reale Spalten aufnehmen, Wächter mit
leerer Ausnahmeliste, Live-Pentest.

**β (zurückgestellt bis PROJ-Y-130r geschlossen ist):** `resources.display_name` und
`vendors.primary_contact_email`. Grund: PROJ-Y-130r hat gemessen, dass die Class-3-Redaktion
**nur** `stakeholders` in **nur** der Export-Fläche abdeckt — Berichts-Route und Verlaufs-Tab
redigieren gar nicht. Personenbezogene Werte in einen append-only Trail ohne Löschpfad und
ohne Redaktion zu schreiben, wäre eine Einwegtür.

### Auswahlregel für α

**Aufnehmen** nur, wenn die Spalte fachlich veränderbar ist **und** ihr Wert weder
personenbezogene Daten noch Freitext trägt (Schlüssel, Flags, Zahlen, Datumsfelder,
kontrollierte Vokabulare, fachliche Bezüge).

**Nicht aufnehmen**, drei Klassen mit je eigener Begründung:

1. **PII und Freitext** — keine Redaktion vorhanden (PROJ-Y-130r): `resources.display_name`,
   `vendors.primary_contact_email`, `communication_outbox.recipient`/`.error_detail`/`.metadata`,
   `vendor_documents.note`, `vendor_invoices.note`, `vendor_project_assignments.scope_note`,
   `work_item_documents.body`/`.checklist`, `work_items.attributes`.
2. **Abgeleitet oder maschinengeschrieben** — würde den Trail mit Rauschen füllen (dieselbe
   Begründung, mit der PROJ-80-α1 `extracted_text` bewusst nicht trackt):
   `resources.recompute_status`, `work_items.derived_*`, `.position`, `.outline_path`,
   `work_item_documents.version`.
3. **Identität und Herkunft** — bei Anlage gesetzt, nie geändert: die definierenden
   Fremdschlüssel sowie `work_items.created_from_proposal_id`/`.source_template_*`.

**Leitprinzip bei Zweifel: weglassen.** Aufnehmen ist eine Einwegtür (append-only, kein
Löschpfad seit PROJ-130-α); Weglassen ist jederzeit nachholbar.

**Die Regel bestätigt sich selbst:** für `work_item_resources` liefert sie exakt
`allocation_pct` — also genau die Whitelist, die PROJ-11 vor der Regression hatte.

## Akzeptanzkriterien

- **AC-Y130s.1** — Nach der Migration nennt `_tracked_audit_columns` in Prod **0** Spalten, die
  in `information_schema.columns` fehlen. Gemessen, nicht zugesichert.
- **AC-Y130s.2** — Die Entfernung ist rein subtraktiv: keine heute reale, getrackte Spalte
  verliert ihren Eintrag. Als Delta geprüft, nicht als Absolutzahl (PROJ-130-α-Lehre).
- **AC-Y130s.3** — Die 26 aufgenommenen Spalten entsprechen der Auswahlregel; PII bleibt
  ausgeschlossen und ist als β registriert.
  ausgeschlossen und ist als β registriert.
- **AC-Y130s.4** — Die vier nachweislich verlorenen `work_items`-Spalten (`planned_start`,
  `planned_end`, `wbs_code`, `release_id`) sind wieder getrackt.
- **AC-Y130s.5** — `work_items.due_date` und `.workstream_id` sind getrackt; damit ist PROJ-45s
  Bestandsfund geschlossen, der bisher nur in der INDEX-Prosa stand.
- **AC-Y130s.6** — Alle 14 Anker-Ersetzungen laufen aus der **Live**-Definition, jede mit
  Eindeutigkeitsprüfung; die Migration bricht laut ab, wenn ein Anker ≠ 1 Treffer hat.
- **AC-Y130s.7** — Die übrigen 64 CASE-Zweige sind unverändert (Clobber-Kontrolle), der
  `authenticated`-Grant ist erhalten.
- **AC-Y130s.8** — Ein Wächter prüft die Whitelist gegen das reale Schema und schlägt bei jedem
  neuen Geist fehl. Ausnahmeliste **leer**.
- **AC-Y130s.9** — Der Wächter meldet eine in der Prüfumgebung fehlende Tabelle als **eigene
  Kategorie**, nicht als Geisterspalten.
- **AC-Y130s.10** — Live-Pentest gegen Prod belegt, dass eine Feldänderung an einer der drei
  100-%-Geister-Tabellen jetzt wirklich eine Audit-Zeile erzeugt. 0 Rückstände.

## Tech-Design

**Migration.** Anker-Ersetzung aus `pg_get_functiondef` für 14 CASE-Zweige. Anker
whitespace-tolerant (`when\s+'tbl'\s+then\s+array\[…\]`) — ein literaler Anker traf in
PROJ-Y-115c in Prod und brach im Fresh-Apply. Je Zweig Trefferzählung mit `raise` bei ≠ 1;
Post-Conditions prüfen Geisterzahl 0, Zweigzahl unverändert und Grant erhalten.
`record_audit_changes` selbst wird **nicht** angefasst.

**Wächter.** Kein Datei-Wächter: 14 der 78 Whitelist-Migrationen nutzen Anker-Ersetzung und
sind statisch nicht auflösbar — eine Dateianalyse müsste die effektive Definition raten. Der
Schema-Drift-Workflow betreibt bereits eine Postgres-17-Shadow-DB mit allen Migrationen; dort
steht die *effektive* Definition zur Verfügung. Der Wächter ist daher ein zusätzlicher Schritt
in `schema-drift.yml`, ohne neue Infrastruktur und ohne Secret.

## Abgrenzung

- `budget_postings` wird mitbereinigt, obwohl seine 4 Geister wirkungslos sind (kein
  Feld-Trigger per PROJ-130-α) — rein subtraktiv, sonst meldet der Wächter sie dauerhaft.
- `communication_outbox` verliert mit `recipient_emails` die Empfänger-Protokollierung. Sie war
  **nie** vorhanden (Geist); die Slice macht das sichtbar, statt es zu verschlechtern. Die reale
  Spalte `recipient` ist PII → β.
- `vendors` bekommt in α **keine** Aufnahme: die einzige untrackte reale Spalte ist
  `primary_contact_email` und damit β.
- `work_items.phase_id`, `.milestone_id`, `.wbs_code_is_custom` sind fachlich plausible
  Kandidaten, aber nicht belegt gefordert — nach dem Leitprinzip weggelassen.

## CIA

CIA-Pass am 2026-08-26 gelaufen (Agent `af4c3f611cba5411d`). Der α/β-Zuschnitt **ist** sein
Ergebnis; die Registerauflage „CIA-pflichtig" ist damit erfüllt. Vom CIA-Vorschlag weicht diese
Slice in einem Punkt ab: der Wächter läuft gegen die Shadow-DB statt als Dateianalyse — mit der
oben gemessenen Begründung.

## Nachweise (live gegen Prod, 2026-08-27)

**Migration** `20260827100000_projy130s_audit_whitelist_ghost_cleanup` in Prod. 14 Anker-Ersetzungen,
jede mit Trefferzählung; Post-Conditions prüfen Geisterzahl, Zweigzahl und Grant.

Vorher → nachher, unabhängig gemessen statt der Post-Condition geglaubt:

| | vorher | nachher |
|---|---|---|
| CASE-Zweige | 78 | **78** (unverändert) |
| Whitelist-Einträge | 504 | 472 |
| davon Geister | **58** | **0** |
| davon real | 446 | **472** (+26) |
| `authenticated`-EXECUTE | ja | ja |
| `anon`-EXECUTE | nein | nein |
| Audit-Zeilen | 698 | **698** (0 Rückstände) |

Die Rechnung geht auch zweigweise auf: die 14 bearbeiteten Zweige hatten 41 reale Einträge und
haben jetzt 67 (+26); die übrigen 64 Zweige bleiben bei 405.

**Live-Pentest** `tests/sql/PROJ-Y-130s-audit-whitelist-pentest.sql` — **7/7 PASS, 0 Rückstände**.
Der Block erzwingt seinen Rollback selbst (Exception am Ende): in einem append-only Trail ohne
Löschpfad darf es keinen Pfad geben, auf dem er committet.

| Vektor | Ergebnis |
|---|---|
| V1 keine Geister über alle 78 Zweige | PASS |
| V2 rein subtraktiv (keine reale getrackte Spalte verloren) | PASS |
| **V3 `work_item_resources.allocation_pct` erzeugt eine Audit-Zeile** | **PASS** |
| **V4 nicht getracktes Feld bleibt still** (Nicht-Leerlauf-Kontrolle) | **PASS** |
| V5 `tenant_method_overrides.enabled` protokolliert | PASS |
| V6 14 Geschwister-Zweige namentlich intakt | PASS |
| V7 Grants (`authenticated` ja, `anon` nein) | PASS |

V4 trägt V3: ohne ihn bewiese V3 nur „irgendein Trigger feuert", nicht „die Whitelist steuert ihn".

**Rot-Grün ausgeführt** (zurückgerollt): mit der *alten* Whitelist erzeugt dieselbe Änderung an
`allocation_pct` **0** Audit-Zeilen — der Defekt ist reproduziert, nicht bloß behauptet —, mit der
neuen **1**.

**Wächter** `.github/workflows/schema-drift.yml`, Schritt „Verify audit whitelist vs real schema".
Gegen Prod gefahren: grün **0** Geister; **Rot-Probe** mit künstlich eingesetzter Spalte findet
`projects.spalte_die_es_nicht_gibt` und schlägt fehl. Die zweite Kategorie („Tabelle fehlt") meldet
in Prod nichts — alle 78 Whitelist-Tabellen existieren.

## Akzeptanzkriterien — Stand

| AC | Ergebnis |
|---|---|
| .1 0 Geister in Prod | ✅ gemessen |
| .2 rein subtraktiv | ✅ V2, zweigweise Delta |
| .3 26 Aufnahmen nach Regel, PII ausgeschlossen | ✅ |
| .4 vier verlorene `work_items`-Spalten wieder getrackt | ✅ |
| .5 `due_date` + `workstream_id` getrackt (PROJ-45-Fund) | ✅ |
| .6 14 Anker aus Live-Definition, je 1 Treffer | ✅ |
| .7 64 Zweige unverändert, Grant erhalten | ✅ V6 + Zählung |
| .8 Wächter, Ausnahmeliste leer | ✅ rot-grün belegt |
| .9 fehlende Tabelle als eigene Kategorie | ✅ |
| .10 Verhaltensnachweis, 0 Rückstände | ✅ V3/V5 |

## Abweichungen

- **D-Y130s.1** — Die Registerzahl **53 war falsch, es sind 58**; alle Einzelzahlen stimmten, nur
  die Summe war nie nachgerechnet. Register und Spec korrigiert.
- **D-Y130s.2** — Wächter gegen die Shadow-DB statt als Dateianalyse (CIA-Vorschlag). Begründung:
  14 der 78 Whitelist-Migrationen patchen per Anker-Ersetzung; statisch ist die effektive
  Whitelist nicht rekonstruierbar.
- **D-Y130s.3** — Kein `src/`-Diff. `src/types/audit.ts` führt die Objektarten, nicht die Spalten;
  die Slice ändert keine Spaltenliste im Anwendungscode.
- **D-Y130s.4** — Kein authentifizierter Browser-Durchlauf. Der Verlaufs-Tab würde die neuen
  Feldnamen zeigen, aber der Nachweis bräuchte eine committende Feldänderung in Prod — also eine
  unlöschbare Zeile im append-only Trail. Der Trigger ist stattdessen direkt gemessen (V3/V5).

## Folgearbeit

- **PROJ-Y-130s-β** — `resources.display_name`, `vendors.primary_contact_email`, gesperrt bis
  PROJ-Y-130r die Redaktion schließt.
- **Nicht aufgenommen, bewusst:** `work_items.phase_id`/`.milestone_id`/`.wbs_code_is_custom` und
  die Freitextspalten. Nachholbar; Aufnehmen wäre es nicht.
