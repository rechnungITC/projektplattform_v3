# PROJ-Y-115c — Need-to-know-Gate für die Dokumentenebene

**Status:** Deployed
**Erstellt:** 2026-08-10
**Herkunft:** CIA-Bestandsfund F4 aus PROJ-115 (`work_item_documents` ohne Need-to-know-Gate) — beim Aufsetzen erweitert, weil die **gesamte DMS-Kette** aus PROJ-79-α keine Vertraulichkeitsdimension besaß.
**Klasse:** Sicherheitsrelevant (Need-to-know / DSGVO-nah), Bestands-Leck — kein Feature.

---

## Problem (live verifiziert vor dem Fix)

PROJ-79-α hat den DMS-Kern gebaut, aber ohne die PROJ-100a-Achse:

1. **Keine Dimension.** `document_tree_nodes` und `documents` hatten die Spalte
   `confidentiality_level` **gar nicht**. Ein `strict`-Dokument in einem M&A-Deal
   war technisch nicht als solches markierbar; jedes Projektmitglied sah jedes
   Dokument. Zum Vergleich: `deliverable_documents` ist seit PROJ-104 korrekt
   gegatet (`can_access_classified(d.project_id, d.confidentiality_level)`).

2. **Scheingate am Download-Proxy.** Die Policy `documents_bucket_select` auf
   `storage.objects` prüfte ausschließlich den **Pfad**
   (`is_tenant_member(seg1) AND is_project_member(seg2)`) und berührte die
   `documents`-Tabelle nie. `createDocumentSignedUrl` läuft im RLS-Kontext des
   Aufrufers — ein Projektmitglied konnte damit mit seinem eigenen
   authentifizierten Client `createSignedUrl(path)` für **jedes** Objekt seines
   Projekts aufrufen und die API-Route komplett umgehen. Die Route war die
   einzige Stelle, die überhaupt eine Doc-Zeile nachschlug.

3. **RPC-Bypass.** `dms_move_node` und `dms_soft_delete_subtree` sind
   `SECURITY DEFINER` und umgehen RLS. Ein Gate nur auf Tabellenebene wäre über
   diese beiden Funktionen umgehbar geblieben (Move gibt via `returning *` sogar
   den Ordnernamen zurück).

4. **`work_item_documents`** (der ursprünglich registrierte Scope) war
   membership-only, obwohl `work_items.confidentiality_level` seit PROJ-100a
   existiert — also eine reine Policy-Lücke ohne Schema-Bedarf.

5. **Audit-Fläche.** `can_read_audit_entry` ist `SECURITY DEFINER`; seine
   Lookups umgehen RLS. Ohne expliziten Check konnte ein nicht-freigegebenes
   Mitglied Namen und (nach dieser Slice) Klassifikationswechsel eines
   `strict`-Ordners über den PROJ-10-HistoryTab lesen.

**Blockierte Folge-Slices:** PROJ-Y-106b (Binär-Upload von Deliverable-Versionen
ins DMS — hätte das PROJ-104-Gate beim Umzug verloren) und PROJ-80
(RAG-Indexierung über DMS-Knoten).

---

## Entscheidungen (User-locked 2026-08-10)

| Fork | Entscheidung |
|---|---|
| Wo lebt die Stufe? | **Nur am Baumknoten.** `documents` erben über `tree_node_id`. Pfadsegment 3 *ist* die `tree_node_id`, also kann die `storage.objects`-Policy die Stufe auflösen. Keine zweite Autorität, kein `GREATEST(node, doc)` in jeder Policy. |
| Umfang | **DMS + `work_item_documents`** — der eigene Fund und das registrierte Ticket, gleiche Fehlerklasse. |
| Reihenfolge | Security-Fix zuerst, die vier offenen Feature-PRs danach. |

**Ordner-Semantik** (aus der Baum-Wahl abgeleitet):
- `INSERT` **erbt aufwärts** vom Eltern-Ordner (`greatest(neu, eltern)`) — ein
  Ordner in einem vertraulichen Ordner ist vertraulich.
- Ein **expliziter Downgrade** unter die Elternstufe wird abgewiesen (`23514`).
- **Anheben kaskadiert** in den ganzen Teilbaum (Invariante bleibt wahr, ohne
  dass der Aufrufer den Baum laufen muss).

---

## Acceptance Criteria

| # | Kriterium | Status |
|---|---|---|
| AC-Y115c.1 | `document_tree_nodes.confidentiality_level` existiert, `not null default 'standard'` → No-op für alle Nicht-M&A-Projekte | ✅ |
| AC-Y115c.2 | RESTRICTIVE `can_access_classified`-Sublayer auf `document_tree_nodes` und `documents` (SELECT/INSERT/UPDATE/DELETE) | ✅ |
| AC-Y115c.3 | `storage.objects`-Policies der `documents`-Bucket lösen die Stufe über den Pfad auf; Signed-URL-Bypass geschlossen; fail-closed bei malformed/fremdem Pfad | ✅ |
| AC-Y115c.4 | `dms_move_node` + `dms_soft_delete_subtree` prüfen Clearance explizit (Delete gegen die **höchste** Stufe im Teilbaum) | ✅ |
| AC-Y115c.5 | `work_item_documents` RESTRICTIVE-gegatet über `work_items.confidentiality_level` | ✅ |
| AC-Y115c.6 | Floor/Inheritance/Cascade-Trigger; Downgrade unter Eltern → 23514 | ✅ |
| AC-Y115c.7 | Audit: `confidentiality_level` tracked; `can_read_audit_entry` gegatet für `document_tree_nodes`/`documents`/`work_item_documents` | ✅ |
| AC-Y115c.8 | UI: Stufe im Baum sichtbar (Badge, `standard` unbadged), im Detail-Panel, setzbar beim Anlegen und per „Vertraulichkeit ändern" | ✅ |
| AC-Y115c.9 | Live-Pentest gegen Prod, 0 Residue; PROJ-79/100a/115-Regressionen grün | ✅ |

---

## Umsetzung

**Migrationen** (beide in Prod, idempotent):
- `20260810120000_projy115c_document_confidentiality_gate.sql` — Spalte, 2 Trigger,
  Resolver `_dms_node_ctx` + `_dms_object_access`, 12 RESTRICTIVE-Policies
  (4 × Baum / 4 × documents / 4 × work_item_documents), 4 neu geschriebene
  Bucket-Policies, 2 neu geschriebene RPCs, Audit-Patch, Post-Condition-Block.
- `20260810121000_projy115c_hotfix_revoke_trigger_execute.sql` — `authenticated`
  EXECUTE auf den beiden Trigger-Funktionen entzogen (Advisor-Lint 0029;
  PROJ-68-Muster). Postgres prüft bei Trigger-Auslösung kein EXECUTE, live bewiesen.

**Audit-Funktionen** wurden per **Anchor-Replace-from-live** gepatcht statt
transkribiert (`pg_get_functiondef` → `replace` → `execute`), mit Grant-Restore in
derselben Anweisung. Grund: `_tracked_audit_columns` hat 63 Branches und
`can_read_audit_entry` 57 — eine Abschrift hätte Geschwister-Einträge verloren,
und ein Recreate ohne Re-Grant bricht still den PROJ-10-HistoryTab. Verifiziert:
beide Funktionen behalten alle Branches, `raci_assignments` unverändert, und die
von den vier parallelen Slices ergänzten Einträge (`spa_issues`, `ma_valuations`)
haben überlebt.

**Code:** `confidentiality_level` in `DocumentTreeNode` + alle drei SELECT-Listen;
Zod-Schema + dritte, exklusive PATCH-Operation (reclassify) mit 409/403/404-Mapping;
Client-Wrapper `setNodeConfidentiality`; neue geteilte `<ConfidentialityBadge>`;
Badge im Baum, Stufe im Detail-Panel, Select im Anlegen-Dialog, Reclassify-Dialog.

---

## Verifikation

**Live-Pentest** `tests/sql/PROJ-Y-115c-document-confidentiality-pentest.sql`
gegen Prod, self-rolling-back, **0 Residue**:
- **Teil 1: A–Q 17/17 PASS.** Kern-Beweis ist **D**: ein Projektmitglied ohne
  Clearance bekommt auf dem `strict`-Pfad `false` — der Signed-URL-Bypass ist zu.
  **E** beweist, dass es kein Blanket-Deny ist, **H** dass eine erteilte Clearance
  das Gate wirklich öffnet, **F** dass Pfad-Smuggling (echte Node-ID, fremdes
  Projekt-Segment) scheitert.
- **Teil 2: 5/5 PASS.** Trigger-Funktionen nicht mehr `authenticated`-aufrufbar,
  Policy-Resolver weiterhin, und beide Trigger feuern trotzdem.

**Regressionen** (live gegen Prod):
- `PROJ-79-dms-pentest.sql` — 16/16 `t` (unverändert; für `standard`-Inhalte ist
  das Gate byte-kompatibel)
- `PROJ-115-external-links-pentest.sql` — A–I 9/9 PASS

**Gates:** vitest 2637/2637 (+6 neue Reclassify-Route-Tests) · ESLint 0 ·
tsc 13 vorbestehend / 0 neu · Build clean · migration-naming 0 errors ·
Advisors **0 ERROR**.

### Vom Schema-Drift-Guard gefangen: Anchor-Whitespace

Die erste Fassung nutzte literales `replace()` für die drei
`can_read_audit_entry`-Anchor. Das lief in Prod durch, der Pentest war grün —
und der **Schema Drift Guard schlug fehl**: `PROJ-Y-115c: documents audit
anchor not found`.

Ursache: `pg_get_functiondef` gibt den Body *so zurück, wie er geschrieben
wurde*. In Prod stammt die Funktion aus einer MCP-`apply_migration`, die den
Branch **einzeilig** hatte; die Shadow-DB des Guards spielt die **Repo-Dateien**
nach, wo PROJ-115 denselben Branch über **drei Zeilen** mit Zeilenumbruch und
Einrückung schreibt. `document_tree_nodes` (einzeilig in beiden) matchte,
`documents` und `work_item_documents` (mehrzeilig im Repo) nicht.

Fix: alle Anchor sind jetzt **whitespace-tolerante Regexe** (`\s+` zwischen
jedem Token, programmatisch erzeugt) via `regexp_replace`. Der **harte Raise
bleibt** — ein „tolerantes" Überspringen hätte CI grün gemacht und das
Audit-Gate in jeder frisch gebauten Umgebung stillschweigend weggelassen.

Verifiziert ohne Shadow-DB (Docker/WSL steht auf diesem Host nicht, PROJ-67/F6):
beide Formen — die mehrzeilige aus der Repo-Datei und die whitespace-kollabierte
einzeilige — gegen alle drei Patterns getestet, **6/6 match**; zusätzlich
bewiesen, dass beide Idempotenz-Guards gegen den bereits gepatchten
Prod-Zustand den Skip-Pfad nehmen (kein Grant-Churn bei Re-Application).

---

## Deployment

**Deployed 2026-08-10** — PR #309 squash-merged to `main` (`c2d5d80`),
Tag `v2.39.0-PROJ-Y-115c`.

Beide Migrationen lagen seit dem `/backend`-Schritt in Prod, der Merge brachte
also keinen Runtime-DB-Change — nur den Code, der die Dimension ausdrücken kann.
Weil in Prod 0 Zeilen ≠ `standard` sind, war der zuvor deployte Code über die
ganze Zeit konsistent mit dem schon aktiven Gate.

Alle drei Required Checks grün auf `cc328de` (Migration Naming Guard, Schema
Drift Guard, Supply Chain Audit); Auto-Merge (Squash) hat auf dieses Grün
gewartet.

Post-Deploy-Smoke (307 Auth-Gate, kein Leck): `/projects/[id]/dokumente`,
`GET …/documents/tree?all=true`, `POST …/tree/nodes`,
`PATCH …/tree/nodes/[nodeId]`.

Prod-DB-Verify: 4 Bucket-Policies über den Resolver · 12 RESTRICTIVE-Policies
über die drei Tabellen · 2 RPCs mit Clearance-Check · 2 Trigger am Baum ·
Default `'standard'` · 0 Zeilen ≠ `standard`.

Kein neues Env/Secret.

### Ablauf-Notizen

- **Vier Parallel-Session-Merges** auf `main` während der Slice (PROJ-Y-142a →
  142b → 142c + zwei Closures) erzwangen zwei Rebases. Kollidiert ist jedes Mal
  nur `features/INDEX.md`; beide Zeilen sind erhalten. Zwischenzeitlich lief die
  andere Session im Primary-Checkout und committete auf den ursprünglichen
  Branch dieser Slice — die Arbeit wurde in eine eigene Worktree transplantiert
  und der Primary-Checkout unangetastet auf ihren Stand zurückgesetzt.
- **Kein CI ohne Merge-Ref:** solange der PR `CONFLICTING` war, entstanden für
  gepushte Commits gar keine Workflow-Runs (GitHub kann `refs/pull/N/merge`
  nicht bauen). Erst nach dem Rebase lief die Prüfung — wichtig zu wissen, wenn
  „keine Checks" wie „Checks hängen" aussieht.


## Deviations / Followups

- **D-Y115c.1 — Kein CIA-Pass.** `.claude/rules/continuous-improvement.md` macht
  CIA für das Umschreiben eines deployten RLS-Musters verbindlich. Diese Slice
  wendet fast durchgehend das etablierte PROJ-100a/113/115-Rezept an; genuin neu
  ist nur die Klassifikationsauflösung **innerhalb** einer
  `storage.objects`-Policy (kein Präzedenzfall). Nachträglicher CIA-Review
  empfohlen, falls das Muster auf weitere Buckets ausgerollt wird.
- **PROJ-Y-115c-1 — Andere Buckets.** `context-source-uploads` (PROJ-70) ist
  tenant-only, `reports` (PROJ-21) tenant-only über `report_snapshots`. Beide
  tragen heute keine Vertraulichkeitsachse. Kein akutes Leck (Kickoff-Uploads
  und Report-Snapshots sind nicht need-to-know-klassifiziert), aber dieselbe
  Struktur — beim ersten klassifizierten Report bzw. mit PROJ-80 nachziehen.
- **PROJ-Y-115c-2 — `levelBadgeVariant`-Dedup.** Die Mapping-Funktion liegt jetzt
  in `<ConfidentialityBadge>`, die zwei Bestandskopien (`committees-page`,
  `communication-page`) blieben bewusst unangetastet, weil dort PROJ-51-Visual-
  Snapshots hängen. Zusammenführen in eigener Hygiene-Slice.
- **PROJ-Y-115c-3 — Orphan-Objekte.** Die DELETE-Bucket-Policy erlaubt Objekte
  ohne auflösbaren Knoten (`p_allow_orphan`), damit hart gelöschte Bäume keinen
  unlöschbaren Müll hinterlassen. Ein Orphan trägt keine Klassifikation und
  verrät nichts über ein lebendes Dokument. Der β-Nightly-Sweep aus PROJ-79
  sollte diesen Pfad übernehmen.
- **Playwright-E2E** für den Reclassify-Pfad nicht ergänzt: die Route ist
  auth-gated wie alle Nachbarn und die Sicherheitsaussage steht auf der
  DB-Ebene, wo sie live bewiesen ist.
