-- PROJ-120 — QA-Fix (Finding F-1, Low): Existenz-Orakel im Sichtbarkeits-Helfer.
--
-- BEFUND (Red-Team-Fall S): `_ma_valuation_link_target_visible` delegierte
-- ausschließlich an `can_access_classified`. Dieses gibt für die Stufe
-- 'standard' bedingungslos `true` zurück — bewusst so, weil Need-to-know nur
-- ADDITIV über der normalen Mitglieds-RLS der jeweiligen Tabelle liegt.
-- Der Helfer ist aber (notwendigerweise) an `authenticated` ge-granted, weil
-- die RLS-Policy von ma_valuation_links ihn im Aufrufer-Kontext aufruft — und
-- damit auch direkt als RPC aufrufbar. Ergebnis: ein Nutzer eines FREMDEN
-- Tenants bekam für ein `standard`-Finding `true` zurück und konnte so die
-- Existenz einer ihm unbekannten dd_findings-UUID bestätigen.
--
-- BEWERTUNG: Low. Es floss kein Inhalt ab (nur ein Boolean), ein gültiges
-- v4-UUID musste bereits bekannt sein, und das eigentliche Link-Gate war NICHT
-- geschwächt — die SELECT-Policy von ma_valuation_links UND-verknüpft diesen
-- Helfer mit der Bewertungs-Seite (is_project_member + can_access_classified),
-- weshalb der Cross-Tenant-Fall im Pentest (Fall K) weiterhin 0 Zeilen lieferte.
--
-- FIX: Mitgliedschaft explizit im Helfer prüfen, damit er kein Orakel mehr ist.
-- Das kann das Link-Gate nicht brechen: `set_ma_valuation_link` erzwingt bereits,
-- dass Ziel und Bewertung im selben Projekt liegen, und die Bewertungs-Seite der
-- Policy verlangt ohnehin Mitgliedschaft in genau diesem Projekt.
create or replace function public._ma_valuation_link_target_visible(
  p_kind text,
  p_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_project uuid;
  v_level public.ma_confidentiality_level;
begin
  case p_kind
    when 'dd_finding' then
      select f.project_id, f.confidentiality_level into v_project, v_level
        from public.dd_findings f where f.id = p_id;
    -- PROJ-126-Kontrakt: 'synergy_hypothesis'-Zweig hier ergänzen.
    else
      return false;
  end case;
  if v_project is null then return false; end if;
  -- Kein Existenz-Orakel: wer nicht im Projekt ist, erfährt nichts (fail-closed).
  if not public.is_project_member(v_project) then return false; end if;
  return public.can_access_classified(v_project, v_level);
end;
$$;
revoke execute on function public._ma_valuation_link_target_visible(text, uuid) from public, anon;
grant execute on function public._ma_valuation_link_target_visible(text, uuid) to authenticated;
