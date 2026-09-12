-- Every approved account collaborates on the same collection lists.
begin;

create or replace function private.has_group(p_group text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1
    from public.users
    where id::text = private.firebase_uid()
      and is_approved
      and (p_group = 'listas' or is_admin or p_group = any(allowed_groups))
  );
$$;

-- Keep the profile value consistent with the fixed access rule so older clients
-- and the administrative screen also show collection lists as enabled.
update public.users
set allowed_groups = array(
    select distinct value
    from unnest(allowed_groups || array['listas']) value
  ),
  updated_at = now()
where not ('listas' = any(allowed_groups));

commit;
