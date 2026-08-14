-- PROJ-Y-45a — Live-Smoke: die additiven Bau-Verweise erzwingen Projekt-Konsistenz.
--
-- Schliesst den QA-Befund F-2 aus PROJ-45-alpha (Vektor R4): der Fremdschluessel
-- sichert nur die Existenz der Zielzeile, nicht die Projektzugehoerigkeit.
--
-- Der Block endet mit RAISE -> alles rollt zurueck, die Fehlermeldung IST der
-- Bericht. 0 Rueckstaende by construction.
--
-- Der Wert liegt so sehr in den N-Vektoren wie in den R-Vektoren: ein Waechter
-- auf work_items faellt jedem Projekt zur Last, auch jedem Nicht-Bauprojekt.
-- N1/N3/N4 belegen, dass der Normalpfad unbeschaedigt ist.
--
-- Ergebnis 2026-08-14 (prod): 9/9 PASS, 0 Rueckstaende.
--   N1  Anlage ohne Bau-Verweise            -> PASS
--   N2  Zuordnung im eigenen Projekt        -> PASS
--   R4  UPDATE auf fremdes Gewerk           -> PASS (23514)
--   R4b UPDATE auf fremden Abschnitt        -> PASS (23514)
--   R4c INSERT mit fremdem Gewerk           -> PASS (23514)
--   R5a Risiko, eigenes Projekt             -> PASS
--   R5b Risiko, fremdes Gewerk              -> PASS (23514)
--   N3  gewoehnliche Bearbeitung            -> PASS
--   N4  Verweise wieder entfernen           -> PASS

do $s$
declare
  v_t uuid := 'e2e00000-0000-4e2e-8e2e-000000000002';
  v_p1 uuid; v_p2 uuid; v_admin uuid;
  v_trade uuid; v_pt1 uuid; v_sec1 uuid;
  v_wi1 uuid; v_wi2 uuid; v_risk1 uuid; v_risk2 uuid;
  v_r text := '';
begin
  select id into v_p1 from public.projects where tenant_id=v_t and is_deleted=false order by created_at limit 1;
  select id into v_p2 from public.projects where tenant_id=v_t and is_deleted=false and id<>v_p1 order by created_at limit 1;
  select user_id into v_admin from public.tenant_memberships where tenant_id=v_t and role='admin' limit 1;

  insert into public.construction_trades (tenant_id,key,label) values (v_t,'y45a','Y45a') returning id into v_trade;
  insert into public.project_construction_trades (tenant_id,project_id,trade_id)
    values (v_t,v_p1,v_trade) returning id into v_pt1;
  insert into public.construction_sections (tenant_id,project_id,label)
    values (v_t,v_p1,'Y45a Sec') returning id into v_sec1;

  begin
    insert into public.work_items (tenant_id,project_id,kind,title,created_by)
      values (v_t,v_p2,'task','Y45a plain',v_admin) returning id into v_wi2;
    v_r := v_r || 'N1_plain_insert=PASS; ';
  exception when others then v_r := v_r || 'N1_plain_insert=FAIL(' || SQLSTATE || '); ';
  end;

  begin
    insert into public.work_items (tenant_id,project_id,kind,title,created_by,trade_id,section_id)
      values (v_t,v_p1,'task','Y45a correct',v_admin,v_pt1,v_sec1) returning id into v_wi1;
    v_r := v_r || 'N2_same_project=PASS; ';
  exception when others then v_r := v_r || 'N2_same_project=FAIL(' || SQLSTATE || '); ';
  end;

  begin
    update public.work_items set trade_id = v_pt1 where id = v_wi2;
    v_r := v_r || 'R4_update_foreign_trade=FAIL(accepted); ';
  exception when others then v_r := v_r || 'R4_update_foreign_trade=PASS(' || SQLSTATE || '); ';
  end;

  begin
    update public.work_items set section_id = v_sec1 where id = v_wi2;
    v_r := v_r || 'R4b_update_foreign_section=FAIL(accepted); ';
  exception when others then v_r := v_r || 'R4b_update_foreign_section=PASS(' || SQLSTATE || '); ';
  end;

  begin
    insert into public.work_items (tenant_id,project_id,kind,title,created_by,trade_id)
      values (v_t,v_p2,'task','Y45a smuggled',v_admin,v_pt1);
    v_r := v_r || 'R4c_insert_foreign=FAIL(accepted); ';
  exception when others then v_r := v_r || 'R4c_insert_foreign=PASS(' || SQLSTATE || '); ';
  end;

  insert into public.risks (tenant_id,project_id,title,probability,impact,created_by)
    values (v_t,v_p1,'Y45a risk ok',3,3,v_admin) returning id into v_risk1;
  insert into public.risks (tenant_id,project_id,title,probability,impact,created_by)
    values (v_t,v_p2,'Y45a risk other',3,3,v_admin) returning id into v_risk2;
  begin
    update public.risks set trade_id = v_pt1 where id = v_risk1;
    v_r := v_r || 'R5a_risk_same_project=PASS; ';
  exception when others then v_r := v_r || 'R5a_risk_same_project=FAIL(' || SQLSTATE || '); ';
  end;
  begin
    update public.risks set trade_id = v_pt1 where id = v_risk2;
    v_r := v_r || 'R5b_risk_foreign=FAIL(accepted); ';
  exception when others then v_r := v_r || 'R5b_risk_foreign=PASS(' || SQLSTATE || '); ';
  end;

  begin
    update public.work_items set title = 'Y45a renamed' where id = v_wi1;
    v_r := v_r || 'N3_ordinary_edit=PASS; ';
  exception when others then v_r := v_r || 'N3_ordinary_edit=FAIL(' || SQLSTATE || '); ';
  end;

  begin
    update public.work_items set trade_id = null, section_id = null where id = v_wi1;
    v_r := v_r || 'N4_clear_refs=PASS; ';
  exception when others then v_r := v_r || 'N4_clear_refs=FAIL(' || SQLSTATE || '); ';
  end;

  raise exception 'Y45A_ROLLBACK :: %', v_r;
end
$s$;
