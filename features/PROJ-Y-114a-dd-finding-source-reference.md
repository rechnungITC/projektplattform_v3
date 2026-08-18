# PROJ-Y-114a: Quelle / Herkunftsnachweis am DD-Finding

## Status: In Progress
## Deployment Scope: —

**Created:** 2026-08-18
**Parent:** PROJ-114 (DD-Findings) · **Requirement-Herkunft:** PROJ-108 AC1 (superseded)
**Absorbiert:** PROJ-Y-113c (`dd_findings.source_dd_question_id`, aus PROJ-113)
**Priorität:** P1 (Should-have)

> **Warum diese ID?** Das Register führte diese Arbeit als **`PROJ-Y-1`** — ein Name, der
> im Repo **fünffach** belegt ist: PROJ-70 (OCR), PROJ-98 (Stage-Gate-Anbindung),
> PROJ-100c (Pro-Objekt-„sensibel"), PROJ-114 (E-Mail-Eskalation) und PROJ-116
> (Word-Export) führen jeweils ein eigenes „PROJ-Y-1". Die globale Registerzeile war
> damit nicht eindeutig auflösbar — und ausgerechnet mit **PROJ-114s eigenem**
> „PROJ-Y-1" (E-Mail-Eskalation) kollidierte sie, obwohl beide dasselbe Elternteil
> haben. Vergeben ist deshalb `PROJ-Y-114a` (frei geprüft: kein `PROJ-Y-114*`
> existierte); das Elternteil ist korrekt, weil die Umsetzung eine additive
> Erweiterung des deployten `dd_findings` ist. `Next Available ID` bleibt unberührt —
> dies ist ein Followup, kein Hauptfeature.

---

## 1. Prior-Art-Prüfung (der eigentliche Kern dieser Slice)

Gegen den **deployten** Stand geprüft (Supabase-MCP für die DB, Dateien für den Code),
nicht aus Spec-Prosa geschlossen. Der Auftrag lautete ausdrücklich: erst prüfen, dann
bauen — und keine zweite Wahrheit neben `external_document_links` errichten.

| Bestandteil von „Quelle/Dokumentenverweis" | Befund | Beleg |
|---|---|---|
| **Dokumentenverweis, extern** (VDR/SharePoint-URL) | **bereits erfüllt** — nichts zu bauen | `external_document_links_entity_type_check` enthält live `'dd_finding'` (6 Werte); `<ExternalLinksSection entityType="dd_finding">` hängt im Finding-Dialog (`dd-findings-panel.tsx:503`); Live-Pentest PROJ-115 A–I **9/9** re-verifiziert, Need-to-know je Typ dicht |
| **Dokumentenverweis, intern** (DMS-Knoten) | **bewusst nicht gebaut** → PROJ-Y-114b | `external_document_links.url` trägt CHECK `https://%` (SSRF-Härtung) und kann keinen Knoten adressieren; DMS in Prod **leer**: `documents` 0, `document_tree_nodes` 0 — dieselbe Messlage, mit der PROJ-80 seinen Vektor-Teil zurückstellte |
| **„Quelle" als Aussage** (Interview, Begehung, Analyse, Datenraum-Fundstelle) | **echte Lücke → gebaut** | `dd_findings` hatte 17 Spalten, **keine** für Herkunft; einziger Ablageort war `description` — der Befund und sein Nachweis lagen im selben Freitext |
| **Q&A-Antwort als Quelle** | **echte Lücke → gebaut** | kein FK `dd_findings → dd_questions` in irgendeiner Migration; PROJ-113 hatte die Spalte **namentlich vorgezeichnet** (`dd_findings.source_dd_question_id`, „downstream-Pattern") und als **PROJ-Y-113c** an PROJ-114 übergeben — PROJ-114 baute sie nie |

**Zwei Bookkeeping-Funde dabei:**

1. **PROJ-Y-113c war nie registriert.** Die ID existiert ausschließlich in der
   PROJ-113-Spec (4 Nennungen, inkl. Reuse-Matrix-Zeile für AC4), nicht in
   `OPEN-DEFERRED-STATUS.md`. Ein zugesagter Followup, der im Register fehlt, ist
   praktisch verloren — er wird hier mit-eingelöst und nachträglich registriert.
2. **Die Oberfläche behauptete etwas Falsches.** `dd-questions-sheet.tsx` trug einen
   **deaktivierten** Knopf „Zu Finding eskalieren" mit dem Tooltip „Verfügbar mit
   DD-Findings (PROJ-114)" — PROJ-114 ist seit dem **2026-06-26** live. Der Platzhalter
   versprach die Funktion als Zukunft, während ihr Fundament seit sieben Wochen stand
   (gleiche Klasse wie PROJ-45s `is_placeholder`-Fund und die Ehrlichkeitsarbeit in
   PROJ-Y-143f).

**Ergebnis:** Antwort **(b)** — der Followup war **zur Hälfte** erledigt (externer
Dokumentenverweis), die andere Hälfte („Quelle") fehlte vollständig. Ein Feld-Trio
plus UI, kein neues Modell, keine zweite Verweis-Wahrheit.

---

## 2. Was gebaut wurde

Drei **nullable** Spalten an `dd_findings` — Bestandsverhalten bleibt byte-identisch:

| Spalte | Zweck |
|---|---|
| `source_kind` | Klasse des Nachweises (CHECK: `document`/`qa_answer`/`interview`/`site_visit`/`analysis`/`other`) |
| `source_ref` | menschlicher Fundort, ≤ 500 Zeichen („VDR 3.4.1", „Interview CFO 12.05.") |
| `source_dd_question_id` | maschinell prüfbare Quelle: FK → `dd_questions`, **`ON DELETE RESTRICT`** |

Warum die Klasse **und** der Fundort: für ein Deal-Breaker-Finding ist der Unterschied
zwischen „steht im unterzeichneten Vertrag" und „sagte jemand im Gespräch" der
eigentliche Beweiswert — eine reine Freitextzeile trägt diese Unterscheidung nicht
auswertbar. Und `RESTRICT` statt `SET NULL`, weil ein Herkunftsnachweis, der beim
Löschen seiner Quelle stillschweigend verschwindet, kein Nachweis ist (Muster der
Provenance-FKs aus PROJ-120 / PROJ-Y-96e, Begründung PROJ-141-γ3).

**Sicherheitsentscheidung, die nicht im Auftrag stand:** Der Konsistenz-Trigger prüft
nur die Projektzugehörigkeit und läuft als `SECURITY DEFINER`, also an RLS vorbei.
Ohne eine zweite Prüfung wäre der Verweis ein **Existenz-Orakel** auf `strict`-Fragen
(genau die Klasse, die PROJ-120 als F-1 nachträglich schließen musste). Beide
Schreib-RPCs prüfen daher zusätzlich `can_access_classified(projekt, stufe_der_frage)`
— eine Frage, die man nicht sehen darf, kann man nicht als Quelle benennen (Vektor G/H).

**Explizites Leeren (`clear_source`):** Die drei Felder sind **eine** Aussage, nicht drei
unabhängige Felder. `clear_source=true` verwirft die alte Herkunft und setzt danach nur,
was mitgegeben wurde („Quelle neu benennen"). Ohne diesen Schalter ließe sich eine
einmal gesetzte Quelle **nie wieder entfernen**, weil `update_dd_finding` durchgängig
`coalesce(param, spalte)` verwendet — derselbe Defekt, den PROJ-122 als D-1 live hatte.

**Signaturwechsel statt Nebenfunktionen:** Beide RPCs wachsen um Parameter, wurden also
`DROP`+`CREATE` (ein abweichendes Argumentprofil erzeugt sonst eine *zweite* Funktion
und Overload-Ambiguität — PROJ-119-D-1) mit anschließend wiederhergestellten Grants
(Vorher-Stand `authenticated` + `service_role`, kein `anon`, kein `public`). Die neuen
Parameter stehen **hinten**, weshalb alle bestehenden positionsbasierten Aufrufe
unverändert auflösen — belegt durch die verbatim grüne PROJ-114/115-Regression.

**Register-Eingriff, minimal gehalten:** `audit_log_entity_type_check` und
`can_read_audit_entry` trugen den `dd_findings`-Zweig bereits (live geprüft) — nur
`_tracked_audit_columns` musste die drei Spalten lernen, sonst wäre „Audit aktiv" nur
scheinbar erfüllt. Anker-Ersetzung aus der **Live**-Definition, whitespace-tolerante
Regex, Treffer-Eindeutigkeit (=1), **Delta**-Prüfung (+3, keine Absolutzahl),
Post-Verifikation und Geschwister-Stichprobe über vier fremde Slices
(`dd_questions`/`committees`/`spa_issues`/`ma_valuations`), Re-Grant in derselben Folge.

**UI:** Quelle-Auswahl + Fundort im Finding-Dialog, Herkunft als Unterzeile unter dem
Titel in der Findings-Tabelle (kein zusätzliche Spalte), und der **aktivierte**
Eskalations-Knopf im Q&A-Detail, der das Finding mit `source_kind='qa_answer'` +
verknüpfter Frage anlegt — so entsteht die Provenance aus dem Arbeitsfluss statt aus
abgetippten Referenzen.

---

## 3. Akzeptanzkriterien und Belege

| AC | Kriterium | Beleg |
|---|---|---|
| AC-Y114a.1 | Ein Finding kann eine Quelle (Klasse + Fundort) tragen | Pentest **A** PASS; `create_dd_finding` persistiert `document` / `VDR 3.4.1` |
| AC-Y114a.2 | Eine DD-Frage ist als strukturierte Quelle verknüpfbar | Pentest **L** PASS (`source_dd_question_id` + `qa_answer`); Eskalations-Knopf aktiv |
| AC-Y114a.3 | Der externe Dokumentenverweis bleibt in `external_document_links` (keine zweite Wahrheit) | PROJ-115-Regression **A–I 9/9** verbatim; keine neue Link-Tabelle, `entity_type` unverändert 6 Werte |
| AC-Y114a.4 | Änderungen an der Quelle sind auditiert | Pentest **B** PASS (Audit-Zeile mit `field_name='source_kind'`); `_tracked_audit_columns('dd_findings')` 10 → **13** |
| AC-Y114a.5 | Eine gesetzte Quelle ist wieder entfernbar | Pentest **C** PASS (`null` behält, `clear_source` leert) |
| AC-Y114a.6 | Kein projektfremder Verweis | Pentest **D** PASS (23514, Konsistenz-Wächter) |
| AC-Y114a.7 | Vokabular und Länge erzwungen | Pentest **E** (erfundenes `source_kind` → 23514) + **F** (>500 Zeichen → 23514); Routen-Tests 400 ohne RPC-Aufruf |
| AC-Y114a.8 | Need-to-know: keine Verknüpfung auf eine unsichtbare Frage | Pentest **G** PASS (42501) **und** **H** PASS (nach Freigabe erlaubt — Tor ist echt, kein Blanket-Deny) |
| AC-Y114a.9 | Der Nachweis überlebt (kein stilles Verschwinden) | Pentest **I** PASS (23503 beim Löschen der Quell-Frage) |
| AC-Y114a.10 | Schreibrechte unverändert streng | Pentest **J** PASS (Editor 42501), **K** PASS (`anon` ohne EXECUTE auf beiden RPCs) |
| AC-Y114a.11 | Bestandsverhalten unbeschädigt | PROJ-114 **A–J 10/10** verbatim, PROJ-115 **A–I 9/9**, PROJ-Y-122a-Audit-Smoke **4/4** (`admin_shortcircuit=f`), Pentest **M** (Need-to-know hält) |
| AC-Y114a.13 | Ein **unveränderter** Verweis sperrt niemanden aus, ein **geänderter** verlangt weiter die Freigabe | Pentest **O** PASS (Titeländerung mit unverändert mitgesendetem `strict`-Verweis geht durch, nach Entzug der Freigabe) **und** **P** PASS (Umbiegen auf eine andere `strict`-Frage weiterhin 42501) |
| AC-Y114a.12 | Wächter nicht von außen aufrufbar, feuert dennoch | Pentest **N** PASS; Fix-forward-Migration + Live-Gegenprobe (`anon=f`, `auth=f`, ACL ohne PUBLIC, Trigger greift) |

---

## 4. Nachweise (live gegen Prod, 0 Rückstände)

- **`tests/sql/PROJ-Y-114a-dd-finding-source-pentest.sql` — A–P 16/16 PASS.**
  Nicht-Admin **synthetisiert** (`ld2` = Projektleitung ohne Mandanten-Adminrechte):
  in Prod ist jedes Mandanten-Mitglied Administrator, und für Administratoren
  schließt `can_access_classified` unbedingt mit `true` kurz — ein Smoke unter Admin
  wäre für G/H/M falsch-grün gewesen.
- **Rückstände 0** über 10 Zählungen nach jedem Lauf (Mandant, Mandant-per-Name,
  Profile, `auth.users`, Projekte, `dd_findings`, `dd_questions`, `dd_streams`,
  Freischaltungen, `audit_log_entries`).
- **Regressionen verbatim grün:** PROJ-114 A–J 10/10 · PROJ-115 A–I 9/9 ·
  PROJ-Y-122a-Audit-Smoke 4/4.
- **Advisors: 0 ERROR** (146 WARN = Bestand). Der Lauf **fand einen eigenen Fehler**
  (siehe F-1) und ist damit selbst der Nachweis, dass er nicht dekorativ gelesen wurde.

### Gates

| Gate | Ergebnis |
|---|---|
| `npx eslint .` | **0** (exit 0) |
| `npx tsc --noEmit` | **13 vorbestehend / 0 neu** (Verteilung unverändert, keiner in berührten Dateien) |
| `npx vitest run` | **3055/3055** (385 Dateien, +12 neu) |
| `npm run build` | clean, 12.4 s |
| `npm run check:migration-naming` | 220 Migrationen, **0 Fehler** |
| `npm run check:index-scope` | 171 Zeilen, **0 Fehler** |

---

## 5. Befunde

- **F-1 (Low, in dieser Slice gefunden und behoben):** `_dd_finding_source_question_guard()`
  war für `anon` **und** `authenticated` ausführbar, obwohl die Hauptmigration
  `revoke all ... from anon, authenticated` enthielt. Ursache: Postgres vergibt auf
  neuen Funktionen `EXECUTE` an **PUBLIC**; die beiden Rollen erben daraus, ein Entzug
  nur auf ihren Namen entfernt den PUBLIC-Eintrag nicht (ACL blieb `=X/postgres` — das
  führende `=` **ist** PUBLIC). Die beiden Schreib-RPCs waren korrekt, weil sie
  `from public, anon` entziehen. Nicht ausnutzbar (eine Trigger-Funktion bricht bei
  direktem Aufruf ab und liest ohnehin nur `dd_questions.project_id`), aber die
  Hausnorm verlangt den ausdrücklichen Entzug — gleiche Klasse wie die zwei vergessenen
  Revokes in PROJ-Y-130n. Fix-forward `20260817123000` (kein Datei-Edit, die
  Hauptmigration war in Prod), Gegenprobe: `anon=f`, `auth=f`, PUBLIC weg, **Trigger
  feuert weiter** — als Vektor **N** dauerhaft im Pentest.
- **F-4 (Medium, in dieser Slice selbst gefunden und behoben):** Die Selbstdurchsicht des
  Bearbeiten-Pfades deckte eine Falle **meines eigenen Entwurfs** auf. Der Dialog sendet
  `source_dd_question_id` bei jedem Speichern mit, um die Verknüpfung über
  `clear_source = true` hinweg zu erhalten — `update_dd_finding` prüfte den Verweis aber
  **unbedingt** gegen `can_access_classified`. Eine Projektleitung, deren Freigabe unter
  der Stufe der verknüpften **Frage** liegt, hätte das Finding damit gar nicht mehr
  bearbeiten können: 42501 selbst für eine reine Titeländerung, obwohl sie für das
  Finding selbst freigegeben ist. Über die Oberfläche nicht erreichbar (der
  Eskalationspfad legt das Finding im Stream der Frage an, einen Verweis-Picker gibt es
  nicht) und stets fail-closed, also kein Sicherheitsbefund — aber eine Falle, die
  zuschlägt, sobald ein Cross-Stream-Verweis über die API entsteht. Behoben mit der
  präzisen Regel **„ein unveränderter Verweis ist keine neue Offenlegung"**: geprüft wird
  nur bei `is distinct from` dem gespeicherten Wert (Fix-forward `20260817124000`). Dass
  die Abschwächung das Leck-Tor **nicht** öffnet, ist der eigentliche Nachweis und steht
  als Vektorpaar im Pentest: **O** (unverändert → erlaubt) **und** **P** (Umbiegen auf
  eine andere `strict`-Frage → weiter 42501).
- **F-2 (Info, Bookkeeping):** `PROJ-Y-113c` war in `OPEN-DEFERRED-STATUS.md` nie
  registriert (nur in der PROJ-113-Spec zugesagt). Hier eingelöst und nachgetragen.
- **F-3 (Info, Bookkeeping):** `PROJ-Y-1` ist fünffach belegt. Die Registerzeile dieser
  Lineage ist auf `PROJ-Y-114a` umgeschrieben; die vier **spec-lokalen** „PROJ-Y-1" in
  PROJ-70/98/100c/116 sind **bewusst nicht** angefasst (fremde Features, parallele
  Lanes) und als offene Hygiene-Aufgabe registriert → **PROJ-Y-114c**.

## 6. Abweichungen

- **D-1:** Interner DMS-Verweis nicht gebaut (DMS in Prod leer, `url`-CHECK https-only)
  → **PROJ-Y-114b**. Bewusste Zurückstellung nach dem PROJ-80-β-Präzedenzfall, keine
  zurückgestellte Original-Anforderung von PROJ-108 AC1: der *Dokumenten*verweis ist
  über PROJ-115 erfüllt, offen ist nur der zusätzliche **interne** Pfad.
- **D-2:** Kein Index auf `source_dd_question_id` — die Spalte liegt auf keinem Leseweg
  („Findings zu dieser Frage" existiert nicht) und Fragen werden selten gelöscht
  (PROJ-69-Triage, PROJ-144-D-144.5-Präzedenz).
- **D-3:** Kein authentifizierter Browser-Durchlauf. Die DD-Flächen sind in Prod
  **datenlos** (0 Streams / 0 Fragen / 0 Findings), ein E2E-Klickpfad hätte erst einen
  Deal-Raum samt Stream seeden müssen; die Verkettung ist stattdessen über den
  Live-Pentest (16 Vektoren, echte RPCs) und 29 Routen-/Lib-Tests belegt.
- **D-4:** Benigne Migrations-Versionsdrift (Prod-Versionen im Fenster `20260818…`
  gegen die Dateinamen `20260817120000`/`20260817123000`/`20260817124000`) — alle drei sind
  durchgängig idempotent (`add column if not exists`, DO-Block-Guards,
  `create or replace`, `drop … if exists`), brechen `supabase db push` also nicht;
  Dateinamen behalten wie bei den unmittelbaren Nachbarn (PROJ-80/148/Y-45a),
  PROJ-134-Domäne. `name` = exakter Dateinamen-Stamm, wie die Regel verlangt.
- **D-5:** Kein CIA-Pass. Additive Spalten auf einer deployten Tabelle nach dem
  etablierten EXTEND-Rezept, kein neues Dependency, kein neues Modell — keiner der
  acht Trigger aus `.claude/rules/continuous-improvement.md` greift.

## 7. Followups

| ID | Inhalt |
|---|---|
| **PROJ-Y-114b** | Verweis auf einen **internen DMS-Knoten** als Quelle (eigene Verweis-Tabelle nach dem `skill_knowledge_links`-Muster), sobald Dokumente in Prod existieren. `external_document_links` ist per SSRF-Härtung https-only und dafür strukturell untauglich. |
| **PROJ-Y-114c** | ID-Hygiene: die vier spec-lokalen `PROJ-Y-1` in PROJ-70/98/100c/116 auf eindeutige `PROJ-Y-<Eltern><Buchstabe>`-IDs umschreiben. |
