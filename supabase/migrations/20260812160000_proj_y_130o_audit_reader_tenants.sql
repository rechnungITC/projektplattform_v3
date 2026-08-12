-- PROJ-Y-130o — ein Helfer für die Revisions-Sicht: welche Mandanten darf ich prüfen?
--
-- Der Live-Pentest hat gezeigt, dass ein reiner Revisor den NAMEN des
-- freigegebenen Mandanten NICHT lesen kann: `tenants` ist an die Mitgliedschaft
-- gebunden, und ein Revisor ist ausdrücklich kein Mitglied. Die Auswahlliste hätte
-- damit UUIDs angezeigt — funktionsfähig, aber für einen Menschen mit mehreren
-- Freigaben unbrauchbar.
--
-- Nicht gewählt: die `tenants`-Policy aufweiten. Das ist die Mandanten-Achse,
-- gelesen an sehr vielen Stellen; eine zusätzliche Sichtbarkeitsregel dort hat
-- einen Blast-Radius, der zu einer Namensanzeige in keinem Verhältnis steht.
--
-- Stattdessen ein schmaler, member-callable DEFINER-Helfer, der genau das
-- zurückgibt, was die Auswahl braucht — und ausschließlich für die EIGENEN
-- Freigaben des Aufrufers (`auth.uid()` intern, kein Actor-Parameter).
--
-- Er liefert auch abgelaufene Freigaben, mit Flag: ein Revisor, der nichts mehr
-- sieht, soll den Grund erfahren statt eine leere Seite. Die Wirksamkeit rechnet
-- die Datenbank, nicht die Oberfläche — dieselbe Frist-Semantik wie
-- `has_audit_reader_grant`.
create or replace function public.audit_reader_tenants()
returns table (
  tenant_id uuid,
  tenant_name text,
  valid_from timestamptz,
  valid_until timestamptz,
  note text,
  is_effective boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select
    g.tenant_id,
    t.name,
    g.valid_from,
    g.valid_until,
    g.note,
    (g.valid_from <= now() and (g.valid_until is null or g.valid_until > now())) as is_effective
  from public.audit_reader_grants g
  join public.tenants t on t.id = g.tenant_id
  where g.user_id = auth.uid()
  order by g.valid_from desc;
$fn$;

revoke all on function public.audit_reader_tenants() from public, anon;
grant execute on function public.audit_reader_tenants() to authenticated, service_role, postgres;

comment on function public.audit_reader_tenants is
  'PROJ-Y-130o: die eigenen Revisions-Freigaben des Aufrufers samt Mandantenname und Wirksamkeits-Flag. SECURITY DEFINER, weil `tenants` an die Mitgliedschaft gebunden ist und ein Revisor bewusst kein Mitglied ist; liest auth.uid() intern (kein Actor-Parameter) und gibt ausschließlich eigene Freigaben zurück.';

do $do$
declare v int;
begin
  if exists (
    select 1 from information_schema.role_routine_grants
    where routine_schema='public' and routine_name='audit_reader_tenants' and grantee='anon'
  ) then
    raise exception 'PROJ-Y-130o: audit_reader_tenants ist für anon aufrufbar';
  end if;

  -- Kein Actor-Parameter: die Funktion darf nicht für fremde Nutzer abfragbar sein.
  select count(*) into v from pg_proc
   where proname='audit_reader_tenants' and pronamespace='public'::regnamespace and pronargs = 0;
  if v <> 1 then
    raise exception 'PROJ-Y-130o: audit_reader_tenants hat Parameter — Impersonations-Risiko';
  end if;

  raise notice 'PROJ-Y-130o: Helfer angelegt';
end $do$;
