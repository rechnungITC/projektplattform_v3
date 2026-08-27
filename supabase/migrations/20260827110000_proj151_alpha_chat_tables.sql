-- PROJ-151-α — Datenschicht des projektbezogenen KI-Chats.
--
-- Vier Entscheidungen aus dem Tech Design, jede gegen den gemessenen Stand:
--
-- Q1  Eigene Ablage statt Erweiterung von `assistant_turns`. Dort ist EINE Zeile ein Zug aus
--     Frage UND Antwort; ein Chat braucht Einzelnachrichten mit Rolle (Stroemen, mehrteilige
--     Antworten). Dazu vier Pflichtfelder ohne Default, die mit erfundenen Platzhaltern zu
--     fuellen waeren. Uebernommen wird das Sichtbarkeits-MUSTER des Assistenten.
--
-- Q3  `project_id` haengt mit ON DELETE CASCADE am Projekt und traegt KEINEN
--     Unveraenderlichkeits-Waechter — bewusst abweichend vom Assistenten (SET NULL). Ein
--     projektbezogener Verlauf ohne sein Projekt ist sinnlos, und PROJ-Y-148a hat gemessen,
--     dass append-only Inseln am Projekt das endgueltige Loeschen dauerhaft blockieren.
--
-- Schreibwege laufen ueber Policies, nicht ueber Funktionen — Praezedenz PROJ-144
-- (`assistant_work_item_drafts`, 4 Policies). Das Haus nutzt Funktionen dort, wo komplexe
-- Rollenregeln zu pruefen sind (Zwei-Akteur-Tor bei dd_findings/construction_defects); hier
-- lautet die Regel schlicht "eigene Zeilen", und dafuer ist eine Policy klarer als eine RPC.
--
-- L2 (privat je Nutzer) gilt AUCH gegenueber Projektleitung und Mandanten-Administration.

-- ---------------------------------------------------------------- Ordner
create table if not exists public.ai_chat_folders (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint ai_chat_folders_name_len check (char_length(name) between 1 and 120)
);

-- ---------------------------------------------------------------- Unterhaltungen
create table if not exists public.ai_chat_conversations (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  folder_id   uuid references public.ai_chat_folders(id) on delete set null,
  title       text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint ai_chat_conversations_title_len check (char_length(title) between 1 and 200)
);

-- ---------------------------------------------------------------- Nachrichten
-- `role` trennt Frage und Antwort — genau das, was `assistant_turns` nicht kann.
-- `ki_run_id` traegt den Bezug zum Lauf-Protokoll: daraus kommen Kosten (AC-151.22)
-- und der Grund einer leeren Antwort (AC-151.11, PROJ-137).
create table if not exists public.ai_chat_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.ai_chat_conversations(id) on delete cascade,
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  role             text not null,
  content          text not null default '',
  token_input      integer,
  token_output     integer,
  ki_run_id        uuid references public.ki_runs(id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint ai_chat_messages_role_check check (role in ('user','assistant')),
  constraint ai_chat_messages_tokens_nonneg
    check (coalesce(token_input,0) >= 0 and coalesce(token_output,0) >= 0)
);

-- ---------------------------------------------------------------- Prompt-Vorlagen
-- Mandantenweit, von der Administration gepflegt. Nur die STRUKTUR ist Teil dieser Slice —
-- die Inhalte der U-Know-Bibliothek liegen nicht im Code (0 geseedete Zeilen in 92
-- Migrationen) und waeren ein Datenexport des Eigners.
create table if not exists public.ai_chat_prompt_templates (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  title       text not null,
  body        text not null,
  is_active   boolean not null default true,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint ai_chat_prompt_templates_title_len check (char_length(title) between 1 and 160),
  constraint ai_chat_prompt_templates_body_len  check (char_length(body) between 1 and 8000)
);

create table if not exists public.ai_chat_prompt_favorites (
  template_id uuid not null references public.ai_chat_prompt_templates(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (template_id, user_id)
);

-- ---------------------------------------------------------------- Modellpreise
-- Denk-Token zaehlen als Ausgabe (U-Know-Vorlage). Mandantengebunden statt global, weil
-- Konditionen sich unterscheiden und das Haus keine globalen Daten ausser markierten
-- Katalogen kennt.
create table if not exists public.ai_model_prices (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  provider       text not null,
  model          text not null,
  input_per_1m   numeric(12,4) not null,
  output_per_1m  numeric(12,4) not null,
  currency       text not null default 'EUR',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint ai_model_prices_nonneg check (input_per_1m >= 0 and output_per_1m >= 0),
  constraint ai_model_prices_currency_len check (char_length(currency) = 3),
  constraint ai_model_prices_unique unique (tenant_id, provider, model)
);

-- ---------------------------------------------------------------- Indizes
create index if not exists ai_chat_conversations_owner_idx
  on public.ai_chat_conversations (user_id, project_id, updated_at desc);
create index if not exists ai_chat_conversations_folder_idx
  on public.ai_chat_conversations (folder_id) where folder_id is not null;
create index if not exists ai_chat_messages_conversation_idx
  on public.ai_chat_messages (conversation_id, created_at);
create index if not exists ai_chat_folders_owner_idx
  on public.ai_chat_folders (user_id, project_id);
create index if not exists ai_chat_prompt_templates_tenant_idx
  on public.ai_chat_prompt_templates (tenant_id) where is_active;
create index if not exists ai_chat_prompt_favorites_user_idx
  on public.ai_chat_prompt_favorites (user_id);

-- ---------------------------------------------------------------- moddatetime
-- Schema-qualifiziert (CLAUDE.md): die bare Form loest in Prod auf, in einer
-- SECURITY-DEFINER-Funktion mit gesetztem search_path aber nicht.
drop trigger if exists ai_chat_folders_touch on public.ai_chat_folders;
create trigger ai_chat_folders_touch before update on public.ai_chat_folders
  for each row execute function extensions.moddatetime(updated_at);
drop trigger if exists ai_chat_conversations_touch on public.ai_chat_conversations;
create trigger ai_chat_conversations_touch before update on public.ai_chat_conversations
  for each row execute function extensions.moddatetime(updated_at);
drop trigger if exists ai_chat_prompt_templates_touch on public.ai_chat_prompt_templates;
create trigger ai_chat_prompt_templates_touch before update on public.ai_chat_prompt_templates
  for each row execute function extensions.moddatetime(updated_at);
drop trigger if exists ai_model_prices_touch on public.ai_model_prices;
create trigger ai_model_prices_touch before update on public.ai_model_prices
  for each row execute function extensions.moddatetime(updated_at);

-- ---------------------------------------------------------------- RLS
alter table public.ai_chat_folders            enable row level security;
alter table public.ai_chat_conversations      enable row level security;
alter table public.ai_chat_messages           enable row level security;
alter table public.ai_chat_prompt_templates   enable row level security;
alter table public.ai_chat_prompt_favorites   enable row level security;
alter table public.ai_model_prices            enable row level security;

-- L2 — privat je Nutzer. Muster `assistant_turns_select_own` (PROJ-40), verschaerft um die
-- Mitgliedschaftspruefung: die Zeile gehoert mir UND ich bin noch Mitglied des Mandanten.
-- Ausdruecklich KEIN Admin-Zweig: Projektleitung und Mandanten-Administration sehen fremde
-- Unterhaltungen nicht (Praezedenz PROJ-144, dort pentest-belegt).
do $rls$
declare t text;
begin
  foreach t in array array['ai_chat_folders','ai_chat_conversations','ai_chat_messages'] loop
    execute format($f$
      create policy %1$s_select_own on public.%1$I for select
        using (user_id = (select auth.uid()) and public.is_tenant_member(tenant_id));
      create policy %1$s_insert_own on public.%1$I for insert
        with check (user_id = (select auth.uid()) and public.is_tenant_member(tenant_id));
      create policy %1$s_update_own on public.%1$I for update
        using (user_id = (select auth.uid()) and public.is_tenant_member(tenant_id))
        with check (user_id = (select auth.uid()) and public.is_tenant_member(tenant_id));
      create policy %1$s_delete_own on public.%1$I for delete
        using (user_id = (select auth.uid()) and public.is_tenant_member(tenant_id));
    $f$, t);
  end loop;
end $rls$;

-- Vorlagen: jedes Mitglied liest die aktiven, nur die Administration pflegt.
create policy ai_chat_prompt_templates_select_member on public.ai_chat_prompt_templates
  for select using (
    public.is_tenant_member(tenant_id)
    and (is_active or public.is_tenant_admin(tenant_id))
  );
create policy ai_chat_prompt_templates_write_admin on public.ai_chat_prompt_templates
  for all using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

-- Favoriten sind privat.
create policy ai_chat_prompt_favorites_select_own on public.ai_chat_prompt_favorites
  for select using (user_id = (select auth.uid()) and public.is_tenant_member(tenant_id));
create policy ai_chat_prompt_favorites_insert_own on public.ai_chat_prompt_favorites
  for insert with check (user_id = (select auth.uid()) and public.is_tenant_member(tenant_id));
create policy ai_chat_prompt_favorites_delete_own on public.ai_chat_prompt_favorites
  for delete using (user_id = (select auth.uid()) and public.is_tenant_member(tenant_id));

-- Preise: jedes Mitglied liest (die Kosten stehen an der eigenen Unterhaltung),
-- nur die Administration pflegt.
create policy ai_model_prices_select_member on public.ai_model_prices
  for select using (public.is_tenant_member(tenant_id));
create policy ai_model_prices_write_admin on public.ai_model_prices
  for all using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

-- ---------------------------------------------------------------- Post-Conditions
-- Fail-loud statt stiller Erfolg (PROJ-Y-122a-Lehre).
do $post$
declare
  v_tables text[] := array['ai_chat_folders','ai_chat_conversations','ai_chat_messages',
                           'ai_chat_prompt_templates','ai_chat_prompt_favorites','ai_model_prices'];
  t text; v_n int; v_rls boolean;
begin
  foreach t in array v_tables loop
    select relrowsecurity into v_rls from pg_class
      where oid = format('public.%I', t)::regclass;
    if not coalesce(v_rls,false) then
      raise exception 'PROJ-151: RLS auf % nicht aktiv', t;
    end if;
    select count(*) into v_n from pg_policy where polrelid = format('public.%I', t)::regclass;
    if v_n = 0 then
      raise exception 'PROJ-151: % hat keine Policy', t;
    end if;
  end loop;

  -- L2 muss strukturell gelten: keine der drei privaten Tabellen darf einen Admin-Zweig
  -- tragen, sonst waere "auch der Admin sieht nichts" eine leere Zusage.
  foreach t in array array['ai_chat_folders','ai_chat_conversations','ai_chat_messages'] loop
    select count(*) into v_n from pg_policy
      where polrelid = format('public.%I', t)::regclass
        and pg_get_expr(polqual, polrelid) like '%is_tenant_admin%';
    if v_n <> 0 then
      raise exception 'PROJ-151: % traegt einen Admin-Zweig — L2 verletzt', t;
    end if;
  end loop;

  -- Q3: der Verlauf haengt am Projekt und blockiert nicht.
  select count(*) into v_n from pg_constraint
    where conrelid = 'public.ai_chat_conversations'::regclass and contype = 'f'
      and confrelid = 'public.projects'::regclass and confdeltype = 'c';
  if v_n <> 1 then
    raise exception 'PROJ-151: project_id ist nicht ON DELETE CASCADE (Q3)';
  end if;

  raise notice 'PROJ-151: 6 Tabellen, RLS aktiv, L2 strukturell geprueft, Q3 CASCADE bestaetigt';
end $post$;
