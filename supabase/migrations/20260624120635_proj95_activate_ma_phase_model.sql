-- PROJ-95 — seed the M&A standard phase model into the existing phases table.
-- Idempotent (dedupe by project_id+name). Phase 2 "Target-Screening" is
-- mandate-gated: only seeded once ma_project_profiles.mandate_status='approved'
-- (PROJ-94 gate). No new phases table — copy-on-create per ADR Fork 1+5.
-- Impersonation-safe: auth.uid() only (no actor param), execute revoked from
-- anon (PROJ-94 lesson). SECURITY DEFINER bypasses RLS for the seed insert.
-- Repo filename version == prod-registered version (PROJ-134 convention).

create or replace function public.activate_ma_phase_model(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_caller        uuid := auth.uid();
  v_tenant        uuid;
  v_type          text;
  v_mandate       text;
  v_is_admin      boolean;
  v_is_lead       boolean;
  v_seeded        integer := 0;
  v_phase2_locked boolean;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select p.tenant_id, p.project_type
    into v_tenant, v_type
    from public.projects p
   where p.id = p_project_id;
  if not found then
    raise exception 'project not found' using errcode = '02000';
  end if;
  if v_type is distinct from 'ma' then
    raise exception 'phase model is only available for M&A projects'
      using errcode = '22023';
  end if;

  v_is_admin := exists (
    select 1 from public.tenant_memberships
    where tenant_id = v_tenant and user_id = v_caller and role = 'admin'
  );
  v_is_lead := exists (
    select 1 from public.project_memberships
    where project_id = p_project_id and user_id = v_caller and role = 'lead'
  );
  if not (v_is_admin or v_is_lead) then
    raise exception 'insufficient role to activate the M&A phase model'
      using errcode = '42501';
  end if;

  select mandate_status into v_mandate
    from public.ma_project_profiles where project_id = p_project_id;
  v_phase2_locked := coalesce(v_mandate, 'draft') is distinct from 'approved';

  with preset(seq, nm, descr, gated) as (
    values
      (1,  'Strategie & Vorbereitung',            'Deal-Rationale, Zielbild, Suchprofil und Investitionsrahmen festlegen.', false),
      (2,  'Target-Screening & Identifikation',   'Zielunternehmen identifizieren, longlist/shortlist priorisieren. Erst nach Mandatsfreigabe.', true),
      (3,  'Erstansprache & NDA',                 'Kontaktaufnahme, Vertraulichkeitsvereinbarung (NDA) abschließen.', false),
      (4,  'Indikatives Angebot / LOI',           'Indikatives Angebot, Letter of Intent, Verhandlungsrahmen abstecken.', false),
      (5,  'Due Diligence',                       'DD-Streams (Legal, Tax, Financial, Commercial, IT, HR), Findings und Red-Flags.', false),
      (6,  'Bewertung & verbindliches Angebot',   'Business Case, Kaufpreis-Bridge, verbindliches Angebot ableiten.', false),
      (7,  'Vertragsverhandlung / SPA',           'SPA-Verhandlung, Issues-List, Closing Conditions definieren.', false),
      (8,  'Signing',                             'Vertragsunterzeichnung und Übergang zu Closing-Bedingungen.', false),
      (9,  'Closing',                             'Erfüllung der Closing Conditions, Vollzug und Übergabe an Integration.', false),
      (10, 'Post-Merger-Integration',             'Day-1- und 100-Tage-Plan, Synergie-Tracking, IMO-Steuerung.', false)
  ),
  ins as (
    insert into public.phases (tenant_id, project_id, name, description, sequence_number, status, created_by)
    select v_tenant, p_project_id, pr.nm, pr.descr, pr.seq, 'planned', v_caller
      from preset pr
     where (not pr.gated or not v_phase2_locked)
       and not exists (
         select 1 from public.phases ph
          where ph.project_id = p_project_id
            and ph.name = pr.nm
            and ph.is_deleted = false
       )
    returning 1
  )
  select count(*) into v_seeded from ins;

  return jsonb_build_object(
    'seeded', v_seeded,
    'phase2_locked', v_phase2_locked,
    'mandate_status', coalesce(v_mandate, 'draft')
  );
end;
$function$;

revoke all on function public.activate_ma_phase_model(uuid) from public;
revoke all on function public.activate_ma_phase_model(uuid) from anon;
grant execute on function public.activate_ma_phase_model(uuid) to authenticated;
