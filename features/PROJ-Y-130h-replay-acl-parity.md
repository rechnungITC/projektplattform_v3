# PROJ-Y-130h — Die Folgen der vier verbleibenden Fresh-Apply-Abbrüche nachholen

## Status: Approved
## Deployment Scope: —
<!-- Aus den Belegen ist `full` die Klassifikation: eine Migration mit gemessener Wirkung
     und Post-Conditions, keine reine Tooling-Ebene. Wert beim Merge. -->

**Created:** 2026-08-20
**Origin:** PROJ-Y-130g, das drei der sieben Abbrüche beseitigte und die restlichen vier mit
vollständigen Daten hier übergab.

---

## Was von 116 Zeilen wirklich Substanz hat

Jede der 116 nicht ausgeführten Zeilen wurde gelesen, nicht geschätzt:

| Datei | Zeilen | tatsächliche Wirkung |
|---|---|---|
| `harden_trigger_only_functions` | 17 | **11 `revoke`** — echte Härtung |
| `security_internal_functions_lockdown` | 10 | **2 relevante `revoke`** (ein dritter zielt auf eine gedroppte Funktion) |
| `proj148_last_lead_cascade_fix` | 25 | **keine** — ausschließlich Post-Conditions |
| `proj70_beta_accept_bulk_rpc` | 64 | **fast keine** — ein `comment on function` und Smoke-Checks |

**13 `revoke`-Anweisungen** haben Substanz, nicht 116 Zeilen. Und ihr Fehlen ist nicht harmlos: eine
frisch aus den Dateien gebaute Datenbank ließ `anon` die Rollen-Helfer aufrufen —
`is_tenant_admin`, `is_tenant_member`, `has_tenant_role` und Geschwister. Das trifft neue Umgebungen und
Staging, **nicht** Prod.

## Warum die alten Anweisungen nicht wiederholt werden

Der naheliegende Fix — die verlorenen Zeilen am Ende erneut ausführen — wäre **falsch**. Zwei live
gemessene Gründe:

1. **`record_tenant_ai_provider_audit` trägt in Prod `authenticated=X`**, obwohl
   `security_internal_functions_lockdown` es entziehen wollte. Ein blindes Nachholen machte die Shadow-DB
   **strenger als Prod** — neue Divergenz in die andere Richtung. Diese Funktion bekommt daher kein
   `authenticated`-revoke.
2. **`accept_proposal_from_context_undo` hat in Prod die Signatur `(uuid, uuid[])`**; die Migration
   revoked `(uuid, uuid)` — eine Signatur, die **nie existierte**. Das ist der Grund ihres Abbruchs, und
   die richtige Signatur gehört gesetzt, nicht die falsche wiederholt.

Maßstab ist deshalb der **gemessene Prod-Zustand**, nicht die historische Absicht: alle 14 betroffenen
Funktionen haben dort `anon = false` und kein `PUBLIC`; `authenticated` unterscheidet sich pro Funktion
und ist einzeln abgebildet.

---

## Drei Fehler, alle vor der Wirkung gefangen — der dritte ist ein Bestandsbefund

**F-1 — die erste Fassung hätte den Required Check rot gemacht.** Sie prüfte die Existenz aller 14
Funktionen mit `raise exception`. Aber `enforce_last_lead` und
`enforce_project_membership_user_in_tenant` legt **keine Migrationsdatei** an — genau die Alt-Divergenz,
die PROJ-Y-148e als `legacy` führt und die überhaupt der Grund für zwei der vier Abbrüche ist. Im Replay
hätte die Datei geworfen, und weil ihre Meldung nicht in das Toleranz-Muster des Workflows passt
(`ERROR: ... function ... does not exist`), wäre daraus ein `structural failure` geworden — der Guard
hätte jeden PR blockiert. Beide werden jetzt **übersprungen und laut gemeldet**; eine *unerwartet*
fehlende Funktion bleibt ein Fehler.

**F-2 — eine Post-Condition prüfte nichts.** Beim Neuschreiben verglich ich Signaturen über
`pg_get_function_identity_arguments`, das `p_tenant_id uuid` liefert — also **mit** Parameternamen. Der
Vergleich gegen `public.is_tenant_admin(uuid)` fand damit **nichts**, und die Helfer-Probe verglich `0`
gegen `0`: trivial erfüllt, ohne irgendetwas zu bewachen. Gefangen nur, weil ich die Zahlen gegen Prod
**nachgemessen** habe, statt der Migration zu glauben. Korrekt ist `oidvectortypes(p.proargtypes)`,
nachgewiesen mit 14/14 gefundenen Funktionen und 6/6 erhaltenen Helfern.

**F-3 — der Fresh-Apply endete mit gebrochenen RLS-Helfern. Nicht durch diese Slice.** Der erste
CI-Lauf machte den Wächter rot, und zwar an genau der Post-Condition, die F-2 wirksam gemacht hatte:
**0 von 6** Rollen-Helfern waren für `authenticated` aufrufbar. Die naheliegende Reaktion — die Prüfung
weicher stellen — wäre die falsche gewesen; sie hatte recht.

Die Ursache ist die **Dateireihenfolge**, nicht mein `revoke` (das trifft nur `public`/`anon`):

| Datei | Wirkung |
|---|---|
| `20260504070000_hotfix_grant_rls_helpers_to_authenticated.sql` | `grant … to authenticated` |
| `20260504500001_security_internal_functions_lockdown.sql` | `revoke … from public, anon, authenticated` |

Nach Dateinamen läuft der Grant **zuerst**, der Lockdown hebt ihn wieder auf. In Prod war es umgekehrt —
in der Registry nachgelesen statt vermutet: Lockdown `20260504144601`, Hotfix `20260504150013`, also rund
15 Minuten **später**. Der Dateiname `…500001` ist eine synthetische Ordnungsnummer (PROJ-134-Domäne) und
invertiert das Paar.

Die Tragweite beschreibt der Hotfix selbst: ohne `EXECUTE` greift die `SECURITY DEFINER`-Erhöhung nicht,
und jede Policy, die einen der Helfer aufruft, scheitert mit „permission denied for function" — am
sichtbarsten beim Onboarding. **Jede frisch aus den Dateien gebaute Umgebung war davon betroffen**;
gesehen hat es niemand, weil der Drift-Wächter Spalten vergleicht, keine Rechte.

Geprüft, ob das ein Einzelfall ist: von allen Lockdown-Zielen ist es der **einzige** unversorgte. Für
`can_read_audit_entry` liegen spätere Grants vor (`…0813`, `…0814`, `…0818`), für die Krypto-Helfer
`…20260521183000` — die heilen sich im Replay selbst, und der gemessene Prod-Zustand deckt sich mit ihnen
(`can_read_audit_entry`, `encrypt_tenant_secret`, `decrypt_tenant_secret` alle `authenticated=X`).

Geheilt wird **fix-forward** am Ende der Kette: die Datei stellt den Grant der sechs Helfer her. Kein
Umbenennen der zwei Bestandsdateien — eine Umbenennung verschiebt zwei geshippte Migrationen, und genau
davor warnt PROJ-134. In Prod ist der Grant ein gemessener No-op (vorher 6/6, nachher 6/6, `anon`
unverändert 0).

Alle drei Fehler sind derselbe Typ, der in dieser Followup-Kette mehrfach auftrat: eine Prüfung, die grün
ist, weil sie ins Leere greift — bei F-3 war es der Wächter selbst, der jahrelang nicht hinsah.

---

## Akzeptanzkriterien

- [x] **AC-Y130h.1** — Die 13 substanziellen `revoke`s sind nachgeholt, hergeleitet aus dem gemessenen
      Prod-Zustand statt aus der historischen Absicht.
- [x] **AC-Y130h.2** — `record_tenant_ai_provider_audit` behält `authenticated` (Prod-Zustand), die
      Shadow-DB wird also nicht strenger als Prod.
- [x] **AC-Y130h.3** — `accept_proposal_from_context_undo` wird mit der **echten** Signatur
      `(uuid, uuid[])` angesprochen.
- [x] **AC-Y130h.4** — Die zwei im Replay abwesenden Funktionen werden übersprungen und gemeldet, **nicht**
      als Fehler behandelt; eine unerwartet fehlende Funktion bleibt ein Fehler.
- [x] **AC-Y130h.5** — Post-Conditions prüfen drei Richtungen: `anon` nirgends aufrufbar, Trigger-Guards
      auch für `authenticated` gesperrt, **und die sechs Rollen-Helfer erhalten** — letzteres ist die
      Absicherung gegen ein zu breites `revoke`, das jede RLS-Policy gebrochen hätte.
- [x] **AC-Y130h.6** — Die Post-Conditions sind **nachweislich wirksam**: gegen Prod gemessen 14/14
      Funktionen gefunden, `anon` 0, Guards 0, Helfer 6/6. Die vorige Fassung hätte 0/0 verglichen.
- [x] **AC-Y130h.7** — In Prod ist die Datei ein No-op; verifiziert durch eine zurückgerollte
      Verhaltensprobe (14 vorhanden, 0 übersprungen, 0 fehlend) und die Messung der ACLs davor und danach.
- [x] **AC-Y130h.9** — Die sechs RLS-Helfer sind im Fresh-Apply für `authenticated` aufrufbar. Die
      Ordnungs-Inversion zwischen Hotfix und Lockdown ist an der Prod-Registry belegt (`…144601` vor
      `…150013`) und fix-forward geheilt; in Prod ein gemessener No-op (6/6 vorher und nachher, `anon` 0).
- [x] **AC-Y130h.10** — Nachgewiesen, dass F-3 kein Einzelfall ist: für jedes andere Lockdown-Ziel
      existiert ein späterer Grant, der sich im Replay selbst heilt, und der gemessene Prod-Zustand deckt
      sich mit ihm.
- [ ] **AC-Y130h.8** — Der CI-Lauf zeigt, dass die Datei im Replay durchläuft und **keinen** neuen
      `structural failure` erzeugt.

## Definition of Done

- [x] Migration in Prod und im Repo, Post-Conditions gemessen wirksam.
- [ ] CI-Lauf beobachtet; Ergebnis eingetragen.
- [ ] Buchführung final.

## Abweichungen

- **D-Y130h.1 — Registry-Drift, bewusst.** Die **erste** Fassung ist in Prod registriert (sie lief dort
  fehlerfrei, alle 14 Funktionen vorhanden); im Repo liegt die **zweite**, die sich nur im Verhalten bei
  *abwesenden* Funktionen unterscheidet. In Prod ist dieser Zweig unerreichbar, beide Fassungen sind dort
  also verhaltensgleiche No-ops. Die Datei erneut anzuwenden hätte eine zweite Registry-Version für
  dieselbe Datei erzeugt; das ist die schlechtere Wahl. Nach F-3 trägt die Repo-Fassung zusätzlich den
  Helfer-Grant, den die registrierte Fassung nicht hat — in Prod nachweislich wirkungslos, weil alle sechs
  Rechte dort bereits gesetzt sind (vor und nach dem Ausführen 6/6 gemessen, `anon` unverändert 0). Der
  Inhalt ist durchgängig idempotent, `db push` bleibt unberührt (PROJ-134-Domäne).
- **D-Y130h.2 — die vier Abbrüche bleiben bestehen.** Diese Slice heilt ihre **Folgen**, nicht ihre
  Ursache: eine neue Migration kommt ans Ende und kann an Position 18/70/75/441 nichts ändern. Der
  Diagnose-Notice meldet weiterhin vier Abbrüche — inhaltlich richtig, denn die Zeilen laufen dort
  wirklich nicht. Was sich ändert, ist der **Endzustand** des Replays.
- **D-Y130h.3 — die Ordnungs-Inversion selbst bleibt in den Dateien stehen.** Geheilt ist ihr Ergebnis,
  nicht ihre Ursache. Wer die zwei Bestandsdateien künftig umbenennt, muss beachten, dass der Grant nach
  dem Lockdown liegen muss; der Wächter dafür ist die Post-Condition in dieser Datei, die es beim ersten
  Lauf auch gefunden hat.
