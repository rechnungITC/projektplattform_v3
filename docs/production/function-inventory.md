# Runbook — Prod-Funktionsinventar auffrischen

**Gehört zu:** PROJ-Y-148e · **Wächter:** `npm run check:function-inventory` ·
**Datei:** `supabase/prod-inventory/functions.txt`

## Warum es diesen Vorgang gibt

PROJ-Y-148c hat aufgedeckt, dass eine Migration **fünf Tage** in der
Produktionsdatenbank lief, ohne im Repo zu sein — und dabei eine RPC anlegte, die vier
append-only-Zusagen aushebelte. Nichts hätte das gemeldet: der Schema-Drift-Wächter
vergleicht nur `SELECT`-Spalten, keine Funktionen.

Das versionierte Inventar schließt diese Lücke, aber **nur wenn es aufgefrischt wird**.
Der Wert steckt im Diff: erscheint beim Auffrischen ein Name, den keine
Migrationsdatei anlegt, ist das entweder eine offene Slice — oder ein Fall wie 148c.

## Wann auffrischen

- **Am Ende jeder Slice mit Migration**, vor dem Merge. Dann steht die eigene neue
  Funktion im Diff, und der Wächter bestätigt, dass die Migrationsdatei sie anlegt.
- **Wenn der Wächter eine unerklärte Funktion meldet** — dann ist zu entscheiden, ob
  es eine offene Slice ist (`pending_merge`-Eintrag) oder ein echter Fund.
- Sonst gelegentlich. Er ist billig.

## Wie auffrischen

Die Abfrage liest den Systemkatalog und muss deshalb über einen Weg mit
SQL-Zugang laufen (Supabase-Studio-SQL-Editor oder das Supabase-MCP-Werkzeug
`execute_sql`). Ein npm-Skript kann das **nicht**: in `.env.local` liegt kein
Connection-String, nur der Service-Role-Key für PostgREST — und PostgREST exponiert
keine Systemkataloge.

```sql
select string_agg(proname, E'\n' order by proname) as liste
from (
  select distinct p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
  where n.nspname = 'public'
    and d.objid is null          -- Extension-Funktionen ausschliessen
) s;
```

Der `d.objid is null`-Filter ist wichtig: ohne ihn kommen die **71** Funktionen der
`ltree`-Extension mit, die nicht dem Projekt gehören und die keine Migrationsdatei
anlegt — der Wächter würde 71 Falschmeldungen liefern.

Ergebnis in `supabase/prod-inventory/functions.txt` unterhalb des Kommentarkopfs
einsetzen (eine Funktion pro Zeile, sortiert), Datum im Kopf anpassen, dann:

```bash
npm run check:function-inventory
```

## Wenn der Wächter meldet

**„existiert in Prod, wird von keiner Migrationsdatei angelegt"** — zwei Fälle, und
die Unterscheidung ist der ganze Zweck:

1. **Eine Slice ist offen.** Ihre Migration ist per `/backend` in Prod, der Merge
   steht aus. Das ist der normale Ablauf dieses Repos. Eintrag in
   `INVENTORY_EXCEPTIONS` mit `kind: "pending_merge"`, Slice-ID und PR im Grund.
   Der Eintrag ist ein Wegwerf-Eintrag: sobald die Slice mergt, meldet der Wächter
   ihn als veraltet und er ist zu entfernen. Diese Selbstreinigung ist Absicht — sonst
   wächst die Liste zu und deckt später einen echten Fund.
2. **Niemand kennt die Funktion.** Das ist der 148c-Fall. Herkunft klären
   (`supabase migration list`, `pg_get_functiondef`, WIP-Branches durchsehen) und
   entscheiden: Migration ins Repo nachliefern oder die Funktion zurückbauen.

**„Ausnahme ist veraltet"** — Eintrag entfernen. Entweder ist die Funktion nicht mehr
in Prod, oder eine Migrationsdatei legt sie inzwischen an; in beiden Fällen ist der
Eintrag toter Ballast.

**„im Repo angelegt, aber nicht im Prod-Inventar"** — **kein Fehler**, nur ein Hinweis.
Eine gemergte, aber noch nicht angewendete Migration landet hier, ebenso eine bewusst
gedroppte Funktion, ebenso ein `create function` in einem Kommentar.

## Was dieser Wächter nicht kann

Ehrlich benannt, weil das über den Nutzen entscheidet:

- **Keine Funktionskörper.** Wird eine bestehende Funktion in Prod geändert, ohne dass
  das Repo folgt, sieht er nichts. Bei 148c wären die vier erweiterten Guards
  durchgegangen; nur die neue RPC wäre aufgefallen. Ein Rumpf-Vergleich braucht die
  Shadow-DB und damit Docker — offener Handoff PROJ-67/F6.
- **Keine Trigger.** Gemessen: ein statischer Parse findet 65 von 74 Tabellen mit
  Audit-Trigger, **10 werden verfehlt**, weil mehrere Slices ihre Trigger über
  DO-Blöcke anlegen. 14 % Fehlerquote sind untauglich. Deshalb bleibt **PROJ-Y-130f**
  offen — die Frage, welche zwei Audit-Trigger die Dateien nicht herstellen, ist nur
  mit einer echten Shadow-DB beantwortbar.
- **Keine Grants, keine Policies.** Gleiche Ursache.
- **Nichts, was nicht im Inventar steht.** Eine neue Prod-Funktion wird erst beim
  Auffrischen sichtbar. Das ist die eingebaute Grenze dieses Ansatzes und der Grund,
  warum dieses Runbook existiert.
