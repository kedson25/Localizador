-- Supabase migration for Localizador
-- Apply once in Supabase SQL Editor or with `supabase db push`.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  email text not null,
  is_admin boolean not null default false,
  is_approved boolean not null default false,
  allowed_groups text[] not null default array['consulta','remover','reporte','listas','upload']::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_username_lower_uidx
  on public.profiles (lower(username));
create unique index if not exists profiles_email_lower_uidx
  on public.profiles (lower(email));

create table if not exists public.coletor_state (
  id text primary key,
  raw_text text not null default '',
  total_rows integer not null default 0,
  file_name text,
  updated_at timestamptz not null default now()
);

create table if not exists public.refugo_state (
  id text primary key,
  raw_text text not null default '',
  total_rows integer not null default 0,
  file_name text,
  updated_at timestamptz not null default now()
);

create table if not exists public.refugo_scans (
  normalized_id text primary key,
  id text not null,
  rota text not null default '',
  scanned_at text not null default '',
  timestamp bigint not null default 0,
  status text not null default 'found' check (status in ('found', 'not_found')),
  found_by text,
  updated_at timestamptz not null default now()
);

create index if not exists refugo_scans_timestamp_idx
  on public.refugo_scans (timestamp desc);
create index if not exists refugo_scans_status_idx
  on public.refugo_scans (status);

create table if not exists public.coleta_listas (
  id text primary key,
  nome text not null default '',
  tipo text not null default 'comum',
  grupos jsonb not null default '[]'::jsonb,
  grupo_ativo_id text,
  rota text not null default '',
  data text not null default '',
  saida text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responsavel text not null default '',
  status text not null default 'em_andamento'
    check (status in ('em_andamento', 'finalizada')),
  saida_padrao text not null default 'Ciclo 2 - Saída PM',
  motivo_padrao text not null default 'Pendente',
  total_itens integer not null default 0,
  total_validados integer not null default 0,
  saidas_count jsonb not null default '{}'::jsonb,
  motivos_count jsonb not null default '{}'::jsonb,
  rotas_count jsonb not null default '{}'::jsonb,
  bips_por_operador jsonb not null default '{}'::jsonb,
  porcentagem_acerto numeric,
  fechamento_gaiola text,
  itens_faltaram integer
);

create index if not exists coleta_listas_created_at_idx
  on public.coleta_listas (created_at desc);
create index if not exists coleta_listas_status_idx
  on public.coleta_listas (status);

create table if not exists public.coleta_itens (
  lista_id text not null references public.coleta_listas(id) on delete cascade,
  id text not null,
  codigo text not null,
  codigo_clean text not null default '',
  rota text not null default 'Sem Rota',
  saida text not null default 'Ciclo 2 - Saída PM',
  motivo text not null default 'Pendente',
  scanned_at text not null default '',
  responsavel text,
  grupo_id text,
  validado boolean not null default false,
  timestamp bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (lista_id, id)
);

create index if not exists coleta_itens_lista_timestamp_idx
  on public.coleta_itens (lista_id, timestamp desc, id desc);
create index if not exists coleta_itens_codigo_idx
  on public.coleta_itens (codigo);
create index if not exists coleta_itens_codigo_clean_idx
  on public.coleta_itens (codigo_clean);
create index if not exists coleta_itens_grupo_idx
  on public.coleta_itens (lista_id, grupo_id);
create index if not exists coleta_itens_saida_idx
  on public.coleta_itens (lista_id, saida);
create index if not exists coleta_itens_motivo_idx
  on public.coleta_itens (lista_id, motivo);
create index if not exists coleta_itens_validado_idx
  on public.coleta_itens (lista_id, validado);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists coleta_listas_touch_updated_at on public.coleta_listas;
create trigger coleta_listas_touch_updated_at
before update on public.coleta_listas
for each row execute function public.touch_updated_at();

drop trigger if exists coleta_itens_touch_updated_at on public.coleta_itens;
create trigger coleta_itens_touch_updated_at
before update on public.coleta_itens
for each row execute function public.touch_updated_at();

drop trigger if exists refugo_scans_touch_updated_at on public.refugo_scans;
create trigger refugo_scans_touch_updated_at
before update on public.refugo_scans
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  first_profile boolean;
  desired_username text;
begin
  select not exists(select 1 from public.profiles) into first_profile;

  desired_username := nullif(trim(coalesce(new.raw_user_meta_data ->> 'username', '')), '');
  if desired_username is null then
    desired_username := split_part(coalesce(new.email, new.id::text), '@', 1);
  end if;

  insert into public.profiles (
    id,
    username,
    email,
    is_admin,
    is_approved,
    allowed_groups
  )
  values (
    new.id,
    desired_username,
    lower(coalesce(new.email, '')),
    first_profile,
    first_profile,
    array['consulta','remover','reporte','listas','upload']::text[]
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_approved_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_approved = true
  );
$$;

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_approved = true
      and is_admin = true
  );
$$;

create or replace function public.resolve_login_email(p_login text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select email
  from public.profiles
  where lower(username) = lower(trim(p_login))
  limit 1;
$$;

create or replace function public.admin_delete_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin_user() then
    raise exception 'Administrador obrigatório';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Não é permitido excluir o próprio usuário administrador';
  end if;

  delete from auth.users where id = p_user_id;
  return found;
end;
$$;

create or replace function public.jsonb_inc(
  source jsonb,
  key_name text,
  delta integer
)
returns jsonb
language plpgsql
immutable
as $$
declare
  base jsonb := coalesce(source, '{}'::jsonb);
  current_value integer := 0;
  next_value integer := 0;
begin
  if key_name is null or btrim(key_name) = '' or delta = 0 then
    return base;
  end if;

  begin
    current_value := coalesce((base ->> key_name)::integer, 0);
  exception when others then
    current_value := 0;
  end;

  next_value := current_value + delta;

  if next_value <= 0 then
    return base - key_name;
  end if;

  return jsonb_set(base, array[key_name], to_jsonb(next_value), true);
end;
$$;

create or replace function public.maintain_lista_counters()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.coleta_listas
    set
      total_itens = greatest(total_itens + 1, 0),
      total_validados = greatest(total_validados + case when new.validado then 1 else 0 end, 0),
      bips_por_operador = public.jsonb_inc(bips_por_operador, coalesce(new.responsavel, 'Operador'), 1),
      saidas_count = public.jsonb_inc(saidas_count, new.saida, 1),
      motivos_count = public.jsonb_inc(motivos_count, new.motivo, 1),
      rotas_count = public.jsonb_inc(rotas_count, new.rota, 1),
      updated_at = now()
    where id = new.lista_id;
    return new;
  end if;

  if tg_op = 'DELETE' then
    update public.coleta_listas
    set
      total_itens = greatest(total_itens - 1, 0),
      total_validados = greatest(total_validados - case when old.validado then 1 else 0 end, 0),
      bips_por_operador = public.jsonb_inc(bips_por_operador, coalesce(old.responsavel, 'Operador'), -1),
      saidas_count = public.jsonb_inc(saidas_count, old.saida, -1),
      motivos_count = public.jsonb_inc(motivos_count, old.motivo, -1),
      rotas_count = public.jsonb_inc(rotas_count, old.rota, -1),
      updated_at = now()
    where id = old.lista_id;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    update public.coleta_listas
    set
      total_validados = greatest(
        total_validados
          + case
              when old.validado = new.validado then 0
              when new.validado then 1
              else -1
            end,
        0
      ),
      bips_por_operador =
        case
          when coalesce(old.responsavel, 'Operador') is distinct from coalesce(new.responsavel, 'Operador')
          then public.jsonb_inc(
                 public.jsonb_inc(bips_por_operador, coalesce(old.responsavel, 'Operador'), -1),
                 coalesce(new.responsavel, 'Operador'),
                 1
               )
          else bips_por_operador
        end,
      saidas_count =
        case
          when old.saida is distinct from new.saida
          then public.jsonb_inc(public.jsonb_inc(saidas_count, old.saida, -1), new.saida, 1)
          else saidas_count
        end,
      motivos_count =
        case
          when old.motivo is distinct from new.motivo
          then public.jsonb_inc(public.jsonb_inc(motivos_count, old.motivo, -1), new.motivo, 1)
          else motivos_count
        end,
      rotas_count =
        case
          when old.rota is distinct from new.rota
          then public.jsonb_inc(public.jsonb_inc(rotas_count, old.rota, -1), new.rota, 1)
          else rotas_count
        end,
      updated_at = now()
    where id = new.lista_id;
    return new;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists coleta_itens_counters on public.coleta_itens;
create trigger coleta_itens_counters
after insert or update or delete on public.coleta_itens
for each row execute function public.maintain_lista_counters();

create or replace function public.reconcile_lista_counts(p_lista_id text)
returns table(total_itens bigint, total_validados bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint := 0;
  v_validados bigint := 0;
  v_bips jsonb := '{}'::jsonb;
  v_saidas jsonb := '{}'::jsonb;
  v_motivos jsonb := '{}'::jsonb;
  v_rotas jsonb := '{}'::jsonb;
begin
  if not public.is_approved_user() then
    raise exception 'Usuário não aprovado';
  end if;

  select
    count(*),
    count(*) filter (where validado = true)
  into v_total, v_validados
  from public.coleta_itens
  where lista_id = p_lista_id;

  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb)
  into v_bips
  from (
    select coalesce(nullif(responsavel, ''), 'Operador') as k, count(*)::integer as n
    from public.coleta_itens
    where lista_id = p_lista_id
    group by 1
  ) q;

  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb)
  into v_saidas
  from (
    select saida as k, count(*)::integer as n
    from public.coleta_itens
    where lista_id = p_lista_id and coalesce(saida, '') <> ''
    group by 1
  ) q;

  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb)
  into v_motivos
  from (
    select motivo as k, count(*)::integer as n
    from public.coleta_itens
    where lista_id = p_lista_id and coalesce(motivo, '') <> ''
    group by 1
  ) q;

  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb)
  into v_rotas
  from (
    select rota as k, count(*)::integer as n
    from public.coleta_itens
    where lista_id = p_lista_id and coalesce(rota, '') <> ''
    group by 1
  ) q;

  update public.coleta_listas
  set
    total_itens = v_total::integer,
    total_validados = v_validados::integer,
    bips_por_operador = v_bips,
    saidas_count = v_saidas,
    motivos_count = v_motivos,
    rotas_count = v_rotas,
    updated_at = now()
  where id = p_lista_id;

  return query select v_total, v_validados;
end;
$$;

alter table public.profiles enable row level security;
alter table public.coletor_state enable row level security;
alter table public.refugo_state enable row level security;
alter table public.refugo_scans enable row level security;
alter table public.coleta_listas enable row level security;
alter table public.coleta_itens enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_admin_user());

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update
on public.profiles
for update
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists coletor_approved_all on public.coletor_state;
create policy coletor_approved_all
on public.coletor_state
for all
to authenticated
using (public.is_approved_user())
with check (public.is_approved_user());

drop policy if exists refugo_state_approved_all on public.refugo_state;
create policy refugo_state_approved_all
on public.refugo_state
for all
to authenticated
using (public.is_approved_user())
with check (public.is_approved_user());

drop policy if exists refugo_scans_approved_all on public.refugo_scans;
create policy refugo_scans_approved_all
on public.refugo_scans
for all
to authenticated
using (public.is_approved_user())
with check (public.is_approved_user());

drop policy if exists coleta_listas_approved_all on public.coleta_listas;
create policy coleta_listas_approved_all
on public.coleta_listas
for all
to authenticated
using (public.is_approved_user())
with check (public.is_approved_user());

drop policy if exists coleta_itens_approved_all on public.coleta_itens;
create policy coleta_itens_approved_all
on public.coleta_itens
for all
to authenticated
using (public.is_approved_user())
with check (public.is_approved_user());

grant usage on schema public to anon, authenticated;
grant select on public.profiles to authenticated;
grant update on public.profiles to authenticated;
grant select, insert, update, delete on public.coletor_state to authenticated;
grant select, insert, update, delete on public.refugo_state to authenticated;
grant select, insert, update, delete on public.refugo_scans to authenticated;
grant select, insert, update, delete on public.coleta_listas to authenticated;
grant select, insert, update, delete on public.coleta_itens to authenticated;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.reconcile_lista_counts(text) to authenticated;

alter table public.coleta_listas replica identity full;
alter table public.coleta_itens replica identity full;
alter table public.refugo_state replica identity full;
alter table public.refugo_scans replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'coleta_listas'
    ) then
      execute 'alter publication supabase_realtime add table public.coleta_listas';
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'coleta_itens'
    ) then
      execute 'alter publication supabase_realtime add table public.coleta_itens';
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'refugo_state'
    ) then
      execute 'alter publication supabase_realtime add table public.refugo_state';
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'refugo_scans'
    ) then
      execute 'alter publication supabase_realtime add table public.refugo_scans';
    end if;
  end if;
end;
$$;
