-- PROJ-Y-130n — Fix-forward: EXECUTE auf den Fingerabdruck-Funktionen entziehen.
--
-- Gefunden vom eigenen Live-Pentest (Vektor I). Betroffen waren ZWEI Funktionen:
--   * `_read_log_entry_fingerprint` (PROJ-Y-130n, dieselbe Migration)
--   * `_audit_entry_fingerprint`    (PROJ-130-ε) — dort war der Revoke ebenfalls
--     vergessen, und ε's Pentest-Vektor zählte die Funktion nicht mit auf.
--
-- Einordnung, ohne es größer oder kleiner zu machen als es ist: beide sind
-- `immutable` und rechnen ausschließlich über übergebene Argumente — sie lesen
-- keine Tabelle. Ein anonymer Aufrufer könnte also nur den Prüfwert von Werten
-- bilden, die er schon kennt: kein Informationsgewinn, kein Schreibpfad. Verletzt
-- ist die Hausnorm (interne Helfer sind für Anwendungsrollen nicht aufrufbar) und
-- die Konsistenz zu den übrigen Helfern, die den Revoke haben.
--
-- Die Post-Condition zählt jetzt ALLE Helfer der Ketten-Mechanik auf, damit
-- dieselbe Lücke nicht ein drittes Mal entsteht.
revoke all on function public._audit_entry_fingerprint(
  uuid, uuid, text, uuid, text, jsonb, jsonb, uuid, timestamptz, text, uuid
) from public, anon, authenticated;

revoke all on function public._read_log_entry_fingerprint(
  uuid, uuid, uuid, text, uuid, public.ma_confidentiality_level, integer, text, text, uuid, jsonb, timestamptz
) from public, anon, authenticated;

do $do$
declare
  v_offen text;
begin
  select string_agg(distinct routine_name || ' (' || grantee || ')', ', ')
    into v_offen
    from information_schema.role_routine_grants
   where routine_schema = 'public'
     and grantee in ('anon', 'authenticated', 'PUBLIC')
     and routine_name in (
       '_audit_entry_fingerprint',
       '_read_log_entry_fingerprint',
       '_audit_chain_digest',
       '_audit_window_digest',
       '_guard_audit_chain_immutable',
       '_guard_confidential_read_log_immutable',
       'seal_audit_chain'
     );
  if v_offen is not null then
    raise exception 'PROJ-Y-130n: Ketten-Helfer für Anwendungsrollen aufrufbar: %', v_offen;
  end if;

  -- `verify_audit_chain` ist ABSICHTLICH für `authenticated` aufrufbar: das Gate
  -- (Admin oder Revisions-Freigabe) sitzt in der Funktion, nicht im Grant.
  if not exists (
    select 1 from information_schema.role_routine_grants
    where routine_schema='public' and routine_name='verify_audit_chain' and grantee='authenticated'
  ) then
    raise exception 'PROJ-Y-130n: verify_audit_chain ist für authenticated nicht mehr aufrufbar — die Prüfung wäre unbedienbar';
  end if;

  raise notice 'PROJ-Y-130n: Helfer-Grants bereinigt';
end $do$;
