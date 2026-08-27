-- PROJ-151-α — eigene Einstellungs-Spalte fuer den Chat.
--
-- Nachtrag: der erste Entwurf las `tenant_settings.ai_chat_settings`, ohne die
-- Spalte anzulegen. Der Schema-Drift-Waechter (PROJ-42) hat das gefunden. Die
-- Wirkung waere STILL gewesen — die Abfrage haette nichts geliefert und die
-- Aufbewahrung immer auf dem Default gestanden, ohne dass etwas rot wird.
--
-- Eigene Spalte statt eines Zweigs in `assistant_settings`: die dortige
-- Einstellung regelt Sprachtranskripte des Assistenten und steht bei ALLEN
-- Mandanten auf "nur Metadaten" — den Chat daran zu haengen hiesse, seinen
-- Verlauf am ersten Tag zu leeren (Q2). Jedes Modul haelt hier ohnehin seine
-- eigene Spalte (`budget_settings`, `output_rendering_settings`, …).

alter table public.tenant_settings
  add column if not exists ai_chat_settings jsonb not null default '{}'::jsonb;

do $post$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tenant_settings'
      and column_name = 'ai_chat_settings'
  ) then
    raise exception 'PROJ-151: ai_chat_settings wurde nicht angelegt';
  end if;

  -- Der Chat darf die Assistenten-Einstellung nicht erben: sie bliebe sonst
  -- die faktische Autoritaet, und der Verlauf waere leer.
  if exists (
    select 1 from public.tenant_settings
    where ai_chat_settings ? 'history_retention'
  ) then
    raise notice 'PROJ-151: mindestens ein Mandant hat bereits eine eigene Chat-Aufbewahrung';
  end if;

  raise notice 'PROJ-151: ai_chat_settings vorhanden, Default {} — Aufbewahrung faellt auf "store"';
end $post$;
