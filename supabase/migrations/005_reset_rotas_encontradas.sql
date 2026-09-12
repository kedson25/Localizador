-- Reset the legacy stored route counter. Admin derives current values from list items.
begin;

update public.coleta_listas
set data = data || jsonb_build_object('rotasEncontradas', 0),
    updated_at = now();

commit;
