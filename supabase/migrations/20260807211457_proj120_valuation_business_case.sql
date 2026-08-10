-- PROJ-120 — Bewertungsmodell und Business Case verknüpfen (Epic I, Klasse EXTEND).
--
-- Bewertungs-Register je Deal: eine UNVERÄNDERLICHE Versionskette, deren Kopf
-- (is_current) die "Aktuelle Bewertungssicht" (AC4) ist. Die Plattform rechnet
-- keine Bewertung — das Modell bleibt im Fachwerkzeug (Excel/Bewertungssoftware)
-- und wird VERLINKT (external_document_links, entity_type='ma_valuation'),
-- nicht hochgeladen.
--
-- Gelockte Forks (CIA-Review 2026-08-07):
--  F1  Genau EINE Kette pro Deal → partial-unique (project_id) where is_current.
--      add_ma_valuation_version flippt ERST den alten Kopf, DANN INSERT →
--      der Unique-Index braucht kein `deferrable`. Schließt zugleich die
--      PROJ-106-Schwäche (dort ist Single-Head nur RPC-erzwungen, ohne Constraint).
--  F2  Nur Verlinkung, KEIN Upload. Begründung live verifiziert: `documents` hat
--      keine confidentiality_level-Spalte UND die Policy documents_bucket_select
--      gibt jedem Projektmitglied SELECT auf jedes Objekt unter <tenant>/<project>/…
--      → ein App-Layer-Download-Proxy wäre ein Scheingate. (PROJ-Y-120c/115c)
--  F3  ma_valuation_links.linked_kind CHECK enthält BEWUSST nur 'dd_finding'.
--      *** ERWEITERUNGS-KONTRAKT für PROJ-126 (K2, Synergien) ***
--      Wer 'synergy_hypothesis' ergänzt, MUSS zusätzlich:
--        (a) den CHECK ma_valuation_links_kind_check erweitern,
--        (b) einen Zweig in _ma_valuation_link_target_visible() ergänzen
--            (sonst ist der Link unsichtbar / fail-closed),
--        (c) einen after-delete Cleanup-Trigger auf der Synergie-Tabelle anlegen
--            (polymorph → keine FK möglich).
--      Ein toter CHECK-Wert ohne diese drei Teile erlaubt Dangling-Referenzen.
--  F4  KEIN Eingriff in decide_stage_gate / stage_gate_prereadiness (keine
--      Bewertungs-Pflicht am Gate; PROJ-109-Präzedenz "weiches Signal").
--  F6  Explizite Währung (value_low/value_high numeric(18,2) + currency), keine FX.
--
-- Need-to-know (AC-120-H1): confidentiality_level Default 'confidential' (bewusste
-- Abweichung vom plattformweiten 'standard', begründet durch DoR "Inner Circle"),
-- RESTRICTIVE can_access_classified auf ALLEN VIER Achsen (PROJ-115-Muster, nicht
-- die work_item_documents-Lücke). ma_valuation_links ist BEIDSEITIG gegated
-- (Bewertungs-Level UND Finding-Level, AC-120-H2), damit die Existenz eines
-- strict-Findings nicht über den Link inferierbar ist.
--
-- Schreibpfade (AC-120-H3): keine INSERT/UPDATE-RLS-Policy — alle Mutationen über
-- SECURITY-DEFINER-RPCs OHNE actor-Parameter (auth.uid()), revoke from public/anon,
-- expliziter Rollen- UND Clearance-Re-Check im RPC (Definer umgehen RLS).
--
-- Audit (AC-120-H5): entity_type-CHECK, _tracked_audit_columns und
-- can_read_audit_entry werden per ANCHOR-REPLACE aus den LIVE-Definitionen
-- erweitert (NICHT als hartkodierter Volltext) — 4 Parallel-Slices schreiben auf
-- dieselbe Fläche. can_read_audit_entry wird nach dem Recreate explizit neu
-- ge-granted (ein Recreate droppt den authenticated-Grant und bricht still den
-- PROJ-10-HistoryTab). ma_valuation_links bekommt KEINEN Audit-Trigger
-- (Join-Tabelle, insert/delete-only — PROJ-102-Präzedenz workstream_phases).

-- Section 0: audit entity_type CHECK erweitern (VOR jedem Write, PROJ-100a-H-1) --
do $mig$
declare v_def text; v_new text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint where conname = 'audit_log_entity_type_check';
  if v_def is not null and v_def not like '%ma_valuations%' then
    v_new := replace(v_def, '])))', ', ''ma_valuations''::text])))');
    if v_new = v_def then
      raise exception 'unexpected audit_log_entity_type_check format — anchor not found';
    end if;
    execute 'alter table public.audit_log_entries drop constraint audit_log_entity_type_check';
    execute 'alter table public.audit_log_entries add constraint audit_log_entity_type_check ' || v_new;
  end if;
end $mig$;

-- Section 1: ma_valuations (Versionskette je Deal) ----------------------------
create table if not exists public.ma_valuations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version_no integer not null default 1,
  supersedes_valuation_id uuid references public.ma_valuations(id) on delete set null,
  is_current boolean not null default true,
  version_comment text,
  title text not null,
  valuation_date date not null,
  method text not null,
  value_low numeric(18,2),
  value_high numeric(18,2),
  currency char(3) not null default 'EUR',
  assumptions text,
  author_user_id uuid references public.profiles(id) on delete set null,
  confidentiality_level public.ma_confidentiality_level not null default 'confidential',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ma_valuations_method_check
    check (method in ('multiple','dcf','comparable_transactions','net_asset')),
  constraint ma_valuations_currency_check
    check (public._is_supported_currency(currency)),
  constraint ma_valuations_band_check
    check (value_low is null or value_high is null or value_high >= value_low),
  constraint ma_valuations_version_no_check check (version_no >= 1),
  constraint ma_valuations_no_self_supersede
    check (supersedes_valuation_id is null or supersedes_valuation_id <> id),
  constraint ma_valuations_project_version_unique unique (project_id, version_no)
);

-- F1: genau EIN gültiger Kopf pro Deal (DB-erzwungen, nicht nur im RPC).
create unique index if not exists ma_valuations_one_current_idx
  on public.ma_valuations (project_id) where is_current;
create index if not exists ma_valuations_project_idx
  on public.ma_valuations (project_id, version_no desc);
create index if not exists ma_valuations_tenant_idx
  on public.ma_valuations (tenant_id);
create index if not exists ma_valuations_supersedes_idx
  on public.ma_valuations (supersedes_valuation_id)
  where supersedes_valuation_id is not null;

alter table public.ma_valuations enable row level security;

-- Section 2: ma_valuation_links (AC3 — echtes M:N Bewertung ↔ Finding) --------
create table if not exists public.ma_valuation_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  valuation_id uuid not null references public.ma_valuations(id) on delete cascade,
  linked_kind text not null,
  linked_id uuid not null,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- F3: bewusst nur 'dd_finding'. Erweiterungs-Kontrakt siehe Header.
  constraint ma_valuation_links_kind_check check (linked_kind in ('dd_finding')),
  constraint ma_valuation_links_unique_edge unique (valuation_id, linked_kind, linked_id)
);

create index if not exists ma_valuation_links_valuation_idx
  on public.ma_valuation_links (valuation_id);
create index if not exists ma_valuation_links_target_idx
  on public.ma_valuation_links (linked_kind, linked_id);
create index if not exists ma_valuation_links_tenant_idx
  on public.ma_valuation_links (tenant_id);

alter table public.ma_valuation_links enable row level security;

-- Section 3: Need-to-know-Helfer für die Link-Gegenseite (AC-120-H2) ----------
-- SECURITY DEFINER, damit die Ziel-Zeile unabhängig von RLS aufgelöst werden
-- kann; zurückgegeben wird ausschließlich, ob der AUFRUFER dafür freigegeben ist.
-- fail-closed: unbekannte Kinds und nicht auflösbare Ziele → false.
create or replace function public._ma_valuation_link_target_visible(
  p_kind text,
  p_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_project uuid;
  v_level public.ma_confidentiality_level;
begin
  case p_kind
    when 'dd_finding' then
      select f.project_id, f.confidentiality_level into v_project, v_level
        from public.dd_findings f where f.id = p_id;
    -- PROJ-126-Kontrakt: 'synergy_hypothesis'-Zweig hier ergänzen (siehe Header).
    else
      return false;
  end case;
  if v_project is null then return false; end if;
  return public.can_access_classified(v_project, v_level);
end;
$$;
revoke execute on function public._ma_valuation_link_target_visible(text, uuid) from public, anon;
grant execute on function public._ma_valuation_link_target_visible(text, uuid) to authenticated;

-- Section 4: RLS-Policies ------------------------------------------------------
-- ma_valuations: SELECT permissive (Projektmitglied) + RESTRICTIVE Need-to-know
-- auf allen vier Achsen. KEINE INSERT/UPDATE/DELETE permissive Policy →
-- default-deny; Schreiben ausschließlich über die DEFINER-RPCs (H3).
drop policy if exists ma_valuations_select on public.ma_valuations;
create policy ma_valuations_select on public.ma_valuations
  for select to authenticated
  using (public.is_project_member(project_id));

drop policy if exists ma_valuations_conf_select on public.ma_valuations;
create policy ma_valuations_conf_select on public.ma_valuations
  as restrictive for select to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));

drop policy if exists ma_valuations_conf_insert on public.ma_valuations;
create policy ma_valuations_conf_insert on public.ma_valuations
  as restrictive for insert to authenticated
  with check (public.can_access_classified(project_id, confidentiality_level));

drop policy if exists ma_valuations_conf_update on public.ma_valuations;
create policy ma_valuations_conf_update on public.ma_valuations
  as restrictive for update to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));

drop policy if exists ma_valuations_conf_delete on public.ma_valuations;
create policy ma_valuations_conf_delete on public.ma_valuations
  as restrictive for delete to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));

-- ma_valuation_links: SELECT nur wenn BEIDE Seiten sichtbar sind (H2).
drop policy if exists ma_valuation_links_select on public.ma_valuation_links;
create policy ma_valuation_links_select on public.ma_valuation_links
  for select to authenticated
  using (
    exists (
      select 1 from public.ma_valuations v
       where v.id = valuation_id
         and public.is_project_member(v.project_id)
         and public.can_access_classified(v.project_id, v.confidentiality_level)
    )
    and public._ma_valuation_link_target_visible(linked_kind, linked_id)
  );

drop policy if exists ma_valuation_links_conf_write on public.ma_valuation_links;
create policy ma_valuation_links_conf_write on public.ma_valuation_links
  as restrictive for update to authenticated
  using (
    exists (
      select 1 from public.ma_valuations v
       where v.id = valuation_id
         and public.can_access_classified(v.project_id, v.confidentiality_level)
    )
  );

drop policy if exists ma_valuation_links_conf_delete on public.ma_valuation_links;
create policy ma_valuation_links_conf_delete on public.ma_valuation_links
  as restrictive for delete to authenticated
  using (
    exists (
      select 1 from public.ma_valuations v
       where v.id = valuation_id
         and public.can_access_classified(v.project_id, v.confidentiality_level)
    )
  );

-- Section 5: updated_at + Immutability-Guard (AC-120-H4) ----------------------
drop trigger if exists ma_valuations_set_updated_at on public.ma_valuations;
create trigger ma_valuations_set_updated_at
  before update on public.ma_valuations
  for each row execute function extensions.moddatetime(updated_at);

-- Bewertungsversionen sind unveränderlich. Die EINZIGE erlaubte inhaltliche
-- Änderung ist der kontrollierte is_current-Flip (Versionswechsel). Korrekturen
-- laufen über eine neue, kommentierte Version (AC2).
create or replace function public._guard_ma_valuation_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if NEW.title is distinct from OLD.title
     or NEW.valuation_date is distinct from OLD.valuation_date
     or NEW.method is distinct from OLD.method
     or NEW.value_low is distinct from OLD.value_low
     or NEW.value_high is distinct from OLD.value_high
     or NEW.currency is distinct from OLD.currency
     or NEW.assumptions is distinct from OLD.assumptions
     or NEW.author_user_id is distinct from OLD.author_user_id
     or NEW.version_no is distinct from OLD.version_no
     or NEW.version_comment is distinct from OLD.version_comment
     or NEW.supersedes_valuation_id is distinct from OLD.supersedes_valuation_id
     or NEW.confidentiality_level is distinct from OLD.confidentiality_level
     or NEW.project_id is distinct from OLD.project_id
     or NEW.tenant_id is distinct from OLD.tenant_id
     or NEW.created_by is distinct from OLD.created_by
     or NEW.created_at is distinct from OLD.created_at then
    raise exception 'ma_valuation versions are immutable; only is_current may change'
      using errcode = '42501';
  end if;
  return NEW;
end;
$$;
revoke execute on function public._guard_ma_valuation_immutable() from public, anon, authenticated;

drop trigger if exists guard_ma_valuation_immutable on public.ma_valuations;
create trigger guard_ma_valuation_immutable
  before update on public.ma_valuations
  for each row execute function public._guard_ma_valuation_immutable();

-- Section 6: external_document_links um 'ma_valuation' erweitern (F2) ---------
-- (a) idempotenter CHECK-Swap (additiv, erhält fremde Parallel-Werte)
do $mig$
declare v_def text; v_new text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint where conname = 'external_document_links_entity_type_check';
  if v_def is not null and v_def not like '%ma_valuation%' then
    v_new := replace(v_def, ']))', ', ''ma_valuation''::text]))');
    if v_new = v_def then
      raise exception 'unexpected external_document_links_entity_type_check format';
    end if;
    execute 'alter table public.external_document_links drop constraint external_document_links_entity_type_check';
    execute 'alter table public.external_document_links add constraint external_document_links_entity_type_check ' || v_new;
  end if;
end $mig$;

-- (b) Resolver-Branch — ANCHOR-REPLACE auf der LIVE-Definition, KEIN Voll-
--     Replace. Eine vollständige Neudefinition aus einem Snapshot hätte den
--     `when 'spa_issue'`-Zweig von PROJ-122 still gelöscht: im Fresh-Replay
--     (Schema-Drift-Shadow-DB) entscheidet der Dateiname, und PROJ-122
--     (20260807110000) läuft VOR dieser Migration (20260807211457). In Prod
--     war die Anwendungsreihenfolge umgekehrt, der Verlust wäre also erst
--     beim Neuaufsetzen sichtbar geworden — und still: der CHECK-Constraint
--     behält 'spa_issue' (additiver Terminator-Anker), Links ließen sich
--     weiter anlegen, wären über den null-project_id-Pfad aber für immer
--     unsichtbar. Additive Zweige sind reihenfolgeunabhängig; die
--     CASE-Reihenfolge ist bei disjunkten Werten semantisch irrelevant.
--
--     Der Anker ist whitespace-tolerant: PROJ-115 schreibt den else-Zweig im
--     Repo zweizeilig, in Prod steht er einzeilig. Ein literales replace()
--     träfe genau eine der beiden Welten (PROJ-Y-115c-Lektion).
do $mig$
declare d text; d0 text;
begin
  select pg_get_functiondef('public.external_link_parent_ctx(text,uuid)'::regprocedure) into d;
  if d is null then
    raise exception 'external_link_parent_ctx not found — PROJ-115 muss zuerst angewendet sein';
  end if;
  d0 := d; -- Vorher-Stand, auch beim idempotenten Skip (sonst liefe der
           -- spa_issue-Guard unten gegen NULL und wäre wirkungslos).

  if position('''ma_valuation''' in d) = 0 then
    d := regexp_replace(d,
      '(\n\s*)else(\s+)project_id := null; level := null;',
      E'\\1when ''ma_valuation'' then select v.project_id, v.confidentiality_level '
      || E'into project_id, level from public.ma_valuations v where v.id = p_entity_id;'
      || E'\\1else\\2project_id := null; level := null;');
    if d = d0 then
      raise exception 'external_link_parent_ctx anchor not found';
    end if;
    execute d;
  end if;

  -- Regressionsschutz: ein Recreate darf keinen fremden Zweig verlieren
  -- (PROJ-78-Muster). Die vier Basis-Typen stammen aus PROJ-115 und sind in
  -- jedem Replay vorhanden; 'spa_issue' nur, wenn PROJ-122 bereits lief.
  select pg_get_functiondef('public.external_link_parent_ctx(text,uuid)'::regprocedure) into d;
  if position('''ma_valuation''' in d) = 0 then
    raise exception 'external_link_parent_ctx patch did not apply';
  end if;
  if position('''deliverable''' in d) = 0
     or position('''work_item''' in d) = 0
     or position('''dd_question''' in d) = 0
     or position('''dd_finding''' in d) = 0 then
    raise exception 'external_link_parent_ctx lost pre-existing branches — aborting';
  end if;
  if position('''spa_issue''' in d0) > 0 and position('''spa_issue''' in d) = 0 then
    raise exception 'external_link_parent_ctx dropped the PROJ-122 branch — aborting';
  end if;
end $mig$;

-- CREATE OR REPLACE erhält die ACLs; erneut setzen dokumentiert die Absicht
-- und schützt gegen ein späteres drop/recreate in dieser Kette (AC-122-H2).
revoke execute on function public.external_link_parent_ctx(text, uuid) from public, anon;
grant execute on function public.external_link_parent_ctx(text, uuid) to authenticated;

-- (c) Cleanup-Trigger (polymorph → keine FK möglich)
drop trigger if exists cleanup_external_links on public.ma_valuations;
create trigger cleanup_external_links after delete on public.ma_valuations
  for each row execute function public._cleanup_external_document_links('ma_valuation');

-- Section 7: RPCs (H3 — kein actor-Param, Rollen- + Clearance-Re-Check) -------

-- 7a) Neue Bewertungsversion (atomarer Flip + INSERT).
create or replace function public.add_ma_valuation_version(
  p_project_id uuid,
  p_title text,
  p_valuation_date date,
  p_method text,
  p_value_low numeric default null,
  p_value_high numeric default null,
  p_currency text default 'EUR',
  p_assumptions text default null,
  p_author_user_id uuid default null,
  p_version_comment text default null,
  p_confidentiality_level public.ma_confidentiality_level default 'confidential',
  p_supersedes_valuation_id uuid default null
)
returns public.ma_valuations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_tenant uuid; v_type text;
  v_prev public.ma_valuations;
  v_head_id uuid;
  v_version_no integer := 1;
  v_row public.ma_valuations;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select tenant_id, project_type into v_tenant, v_type
    from public.projects where id = p_project_id;
  if not found then
    raise exception 'project not found' using errcode = 'P0002';
  end if;
  if v_type is distinct from 'ma' then
    raise exception 'valuations are available for M&A projects only' using errcode = 'P0001';
  end if;

  if not (public.is_tenant_admin(v_tenant) or public.is_project_lead(p_project_id)) then
    raise exception 'insufficient role for valuation version' using errcode = '42501';
  end if;
  -- Definer umgehen RLS → Clearance auf die RESULTIERENDE Stufe explizit prüfen.
  if not public.can_access_classified(p_project_id, p_confidentiality_level) then
    raise exception 'need-to-know: insufficient clearance' using errcode = '42501';
  end if;

  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'title required' using errcode = '22023';
  end if;
  if p_valuation_date is null then
    raise exception 'valuation_date required' using errcode = '22023';
  end if;
  if p_method is null or p_method not in ('multiple','dcf','comparable_transactions','net_asset') then
    raise exception 'invalid valuation method' using errcode = '22023';
  end if;
  if not public._is_supported_currency(coalesce(p_currency, 'EUR')) then
    raise exception 'unsupported currency' using errcode = '22023';
  end if;
  if p_value_low is not null and p_value_high is not null and p_value_high < p_value_low then
    raise exception 'value_high must be >= value_low' using errcode = '23514';
  end if;

  select id into v_head_id from public.ma_valuations
    where project_id = p_project_id and is_current;

  if p_supersedes_valuation_id is not null then
    select * into v_prev from public.ma_valuations
      where id = p_supersedes_valuation_id and project_id = p_project_id;
    if not found then
      raise exception 'supersedes target not in this project' using errcode = '23514';
    end if;
    if not v_prev.is_current then
      raise exception 'can only supersede the current version' using errcode = '23514';
    end if;
    v_version_no := v_prev.version_no + 1;
    -- Erst flippen, dann einfügen → der partial-unique Kopf-Index hält ohne deferrable.
    perform set_config('audit.change_reason', 'valuation superseded by new version', true);
    update public.ma_valuations set is_current = false where id = v_prev.id;
  elsif v_head_id is not null then
    -- Verhindert eine zweite Kette UND verlorene Updates bei Parallelanlage.
    raise exception 'a current valuation exists; pass p_supersedes_valuation_id to add a new version'
      using errcode = '23514';
  end if;

  insert into public.ma_valuations (
    tenant_id, project_id, version_no, supersedes_valuation_id, is_current,
    version_comment, title, valuation_date, method, value_low, value_high,
    currency, assumptions, author_user_id, confidentiality_level, created_by
  ) values (
    v_tenant, p_project_id, v_version_no, p_supersedes_valuation_id, true,
    p_version_comment, trim(p_title), p_valuation_date, p_method, p_value_low, p_value_high,
    upper(coalesce(p_currency, 'EUR')), p_assumptions, p_author_user_id, p_confidentiality_level, v_caller
  ) returning * into v_row;

  return v_row;
end;
$$;
revoke execute on function public.add_ma_valuation_version(uuid,text,date,text,numeric,numeric,text,text,uuid,text,public.ma_confidentiality_level,uuid) from public, anon;
grant execute on function public.add_ma_valuation_version(uuid,text,date,text,numeric,numeric,text,text,uuid,text,public.ma_confidentiality_level,uuid) to authenticated;

-- 7b) Verknüpfung setzen (idempotent).
create or replace function public.set_ma_valuation_link(
  p_valuation_id uuid,
  p_linked_kind text,
  p_linked_id uuid,
  p_note text default null
)
returns public.ma_valuation_links
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_tenant uuid; v_project uuid; v_level public.ma_confidentiality_level;
  v_target_project uuid;
  v_row public.ma_valuation_links;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select tenant_id, project_id, confidentiality_level
    into v_tenant, v_project, v_level
    from public.ma_valuations where id = p_valuation_id;
  if not found then
    raise exception 'valuation not found' using errcode = 'P0002';
  end if;
  if not (public.is_tenant_admin(v_tenant) or public.is_project_lead(v_project)) then
    raise exception 'insufficient role for valuation link' using errcode = '42501';
  end if;
  if not public.can_access_classified(v_project, v_level) then
    raise exception 'need-to-know: insufficient clearance' using errcode = '42501';
  end if;

  if p_linked_kind is distinct from 'dd_finding' then
    raise exception 'unsupported linked_kind' using errcode = '22023';
  end if;

  select f.project_id into v_target_project
    from public.dd_findings f where f.id = p_linked_id;
  if v_target_project is null then
    raise exception 'link target not found' using errcode = '23503';
  end if;
  if v_target_project is distinct from v_project then
    raise exception 'link target belongs to another project' using errcode = '23514';
  end if;
  -- H2: der Aufrufer muss AUCH für das Ziel freigegeben sein, sonst wäre die
  -- Existenz eines strict-Findings über den Link inferierbar.
  if not public._ma_valuation_link_target_visible(p_linked_kind, p_linked_id) then
    raise exception 'need-to-know: insufficient clearance for link target' using errcode = '42501';
  end if;

  insert into public.ma_valuation_links (tenant_id, valuation_id, linked_kind, linked_id, note, created_by)
  values (v_tenant, p_valuation_id, p_linked_kind, p_linked_id, p_note, v_caller)
  on conflict (valuation_id, linked_kind, linked_id)
    do update set note = excluded.note
  returning * into v_row;

  return v_row;
end;
$$;
revoke execute on function public.set_ma_valuation_link(uuid,text,uuid,text) from public, anon;
grant execute on function public.set_ma_valuation_link(uuid,text,uuid,text) to authenticated;

-- 7c) Verknüpfung entfernen.
create or replace function public.remove_ma_valuation_link(p_link_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_tenant uuid; v_project uuid; v_level public.ma_confidentiality_level;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select v.tenant_id, v.project_id, v.confidentiality_level
    into v_tenant, v_project, v_level
    from public.ma_valuation_links l
    join public.ma_valuations v on v.id = l.valuation_id
   where l.id = p_link_id;
  if not found then
    raise exception 'valuation link not found' using errcode = 'P0002';
  end if;
  if not (public.is_tenant_admin(v_tenant) or public.is_project_lead(v_project)) then
    raise exception 'insufficient role for valuation link' using errcode = '42501';
  end if;
  if not public.can_access_classified(v_project, v_level) then
    raise exception 'need-to-know: insufficient clearance' using errcode = '42501';
  end if;

  delete from public.ma_valuation_links where id = p_link_id;
  return true;
end;
$$;
revoke execute on function public.remove_ma_valuation_link(uuid) from public, anon;
grant execute on function public.remove_ma_valuation_link(uuid) to authenticated;

-- Section 8: Audit-Trio per Anchor-Replace aus LIVE (H5) ----------------------
-- ma_valuations: nur is_current ist überhaupt änderbar (Immutability-Guard) →
-- genau diese Spalte wird getrackt (analog skill_versions → array['status']).
-- Das ist exakt der Versionswechsel, den die DoD im Audit-Trail verlangt.
do $mig$
declare d text;
begin
  select pg_get_functiondef('public._tracked_audit_columns(text)'::regprocedure) into d;
  if position('''ma_valuations''' in d) = 0 then
    d := replace(
      d,
      'else array[]::text[]',
      'when ''ma_valuations'' then array[''is_current''] else array[]::text[]'
    );
    if position('''ma_valuations''' in d) = 0 then
      raise exception '_tracked_audit_columns anchor not found';
    end if;
    execute d;
  end if;
end $mig$;

do $mig$
declare d text;
begin
  select pg_get_functiondef('public.can_read_audit_entry(text,uuid,uuid)'::regprocedure) into d;
  if position('''ma_valuations''' in d) = 0 then
    d := replace(
      d,
      'else return false;',
      'when ''ma_valuations'' then select project_id into v_project from public.ma_valuations where id = p_entity_id; else return false;'
    );
    if position('''ma_valuations''' in d) = 0 then
      raise exception 'can_read_audit_entry anchor not found';
    end if;
    execute d;
  end if;
end $mig$;

-- Pflicht nach jedem Recreate: der authenticated-Grant wird sonst gedroppt und
-- der PROJ-10-HistoryTab bricht still (feedback_audit_fn_recreate_drops_grant).
grant execute on function public.can_read_audit_entry(text, uuid, uuid) to authenticated;

drop trigger if exists audit_changes_ma_valuations on public.ma_valuations;
create trigger audit_changes_ma_valuations
  after update on public.ma_valuations
  for each row execute function public.record_audit_changes();