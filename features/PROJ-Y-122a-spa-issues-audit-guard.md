---
id: PROJ-Y-122a
title: "spa_issues-Audit-Verdrahtung härten (Anchor-Guard + Live-Smoke)"
issue_type: Chore
epic_code: HYGIENE
epic_title: "Hygiene & Supply-Chain"
priority: Medium
priority_source: "Should"
labels: ["hygiene", "audit", "migration"]
dependencies: ["PROJ-122", "PROJ-10"]
roles: ["Platform"]
summary_for_jira: "[HYGIENE] spa_issues-Audit-Verdrahtung: fehlende Anchor-Verifikation nachrüsten + Live-Smoke"
---

# PROJ-Y-122a: spa_issues-Audit-Verdrahtung härten

## Status: Deployed (2026-08-11)
## Deployment Scope: full
**Deployed:** 2026-08-11 — PR #316 (squash) → main (`f6d36e0`), Tag `v2.40.0-PROJ-Y-122a`. Migration seit `/backend` in Prod, daher kein Runtime-DB-Change beim Merge; Code-Deploy über Vercel-Auto-Deploy von main. Alle Required-Checks grün — darunter der **Schema-Drift-Guard**, also trägt die Migration auch im Fresh-Replay-Pfad. **Post-Deploy-Smoke gegen Prod, 0 Residue:** `A=PASS B=PASS(rows=1) C=PASS D=PASS admin_shortcircuit=f`. Kein Env/Secret.
**PROJ-134-Versionsdrift (benign):** in Prod registriert als `20260811061845`, Repo-Dateiname `20260811090000_…`. Die Migration besteht ausschließlich aus `position()`-gegateten DO-Blöcken und Grants, ist also vollständig idempotent → `supabase db push` bricht nicht. Nicht umbenannt, weil die Datei bereits geshippt ist (Präzedenz PROJ-106/131).
**Created:** 2026-08-11
**Origin:** Querschnitts-Audit der vier parallelen Feature-PRs (#301/#302/#303/#304) auf latente Anchor-Fehler, angefordert vor deren Merge. Elf der zwölf Anchor-Patches waren sauber; dieser eine Befund blieb übrig. PROJ-122 ist inzwischen als `481a5a7` auf main und in Prod angewendet — der Fix kann daher nicht mehr durch Editieren erfolgen, sondern nur als spätere, idempotente Reconcile-Migration.

> **Hygiene-Slice.** Kein Feature, kein Schema-Change, keine neue Dependency, keine `src/**`-Änderung. Eine Migration (auf Prod ein No-op) + ein Live-Smoke.

## Der Befund

`supabase/migrations/20260807110000_proj122_spa_issues.sql` patcht die beiden geteilten Audit-Helfer per **literalem `replace()`** und führt das Ergebnis anschließend aus, **ohne zu prüfen, ob die Ersetzung gegriffen hat**:

```sql
-- Zeilen 119-132 (_tracked_audit_columns) und 134-144 (can_read_audit_entry)
if position('''spa_issues''' in d) = 0 then
  d := replace(d, 'else array[]::text[]', '… else array[]::text[]');
  execute d;                 -- <- keine Verifikation
end if;
```

`replace()` gibt bei nicht gefundenem Anchor seine Eingabe **unverändert** zurück. `execute d` legt die Funktion dann wortgleich neu an, und die Migration meldet Erfolg. Ein fehlgeschlagener Patch ist von einem erfolgreichen nicht zu unterscheiden.

**Warum das keine andere Instanz fängt:**

| Gate | Warum es blind ist |
|---|---|
| Route-/Unit-Tests | mocken Supabase, feuern keinen echten Trigger |
| Schema-Drift-Guard | vergleicht nur SELECT-Spalten gegen `information_schema` |
| Migration selbst | ein stiller No-op löst keine Exception aus |

**Folge in einer frisch gebauten Umgebung** mit abweichendem Whitespace: `spa_issues`-UPDATEs verlieren still das Feld-Audit, und Audit-Reads fallen ins `else return false` → dauerhaft leerer History-Tab. Ohne Fehler, ohne Log.

Die Schwester-Slices machen es richtig: PROJ-120 sichert **dieselben zwei Anchor** mit `raise exception` (Z. 548/565), PROJ-78 und PROJ-119 ebenso. PROJ-122 ist der einzige Ausreißer.

## Warum es heute nicht brennt

Empirisch geprüft, beide Formen:

- **Prod-Live-Def:** Anchor vorhanden, genau 1× (kein Replace-All-Kollateral)
- **Repo-Replay-Form:** letzter vollständiger Neuautor beider Funktionen vor dem 07.08. ist `20260729082833_proj115_external_document_links.sql`; dort steht `else return false;` (Z. 349) bzw. `else array[]::text[]` (Z. 261) **einzeilig mit einem Space** — der literale Anchor matcht
- **Gegenbeweis aus der CI:** der Schema-Drift-Guard (= genau dieser Fresh-Replay) war auf #303 grün, also haben die *guarded* Blöcke nicht geraist

Der Defekt ist damit **latent, nicht aktiv**. Er wird scharf, sobald eine künftige Neuautorenschaft von `can_read_audit_entry` die Whitespace-Form ändert — genau das, was PROJ-Y-115c passiert ist.

## Acceptance Criteria

- **AC-Y122a.1** — Eine Migration mit späterem Timestamp stellt sicher, dass beide `spa_issues`-Zweige nach dem Fresh-Apply vorhanden sind: No-op wenn schon da, sonst Re-Injektion über einen **whitespace-toleranten** `regexp_replace`-Anchor. ✅
- **AC-Y122a.2** — Fehlt auch die tolerante Form, bricht die Migration **hart** ab (`raise exception`) statt still zu überspringen. ✅
- **AC-Y122a.3** — Der injizierte Text ist byte-identisch zu PROJ-122s, sodass der Endzustand unabhängig davon ist, welche Migration den Zweig gesetzt hat. ✅ (gegen die Live-Def verifiziert)
- **AC-Y122a.4** — Beide Blöcke prüfen zusätzlich, dass kein Zweig einer Schwester-Slice gedroppt wurde (der inhärente Clobber-Hazard bei N parallelen Sessions auf denselben zwei Funktionen). ✅
- **AC-Y122a.5** — Ein Live-Smoke assertet, dass ein UPDATE einer getrackten Spalte wirklich eine Feld-Audit-Zeile schreibt, und dass das Read-Gate `spa_issues` auflöst. Pflicht nach jedem künftigen Recreate. ✅
- **AC-Y122a.6** — Auf Prod ist die Migration ein No-op (Zweige vorhanden); nur die Grants werden neu gesetzt. ✅

## Umsetzung

**Migration** `supabase/migrations/20260811090000_projy122a_spa_issues_audit_reconcile.sql` — in Prod angewendet (Skip-Pfad wie erwartet), registriert als `20260811090000_projy122a_spa_issues_audit_reconcile` (PROJ-134-konform: `name` = Repo-Dateiname-Stamm).

- `regexp_replace` **ohne** `g`-Flag → nur der erste Treffer; beide Else-Zweige sind ohnehin unikal (`when 'report_snapshots' then array[]::text[]` trägt kein führendes `else`, die übrigen `return false` sind Guard-Clauses mit `then`)
- Post-Verifikation nach jedem `execute`
- Sibling-Clobber-Guards auf `ma_valuations` / `communication_matrix_entries` / `raci_assignments` (tac) und `project_skills` / `ma_valuations` / `document_tree_nodes` (cra) — alle tragen frühere Timestamps, sind im Replay also garantiert vorhanden
- Grants werden neu gesetzt; laut Messung an dieser DB ist das ein No-op (`CREATE OR REPLACE` erhält die ACL), bleibt aber als Absichtsdokumentation stehen

**Live-Smoke** `tests/sql/PROJ-Y-122a-spa-issues-audit-smoke.sql` — eine Transaktion, die am Ende raist (0 Residue). Vektoren A (Whitelist) · B (Audit-Zeile nach UPDATE) · C (Nicht-Admin-Projektmitglied darf lesen) · D (Nicht-Mitglied wird abgewiesen).

## Zwei Fallen beim Authoring des Smokes

Beide wurden live gefunden und sind im Smoke als Kommentar zementiert:

1. **Argumentreihenfolge.** Die Signatur ist `can_read_audit_entry(entity_type, entity_id, tenant_id)`. Tenant und Entity vertauscht liefert ein plausibel aussehendes falsches FAIL — genau das passierte im ersten Lauf.
2. **Admin-Kurzschluss.** Die Funktion beginnt mit `if is_tenant_admin(p_tenant_id) then return true; end if;`. Ein Test unter Tenant-Admin erreicht den `spa_issues`-Zweig **nie** und wäre auch bei gedroppten Zweig grün — ein Falsch-Grün. C impersoniert deshalb ein synthetisiertes **Nicht-Admin**-Projektmitglied, und der Raise gibt `admin_shortcircuit` mit aus (muss `f` sein), damit die Wirksamkeit der Impersonation sichtbar bleibt.

Der Prod-Seed hat keinen Nicht-Admin-Nutzer (2 User, beide Admin im eigenen Tenant), daher wird die Identität innerhalb der zurückgerollten Transaktion erzeugt.

## Verifikation

**Live-Smoke gegen Prod, 2026-08-11 — alle Vektoren grün, 0 Residue:**

```
A_whitelist=PASS  B_audit_on_update=PASS(rows=1)
C_member_can_read=PASS  D_nonmember_denied=PASS  admin_shortcircuit=f
```

`B` ist der Kernnachweis: das UPDATE einer getrackten Spalte erzeugt tatsächlich eine Feld-Audit-Zeile. `admin_shortcircuit=f` belegt, dass `C` den Zweig wirklich durchlief.

**Post-Merge-Clobber-Check gegen Prod** (nach vier Feature-Merges innerhalb einer halben Stunde): alle sechs Schwester-Zweige koexistieren in beiden Funktionen (PROJ-78/119/120/122/Y-115c/Y-96b), `authenticated`-Grant auf `can_read_audit_entry` intakt.

**Gates:** `check:migration-naming` 0 Errors · keine `src/**`-Änderung, daher keine Auswirkung auf Vitest/ESLint/Build.

## Deviations

- **D-Y122a.1 — PROJ-122s Originalblöcke bleiben unverändert.** Die Migration ist geshippt und in Prod registriert; „never edit a shipped file". Der Reconcile-Ansatz ist deshalb bewusst additiv und muss selbst idempotent sein.
- **D-Y122a.2 — kein CIA-Pass.** Spec-folgende Anwendung des etablierten Reconcile-Musters (`feedback_audit_fn_recreate_drops_grant`, zweite Facette) ohne neue Technologie und ohne Architekturentscheidung.

## Followups

- **PROJ-Y-122a-1** — Die übrigen Slices, die diese beiden Funktionen per Anchor patchen, verwenden weiterhin literale `replace()`-Anchor mit Guard. Das ist korrekt, aber whitespace-fragil; ein gemeinsamer Helfer (`public._patch_audit_fn(fn, anchor_regex, branch)`) würde die Regel an einer Stelle erzwingen statt in jeder Migration neu. Erst sinnvoll, wenn die nächste Slice diese Fläche anfasst.
