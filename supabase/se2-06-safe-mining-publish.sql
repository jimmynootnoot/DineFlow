-- Existing-project repair: pg_safeupdate rejects an unqualified DELETE inside
-- the batch publisher. Replacing the function does not change current rules.
begin;
create or replace function public.publish_recommendation_batch(p_report jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare v_run uuid; v_rule uuid; r jsonb; a uuid[]; c uuid[];
begin
  perform pg_advisory_xact_lock(hashtext('dineflow:mining'));
  if p_report->>'source' not in ('simulated','historical') or (p_report->>'transaction_count')::integer < 5 or jsonb_typeof(p_report->'rules') <> 'array' then raise exception 'Invalid batch'; end if;
  if p_report->>'source' = 'simulated' and exists(select 1 from recommendation_runs where source = 'historical') then raise exception 'Simulated rules cannot replace historical mining'; end if;
  insert into recommendation_runs(source,transaction_count,rule_count,report) values(p_report->>'source',(p_report->>'transaction_count')::integer,jsonb_array_length(p_report->'rules'),p_report) returning id into v_run;
  delete from recommendation_rules where id is not null;
  for r in select value from jsonb_array_elements(p_report->'rules') loop
    a := array(select value::uuid from jsonb_array_elements_text(r->'antecedent'));
    c := array(select value::uuid from jsonb_array_elements_text(r->'consequent'));
    if cardinality(a) = 0 or cardinality(c) = 0 or a && c or (r->>'lift')::numeric <= 1 then raise exception 'Invalid rule'; end if;
    insert into recommendation_rules(antecedent_name,consequent_name,antecedent,consequent,antecedent_ids,consequent_ids,support,confidence,lift,source,run_id)
    values(array_to_string(a,' + '),array_to_string(c,' + '),array(select name from menu_items where id = any(a) order by id),array(select name from menu_items where id = any(c) order by id),a,c,(r->>'support')::numeric,(r->>'confidence')::numeric,(r->>'lift')::numeric,p_report->>'source',v_run) returning id into v_rule;
    insert into recommendation_rule_items select v_rule,unnest(a),'antecedent';
    insert into recommendation_rule_items select v_rule,unnest(c),'consequent';
  end loop;
  return v_run;
end $$;
revoke all on function public.publish_recommendation_batch(jsonb) from public,anon,authenticated;
grant execute on function public.publish_recommendation_batch(jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
