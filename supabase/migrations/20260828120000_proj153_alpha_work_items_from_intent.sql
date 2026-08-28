-- PROJ-153-α — Arbeitspakete aus dem Vorhaben: Zweck-Lockstep + Übernahme.
--
-- Drei Teile:
--   1. Der neue Zweck in BEIDEN Verzeichnissen, in DIESER Migration
--      (AC-153H.1). Ein Eintrag nur in `ki_runs` und der Kostendeckel läuft in
--      Produktion mit einem Serverfehler auf — im Haus zweimal passiert
--      (sentiment/coaching, nachgetragen von PROJ-88).
--   2. Die Übernahme (`..._bulk`) — Vorlage ist die deployte
--      `accept_proposal_from_context_bulk`, inklusive ihres H-3-Fixes für den
--      Topologie-Lauf, den PROJ-70-δ live gefunden hat (die β-Fassung verglich
--      `temp_id = parent_temp_id` INNERHALB der Unterabfrage, wodurch jede
--      verschachtelte Hierarchie scheiterte).
--   3. Rückgängig (`..._undo`) mit 30-Sekunden-Fenster und demselben Akteur.
--
-- **Warum die Herkunft (Lock L2) hier unfälschbar wird:** die Zeile in
-- `ki_provenance` entsteht ausschliesslich INNERHALB dieser Funktion, mit
-- hartkodiertem `entity_type` und dem Verweis auf den Vorschlag, der seinen
-- Zweck trägt. Sie kommt nie aus der Modellausgabe und nie vom Browser. Ein
-- Skill kann Inhalte prägen — er kann ein Item nicht behaupten lassen, es
-- stamme aus einem Dokument (CIA-Auflage A-3).

-- ---------------------------------------------------------------------------
-- 1. Zweck-Lockstep — beide Verzeichnisse, eine Migration
-- ---------------------------------------------------------------------------

do $$
declare
  v_runs text;
  v_caps text;
  v_anchor constant text := '''project_chat''::text';
  v_replacement constant text :=
    '''project_chat''::text, ''work_items_from_project_intent''::text';
begin
  select pg_get_constraintdef(oid) into v_runs
    from pg_constraint where conname = 'ki_runs_purpose_check';
  select pg_get_constraintdef(oid) into v_caps
    from pg_constraint where conname = 'tenant_ai_cost_caps_purpose_check';

  if v_runs is null or v_caps is null then
    raise exception
      'PROJ-153: Zweck-CHECK nicht gefunden — Abbruch statt Raten.';
  end if;

  if v_runs like '%work_items_from_project_intent%'
     and v_caps like '%work_items_from_project_intent%' then
    raise notice 'PROJ-153: Zweck steht bereits in beiden Verzeichnissen.';
    return;
  end if;

  -- Anker aus der LIVE-Definition, nicht aus einer Vorlage: parallele Slices
  -- haben diese CHECKs zuletzt mehrfach erweitert (project_chat kam am
  -- 2026-08-27), eine abgeschriebene Liste verlöre ihre Werte.
  if v_runs not like '%' || v_anchor || '%' then
    raise exception 'PROJ-153: Anker fehlt in ki_runs_purpose_check: %', v_runs;
  end if;
  if v_caps not like '%' || v_anchor || '%' then
    raise exception 'PROJ-153: Anker fehlt in tenant_ai_cost_caps_purpose_check: %', v_caps;
  end if;

  if v_runs not like '%work_items_from_project_intent%' then
    execute 'alter table public.ki_runs drop constraint ki_runs_purpose_check';
    execute 'alter table public.ki_runs add constraint ki_runs_purpose_check '
            || replace(v_runs, v_anchor, v_replacement);
  end if;

  if v_caps not like '%work_items_from_project_intent%' then
    execute 'alter table public.tenant_ai_cost_caps drop constraint tenant_ai_cost_caps_purpose_check';
    execute 'alter table public.tenant_ai_cost_caps add constraint tenant_ai_cost_caps_purpose_check '
            || replace(v_caps, v_anchor, v_replacement);
  end if;
end
$$;

-- Post-Condition: geprüft wird das VERHALTEN, nicht der Text — und beide
-- Verzeichnisse, weil genau ihr Auseinanderlaufen der Defekt wäre.
do $$
declare
  v_runs text;
  v_caps text;
  v_sibling_count int;
begin
  select pg_get_constraintdef(oid) into v_runs
    from pg_constraint where conname = 'ki_runs_purpose_check';
  select pg_get_constraintdef(oid) into v_caps
    from pg_constraint where conname = 'tenant_ai_cost_caps_purpose_check';

  if v_runs not like '%work_items_from_project_intent%' then
    raise exception 'PROJ-153: ki_runs kennt den Zweck nicht: %', v_runs;
  end if;
  if v_caps not like '%work_items_from_project_intent%' then
    raise exception 'PROJ-153: tenant_ai_cost_caps kennt den Zweck nicht: %', v_caps;
  end if;

  -- Clobber-Kontrolle: die Geschwisterwerte müssen vollzählig erhalten sein.
  select count(*) into v_sibling_count
  from unnest(array[
    'risks','decisions','work_items','open_items','narrative','sentiment',
    'coaching','trajectory_sequence','resource_swap','cross_project_links',
    'proposal_from_context','proposal_stakeholders_from_context',
    'proposal_risks_from_context','clarifying_questions_from_context',
    'document_summary','project_chat'
  ]) as sibling
  where v_runs like '%''' || sibling || '''%'
    and v_caps like '%''' || sibling || '''%';

  if v_sibling_count <> 16 then
    raise exception
      'PROJ-153: nur % von 16 Geschwisterwerten in BEIDEN CHECKs erhalten.',
      v_sibling_count;
  end if;

  raise notice 'PROJ-153: Zweck in beiden Verzeichnissen, 16 Geschwister erhalten.';
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Übernahme
-- ---------------------------------------------------------------------------

create or replace function public.accept_work_items_from_intent_bulk(
  p_project_id uuid,
  p_suggestion_ids uuid[]
)
returns table (
  accepted_suggestion_ids uuid[],
  created_work_item_ids uuid[],
  accepted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_project_method text;
  v_now timestamptz := now();
  v_accepted_ids uuid[] := array[]::uuid[];
  v_created_ids uuid[] := array[]::uuid[];
  v_expected_count int;
  v_loaded_count int;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  select tenant_id, project_method
    into v_tenant_id, v_project_method
  from public.projects
  where id = p_project_id;
  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  if not (is_project_lead(p_project_id)
          or has_project_role(p_project_id, 'editor')
          or is_tenant_admin(v_tenant_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_suggestion_ids is null or array_length(p_suggestion_ids, 1) is null then
    raise exception 'empty_suggestion_ids' using errcode = '22023';
  end if;
  v_expected_count := array_length(p_suggestion_ids, 1);

  create temporary table _intent_accept_working (
    suggestion_id uuid primary key,
    temp_id text not null,
    parent_temp_id text,
    kind text not null,
    title text not null,
    description text,
    work_item_id uuid,
    processed boolean default false
  ) on commit drop;

  -- Der Zweck-Filter ist hier Sicherheit, nicht Bequemlichkeit: er verhindert,
  -- dass ein Vorschlag EINES ANDEREN Zwecks über diese Funktion angenommen
  -- wird und dabei die Herkunft dieses Zwecks bekäme.
  insert into _intent_accept_working
    (suggestion_id, temp_id, parent_temp_id, kind, title, description)
  select
    s.id,
    s.payload->>'temp_id',
    s.payload->>'parent_temp_id',
    s.payload->>'kind',
    s.payload->>'title',
    s.payload->>'description'
  from public.ki_suggestions s
  where s.id = any(p_suggestion_ids)
    and s.project_id = p_project_id
    and s.purpose = 'work_items_from_project_intent'
    and s.status = 'draft';

  select count(*) into v_loaded_count from _intent_accept_working;
  if v_loaded_count <> v_expected_count then
    raise exception 'some_suggestions_invalid_or_already_accepted'
      using errcode = '23514',
            detail = format(
              'Erwartet %s Entwuerfe des Zwecks work_items_from_project_intent im Projekt, gefunden %s.',
              v_expected_count, v_loaded_count);
  end if;

  -- Methoden-Prüfung wie beim Kickoff-Pfad: Hybrid und "nicht festgelegt"
  -- gehen durch (18 von 31 Projekten haben live gar keine Methode).
  if v_project_method in ('waterfall', 'Wasserfall') then
    if exists (select 1 from _intent_accept_working
               where kind not in ('work_package','task','bug')) then
      raise exception 'method_kind_incompatible'
        using errcode = '23514',
              detail = 'Methode Wasserfall verlangt kind in (work_package, task, bug).';
    end if;
  elsif v_project_method in ('scrum','agile','Scrum','Agile','kanban') then
    if exists (select 1 from _intent_accept_working
               where kind not in ('epic','story','task','subtask','bug')) then
      raise exception 'method_kind_incompatible'
        using errcode = '23514',
              detail = 'Methode Scrum/Kanban verlangt kind in (epic, story, task, subtask, bug).';
    end if;
  end if;

  loop
    declare
      v_pending int;
      v_row_sug uuid;
      v_row_temp text;
      v_row_parent_temp text;
      v_row_kind text;
      v_row_title text;
      v_row_desc text;
      v_row_parent_wi uuid;
      v_new_wi uuid;
      v_unresolved jsonb;
    begin
      select count(*) into v_pending from _intent_accept_working where not processed;
      exit when v_pending = 0;

      -- Alias-qualifizierte Korrelation: der H-3-Fix aus PROJ-70-δ. Ohne ihn
      -- ist KEINE verschachtelte Hierarchie annehmbar, und der Fehler sieht
      -- aus wie ein Zyklus.
      select w.suggestion_id, w.temp_id, w.parent_temp_id, w.kind, w.title, w.description
        into v_row_sug, v_row_temp, v_row_parent_temp, v_row_kind, v_row_title, v_row_desc
      from _intent_accept_working w
      where not w.processed
        and (
          w.parent_temp_id is null
          or exists (select 1 from _intent_accept_working p
                     where p.temp_id = w.parent_temp_id and p.processed)
          or not exists (select 1 from _intent_accept_working p
                         where p.temp_id = w.parent_temp_id)
        )
      limit 1;

      if not found then
        v_unresolved := (
          select coalesce(jsonb_agg(jsonb_build_object(
            'suggestion_id', suggestion_id,
            'temp_id', temp_id,
            'parent_temp_id', parent_temp_id)), '[]'::jsonb)
          from _intent_accept_working where not processed);
        raise exception 'topological_sort_failed'
          using errcode = '22023',
                detail = 'Zyklus oder unaufloesbarer parent_temp_id im Vorschlagsgraphen.',
                hint = v_unresolved::text;
      end if;

      if v_row_parent_temp is null then
        v_row_parent_wi := null;
      else
        select work_item_id into v_row_parent_wi
        from _intent_accept_working where temp_id = v_row_parent_temp;
        if v_row_parent_wi is null then
          -- Elternteil nicht in diesem Stapel: an ein zuvor angenommenes
          -- Item desselben Zwecks hängen (Einzelannahme eines Kindes NACH
          -- seinem Elternteil).
          select s.accepted_entity_id into v_row_parent_wi
          from public.ki_suggestions s
          where s.project_id = p_project_id
            and s.purpose = 'work_items_from_project_intent'
            and s.status = 'accepted'
            and s.payload->>'temp_id' = v_row_parent_temp
            and s.accepted_entity_id is not null
          order by s.accepted_at desc
          limit 1;
          if v_row_parent_wi is null then
            raise exception 'parent_not_accepted'
              using errcode = '23514',
                    detail = format('Elternteil %s ist weder im Stapel noch zuvor angenommen.',
                                    v_row_parent_temp);
          end if;
        end if;
      end if;

      v_new_wi := gen_random_uuid();
      insert into public.work_items (
        id, tenant_id, project_id, kind, title, description, status,
        parent_id, created_by, created_at, updated_at
      )
      values (
        v_new_wi, v_tenant_id, p_project_id, v_row_kind, v_row_title,
        v_row_desc, 'todo', v_row_parent_wi, v_user_id, v_now, v_now
      );

      -- L2: HIER entsteht die Herkunft — serverseitig, hartkodiert, ohne
      -- Zutun des Modells. `entity_type` ist ein Literal, nicht ein Wert aus
      -- der Nutzlast; der Zweck steckt im verwiesenen Vorschlag.
      insert into public.ki_provenance (
        tenant_id, entity_type, entity_id, ki_suggestion_id, was_modified
      )
      values (v_tenant_id, 'work_items', v_new_wi, v_row_sug, false);

      update public.ki_suggestions
      set status = 'accepted',
          accepted_at = v_now,
          accepted_entity_type = 'work_item',
          accepted_entity_id = v_new_wi,
          updated_at = v_now
      where id = v_row_sug and status = 'draft';

      update _intent_accept_working
      set processed = true, work_item_id = v_new_wi
      where suggestion_id = v_row_sug;

      v_accepted_ids := array_append(v_accepted_ids, v_row_sug);
      v_created_ids := array_append(v_created_ids, v_new_wi);
    end;
  end loop;

  accepted_suggestion_ids := v_accepted_ids;
  created_work_item_ids := v_created_ids;
  accepted_at := v_now;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Rückgängig
-- ---------------------------------------------------------------------------

create or replace function public.accept_work_items_from_intent_undo(
  p_project_id uuid,
  p_suggestion_ids uuid[]
)
returns table (
  reverted_suggestion_ids uuid[],
  reverted_work_item_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_now timestamptz := now();
  v_window_seconds int := 30;
  v_oldest_accept timestamptz;
  v_reverted_wi_ids uuid[];
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  select tenant_id into v_tenant_id from public.projects where id = p_project_id;
  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  if not (is_project_lead(p_project_id)
          or has_project_role(p_project_id, 'editor')
          or is_tenant_admin(v_tenant_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_suggestion_ids is null or array_length(p_suggestion_ids, 1) is null then
    raise exception 'empty_suggestion_ids' using errcode = '22023';
  end if;

  -- Jede Kennung muss (a) zum Projekt, (b) zum Zweck, (c) zum Zustand
  -- 'accepted', (d) ins Zeitfenster und (e) zum SELBEN Akteur gehören.
  -- Letzteres verhindert, dass jemand fremde Annahmen zurücknimmt.
  if exists (
    select 1 from unnest(p_suggestion_ids) as needle(id)
    where not exists (
      select 1 from public.ki_suggestions s
      where s.id = needle.id
        and s.project_id = p_project_id
        and s.purpose = 'work_items_from_project_intent'
        and s.status = 'accepted'
        and s.accepted_at is not null
        and s.accepted_at > v_now - make_interval(secs => v_window_seconds)
        and s.created_by = v_user_id
    )
  ) then
    raise exception 'undo_invalid_or_window_expired'
      using errcode = '22023',
            detail = format(
              'Mindestens ein Vorschlag ist nicht zurücknehmbar (falsches Projekt, falscher Zweck, nicht angenommen, älter als %s s, oder anderer Akteur).',
              v_window_seconds);
  end if;

  select min(accepted_at) into v_oldest_accept
  from public.ki_suggestions where id = any(p_suggestion_ids);

  if v_oldest_accept is null
     or v_now - v_oldest_accept > make_interval(secs => v_window_seconds) then
    raise exception 'undo_window_expired'
      using errcode = '22023',
            detail = format('Das Rückgängig-Fenster von %s Sekunden ist abgelaufen.',
                            v_window_seconds);
  end if;

  select array_agg(distinct s.accepted_entity_id)
    into v_reverted_wi_ids
  from public.ki_suggestions s
  where s.id = any(p_suggestion_ids)
    and s.accepted_entity_type = 'work_item'
    and s.accepted_entity_id is not null;

  perform set_config('proposal_undo.allowed', 'true', true);

  if v_reverted_wi_ids is not null then
    delete from public.work_items
    where id = any(v_reverted_wi_ids) and project_id = p_project_id;
  end if;

  -- Ohne dieses Löschen scheitert ein erneutes Annehmen nach dem Rückgängig
  -- an UNIQUE(ki_suggestion_id) — der H-2-Fund aus PROJ-70-δ.
  delete from public.ki_provenance
  where ki_suggestion_id = any(p_suggestion_ids) and tenant_id = v_tenant_id;

  update public.ki_suggestions
  set status = 'draft',
      accepted_at = null,
      accepted_entity_type = null,
      accepted_entity_id = null,
      updated_at = v_now
  where id = any(p_suggestion_ids)
    and project_id = p_project_id
    and status = 'accepted';

  perform set_config('proposal_undo.allowed', 'false', true);

  reverted_suggestion_ids := p_suggestion_ids;
  reverted_work_item_ids := coalesce(v_reverted_wi_ids, array[]::uuid[]);
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Rechte
-- ---------------------------------------------------------------------------
--
-- `from public` ist nicht redundant: Postgres gibt jeder neuen Funktion
-- EXECUTE an PUBLIC, und ein Entzug nur von anon/authenticated lässt den
-- PUBLIC-Eintrag stehen — im Haus dreimal aufgetreten, jedes Mal erst vom
-- Pentest gefunden.

revoke execute on function public.accept_work_items_from_intent_bulk(uuid, uuid[])
  from public, anon;
revoke execute on function public.accept_work_items_from_intent_undo(uuid, uuid[])
  from public, anon;

grant execute on function public.accept_work_items_from_intent_bulk(uuid, uuid[])
  to authenticated;
grant execute on function public.accept_work_items_from_intent_undo(uuid, uuid[])
  to authenticated;

do $$
declare
  v_bad text;
begin
  select string_agg(p.proname, ', ')
    into v_bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('accept_work_items_from_intent_bulk',
                      'accept_work_items_from_intent_undo')
    and (
      -- Ein PUBLIC-Eintrag rendert mit LEEREM Empfänger, beginnt also mit '='.
      exists (select 1 from unnest(coalesce(p.proacl, '{}')) acl
              where acl::text like '=%')
      or exists (select 1 from unnest(coalesce(p.proacl, '{}')) acl
                 where acl::text like 'anon=%')
    );

  if v_bad is not null then
    raise exception 'PROJ-153: PUBLIC oder anon hat noch EXECUTE auf: %', v_bad;
  end if;

  raise notice 'PROJ-153: beide Funktionen ohne PUBLIC- und anon-EXECUTE.';
end
$$;
