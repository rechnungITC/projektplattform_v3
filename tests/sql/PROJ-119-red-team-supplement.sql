-- =============================================================================
-- PROJ-119 — Red-Team-Supplement zum QA-Lauf 2026-08-11
--
-- Ergänzt `PROJ-119-confidential-distribution-pentest.sql` (A–N). Jene Datei
-- bleibt unangetastet, damit ihr Ergebnis „A–N 14/14" byte-stabil zitierbar
-- bleibt; hier stehen ausschließlich die Vektoren, die dort NICHT vorkamen.
--
-- Wie A–N: eine Transaktion, die am Ende raist → 0 Rückstände.
--
-- Ergebnis 2026-08-11 gegen Produktion:
--   O PASS · P PASS · Q PASS · S INFO (SENT) · T INFO (BLOCKED 42501)
--
-- Vektoren:
--   O  Der wichtigste. Ein Tenant-Admin AUSSERHALB des Kreises versucht, sich
--      per add_communication_inner_circle_member selbst hinzuzufügen — ein
--      stiller Weg hinein, der die gesamte Break-Glass-Garantie aushebeln
--      würde ("ein Administrator kommt an den Inhalt, aber nur laut und
--      nachweisbar"). A–N prüfte nur, dass die Auflösung protokolliert wird,
--      nicht dass es keinen leisen Nebeneingang gibt.
--   P  Fremder Mandant schreibt Zeilen in das Zugriffsprotokoll eines Eintrags,
--      den er nicht sehen darf (Audit-Verfälschung / Protokoll-Flutung).
--      A–N prüfte Append-only für den eigenen Mandanten, nicht Fremdzugriff.
--   Q  Cross-Tenant-Inhaltsabruf über die SECURITY-DEFINER-RPC
--      read_communication_content. A–N prüfte Cross-Tenant nur per SELECT.
--   S  Embargo-Grenzfall: Zeitpunkt exakt now(). A–N prüfte nur +2 Tage
--      (blockt) und -1 Minute (gibt frei). INFO, kein Pass/Fail.
--   T  Darf ein gewöhnliches Kreis-Mitglied (Rolle `editor`) den Kreis auf
--      einen Außenstehenden erweitern? INFO, dokumentiert das Ist-Verhalten.
--
-- Prod-Seed-Form: siehe reference_prod_seed_shape.md. Alle Identitäten werden
-- innerhalb der Transaktion erzeugt.
-- =============================================================================
do $pen$
declare
  v_orig text := current_user;
  t1 uuid:='c119a000-0000-0000-0000-000000000001'; t2 uuid:='c119a000-0000-0000-0000-000000000002';
  adm  uuid:='c119a000-0000-0000-0000-0000000000a0';  -- Tenant-Admin, legt den Kreis an
  adm2 uuid:='c119a000-0000-0000-0000-0000000000a1';  -- Tenant-Admin AUSSERHALB des Kreises
  mem  uuid:='c119a000-0000-0000-0000-0000000000b0';  -- Mitglied im Kreis
  outs uuid:='c119a000-0000-0000-0000-0000000000b1';  -- strict-freigegeben, außerhalb
  apr  uuid:='c119a000-0000-0000-0000-0000000000c1';  -- Genehmiger
  ext  uuid:='c119a000-0000-0000-0000-0000000000d0';  -- fremder Mandant
  p1 uuid:='c119c000-0000-0000-0000-000000000001';
  e  public.communication_matrix_entries;
  e2 public.communication_matrix_entries;
  r text:=E'\n'; n int; m int; v text; v2 text; v3 text;
begin
  insert into auth.users(id) values (adm),(adm2),(mem),(outs),(apr),(ext);
  insert into public.profiles(id,email,display_name) values
    (adm,'sa@p.local','A'),(adm2,'sa2@p.local','A2'),(mem,'sm@p.local','M'),
    (outs,'so@p.local','O'),(apr,'sr@p.local','R'),(ext,'se@p.local','E');
  insert into public.tenants(id,name) values (t1,'P119S-T1'),(t2,'P119S-T2');
  insert into public.tenant_memberships(tenant_id,user_id,role) values
    (t1,adm,'admin'),(t1,adm2,'admin'),(t1,mem,'member'),(t1,outs,'member'),(t1,apr,'member'),(t2,ext,'admin');
  insert into public.projects(id,tenant_id,name,project_type,lifecycle_status,responsible_user_id,created_by)
    values (p1,t1,'P119S Deal','ma','active',adm,adm);
  insert into public.project_memberships(project_id,user_id,role,created_by) values
    (p1,adm,'lead',adm),(p1,adm2,'editor',adm),(p1,mem,'editor',adm),(p1,outs,'editor',adm),(p1,apr,'editor',adm);
  -- adm2 bekommt bewusst eine VOLLE strict-Freigabe: der Kreis muss auch die
  -- überstimmen, sonst wäre O kein echter Test.
  insert into public.ma_confidentiality_clearances(tenant_id,project_id,user_id,max_level,granted_by)
    values (t1,p1,outs,'strict',adm),(t1,p1,mem,'strict',adm),(t1,p1,adm2,'strict',adm);

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  e := public.create_communication_entry(
    p_project_id=>p1, p_target_group_key=>'mitarbeiter', p_message=>'Supplement-Geheimnis',
    p_confidentiality_level=>'confidential', p_responsible_user_id=>mem, p_approver_user_id=>apr);
  e := public.set_communication_inner_circle(e.id, true);

  -- ------------------------------------------------------------------ O -----
  perform set_config('request.jwt.claims', json_build_object('sub',adm2,'role','authenticated')::text, true);
  begin perform public.add_communication_inner_circle_member(e.id, adm2); v:='ALLOWED';
  exception when others then v:='BLOCKED '||sqlstate; end;
  perform set_config('role', v_orig, true);
  select count(*) into n from public.communication_entry_inner_circle where entry_id=e.id and user_id=adm2;
  select count(*) into m from public.communication_access_log where entry_id=e.id;
  perform set_config('role','authenticated',true);
  r := r||'O '||(case when v like 'BLOCKED%' and n=0 then 'PASS'
                 when n=1 and m=0 then 'FAIL(STILLER SELBST-EINTRITT, keine Protokollzeile)'
                 else 'FAIL('||v||',member='||n||',log='||m||')' end)
       ||' Admin ausserhalb kann sich nicht still selbst hinzufuegen (Break-Glass bleibt einziger Weg)'||E'\n';

  -- ------------------------------------------------------------------ P -----
  perform set_config('request.jwt.claims', json_build_object('sub',ext,'role','authenticated')::text, true);
  begin perform public.log_communication_access(e.id,'view_content','granted'); v2:='ALLOWED';
  exception when others then v2:='BLOCKED '||sqlstate; end;
  perform set_config('role', v_orig, true);
  select count(*) into n from public.communication_access_log where entry_id=e.id and user_id=ext;
  perform set_config('role','authenticated',true);
  r := r||'P '||(case when n=0 then 'PASS' else 'FAIL(gefaelschte Zeilen='||n||', call='||v2||')' end)
       ||' fremder Mandant kann das Zugriffsprotokoll nicht verfaelschen'||E'\n';

  -- ------------------------------------------------------------------ Q -----
  perform set_config('request.jwt.claims', json_build_object('sub',ext,'role','authenticated')::text, true);
  begin select c.message into v3 from public.read_communication_content(e.id) c;
  exception when others then v3:='<err '||sqlstate||'>'; end;
  r := r||'Q '||(case when v3 is null or v3 like '<err%' then 'PASS' else 'FAIL(geleakt='||v3||')' end)
       ||' Cross-Tenant-Inhaltsabruf verweigert'||E'\n';

  -- ------------------------------------------------------------------ S -----
  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  e2 := public.create_communication_entry(
    p_project_id=>p1, p_target_group_key=>'presse', p_message=>'Boundary',
    p_responsible_user_id=>mem, p_approver_user_id=>apr);
  e2 := public.submit_communication_entry(e2.id);
  perform set_config('request.jwt.claims', json_build_object('sub',apr,'role','authenticated')::text, true);
  e2 := public.respond_communication_approval(e2.id, true, null);
  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  e2 := public.set_communication_embargo(e2.id, now());
  begin e2 := public.mark_communication_sent(e2.id); v:='SENT';
  exception when others then v:='BLOCKED '||sqlstate; end;
  r := r||'S INFO Embargo == now() -> '||v||' (inklusive Grenze)'||E'\n';

  -- ------------------------------------------------------------------ T -----
  perform set_config('request.jwt.claims', json_build_object('sub',mem,'role','authenticated')::text, true);
  begin perform public.add_communication_inner_circle_member(e.id, outs); v:='ALLOWED';
  exception when others then v:='BLOCKED '||sqlstate; end;
  r := r||'T INFO Kreis-Mitglied (editor) erweitert den Kreis -> '||v||E'\n';

  raise exception 'P119_SUPPLEMENT_ROLLBACK %', r;
end
$pen$;
