-- PROJ-80-α.2c — der Summarizer als gewöhnlicher Skill
--
-- Die Spec verlangt: „Ships with seeded built-in Skill `summarizer` (category
-- `cross_cutting`, active by default in every tenant)" und „Admin can override
-- the markdown but cannot delete it (V1)".
--
-- Umgesetzt als **gewöhnlicher** PROJ-76-Skill, nicht als Sonderweg: dadurch
-- erbt er Versionierung, Entwurf/Veröffentlichen (PROJ-77), Audit und die
-- Admin-Oberfläche, statt eine zweite Verwaltung neben dem Skill-Rahmen
-- aufzumachen.
--
-- Nachgesät statt in einer Migration verteilt: neue Mandanten entstehen nach
-- dieser Migration, und ein Backfill über alle Bestandsmandanten würde in
-- Mandanten Zeilen anlegen, die die Funktion nie nutzen. Dasselbe Muster wie
-- `seed_risk_categories_if_empty` und `ensure_default_ma_project_templates`.

-- ---------------------------------------------------------------------------
-- 1. Nachsäen
-- ---------------------------------------------------------------------------

create or replace function public.ensure_summarizer_skill(p_tenant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_skill_id uuid;
  v_version_id uuid;
begin
  if not public.is_tenant_member(p_tenant_id) then
    raise exception 'forbidden' using errcode = 'P0003';
  end if;

  select id into v_skill_id
    from public.skills
   where tenant_id = p_tenant_id and slug = 'summarizer';
  if v_skill_id is not null then
    return v_skill_id;
  end if;

  insert into public.skills (tenant_id, name, slug, description, category, is_active)
  values (
    p_tenant_id,
    'Quintessenz',
    'summarizer',
    'Fasst ein hochgeladenes Dokument zu einer kompakten, strukturierten Quintessenz zusammen.',
    'cross_cutting',
    true
  )
  returning id into v_skill_id;

  insert into public.skill_versions (
    skill_id, tenant_id, version_number, markdown_content, frontmatter,
    change_summary, status
  )
  values (
    v_skill_id,
    p_tenant_id,
    1,
    -- Der Inhalt ist die **Zusatzanweisung** an das Modell, nicht der ganze
    -- Prompt. Die unverhandelbaren Regeln (nur wiedergeben, nichts erfinden,
    -- Schema einhalten) stehen im Code und sind für Mandanten nicht
    -- abschaltbar — sonst könnte eine Anpassung die Zusicherung aushebeln,
    -- dass die Quintessenz das Dokument wiedergibt und nicht ausschmückt.
    E'Halte die Quintessenz sachlich und knapp.\n\n'
    'Nenne bei Bau- und Projektdokumenten bevorzugt: Gewerk oder Bauabschnitt, '
    'Termine, Mengen, offene Punkte.\n\n'
    'Bei Vertrags- und Rechtsdokumenten: Vertragsparteien, Laufzeit, '
    'Kündigungsfristen, wesentliche Pflichten.',
    jsonb_build_object('purpose', 'document_summary', 'builtin', true),
    'Erstfassung (automatisch angelegt)',
    'active'
  )
  returning id into v_version_id;

  update public.skills set current_version_id = v_version_id where id = v_skill_id;
  return v_skill_id;
end;
$$;
revoke all on function public.ensure_summarizer_skill(uuid) from public;
revoke all on function public.ensure_summarizer_skill(uuid) from anon;
grant execute on function public.ensure_summarizer_skill(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Löschschutz
-- ---------------------------------------------------------------------------
-- Der Skill ist eingebaut: Inhalt änderbar (das ist der Sinn der Anpassbarkeit),
-- Existenz nicht. Ohne diesen Wächter könnte ein Admin die Funktion für seinen
-- Mandanten unbemerkt entfernen — die Extraktion liefe weiter, die Quintessenz
-- bliebe still aus, und es sähe aus wie ein Fehler der KI.
--
-- Bewusst als Trigger und nicht als Policy: eine fehlende DELETE-Policy würde
-- 0 Zeilen liefern und damit wie Erfolg aussehen; der Trigger sagt, warum.

create or replace function public._skills_protect_builtin_delete()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if old.slug = 'summarizer' then
    raise exception
      'Der eingebaute Quintessenz-Skill kann nicht geloescht werden. Inhalt aendern ist moeglich, Deaktivieren ueber is_active.'
      using errcode = '42501';
  end if;
  return old;
end;
$$;
revoke all on function public._skills_protect_builtin_delete() from public;
revoke all on function public._skills_protect_builtin_delete() from anon, authenticated;

drop trigger if exists skills_protect_builtin_delete on public.skills;
create trigger skills_protect_builtin_delete
  before delete on public.skills
  for each row execute function public._skills_protect_builtin_delete();

-- ---------------------------------------------------------------------------
-- 3. Post-Conditions
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.skills'::regclass
                    and tgname = 'skills_protect_builtin_delete') then
    raise exception 'PROJ-80: Loeschschutz-Trigger fehlt';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname='public' and p.proname='ensure_summarizer_skill') then
    raise exception 'PROJ-80: ensure_summarizer_skill fehlt';
  end if;
  -- Die interne Trigger-Funktion darf nicht direkt aufrufbar sein
  -- (Advisor-Lint 0029, PROJ-68-Muster).
  if has_function_privilege('authenticated', 'public._skills_protect_builtin_delete()', 'execute') then
    raise exception 'PROJ-80: Trigger-Funktion ist fuer authenticated aufrufbar';
  end if;
  raise notice 'PROJ-80-alpha2c: Nachsaat-RPC und Loeschschutz in Ordnung';
end $$;
