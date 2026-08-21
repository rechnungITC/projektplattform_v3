-- PROJ-Y-114a — Quelle / Herkunftsnachweis am DD-Finding.
--
-- Schliesst die letzte offene Haelfte von PROJ-108 AC1 ("Quelle/Dokumentenverweis")
-- und zugleich das in PROJ-113 namentlich vorgezeichnete, nie gebaute
-- PROJ-Y-113c (`dd_findings.source_dd_question_id`).
--
-- Warum nur noch DIESE Haelfte: der *Dokumentenverweis* nach aussen ist seit
-- PROJ-115 live (`external_document_links` traegt `entity_type='dd_finding'`, die
-- wiederverwendbare `<ExternalLinksSection>` haengt im Finding-Dialog). Was fehlte,
-- ist die *Quelle* als Aussage: woher stammt die Feststellung — Datenraum-Dokument,
-- Q&A-Antwort, Management-Interview, Standortbesichtigung, eigene Analyse. Bisher
-- liess sich das nur in `description` unterbringen, wodurch der Befund selbst und
-- sein Herkunftsnachweis vermischt wurden. Fuer ein Deal-Breaker-Finding ist der
-- Unterschied zwischen "steht im unterzeichneten Vertrag" und "sagte jemand im
-- Gespraech" der eigentliche Beweiswert.
--
-- Drei Spalten, alle nullable → Bestandsverhalten bleibt byte-identisch:
--   source_kind            — Klasse des Nachweises (CHECK, kleines Vokabular)
--   source_ref             — menschlicher Fundort ("VDR 3.4.1", "Interview CFO 12.05.")
--   source_dd_question_id  — maschinell pruefbare Quelle: die DD-Frage (PROJ-113)
--
-- Bewusst NICHT gebaut: ein Verweis auf einen internen DMS-Knoten. `documents`/
-- `document_tree_nodes` sind in Prod leer (0 Zeilen, gemessen), und
-- `external_document_links.url` ist per SSRF-Haertung auf `https://%` begrenzt, kann
-- also keinen Knoten adressieren. Gleiche Begruendung, mit der PROJ-80 seinen
-- Vektor-Teil zurueckgestellt hat: erst bauen, wenn Dokumente existieren.
-- → Followup PROJ-Y-114b.


-- 1) Spalten ---------------------------------------------------------------

alter table public.dd_findings
  add column if not exists source_kind text,
  add column if not exists source_ref text,
  add column if not exists source_dd_question_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.dd_findings'::regclass
      and conname = 'dd_findings_source_kind_check'
  ) then
    alter table public.dd_findings
      add constraint dd_findings_source_kind_check
      check (source_kind is null or source_kind in
        ('document','qa_answer','interview','site_visit','analysis','other'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.dd_findings'::regclass
      and conname = 'dd_findings_source_ref_check'
  ) then
    alter table public.dd_findings
      add constraint dd_findings_source_ref_check
      check (source_ref is null or length(source_ref) <= 500);
  end if;

  -- ON DELETE RESTRICT, nicht SET NULL: ein Herkunftsnachweis, der beim Loeschen
  -- seiner Quelle stillschweigend verschwindet, ist kein Nachweis. Gleiche Wahl wie
  -- die Provenance-FKs in PROJ-120 und PROJ-Y-96e (PROJ-141-γ3-Begruendung).
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.dd_findings'::regclass
      and conname = 'dd_findings_source_dd_question_id_fkey'
  ) then
    alter table public.dd_findings
      add constraint dd_findings_source_dd_question_id_fkey
      foreign key (source_dd_question_id)
      references public.dd_questions(id) on delete restrict;
  end if;
end $$;

-- Kein Index auf `source_dd_question_id`: die Spalte liegt auf keinem Leseweg
-- (es gibt keine "Findings zu dieser Frage"-Sicht), und Fragen werden selten
-- geloescht. PROJ-69-Triage / PROJ-144-D-144.5-Praezedenz — bewusste Auslassung.

-- 2) Projekt-Konsistenz-Waechter -------------------------------------------
-- Spiegelt PROJ-Y-45a: ein Verweis darf nur auf eine Frage DESSELBEN Projekts
-- zeigen. Frueher Ausstieg wenn leer — der Normalfall.

create or replace function public._dd_finding_source_question_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_project uuid;
begin
  if new.source_dd_question_id is null then
    return new;
  end if;
  select project_id into v_project
    from public.dd_questions where id = new.source_dd_question_id;
  if not found then
    raise exception 'source dd_question not found' using errcode = '23514';
  end if;
  if v_project is distinct from new.project_id then
    raise exception 'source dd_question belongs to a different project'
      using errcode = '23514';
  end if;
  return new;
end $function$;

revoke all on function public._dd_finding_source_question_guard() from anon, authenticated;

drop trigger if exists dd_findings_source_question_guard on public.dd_findings;
create trigger dd_findings_source_question_guard
  before insert or update of source_dd_question_id, project_id
  on public.dd_findings
  for each row execute function public._dd_finding_source_question_guard();

-- 3) Audit-Whitelist -------------------------------------------------------
-- Anker-Ersetzung aus der LIVE-Definition, whitespace-tolerant, mit
-- Treffer-Eindeutigkeit und Post-Verifikation. Die Registrierung im
-- `audit_log_entity_type_check` und in `can_read_audit_entry` ist NICHT noetig:
-- beide tragen den `dd_findings`-Zweig seit PROJ-114 (live geprueft) — nur die
-- Spaltenliste muss die drei Neuen kennen, sonst ist "Audit aktiv" nur scheinbar
-- erfuellt.
--
-- Es wird die Definition gepatcht, die zum Anwendungszeitpunkt live ist (parallele
-- Slices erweitern dieselbe Funktion), Delta- statt Absolutpruefung.

do $$
declare
  d text;
  patched text;
  v_hits int;
  v_before int;
  v_after int;
begin
  select pg_get_functiondef(p.oid) into d
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_tracked_audit_columns';
  if d is null then
    raise exception 'PROJ-Y-114a: _tracked_audit_columns not found';
  end if;

  -- Schon erledigt? (Idempotenz)
  if d like '%source_dd_question_id%' then
    raise notice 'PROJ-Y-114a: audit whitelist already carries the source columns — skipping';
    return;
  end if;

  v_before := array_length(
    string_to_array(substring(d from 'dd_findings''\s*then\s*array\[([^\]]*)\]'), ','), 1);

  select count(*) into v_hits
    from regexp_matches(d, 'when\s+''dd_findings''\s+then\s+array\[[^\]]*\]', 'g');
  if v_hits <> 1 then
    raise exception 'PROJ-Y-114a: expected exactly 1 dd_findings branch, found %', v_hits;
  end if;

  patched := regexp_replace(
    d,
    '(when\s+''dd_findings''\s+then\s+array\[[^\]]*)\]',
    '\1,''source_kind'',''source_ref'',''source_dd_question_id'']'
  );
  if patched = d then
    raise exception 'PROJ-Y-114a: anchor replacement was a no-op';
  end if;

  execute patched;

  -- Post-Verifikation gegen die neu installierte Definition.
  select pg_get_functiondef(p.oid) into d
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_tracked_audit_columns';
  v_after := array_length(
    string_to_array(substring(d from 'dd_findings''\s*then\s*array\[([^\]]*)\]'), ','), 1);
  if v_after - v_before <> 3 then
    raise exception 'PROJ-Y-114a: expected +3 dd_findings audit columns, got % -> %',
      v_before, v_after;
  end if;
  if not (d like '%source_kind%' and d like '%source_ref%'
          and d like '%source_dd_question_id%') then
    raise exception 'PROJ-Y-114a: new columns missing after patch';
  end if;
  -- Geschwister-Zweige nachweislich erhalten (Stichprobe ueber vier fremde Slices).
  if not (d like '%dd_questions%' and d like '%committees%'
          and d like '%spa_issues%' and d like '%ma_valuations%') then
    raise exception 'PROJ-Y-114a: sibling audit branches were clobbered';
  end if;

  -- Re-Grant in derselben Anweisungsfolge (CREATE OR REPLACE erhaelt die ACL,
  -- der Grant wird dennoch explizit gesetzt — PROJ-114 hat genau hier einmal
  -- den `authenticated`-Grant verloren und den History-Tab still gebrochen).
  grant execute on function public._tracked_audit_columns(text) to authenticated;
end $$;

-- 4) Schreibpfade ----------------------------------------------------------
-- `dd_findings` wird ausschliesslich ueber RPCs beschrieben (PROJ-114: keine
-- INSERT/UPDATE-Policies). Die Signaturen wachsen, deshalb DROP + CREATE statt
-- CREATE OR REPLACE — ein abweichendes Argumentprofil erzeugt sonst eine
-- *zweite* Funktion und damit Overload-Ambiguitaet (PROJ-119-D-1-Lehre).
-- Grants werden anschliessend wiederhergestellt (Vorher-Stand: authenticated +
-- service_role, kein anon, kein public).

drop function if exists public.create_dd_finding(uuid, text, text, text, numeric, smallint, text, uuid, public.ma_confidentiality_level);

create function public.create_dd_finding(
  p_dd_stream_id uuid,
  p_title text,
  p_description text default null,
  p_severity text default 'mittel',
  p_economic_impact_eur numeric default null,
  p_probability smallint default null,
  p_recommended_treatment text default null,
  p_linked_risk_id uuid default null,
  p_confidentiality_level public.ma_confidentiality_level default null,
  p_source_kind text default null,
  p_source_ref text default null,
  p_source_dd_question_id uuid default null
)
returns public.dd_findings
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_caller uuid := auth.uid(); v_tenant uuid; v_project uuid;
  v_stream_level public.ma_confidentiality_level; v_level public.ma_confidentiality_level;
  v_row public.dd_findings; v_q_level public.ma_confidentiality_level;
begin
  if v_caller is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select tenant_id, project_id, confidentiality_level into v_tenant, v_project, v_stream_level
    from public.dd_streams where id = p_dd_stream_id;
  if not found then raise exception 'dd_stream not found' using errcode = 'P0002'; end if;
  if not (public.is_tenant_admin(v_tenant) or public.is_project_lead(v_project)) then
    raise exception 'insufficient role to create dd_finding' using errcode = '42501';
  end if;
  v_level := coalesce(p_confidentiality_level, v_stream_level);
  if v_level < v_stream_level then
    raise exception 'finding confidentiality cannot be below its stream' using errcode = '42501';
  end if;
  if not public.can_access_classified(v_project, v_level) then
    raise exception 'not cleared for this confidentiality level' using errcode = '42501';
  end if;
  -- PROJ-Y-114a: eine Frage darf nur als Quelle benannt werden, wenn der Aufrufer
  -- sie auch sehen darf. Ohne diese Pruefung waere der Verweis ein Existenz-Orakel
  -- auf `strict`-Fragen (PROJ-120-F-1-Klasse); der Waechter-Trigger prueft nur die
  -- Projektzugehoerigkeit und laeuft als DEFINER, also an RLS vorbei.
  if p_source_dd_question_id is not null then
    select confidentiality_level into v_q_level
      from public.dd_questions where id = p_source_dd_question_id;
    if not found then
      raise exception 'source dd_question not found' using errcode = 'P0002';
    end if;
    if not public.can_access_classified(v_project, v_q_level) then
      raise exception 'not cleared for the referenced dd_question' using errcode = '42501';
    end if;
  end if;
  insert into public.dd_findings
    (tenant_id, project_id, dd_stream_id, title, description, severity, economic_impact_eur,
     probability, recommended_treatment, linked_risk_id, confidentiality_level, created_by,
     source_kind, source_ref, source_dd_question_id)
  values
    (v_tenant, v_project, p_dd_stream_id, p_title, p_description, p_severity, p_economic_impact_eur,
     p_probability, p_recommended_treatment, p_linked_risk_id, v_level, v_caller,
     nullif(p_source_kind, ''), nullif(p_source_ref, ''), p_source_dd_question_id)
  returning * into v_row;
  if v_row.severity = 'deal_breaker' then perform public._escalate_dd_finding(v_row.id); end if;
  return v_row;
end $function$;

revoke all on function public.create_dd_finding(uuid, text, text, text, numeric, smallint, text, uuid, public.ma_confidentiality_level, text, text, uuid) from public, anon;
grant execute on function public.create_dd_finding(uuid, text, text, text, numeric, smallint, text, uuid, public.ma_confidentiality_level, text, text, uuid) to authenticated, service_role;

drop function if exists public.update_dd_finding(uuid, text, text, text, numeric, boolean, smallint, text, text, uuid, uuid);

create function public.update_dd_finding(
  p_finding_id uuid,
  p_title text default null,
  p_description text default null,
  p_severity text default null,
  p_economic_impact_eur numeric default null,
  p_clear_eur boolean default false,
  p_probability smallint default null,
  p_recommended_treatment text default null,
  p_status text default null,
  p_linked_risk_id uuid default null,
  p_responsible_user_id uuid default null,
  p_source_kind text default null,
  p_source_ref text default null,
  p_source_dd_question_id uuid default null,
  p_clear_source boolean default false
)
returns public.dd_findings
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_caller uuid := auth.uid(); v_f public.dd_findings; v_row public.dd_findings;
  v_was_db boolean; v_q_level public.ma_confidentiality_level;
begin
  if v_caller is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into v_f from public.dd_findings where id = p_finding_id;
  if not found then raise exception 'dd_finding not found' using errcode = 'P0002'; end if;
  if not (public.is_tenant_admin(v_f.tenant_id) or public.is_project_lead(v_f.project_id)) then
    raise exception 'insufficient role to update dd_finding' using errcode = '42501';
  end if;
  if not public.can_access_classified(v_f.project_id, v_f.confidentiality_level) then
    raise exception 'not cleared for this finding' using errcode = '42501';
  end if;
  if p_source_dd_question_id is not null then
    select confidentiality_level into v_q_level
      from public.dd_questions where id = p_source_dd_question_id;
    if not found then
      raise exception 'source dd_question not found' using errcode = 'P0002';
    end if;
    if not public.can_access_classified(v_f.project_id, v_q_level) then
      raise exception 'not cleared for the referenced dd_question' using errcode = '42501';
    end if;
  end if;
  v_was_db := (v_f.severity = 'deal_breaker');
  -- PROJ-Y-114a `p_clear_source`: die drei Quell-Spalten sind EINE Aussage, keine
  -- drei unabhaengigen Felder. `true` verwirft die alte Aussage vollstaendig und
  -- setzt danach nur, was ausdruecklich mitgegeben wurde — "Quelle neu benennen"
  -- statt drei Einzel-Loeschschalter. Ohne das Flag gilt weiter NULL = unveraendert
  -- (`p_clear_eur`-Muster; die Luecke, die PROJ-122 als D-1 live getroffen hat).
  update public.dd_findings set
    title = coalesce(p_title, title),
    description = coalesce(p_description, description),
    severity = coalesce(p_severity, severity),
    economic_impact_eur = case when p_clear_eur then null else coalesce(p_economic_impact_eur, economic_impact_eur) end,
    probability = coalesce(p_probability, probability),
    recommended_treatment = coalesce(p_recommended_treatment, recommended_treatment),
    status = coalesce(p_status, status),
    linked_risk_id = coalesce(p_linked_risk_id, linked_risk_id),
    responsible_user_id = coalesce(p_responsible_user_id, responsible_user_id),
    source_kind = case when p_clear_source then nullif(p_source_kind, '')
                       else coalesce(nullif(p_source_kind, ''), source_kind) end,
    source_ref = case when p_clear_source then nullif(p_source_ref, '')
                      else coalesce(nullif(p_source_ref, ''), source_ref) end,
    source_dd_question_id = case when p_clear_source then p_source_dd_question_id
                                 else coalesce(p_source_dd_question_id, source_dd_question_id) end,
    updated_at = now()
  where id = p_finding_id returning * into v_row;
  if v_row.severity = 'deal_breaker' and not v_was_db then perform public._escalate_dd_finding(v_row.id); end if;
  return v_row;
end $function$;

revoke all on function public.update_dd_finding(uuid, text, text, text, numeric, boolean, smallint, text, text, uuid, uuid, text, text, uuid, boolean) from public, anon;
grant execute on function public.update_dd_finding(uuid, text, text, text, numeric, boolean, smallint, text, text, uuid, uuid, text, text, uuid, boolean) to authenticated, service_role;

-- 5) Post-Conditions -------------------------------------------------------

do $$
declare v_n int;
begin
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'dd_findings'
     and column_name in ('source_kind','source_ref','source_dd_question_id');
  if v_n <> 3 then raise exception 'PROJ-Y-114a: expected 3 new columns, found %', v_n; end if;

  -- Genau eine Fassung jeder RPC (kein Overload uebrig geblieben).
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_dd_finding';
  if v_n <> 1 then raise exception 'PROJ-Y-114a: create_dd_finding overloaded (%)', v_n; end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'update_dd_finding';
  if v_n <> 1 then raise exception 'PROJ-Y-114a: update_dd_finding overloaded (%)', v_n; end if;

  -- Beide weiterhin DEFINER und ohne anon-EXECUTE.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('create_dd_finding','update_dd_finding')
     and p.prosecdef;
  if v_n <> 2 then raise exception 'PROJ-Y-114a: RPC lost SECURITY DEFINER'; end if;
  if has_function_privilege('anon', 'public.create_dd_finding(uuid, text, text, text, numeric, smallint, text, uuid, public.ma_confidentiality_level, text, text, uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.update_dd_finding(uuid, text, text, text, numeric, boolean, smallint, text, text, uuid, uuid, text, text, uuid, boolean)', 'EXECUTE') then
    raise exception 'PROJ-Y-114a: anon must not hold EXECUTE';
  end if;
  if not has_function_privilege('authenticated', 'public.create_dd_finding(uuid, text, text, text, numeric, smallint, text, uuid, public.ma_confidentiality_level, text, text, uuid)', 'EXECUTE') then
    raise exception 'PROJ-Y-114a: authenticated lost EXECUTE on create_dd_finding';
  end if;

  if not exists (select 1 from pg_trigger
                 where tgrelid = 'public.dd_findings'::regclass
                   and tgname = 'dd_findings_source_question_guard') then
    raise exception 'PROJ-Y-114a: consistency guard trigger missing';
  end if;
end $$;

