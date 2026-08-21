-- PROJ-Y-114a (Fix-forward 2) — Freigabe-Pruefung nur bei tatsaechlicher Aenderung.
--
-- Befund bei der Selbstdurchsicht des Bearbeiten-Pfades: der Dialog sendet
-- `source_dd_question_id` bei JEDEM Speichern mit, um die bestehende Verknuepfung
-- ueber `clear_source = true` hinweg zu erhalten. `update_dd_finding` prueft den
-- Verweis aber unbedingt gegen `can_access_classified` — damit haette eine
-- Projektleitung, deren Freigabe unterhalb der Stufe der verknuepften FRAGE liegt,
-- das Finding gar nicht mehr bearbeiten koennen (42501 auch fuer eine reine
-- Titelaenderung), obwohl sie fuer das Finding selbst freigegeben ist.
--
-- Ueber die Oberflaeche heute nicht erreichbar (der Eskalationspfad legt das Finding
-- im Stream der Frage an, und einen Verweis-Picker gibt es nicht), also kein
-- Sicherheitsbefund — aber eine Falle, die genau dann zuschlaegt, wenn ein
-- Cross-Stream-Verweis ueber die API entsteht. Fail-closed war es immer, nur eben
-- ueberschiessend.
--
-- Praezise Regel statt Abschwaechung: **ein unveraenderter Verweis ist keine neue
-- Offenlegung.** Geprueft wird nur, wenn der neue Wert vom gespeicherten abweicht.
-- Das Leck-Tor bleibt damit vollstaendig zu (Vektoren G/H unveraendert): das
-- *Setzen* oder *Umbiegen* eines Verweises verlangt weiterhin die Freigabe.

create or replace function public.update_dd_finding(
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
  -- Nur bei echter Aenderung pruefen: ein erneut mitgesendeter, identischer Verweis
  -- offenbart nichts, was der Aufrufer nicht schon in der Hand hat.
  if p_source_dd_question_id is not null
     and p_source_dd_question_id is distinct from v_f.source_dd_question_id then
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

do $$
declare v_n int;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'update_dd_finding';
  if v_n <> 1 then raise exception 'PROJ-Y-114a: update_dd_finding overloaded (%)', v_n; end if;
  if not (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname='public' and p.proname='update_dd_finding') then
    raise exception 'PROJ-Y-114a: update_dd_finding lost SECURITY DEFINER';
  end if;
  if has_function_privilege('anon','public.update_dd_finding(uuid, text, text, text, numeric, boolean, smallint, text, text, uuid, uuid, text, text, uuid, boolean)','EXECUTE') then
    raise exception 'PROJ-Y-114a: anon must not hold EXECUTE';
  end if;
  if not has_function_privilege('authenticated','public.update_dd_finding(uuid, text, text, text, numeric, boolean, smallint, text, text, uuid, uuid, text, text, uuid, boolean)','EXECUTE') then
    raise exception 'PROJ-Y-114a: authenticated lost EXECUTE';
  end if;
  -- Die Aenderungs-Bedingung muss im Rumpf stehen, sonst ist der Fix nicht drin.
  if (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='update_dd_finding')
     not like '%is distinct from v_f.source_dd_question_id%' then
    raise exception 'PROJ-Y-114a: change-only guard missing from body';
  end if;
end $$;
