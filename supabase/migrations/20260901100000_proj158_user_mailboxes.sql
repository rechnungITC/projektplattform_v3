-- =============================================================================
-- PROJ-158-α: Postfach-Anbindung — nutzereigene Postfächer
-- =============================================================================
-- Ein Postfach gehört einer PERSON, nicht dem Mandanten (Tech Design Q2, am
-- 2026-09-01 vom Nutzer korrigiert). Sichtbarkeit ist daher durchgängig
-- eigentümergebunden — dasselbe Muster wie assistant_work_item_drafts
-- (PROJ-144) und chat_conversations (PROJ-151): auch die Mandanten-
-- Administration sieht kein fremdes Postfach.
--
-- BEWUSST NICHT in dieser Migration:
--
--   * Kein Eintrag in die geteilten Audit-Register (entity_type-CHECK,
--     _tracked_audit_columns, can_read_audit_entry). Grund gemessen, nicht
--     vermutet: can_read_audit_entry beginnt mit einem Kurzschluss fuer
--     is_tenant_admin und loest danach zu jedem Eintrag ein PROJEKT auf. Ein
--     Postfach hat kein Projekt, und der Kurzschluss haette Name, Host und
--     Benutzername jedes privaten Postfachs fuer die Administration lesbar
--     gemacht — genau das, was AC-158.5b verbietet. Ein privates Objekt in
--     einen geteilten, administrations-lesbaren Trail zu schreiben, hebt seine
--     Privatheit auf. Praezedenz: PROJ-144 (nutzerprivate Daten ohne
--     Feld-Audit). Siehe korrigiertes AC-158.16.
--
--   * Keine Schreib-RPCs. Die Regel lautet schlicht „nur die eigenen Zeilen";
--     dafuer sind Policies das richtige Mittel. SECURITY-DEFINER-Funktionen
--     nutzt das Haus fuer zusammengesetzte Rollenregeln (PROJ-45-beta), nicht
--     fuer Eigentuemerschaft — vgl. PROJ-144, das aus demselben Grund mit
--     Policies auskommt.
--
-- VORBEREITET FUER BETA (OAuth), ohne dass beta die Ablage umbaut: der
-- provider-CHECK kennt bereits alle drei Werte, die OAuth-Spalten sind
-- angelegt und nullable. Alpha weist 'microsoft365' und 'gmail' in der
-- Anwendungsschicht ab; beta entfernt nur diese Abweisung.
-- =============================================================================

create table if not exists public.user_mailboxes (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  -- auth.users, nicht profiles: dem naeheren Vorbild folgend — die
  -- nutzerprivaten Assistant-Tabellen (PROJ-144) verweisen ebenso dorthin.
  -- Das Haus ist an dieser Stelle uneinheitlich (audit_reader_grants zeigt
  -- auf profiles); gewaehlt ist die Tabelle gleicher Gestalt.
  user_id           uuid not null references auth.users(id) on delete cascade,

  label             text not null,
  provider          text not null
                      check (provider in ('imap', 'microsoft365', 'gmail')),

  -- Nur fuer provider='imap' belegt; bei OAuth liefert der Anbieter die Werte.
  imap_host         text,
  imap_port         integer check (imap_port is null or (imap_port between 1 and 65535)),
  imap_security     text check (imap_security is null or imap_security in ('tls', 'starttls')),
  imap_username     text,

  -- Passwort (alpha) bzw. Token (beta) — verschluesselt ueber dieselben
  -- Funktionen wie die Konnektor-Geheimnisse (korrigiertes AC-158.4).
  -- Die Anwendung gibt diese Spalte NIE zurueck.
  credential_encrypted bytea,

  -- Ergebnis der letzten ausdruecklichen Verbindungspruefung. Bewusst ein
  -- gespeichertes Ergebnis und keine Live-Aussage (Tech Design Q3) — deshalb
  -- traegt die Flaeche den Zeitpunkt mit.
  status            text not null default 'unchecked'
                      check (status in ('unchecked','connected','auth_failed',
                                        'unreachable','mailbox_disabled',
                                        'consent_required','error')),
  last_checked_at   timestamptz,
  last_error_code   text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Ein Nutzer vergibt jeden Namen nur einmal; sonst ist spaeter nicht
  -- erkennbar, aus welchem Postfach eine Mail stammt (AC-158.6).
  constraint user_mailboxes_label_unique unique (user_id, label),

  -- Vollstaendigkeit je Anbieterart: ein IMAP-Postfach ohne Host waere ein
  -- Eintrag, den niemand pruefen kann.
  constraint user_mailboxes_imap_complete check (
    provider <> 'imap'
    or (imap_host is not null and imap_port is not null
        and imap_security is not null and imap_username is not null)
  )
);

-- Dasselbe Postfach zweimal anzubinden erzeugt spaeter doppelte Mails im
-- Posteingang (Edge Case der Spec). Partiell, weil die Kennung erst mit beta
-- auch fuer OAuth-Postfaecher bekannt ist.
create unique index if not exists user_mailboxes_identity_unique
  on public.user_mailboxes (user_id, provider, lower(imap_host), lower(imap_username))
  where provider = 'imap';

create index if not exists user_mailboxes_owner_idx
  on public.user_mailboxes (user_id, tenant_id);

comment on table public.user_mailboxes is
  'PROJ-158: nutzereigene Postfach-Anbindungen. Eigentuemergebunden sichtbar, auch vor der Mandanten-Administration (AC-158.5b). credential_encrypted verlaesst die Anwendung nie.';
comment on column public.user_mailboxes.status is
  'PROJ-158: Ergebnis der letzten ausdruecklichen Pruefung, keine Live-Aussage — daher immer zusammen mit last_checked_at anzeigen.';

-- --- Eigentuemergebundene Sichtbarkeit ---------------------------------------
-- Vier Policies, alle mit derselben Bedingung. Die Mitgliedschaftspruefung
-- steht zusaetzlich zur Eigentuemerschaft, damit eine Zeile nach dem Entfernen
-- eines Nutzers aus dem Mandanten nicht weiterlebt.

alter table public.user_mailboxes enable row level security;

drop policy if exists user_mailboxes_select_own on public.user_mailboxes;
create policy user_mailboxes_select_own on public.user_mailboxes
  for select using (
    user_id = (select auth.uid()) and public.is_tenant_member(tenant_id)
  );

drop policy if exists user_mailboxes_insert_own on public.user_mailboxes;
create policy user_mailboxes_insert_own on public.user_mailboxes
  for insert with check (
    user_id = (select auth.uid()) and public.is_tenant_member(tenant_id)
  );

drop policy if exists user_mailboxes_update_own on public.user_mailboxes;
create policy user_mailboxes_update_own on public.user_mailboxes
  for update using (
    user_id = (select auth.uid()) and public.is_tenant_member(tenant_id)
  ) with check (
    user_id = (select auth.uid()) and public.is_tenant_member(tenant_id)
  );

drop policy if exists user_mailboxes_delete_own on public.user_mailboxes;
create policy user_mailboxes_delete_own on public.user_mailboxes
  for delete using (
    user_id = (select auth.uid()) and public.is_tenant_member(tenant_id)
  );

drop trigger if exists user_mailboxes_touch_updated_at on public.user_mailboxes;
create trigger user_mailboxes_touch_updated_at
  before update on public.user_mailboxes
  for each row execute function extensions.moddatetime(updated_at);

-- =============================================================================
-- Post-Conditions — laut scheitern statt still danebenliegen
-- =============================================================================
do $$
declare
  v_policies int;
  v_admin_leak int;
  v_rls boolean;
begin
  select count(*) into v_policies
    from pg_policies where schemaname='public' and tablename='user_mailboxes';
  if v_policies <> 4 then
    raise exception 'PROJ-158: erwartet 4 Policies, gefunden %', v_policies;
  end if;

  -- Die tragende Zusicherung: KEINE Policy dieser Tabelle darf einen
  -- Administrations-Zweig tragen. AC-158.5b haengt daran, und ein spaeter
  -- eingefuegter is_tenant_admin-Zweig waere von aussen nicht zu bemerken.
  select count(*) into v_admin_leak
    from pg_policies
   where schemaname='public' and tablename='user_mailboxes'
     and (coalesce(qual,'') || coalesce(with_check,'')) like '%is_tenant_admin%';
  if v_admin_leak <> 0 then
    raise exception 'PROJ-158: % Policy(s) tragen einen Admin-Zweig — AC-158.5b verletzt', v_admin_leak;
  end if;

  select relrowsecurity into v_rls
    from pg_class where oid = 'public.user_mailboxes'::regclass;
  if not v_rls then
    raise exception 'PROJ-158: RLS ist nicht aktiv';
  end if;

  -- Die Slice fasst die geteilten Audit-Register bewusst nicht an. Wenn hier
  -- doch ein Zweig auftaucht, ist etwas anderes passiert als beabsichtigt.
  if exists (
    select 1 from pg_constraint
     where conname = 'audit_log_entity_type_check'
       and pg_get_constraintdef(oid) like '%user_mailboxes%'
  ) then
    raise exception 'PROJ-158: user_mailboxes steht im Audit-CHECK — siehe AC-158.16';
  end if;

  raise notice 'PROJ-158: 4 Policies, 0 Admin-Zweige, RLS aktiv, Audit-Register unberuehrt.';
end $$;
