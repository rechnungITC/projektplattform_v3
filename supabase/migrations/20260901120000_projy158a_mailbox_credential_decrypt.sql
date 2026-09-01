-- =============================================================================
-- PROJ-Y-158a: Entschlüsselung des Postfach-Geheimnisses
-- =============================================================================
-- Behebt den QA-Befund F-2 aus PROJ-158-α: die Verbindungsprüfung war in
-- Produktion strukturell unerreichbar.
--
-- URSACHE, gemessen statt vermutet: `decrypt_tenant_secret_with_key` nimmt
-- `p_secret_id uuid` und holt den Chiffretext SELBST aus `tenant_secrets`.
-- Die Anwendung rief sie mit `p_payload` — eine Signatur, die es nicht gibt
-- (live: 42883). Jede Prüfung endete mit 503.
--
-- WARUM DIE ASYMMETRIE KEIN VERSEHEN IST: `encrypt_tenant_secret` ist rein
-- (nur `pgp_sym_encrypt`), `decrypt_tenant_secret` liest die Zeile UND prüft
-- `is_tenant_admin`. Die Entschlüsselung trägt also die Berechtigungsregel der
-- Konnektoren mit. Für Postfächer wäre genau diese Regel FALSCH in beide
-- Richtungen: der Eigentümer ist oft ein einfaches Mitglied (kein Admin), und
-- die Mandanten-Administration darf ein fremdes Postfach gerade NICHT lesen
-- (AC-158.5b). Die Konnektor-Funktion wiederzuverwenden war also nie möglich.
--
-- DESHALB `SECURITY INVOKER` UND NICHT `DEFINER`:
-- Die Funktion liest `user_mailboxes` im Rechtekontext des Aufrufers — die
-- vier Policies aus PROJ-158 entscheiden. Damit gibt es KEINE zweite
-- Berechtigungsstelle; eine DEFINER-Fassung müsste `user_id = auth.uid()`
-- erneut hinschreiben und wäre eine zweite Wahrheit, die von der Policy
-- abdriften kann. Dasselbe Argument, mit dem PROJ-116/131/132 ihre
-- Auswertungen als INVOKER bauen ("Need-to-know erbt gratis").
--
-- NEBENERTRAG: der Chiffretext verlässt die Datenbank jetzt gar nicht mehr.
-- Vorher las die Route ihn nach Node, nur um ihn wieder hineinzureichen.
-- =============================================================================

create or replace function public.decrypt_user_mailbox_credential(
  p_mailbox_id uuid,
  p_key text
)
returns jsonb
language plpgsql
security invoker
stable
set search_path = public, extensions
as $function$
declare
  v_cipher bytea;
begin
  if p_key is null or length(p_key) = 0 then
    raise exception 'encryption_unavailable: p_key must be non-empty'
      using errcode = 'P0001';
  end if;

  -- SECURITY INVOKER: sieht der Aufrufer die Zeile nicht, gibt es hier keine.
  -- „nicht vorhanden" und „nicht sichtbar" sind für ihn dasselbe.
  select credential_encrypted into v_cipher
    from public.user_mailboxes
   where id = p_mailbox_id;

  if not found then
    raise exception 'not_found: user_mailboxes row %', p_mailbox_id
      using errcode = 'P0002';
  end if;

  -- Kein Geheimnis hinterlegt ist etwas anderes als „nicht lesbar": der
  -- Aufrufer soll den Nutzer zum erneuten Speichern schicken können, ohne dass
  -- das eine Falschaussage ist.
  if v_cipher is null then
    return null;
  end if;

  return pgp_sym_decrypt(v_cipher, p_key)::jsonb;
end;
$function$;

revoke all on function public.decrypt_user_mailbox_credential(uuid, text) from public;
revoke all on function public.decrypt_user_mailbox_credential(uuid, text) from anon;
grant execute on function public.decrypt_user_mailbox_credential(uuid, text) to authenticated;

comment on function public.decrypt_user_mailbox_credential(uuid, text) is
  'PROJ-Y-158a: entschluesselt das Geheimnis EINES Postfachs. SECURITY INVOKER — die RLS von user_mailboxes ist die einzige Berechtigungsstelle. Ersetzt den fehlgeschlagenen Aufruf von decrypt_tenant_secret_with_key (QA-Befund F-2 zu PROJ-158).';

-- =============================================================================
-- Post-Conditions — laut scheitern statt still danebenliegen
-- =============================================================================
do $$
declare
  v_definer boolean;
  v_path text;
  v_anon boolean;
  v_pub boolean;
  v_auth boolean;
  v_res jsonb;
begin
  select p.prosecdef, array_to_string(p.proconfig, ',')
    into v_definer, v_path
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'decrypt_user_mailbox_credential';

  -- DEFINER waere hier ein Sicherheitsrueckschritt: die Funktion umginge die
  -- Policies und muesste die Eigentuemerregel ein zweites Mal behaupten.
  if v_definer then
    raise exception 'PROJ-Y-158a: Funktion ist SECURITY DEFINER — INVOKER war die Entscheidung';
  end if;
  if v_path is null or v_path not like '%search_path%' then
    raise exception 'PROJ-Y-158a: search_path nicht gesetzt (%)', v_path;
  end if;

  select has_function_privilege('anon', 'public.decrypt_user_mailbox_credential(uuid, text)', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.decrypt_user_mailbox_credential(uuid, text)', 'EXECUTE')
    into v_anon, v_auth;
  if v_anon then
    raise exception 'PROJ-Y-158a: anon darf ausfuehren';
  end if;
  if not v_auth then
    raise exception 'PROJ-Y-158a: authenticated darf NICHT ausfuehren — die Route braucht es';
  end if;

  -- Der PUBLIC-Eintrag beginnt mit '='; ein Entzug nur von anon/authenticated
  -- laesst ihn stehen (PROJ-Y-114a-Lehre).
  select exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='decrypt_user_mailbox_credential'
       and coalesce(array_to_string(p.proacl, ','), '') ~ '(^|,)='
  ) into v_pub;
  if v_pub then
    raise exception 'PROJ-Y-158a: PUBLIC haelt noch EXECUTE';
  end if;

  -- VERHALTENSPROBE statt Textprobe: die Signatur muss GENAU so aufrufbar
  -- sein, wie die Anwendung sie ruft. Der ganze Defekt war ein Parametername.
  begin
    execute 'select public.decrypt_user_mailbox_credential(p_mailbox_id => $1, p_key => $2)'
      into v_res using '00000000-0000-4000-8000-000000000000'::uuid, 'probe';
    raise exception 'PROJ-Y-158a: unbekannte Kennung haette not_found werfen muessen';
  exception
    when sqlstate 'P0002' then
      null; -- erwartet: Zeile nicht sichtbar
    when undefined_function then
      raise exception 'PROJ-Y-158a: Signatur passt nicht zum Aufruf der Anwendung';
  end;

  raise notice 'PROJ-Y-158a: INVOKER, search_path gesetzt, anon/PUBLIC ohne EXECUTE, Signatur wie aufgerufen.';
end $$;
