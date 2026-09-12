-- Replace Firebase identity with native Supabase Auth.
begin;

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (length(trim(username)) between 3 and 80 and username !~ '@'),
  email text not null,
  is_admin boolean not null default false,
  is_approved boolean not null default true,
  allowed_groups text[] not null default array['consulta','remover','reporte','listas','upload'],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index users_username_unique on public.users (lower(username));
create unique index users_email_unique on public.users (lower(email));

create function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_username text;
begin
  v_username := left(trim(coalesce(new.raw_user_meta_data->>'username', '')), 80);
  if length(v_username) < 3 or v_username ~ '@' then
    v_username := left(coalesce(nullif(split_part(new.email, '@', 1), ''), 'user'), 70)
      || '_' || left(new.id::text, 8);
  end if;

  begin
    insert into public.users(id, username, email)
    values (new.id, v_username, coalesce(new.email, ''));
  exception when unique_violation then
    insert into public.users(id, username, email)
    values (new.id, left(v_username, 70) || '_' || left(new.id::text, 8), coalesce(new.email, ''));
  end;
  return new;
end;
$$;

create trigger create_public_user
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Covers accounts that may already exist in Supabase Auth before this migration.
insert into public.users(id, username, email)
select u.id,
  left(case
    when length(trim(coalesce(u.raw_user_meta_data->>'username', ''))) between 3 and 70
      and trim(u.raw_user_meta_data->>'username') !~ '@'
      then trim(u.raw_user_meta_data->>'username')
    else coalesce(nullif(split_part(u.email, '@', 1), ''), 'user')
  end, 70) || '_' || left(u.id::text, 8),
  coalesce(u.email, '')
from auth.users u
on conflict (id) do nothing;

-- Existing operational RPCs keep their actor column names for data compatibility,
-- but the value now comes from the verified Supabase Auth JWT subject.
create or replace function private.firebase_uid() returns text
language sql stable set search_path = '' as $$
  select nullif(auth.jwt()->>'sub', '');
$$;
create or replace function private.is_approved() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.users
    where id::text = private.firebase_uid() and is_approved);
$$;
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.users
    where id::text = private.firebase_uid() and is_approved and is_admin);
$$;
create or replace function private.has_group(p_group text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.users where id::text = private.firebase_uid()
    and is_approved and (is_admin or p_group = any(allowed_groups)));
$$;
create or replace function private.actor_name() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select username from public.users where id::text = private.firebase_uid()),
    nullif(auth.jwt()->'user_metadata'->>'username', ''),
    nullif(auth.jwt()->>'email', ''), '');
$$;

alter table public.users enable row level security;
create policy users_read on public.users for select to authenticated
  using (id::text = (select private.firebase_uid()) or (select private.is_admin()));

revoke all on public.users from anon, authenticated;
grant select on public.users to authenticated;
grant all on public.users to service_role;

-- Only an approved administrator can change access flags. Browser clients never
-- receive direct UPDATE permission for the users table.
create function public.update_user_permissions(
  p_user_id uuid,
  p_is_admin boolean default null,
  p_is_approved boolean default null,
  p_allowed_groups text[] default null
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_updated integer;
  v_group text;
begin
  if not private.is_admin() then
    raise exception 'Apenas administradores podem alterar permissões.' using errcode = '42501';
  end if;
  if p_user_id::text = private.firebase_uid()
    and (p_is_admin is false or p_is_approved is false) then
    raise exception 'Outro administrador deve remover seu acesso.' using errcode = '42501';
  end if;
  if p_allowed_groups is not null then
    foreach v_group in array p_allowed_groups loop
      if v_group not in ('consulta','remover','reporte','listas','upload') then
        raise exception 'Grupo de permissão inválido.' using errcode = '22023';
      end if;
    end loop;
  end if;

  update public.users set
    is_admin = coalesce(p_is_admin, is_admin),
    is_approved = coalesce(p_is_approved, is_approved),
    allowed_groups = case when p_allowed_groups is null then allowed_groups
      else array(select distinct unnest(p_allowed_groups)) end,
    updated_at = now()
  where id = p_user_id;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;
  return true;
end;
$$;

create function public.list_visible_users()
returns table(id uuid, username text, email text, is_admin boolean,
  is_approved boolean, allowed_groups text[])
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_access('listas');
  if private.is_admin() then
    return query select u.id, u.username, u.email, u.is_admin,
      u.is_approved, u.allowed_groups from public.users u order by lower(u.username);
    return;
  end if;
  return query select u.id, u.username, ''::text, false, true, '{}'::text[]
    from public.users u where u.is_approved order by lower(u.username);
end;
$$;

revoke all on function public.update_user_permissions(uuid,boolean,boolean,text[]),
  public.list_visible_users(), public.list_visible_profiles() from public, anon;
revoke all on function public.list_visible_profiles() from authenticated;
grant execute on function public.update_user_permissions(uuid,boolean,boolean,text[]),
  public.list_visible_users() to authenticated;

-- The legacy Firebase profile rows remain available only to service_role for
-- audit/migration purposes and are no longer part of the live application.
revoke all on public.profiles from authenticated;
alter publication supabase_realtime drop table public.profiles;
alter publication supabase_realtime add table public.users;

commit;
