-- PROJ-80-α.1 — Volltext-Auszug + Datenschutz-Klassifikation + Quintessenz-Ablage
--
-- Legt die Datenbasis für die Quintessenz (α) an. KEIN pgvector, KEINE Chunks,
-- KEINE Embeddings — die kommen mit β, wenn im DMS Dokumente liegen.
--
-- Drei Entscheidungen, die hier festgeschrieben werden:
--
--  1. Volltext UND Klassifikation liegen auf DERSELBEN Zeile. Präzedenzfall ist
--     `context_sources`, das `content_excerpt` und `privacy_class` ebenfalls
--     zusammen hält: Text und seine Schutzklasse sind eine Tatsache, die beim
--     erneuten Hochladen atomar ersetzt wird. Getrennt gehalten könnten sie
--     auseinanderlaufen — ein Dokument mit neuem Text und alter Klasse wäre
--     genau das Leck, gegen das Invariante #3 antritt.
--
--  2. `privacy_class` erbt Typ, CHECK und **Default 3** wörtlich von
--     `context_sources`. Der Default ist der eigentliche Schutz: eine Zeile, die
--     vor der Klassifikation entsteht, gilt als personenbezogen und ist damit
--     für Cloud-Anbieter gesperrt, bis das Gegenteil gemessen ist.
--
--  3. Vertraulichkeit wird NICHT kopiert. Beide Tabellen erben sie über den
--     PROJ-Y-115c-Weg (Dokument -> Baumknoten). Eine eigene Stufenspalte wäre
--     eine zweite Wahrheit; PROJ-Y-115c hat aus genau diesem Grund entschieden,
--     die Stufe nur am Knoten zu führen.
--
-- Die Audit-Register werden per Anker-Ersetzung aus der LIVE-Definition
-- erweitert, mit whitespace-toleranten Ankern und Post-Verifikation. Beides ist
-- Lehrgeld: PROJ-Y-122a lief ohne Post-Verifikation (stiller No-op möglich), und
-- PROJ-Y-115c fiel im Schema-Drift-Guard auf, weil ein literaler Anker zwar in
-- Prod passte, aber nicht in einer frisch aus den Dateien gebauten Datenbank.

-- ---------------------------------------------------------------------------
-- 1. Volltext-Auszug + Klassifikation
-- ---------------------------------------------------------------------------

create table if not exists public.document_extractions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  document_id uuid not null unique references public.documents(id) on delete cascade,

  -- Ablauf-Zustand. `too_large` ist bewusst von `failed` getrennt: es ist kein
  -- Fehler, sondern die geerbte 2-MB-Grenze aus `parseFile` (PROJ-75,
  -- "fully screened or rejected"). Der Unterschied ist für den Nutzer wichtig —
  -- "kaputt" gegen "zu groß, β löst das per Chunking".
  status text not null default 'pending'
    check (status in ('pending','extracted','failed','too_large','unsupported_type')),

  -- Nur bei status='extracted' gefüllt.
  extracted_text text,
  char_count integer,
  page_count integer,
  parser text,
  failure_code text,

  -- Datenschutz, wörtlich gespiegelt von `context_sources` (PROJ-75).
  -- Default 3 = fail-closed, siehe Kopfkommentar.
  privacy_class smallint not null default 3 check (privacy_class in (1,2,3)),
  full_text_classified_at timestamptz,
  classification_unverified boolean not null default false,

  extracted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Ein Text ohne abgeschlossene Klassifikation darf nicht als geprüft gelten.
  constraint document_extractions_classified_when_extracted
    check (status <> 'extracted' or full_text_classified_at is not null)
);

create index if not exists document_extractions_document_id_idx
  on public.document_extractions (document_id);
create index if not exists document_extractions_tenant_status_idx
  on public.document_extractions (tenant_id, status);

drop trigger if exists document_extractions_set_updated_at on public.document_extractions;
create trigger document_extractions_set_updated_at
  before update on public.document_extractions
  for each row execute function extensions.moddatetime(updated_at);

-- ---------------------------------------------------------------------------
-- 2. Quintessenz
-- ---------------------------------------------------------------------------
-- Wird erst in α.2 beschrieben. Sie entsteht hier mit, damit das
-- Vertraulichkeits- und Audit-Tor für beide Tabellen in EINER Migration steht:
-- ein nachgereichtes Tor ist genau die Lücke, die niemand bemerkt.

create table if not exists public.document_summaries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  document_id uuid not null unique references public.documents(id) on delete cascade,

  structured_summary jsonb,
  summary_markdown text,

  generated_by_skill_version_id uuid references public.skill_versions(id) on delete set null,
  generated_at timestamptz,

  edited_by_user_id uuid references public.profiles(id) on delete set null,
  edited_at timestamptz,

  -- 'stale' deckt beide Nicht-Erzeugungs-Fälle ab (kein zulässiger Anbieter,
  -- Anbieterfehler). Der maschinenlesbare Grund steht in `reason_code` — ein
  -- leeres Ergebnis muss erklärbar sein (PROJ-137), sonst liest es sich wie
  -- "das Dokument gibt nichts her".
  status text not null default 'stale'
    check (status in ('auto','user_edited','stale')),
  reason_code text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists document_summaries_document_id_idx
  on public.document_summaries (document_id);
create index if not exists document_summaries_tenant_status_idx
  on public.document_summaries (tenant_id, status);

drop trigger if exists document_summaries_set_updated_at on public.document_summaries;
create trigger document_summaries_set_updated_at
  before update on public.document_summaries
  for each row execute function extensions.moddatetime(updated_at);

-- ---------------------------------------------------------------------------
-- 3. Kontext-Auflöser Dokument -> Projekt + Stufe
-- ---------------------------------------------------------------------------
-- Spiegelt `_dms_node_ctx` eine Ebene tiefer. Nötig, weil die Policies sonst
-- `documents` unter RLS lesen müssten — verschachtelte RLS-Auswertung ist genau
-- das, wogegen PROJ-Y-115c den Knoten-Auflöser gebaut hat.
-- Ein fehlendes Dokument oder ein fehlender Knoten liefert keine Zeile -> das
-- `exists` schlägt fehl -> fail closed.

create or replace function public._dms_document_ctx(p_document_id uuid)
returns table (project_id uuid, confidentiality_level public.ma_confidentiality_level)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select n.project_id, n.confidentiality_level
  from public.documents d
  join public.document_tree_nodes n on n.id = d.tree_node_id
  where d.id = p_document_id;
$$;
revoke all on function public._dms_document_ctx(uuid) from public;
revoke all on function public._dms_document_ctx(uuid) from anon;
grant execute on function public._dms_document_ctx(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. RLS — permissiv (Mitgliedschaft) + restriktiv (Vertraulichkeit)
-- ---------------------------------------------------------------------------

alter table public.document_extractions enable row level security;
alter table public.document_summaries  enable row level security;

-- Supabase erteilt neuen Tabellen im Schema `public` per Default-Privileg volle
-- DML-Rechte an `anon` und `authenticated`. RLS würde hier zwar ohnehin greifen
-- (es gibt keine Schreib-Policy), aber Tiefe statt einer Barriere ist die
-- Hausnorm seit PROJ-130-α — deshalb explizit entziehen.
do $$
declare
  t text;
begin
  foreach t in array array['document_extractions','document_summaries'] loop
    execute format('revoke all on table public.%1$I from anon', t);
    execute format('revoke insert, update, delete on table public.%1$I from authenticated', t);
    execute format('grant select on table public.%1$I to authenticated', t);
  end loop;
end $$;

-- 4a. Permissive Schicht: dieselbe Mitgliedschaftsprüfung wie auf `documents`.
do $$
declare
  t text;
begin
  foreach t in array array['document_extractions','document_summaries'] loop
    execute format('drop policy if exists %1$s_select on public.%1$I', t);
    execute format(
      'create policy %1$s_select on public.%1$I'
      || ' as permissive for select to authenticated'
      || ' using (exists ('
      || '   select 1 from public._dms_document_ctx(document_id) c'
      || '   where public.is_project_member(c.project_id)))', t);
  end loop;
end $$;

-- Schreiben läuft ausschließlich über den Server-Pfad (service_role):
-- Auszug und Quintessenz entstehen maschinell, ein direkter Client-Schreibweg
-- wäre eine zweite Autorität neben der Extraktions-/Erzeugungskette.
-- Die Nutzer-Bearbeitung der Quintessenz (α.2) geht über eine Route, nicht über
-- eine INSERT/UPDATE-Policy — deshalb hier bewusst KEINE Schreib-Policies.

-- 4b. Restriktive Schicht: Vertraulichkeit, geerbt über den Auflöser.
do $$
declare
  t text;
  v_gate constant text :=
    'exists (select 1 from public._dms_document_ctx(document_id) c'
    || ' where public.can_access_classified(c.project_id, c.confidentiality_level))';
begin
  foreach t in array array['document_extractions','document_summaries'] loop
    execute format('drop policy if exists %1$s_confidentiality_select on public.%1$I', t);
    execute format('create policy %1$s_confidentiality_select on public.%1$I'
                   || ' as restrictive for select to authenticated using (%2$s)', t, v_gate);

    execute format('drop policy if exists %1$s_confidentiality_insert on public.%1$I', t);
    execute format('create policy %1$s_confidentiality_insert on public.%1$I'
                   || ' as restrictive for insert to authenticated with check (%2$s)', t, v_gate);

    execute format('drop policy if exists %1$s_confidentiality_update on public.%1$I', t);
    execute format('create policy %1$s_confidentiality_update on public.%1$I'
                   || ' as restrictive for update to authenticated'
                   || ' using (%2$s) with check (%2$s)', t, v_gate);

    execute format('drop policy if exists %1$s_confidentiality_delete on public.%1$I', t);
    execute format('create policy %1$s_confidentiality_delete on public.%1$I'
                   || ' as restrictive for delete to authenticated using (%2$s)', t, v_gate);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Audit-Register — in DERSELBEN Migration wie die Tabellen
-- ---------------------------------------------------------------------------
-- CLAUDE.md: den entity_type-CHECK in derselben Migration erweitern, die die
-- Tabelle anlegt, sonst scheitert der erste Schreibvorgang am Constraint.

-- 5a. entity_type-CHECK
do $$
declare
  v_def text;
  v_new text;
  -- `pg_get_constraintdef` rendert die Werte als `'documents'::text`. Der Cast
  -- gehört mit in den Anker — sonst hängt er nach der Ersetzung am falschen
  -- Element. Das `(?!...)`-freie Ende ist Absicht: `'documents'` kann nicht
  -- versehentlich in `'document_tree_nodes'` treffen, weil das schließende
  -- Anführungszeichen Teil des Musters ist.
  v_anchor_re text := '(''documents''(::text)?)';
  v_matches int;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint where conname = 'audit_log_entity_type_check';
  if v_def is null then
    raise exception 'PROJ-80: audit_log_entity_type_check nicht gefunden';
  end if;

  if v_def like '%''document_extractions''%' and v_def like '%''document_summaries''%' then
    raise notice 'PROJ-80: entity_type-CHECK trägt beide Werte bereits — übersprungen';
  else
    select count(*) into v_matches from regexp_matches(v_def, v_anchor_re, 'g');
    if v_matches <> 1 then
      raise exception 'PROJ-80: Anker ''documents'' im entity_type-CHECK % mal getroffen, erwartet 1', v_matches;
    end if;
    v_new := regexp_replace(v_def, v_anchor_re,
      '\1, ''document_extractions''::text, ''document_summaries''::text');
    execute 'alter table public.audit_log_entries drop constraint audit_log_entity_type_check';
    execute 'alter table public.audit_log_entries add constraint audit_log_entity_type_check '
            || v_new;
  end if;

  -- Post-Verifikation: nicht der eigenen Ersetzung glauben.
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint where conname = 'audit_log_entity_type_check';
  if v_def not like '%''document_extractions''%'
     or v_def not like '%''document_summaries''%'
     or v_def not like '%''documents''%' then
    raise exception 'PROJ-80: entity_type-CHECK nach der Ersetzung unvollständig';
  end if;
end $$;

-- 5b. _tracked_audit_columns
-- `extracted_text` und `summary_markdown` bewusst UNTERSCHIEDLICH behandelt:
-- der Auszug ist Maschinenausgabe und kann megabytegroß sein — ihn zu tracken
-- hieße, jede Neu-Extraktion als riesigen Feld-Diff in ein append-only Protokoll
-- zu schreiben (seit PROJ-130-α gibt es keinen Löschpfad mehr). Die Quintessenz
-- dagegen wird von Menschen bearbeitet, ist beschränkt, und ihre Änderung ist
-- genau das, was die Spec protokolliert sehen will.
do $$
declare
  v_def text;
  v_anchor_re text :=
    '(when\s+''documents''\s+then\s+array\[''deleted_at'',''mime_unsupported_for_rag''\])';
  v_matches int;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_tracked_audit_columns';
  if v_def is null then
    raise exception 'PROJ-80: _tracked_audit_columns nicht gefunden';
  end if;

  if v_def like '%document_extractions%' then
    raise notice 'PROJ-80: _tracked_audit_columns trägt die Zweige bereits — übersprungen';
  else
    -- Whitespace-tolerant: der Fresh-Apply aus den Migrationsdateien kann den
    -- Zweig anders umbrechen als Prod ihn führt (PROJ-Y-115c-Lehre).
    -- Eindeutigkeit erzwingen statt hoffen: trifft der Anker nicht genau einmal,
    -- ist die Annahme falsch und wir hören auf, statt die falsche Stelle zu
    -- erweitern.
    select count(*) into v_matches from regexp_matches(v_def, v_anchor_re, 'g');
    if v_matches <> 1 then
      raise exception 'PROJ-80: documents-Anker in _tracked_audit_columns % mal getroffen, erwartet 1', v_matches;
    end if;

    v_def := regexp_replace(
      v_def,
      v_anchor_re,
      '\1' || chr(10)
        || '    when ''document_extractions'' then array[''status'',''privacy_class'',''classification_unverified'']'
        || chr(10)
        || '    when ''document_summaries'' then array[''status'',''summary_markdown'',''structured_summary'']');
    execute v_def;
    execute 'revoke all on function public._tracked_audit_columns(text) from public, anon';
    execute 'grant execute on function public._tracked_audit_columns(text) to authenticated, service_role';
  end if;

  -- Post-Verifikation über das VERHALTEN, nicht über den Text.
  if public._tracked_audit_columns('document_extractions') is null
     or array_length(public._tracked_audit_columns('document_extractions'), 1) <> 3
     or array_length(public._tracked_audit_columns('document_summaries'), 1) <> 3 then
    raise exception 'PROJ-80: _tracked_audit_columns liefert die neuen Zweige nicht';
  end if;
  -- Geschwister-Zweige dürfen nicht verloren gegangen sein.
  if array_length(public._tracked_audit_columns('documents'), 1) <> 2
     or array_length(public._tracked_audit_columns('document_tree_nodes'), 1) is null then
    raise exception 'PROJ-80: Geschwister-Zweige in _tracked_audit_columns beschädigt';
  end if;
end $$;

-- 5c. can_read_audit_entry — Lesetor für die neuen Objektarten
-- Beide erben die Sichtbarkeit über denselben Weg wie `documents`: Projekt aus
-- dem Baumknoten, plus die Vertraulichkeitsprüfung. Ohne diesen Zweig fielen
-- Einträge auf `else return false` und der Verlauf bliebe dauerhaft leer —
-- lautlos, wie in PROJ-130-γ1 beschrieben.
do $$
declare
  v_def text;
  v_anchor_re text :=
    '(when\s+''documents''\s+then\s+select\s+n\.project_id\s+into\s+v_project\s+from\s+public\.documents\s+dd\s+join\s+public\.document_tree_nodes\s+n\s+on\s+n\.id\s*=\s*dd\.tree_node_id\s+where\s+dd\.id\s*=\s*p_entity_id\s+and\s+public\.can_access_classified\(n\.project_id,\s*n\.confidentiality_level\);)';
  v_matches int;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'can_read_audit_entry';
  if v_def is null then
    raise exception 'PROJ-80: can_read_audit_entry nicht gefunden';
  end if;

  if v_def like '%document_extractions%' then
    raise notice 'PROJ-80: can_read_audit_entry trägt die Zweige bereits — übersprungen';
  else
    -- Eindeutigkeit erzwingen: trifft der Anker mehr oder weniger als einmal,
    -- ist die Annahme falsch und wir hören auf, statt die falsche Stelle zu
    -- erweitern (PROJ-130-γ1-Beinahefehler).
    select count(*) into v_matches
      from regexp_matches(v_def, v_anchor_re, 'g');
    if v_matches <> 1 then
      raise exception 'PROJ-80: documents-Anker in can_read_audit_entry % mal getroffen, erwartet 1', v_matches;
    end if;

    v_def := regexp_replace(v_def, v_anchor_re,
      '\1' || chr(10)
      || '    when ''document_extractions'' then select n.project_id into v_project'
      || ' from public.document_extractions x'
      || ' join public.documents dd on dd.id = x.document_id'
      || ' join public.document_tree_nodes n on n.id = dd.tree_node_id'
      || ' where x.id = p_entity_id'
      || ' and public.can_access_classified(n.project_id, n.confidentiality_level);'
      || chr(10)
      || '    when ''document_summaries'' then select n.project_id into v_project'
      || ' from public.document_summaries s'
      || ' join public.documents dd on dd.id = s.document_id'
      || ' join public.document_tree_nodes n on n.id = dd.tree_node_id'
      || ' where s.id = p_entity_id'
      || ' and public.can_access_classified(n.project_id, n.confidentiality_level);');
    execute v_def;
    -- Grants nach jedem Recreate erneuern (mehrfach verlorengegangen, zuletzt
    -- in der 112/113/97-Kette; PROJ-114 musste es fix-forward reparieren).
    execute 'revoke all on function public.can_read_audit_entry(text, uuid, uuid) from public, anon';
    execute 'grant execute on function public.can_read_audit_entry(text, uuid, uuid) to authenticated, service_role';
  end if;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'can_read_audit_entry';
  if v_def not like '%document_extractions%'
     or v_def not like '%document_summaries%'
     or v_def not like '%committee_meetings%' then
    raise exception 'PROJ-80: can_read_audit_entry nach der Ersetzung unvollständig';
  end if;
end $$;

-- 5d. Trigger anhängen (Feld-Audit + Lebenszyklus, PROJ-130-β)
do $$
declare
  t text;
begin
  foreach t in array array['document_extractions','document_summaries'] loop
    execute format('drop trigger if exists audit_changes_%1$s on public.%1$I', t);
    execute format('create trigger audit_changes_%1$s after update on public.%1$I '
                   || 'for each row execute function public.record_audit_changes()', t);
    execute format('drop trigger if exists audit_lifecycle_%1$s on public.%1$I', t);
    execute format('create trigger audit_lifecycle_%1$s after insert or delete on public.%1$I '
                   || 'for each row execute function public.record_audit_lifecycle()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Schluss-Post-Conditions
-- ---------------------------------------------------------------------------
do $$
declare
  v_policies int;
  v_triggers int;
begin
  select count(*) into v_policies
    from pg_policies
   where tablename in ('document_extractions','document_summaries');
  -- je Tabelle: 1 permissive select + 4 restrictive = 5, also 10.
  if v_policies <> 10 then
    raise exception 'PROJ-80: % Policies auf den neuen Tabellen, erwartet 10', v_policies;
  end if;

  select count(*) into v_triggers
    from pg_trigger
   where tgrelid in ('public.document_extractions'::regclass,
                     'public.document_summaries'::regclass)
     and not tgisinternal;
  -- je Tabelle: updated_at + audit_changes + audit_lifecycle = 3, also 6.
  if v_triggers <> 6 then
    raise exception 'PROJ-80: % Trigger auf den neuen Tabellen, erwartet 6', v_triggers;
  end if;

  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname='public' and p.proname='_dms_document_ctx') then
    raise exception 'PROJ-80: _dms_document_ctx fehlt';
  end if;

  raise notice 'PROJ-80-α.1: % Policies, % Trigger, Auflöser und Audit-Register in Ordnung',
               v_policies, v_triggers;
end $$;
