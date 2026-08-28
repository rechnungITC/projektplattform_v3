-- =============================================================================
-- PROJ-Y-151a — Projekt- und Mandanten-Konsistenz der Chat-Verweise
-- =============================================================================
-- WARUM
-- PROJ-151-alpha haengt vier Verweise aneinander, die der Fremdschluessel nur
-- auf EXISTENZ prueft, nicht auf Zugehoerigkeit:
--   ai_chat_conversations.project_id -> projects(id)
--   ai_chat_conversations.folder_id  -> ai_chat_folders(id)
--   ai_chat_folders.project_id       -> projects(id)
--   ai_chat_messages.conversation_id -> ai_chat_conversations(id)
--
-- Die QA vom 2026-08-27 hat die ersten beiden Faelle live belegt (Vektor R7):
-- ein Nutzer kann per REST-API eine Unterhaltung mit eigenem `tenant_id` und
-- FREMDEM `project_id` anlegen.
--
-- KEIN Sicherheitsbefund, und das ist gemessen: der Angreifer sieht dabei SEINE
-- Zeile, das fremde Projekt aber NICHT. Es bleiben eine unsinnige Zuordnung und
-- ein schwaches Existenz-Orakel (eine erfundene Projekt-Kennung scheitert am
-- Fremdschluessel, eine echte nicht).
--
-- DRITTER FALL, beim Bau dieser Slice gefunden und von der QA NICHT erfasst:
-- `ai_chat_messages.tenant_id` kann vom `tenant_id` seiner Unterhaltung
-- abweichen, sobald der Nutzer in beiden Mandanten Mitglied ist. Live
-- reproduziert. Wirkung ist dieselbe Klasse — unsinnige Zuordnung, kein
-- Abfluss —, aber sie verzerrt jede Auswertung, die Nachrichten nach
-- `tenant_id` gruppiert.
--
-- FORM
-- Drei Waechter statt eines gemeinsamen: die Tabellen haben verschiedene
-- Verweise, und ein gemeinsamer Rumpf muesste die Spalten ueber `to_jsonb(NEW)`
-- erraten. Bauform gespiegelt von PROJ-Y-45a.
--
-- Die UPDATE-Trigger sind auf die betroffenen Spalten eingegrenzt, damit eine
-- gewoehnliche Titelaenderung sie nicht bezahlt.

create or replace function public.enforce_chat_conversation_consistency()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_project_tenant uuid;
  v_folder_project uuid;
  v_folder_user uuid;
begin
  select p.tenant_id into v_project_tenant
    from public.projects p where p.id = new.project_id;

  if v_project_tenant is null or v_project_tenant <> new.tenant_id then
    raise exception
      'Die Unterhaltung verweist auf ein Projekt eines anderen Arbeitsbereichs.'
      using errcode = 'check_violation';
  end if;

  if new.folder_id is not null then
    select f.project_id, f.user_id into v_folder_project, v_folder_user
      from public.ai_chat_folders f where f.id = new.folder_id;

    if v_folder_project is distinct from new.project_id then
      raise exception 'Der Ordner gehoert zu einem anderen Projekt.'
        using errcode = 'check_violation';
    end if;
    -- Ordner sind privat (L2): ein fremder Ordner waere auch dann falsch, wenn
    -- er zufaellig im selben Projekt liegt.
    if v_folder_user is distinct from new.user_id then
      raise exception 'Der Ordner gehoert einer anderen Person.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end $fn$;

create or replace function public.enforce_chat_folder_consistency()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_project_tenant uuid;
begin
  select p.tenant_id into v_project_tenant
    from public.projects p where p.id = new.project_id;

  if v_project_tenant is null or v_project_tenant <> new.tenant_id then
    raise exception
      'Der Ordner verweist auf ein Projekt eines anderen Arbeitsbereichs.'
      using errcode = 'check_violation';
  end if;

  return new;
end $fn$;

create or replace function public.enforce_chat_message_consistency()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_conv_tenant uuid;
  v_conv_user uuid;
begin
  select c.tenant_id, c.user_id into v_conv_tenant, v_conv_user
    from public.ai_chat_conversations c where c.id = new.conversation_id;

  if v_conv_tenant is null then
    -- Kann nur passieren, wenn die Unterhaltung fuer den Aufrufer unsichtbar
    -- ist. Die Zuordnung waere dann ohnehin nicht pruefbar.
    raise exception 'Die Unterhaltung ist nicht auffindbar.'
      using errcode = 'check_violation';
  end if;

  if v_conv_tenant <> new.tenant_id then
    raise exception
      'Die Nachricht traegt einen anderen Arbeitsbereich als ihre Unterhaltung.'
      using errcode = 'check_violation';
  end if;

  -- L2 doppelt gesichert: eine Nachricht gehoert derselben Person wie ihre
  -- Unterhaltung. Die Zugriffsregel prueft beide Seiten getrennt, aber nicht
  -- ihre Uebereinstimmung.
  if v_conv_user <> new.user_id then
    raise exception 'Die Nachricht gehoert einer anderen Person als die Unterhaltung.'
      using errcode = 'check_violation';
  end if;

  return new;
end $fn$;

revoke execute on function public.enforce_chat_conversation_consistency() from public, anon, authenticated;
revoke execute on function public.enforce_chat_folder_consistency()       from public, anon, authenticated;
revoke execute on function public.enforce_chat_message_consistency()      from public, anon, authenticated;

drop trigger if exists ai_chat_conversations_consistency on public.ai_chat_conversations;
create trigger ai_chat_conversations_consistency
  before insert or update of tenant_id, project_id, folder_id, user_id
  on public.ai_chat_conversations
  for each row execute function public.enforce_chat_conversation_consistency();

drop trigger if exists ai_chat_folders_consistency on public.ai_chat_folders;
create trigger ai_chat_folders_consistency
  before insert or update of tenant_id, project_id
  on public.ai_chat_folders
  for each row execute function public.enforce_chat_folder_consistency();

drop trigger if exists ai_chat_messages_consistency on public.ai_chat_messages;
create trigger ai_chat_messages_consistency
  before insert or update of tenant_id, conversation_id, user_id
  on public.ai_chat_messages
  for each row execute function public.enforce_chat_message_consistency();

do $post$
declare v_n int;
begin
  select count(*) into v_n from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
   where not tg.tgisinternal and tg.tgname in (
     'ai_chat_conversations_consistency','ai_chat_folders_consistency','ai_chat_messages_consistency');
  if v_n <> 3 then
    raise exception 'PROJ-Y-151a: % von 3 Triggern angelegt', v_n;
  end if;

  -- INVOKER ist tragend: unter DEFINER liefe die Pruefung mit den Rechten des
  -- Eigentuemers und saehe Projekte, die der Aufrufer nicht sehen darf — der
  -- Waechter wuerde dann fremde Zuordnungen DURCHLASSEN statt sie zu fangen.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.prosecdef
     and p.proname in ('enforce_chat_conversation_consistency','enforce_chat_folder_consistency','enforce_chat_message_consistency');
  if v_n <> 0 then
    raise exception 'PROJ-Y-151a: % Waechter sind SECURITY DEFINER — muessen INVOKER sein', v_n;
  end if;

  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname in ('enforce_chat_conversation_consistency','enforce_chat_folder_consistency','enforce_chat_message_consistency')
     and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if v_n <> 0 then
    raise exception 'PROJ-Y-151a: % Waechter sind noch aufrufbar', v_n;
  end if;

  raise notice 'PROJ-Y-151a: 3 Waechter, INVOKER, nicht aufrufbar';
end $post$;
