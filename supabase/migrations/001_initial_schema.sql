-- Run once in the Supabase SQL editor (or `supabase db push`).
-- Firebase Auth Third-Party integration: ecooy-5b791. No browser secret is needed.
begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
  firebase_uid text primary key check (length(firebase_uid) between 1 and 128),
  username text not null check (length(trim(username)) between 1 and 120),
  email text not null,
  is_admin boolean not null default false,
  is_approved boolean not null default false,
  allowed_groups text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_username_unique on public.profiles (lower(username));
create unique index profiles_email_unique on public.profiles (lower(email));

-- Supabase verifies signature/expiry before PostgreSQL. These checks also pin
-- the issuer and audience so another Firebase project cannot use these policies.
create function private.firebase_uid() returns text
language sql stable set search_path = '' as $$
  select case when auth.jwt()->>'iss' = 'https://securetoken.google.com/ecooy-5b791'
    and auth.jwt()->>'aud' = 'ecooy-5b791'
    and auth.jwt()->>'role' = 'authenticated'
    then nullif(auth.jwt()->>'sub', '') end;
$$;
create function private.is_approved() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles
    where firebase_uid = private.firebase_uid() and is_approved);
$$;
create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles
    where firebase_uid = private.firebase_uid() and is_approved and is_admin);
$$;
create function private.has_group(p_group text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where firebase_uid = private.firebase_uid()
    and is_approved and (is_admin or p_group = any(allowed_groups)));
$$;
create function private.require_access(p_group text default null) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_approved() or (p_group is not null and not private.has_group(p_group)) then
    raise exception 'Acesso não autorizado para esta operação.' using errcode = '42501';
  end if;
end;
$$;
create function private.actor_name() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(auth.jwt()->>'name', ''),
    (select username from public.profiles where firebase_uid = private.firebase_uid()), '');
$$;
create function private.code_key(p_code text) returns text
language sql immutable strict set search_path = '' as $$
  select coalesce(nullif(regexp_replace(v, '[^0-9]', '', 'g'), ''), v)
  from (select regexp_replace(upper(trim(p_code)), 'M$', '') v) normalized;
$$;

create table public.coleta_listas (
  id text primary key check (length(id) between 1 and 200),
  data jsonb not null check (jsonb_typeof(data) = 'object' and not data ? 'itens'),
  revision bigint not null default 1 check (revision > 0),
  firebase_uid text not null,
  user_name text not null default '',
  user_email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index coleta_listas_date_idx on public.coleta_listas ((data->>'data') desc, id);
create index coleta_listas_status_date_idx on public.coleta_listas ((data->>'status'), (data->>'data') desc, id);
create index coleta_listas_actor_idx on public.coleta_listas (firebase_uid, created_at desc);

create table public.coleta_itens (
  lista_id text not null references public.coleta_listas(id) on delete cascade,
  id text not null check (length(id) between 1 and 300),
  codigo text not null check (length(codigo) > 0 and codigo = private.code_key(codigo)),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and not payload ? 'syncStatus'),
  revision bigint not null default 1 check (revision > 0),
  firebase_uid text not null,
  user_name text not null default '',
  user_email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (lista_id, id),
  unique (lista_id, codigo)
);
create index coleta_itens_actor_idx on public.coleta_itens (firebase_uid, created_at desc);
create index coleta_itens_code_idx on public.coleta_itens (codigo);

create table public.bases_operacionais (
  kind text primary key check (kind in ('coletor', 'refugo')),
  raw_text text not null,
  total_rows integer not null check (total_rows >= 0),
  file_name text not null default '',
  revision bigint not null default 1 check (revision > 0),
  firebase_uid text not null,
  user_name text not null default '',
  user_email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.refugo_state (
  id text primary key default 'current' check (id = 'current'),
  generation uuid,
  firebase_uid text,
  user_name text not null default '',
  user_email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.refugo_state(id) values ('current');
create table public.refugo_scans (
  id text primary key check (length(id) > 0 and id = private.code_key(id)),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  generation uuid,
  firebase_uid text not null,
  user_name text not null default '',
  user_email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index refugo_scans_generation_idx on public.refugo_scans (generation, id);
create index refugo_scans_actor_idx on public.refugo_scans (firebase_uid, created_at desc);

create table public.individual_items (
  firebase_uid text not null,
  session text not null check (length(session) between 1 and 200),
  id text not null check (length(id) between 1 and 300),
  codigo text not null check (length(codigo) > 0 and codigo = private.code_key(codigo)),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and not payload ? 'syncStatus'),
  revision bigint not null default 1 check (revision > 0),
  user_name text not null default '',
  user_email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (firebase_uid, session, id),
  unique (firebase_uid, session, codigo)
);
create table public.operational_history (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  action text not null,
  payload jsonb not null default '{}',
  firebase_uid text not null,
  user_name text not null default '',
  user_email text not null default '',
  created_at timestamptz not null default now()
);
create index operational_history_entity_idx on public.operational_history (entity_type, entity_id, created_at desc);
create index operational_history_actor_idx on public.operational_history (firebase_uid, created_at desc);
create table public.operation_receipts (
  firebase_uid text not null,
  mutation_id uuid not null,
  request_hash text not null,
  created_at timestamptz not null default now(),
  primary key (firebase_uid, mutation_id)
);

create function private.audit(p_type text, p_id text, p_action text, p_payload jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.operational_history(entity_type, entity_id, action, payload, firebase_uid, user_name, user_email)
  values (p_type, p_id, p_action, p_payload, private.firebase_uid(), private.actor_name(), coalesce(auth.jwt()->>'email', ''));
$$;

-- All browser writes go through checked, atomic RPCs. There are deliberately no
-- authenticated INSERT/UPDATE/DELETE table grants or permissive write policies.
alter table public.profiles enable row level security;
alter table public.coleta_listas enable row level security;
alter table public.coleta_itens enable row level security;
alter table public.bases_operacionais enable row level security;
alter table public.refugo_state enable row level security;
alter table public.refugo_scans enable row level security;
alter table public.individual_items enable row level security;
alter table public.operational_history enable row level security;
alter table public.operation_receipts enable row level security;

create policy profiles_read on public.profiles for select to authenticated
  using (firebase_uid = (select private.firebase_uid()) or (select private.is_admin()));
create policy listas_read on public.coleta_listas for select to authenticated
  using ((select private.has_group('listas')));
create policy itens_read on public.coleta_itens for select to authenticated
  using ((select private.has_group('listas')));
create policy bases_read on public.bases_operacionais for select to authenticated
  using ((select private.is_approved()));
create policy refugo_state_read on public.refugo_state for select to authenticated
  using ((select private.is_approved()));
create policy refugo_scans_read on public.refugo_scans for select to authenticated
  using ((select private.is_approved()));
create policy individual_read on public.individual_items for select to authenticated
  using (firebase_uid = (select private.firebase_uid()) and (select private.has_group('listas')));
create policy history_read on public.operational_history for select to authenticated
  using ((select private.is_admin()) or
    (firebase_uid = (select private.firebase_uid()) and (select private.is_approved())));

revoke all on public.profiles, public.coleta_listas, public.coleta_itens, public.bases_operacionais,
  public.refugo_state, public.refugo_scans, public.individual_items, public.operational_history,
  public.operation_receipts from anon, authenticated;
grant select on public.profiles, public.coleta_listas, public.coleta_itens, public.bases_operacionais,
  public.refugo_state, public.refugo_scans, public.individual_items, public.operational_history to authenticated;
grant all on public.profiles, public.coleta_listas, public.coleta_itens, public.bases_operacionais,
  public.refugo_state, public.refugo_scans, public.individual_items, public.operational_history,
  public.operation_receipts to service_role;

-- Operational users need the approved usernames for the responsibility picker,
-- while only administrators may receive email addresses and permission details.
create function public.list_visible_profiles()
returns table(firebase_uid text, username text, email text, is_admin boolean,
  is_approved boolean, allowed_groups text[])
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_access('listas');
  if private.is_admin() then
    return query select p.firebase_uid, p.username, p.email, p.is_admin,
      p.is_approved, p.allowed_groups from public.profiles p order by lower(p.username);
    return;
  end if;
  return query select p.firebase_uid, p.username, ''::text, false, true, '{}'::text[]
    from public.profiles p where p.is_approved order by lower(p.username);
end;
$$;

create function public.mutate_lista(p_mutation jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid text := private.firebase_uid();
  v_id text := p_mutation->>'listaId';
  v_mutation uuid := (p_mutation->>'id')::uuid;
  v_metadata jsonb := coalesce(p_mutation->'metadata', '{}');
  v_upserts jsonb := coalesce(p_mutation->'upserts', '[]');
  v_removed jsonb := coalesce(p_mutation->'removedIds', '[]');
  v_expected jsonb := coalesce(p_mutation->'expectedItems', '{}');
  v_parent public.coleta_listas%rowtype;
  v_previous public.coleta_itens%rowtype;
  v_item jsonb;
  v_item_id text;
  v_hash text;
  v_inserted integer;
  v_exists boolean;
  v_create boolean := coalesce((p_mutation->>'create')::boolean, false);
  v_deleted boolean := coalesce((p_mutation->>'deleted')::boolean, false);
begin
  perform private.require_access('listas');
  if v_mutation is null or coalesce(length(v_id), 0) = 0 or
    jsonb_typeof(v_metadata) <> 'object' or jsonb_typeof(v_upserts) <> 'array' or
    jsonb_typeof(v_removed) <> 'array' or jsonb_typeof(v_expected) <> 'object' then
    raise exception 'Operação de lista inválida.' using errcode = '22023';
  end if;
  if exists(select 1 from jsonb_object_keys(v_metadata) k where k not in
    ('nome','tipo','grupos','grupoAtivoId','rota','data','responsavel','status','saidaPadrao',
     'motivoPadrao','porcentagemAcerto','fechamentoGaiola','itensFaltaram')) then
    raise exception 'Campo de lista desconhecido.' using errcode = '22023';
  end if;
  if v_metadata ? 'status' and v_metadata->>'status' not in ('em_andamento', 'finalizada') then
    raise exception 'Status de lista inválido.' using errcode = '22023';
  end if;
  insert into public.operation_receipts(firebase_uid, mutation_id, request_hash)
    values (v_uid, v_mutation, md5(p_mutation::text)) on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    select request_hash into v_hash from public.operation_receipts
      where firebase_uid = v_uid and mutation_id = v_mutation;
    if v_hash <> md5(p_mutation::text) then
      raise exception 'Identificador de operação reutilizado.' using errcode = '22023';
    end if;
    return true;
  end if;
  -- Serialize both creation and changes (including two simultaneous creates).
  perform pg_advisory_xact_lock(hashtextextended('lista:' || v_id, 0));
  select * into v_parent from public.coleta_listas where id = v_id for update;
  v_exists := found;
  if not v_exists then
    if not v_create or v_deleted then
      raise exception 'Esta lista não existe mais.' using errcode = 'PT409';
    end if;
    if coalesce(trim(v_metadata->>'nome'), '') = '' then
      raise exception 'Informe o nome da lista.' using errcode = '22023';
    end if;
    insert into public.coleta_listas(id, data, firebase_uid, user_name, user_email)
      values (v_id, v_metadata, v_uid, private.actor_name(), coalesce(auth.jwt()->>'email', ''));
  elsif v_create then
    raise exception 'Esta lista já foi criada.' using errcode = '23505';
  elsif (v_metadata <> '{}'::jsonb or v_deleted) and
    (p_mutation->>'expectedRevision')::bigint is distinct from v_parent.revision then
    raise exception 'A lista foi alterada por outro usuário. Atualize e tente novamente.' using errcode = 'PT409';
  end if;
  if v_deleted then
    perform private.audit('lista', v_id, 'delete', jsonb_build_object('metadata', v_parent.data));
    delete from public.coleta_listas where id = v_id;
    return true;
  end if;
  for v_item_id in select jsonb_array_elements_text(v_removed) loop
    select * into v_previous from public.coleta_itens where lista_id = v_id and id = v_item_id;
    if not found or (v_expected->>v_item_id)::bigint is distinct from v_previous.revision then
      raise exception 'O ID removido foi alterado por outro usuário.' using errcode = 'PT409';
    end if;
    delete from public.coleta_itens where lista_id = v_id and id = v_item_id;
  end loop;
  for v_item in select value from jsonb_array_elements(v_upserts) loop
    v_item_id := v_item->>'id';
    if coalesce(length(v_item_id), 0) = 0 or coalesce(length(private.code_key(v_item->>'codigo')), 0) = 0 then
      raise exception 'ID ou código vazio.' using errcode = '22023';
    end if;
    if v_removed ? v_item_id then
      raise exception 'O mesmo ID não pode ser removido e atualizado.' using errcode = '22023';
    end if;
    select * into v_previous from public.coleta_itens where lista_id = v_id and id = v_item_id;
    if found then
      if (v_expected->>v_item_id)::bigint is distinct from v_previous.revision then
        raise exception 'Este ID já foi bipado ou alterado em outro dispositivo.' using errcode = 'PT409';
      end if;
      update public.coleta_itens set payload = v_item - 'syncStatus' - 'revision',
        codigo = private.code_key(v_item->>'codigo'), revision = revision + 1,
        firebase_uid = v_uid, user_name = private.actor_name(), user_email = coalesce(auth.jwt()->>'email', ''), updated_at = now()
        where lista_id = v_id and id = v_item_id;
    else
      if v_expected ? v_item_id then
        raise exception 'Este ID foi removido em outro dispositivo.' using errcode = 'PT409';
      end if;
      insert into public.coleta_itens(lista_id, id, codigo, payload, firebase_uid, user_name, user_email)
        values (v_id, v_item_id, private.code_key(v_item->>'codigo'), v_item - 'syncStatus' - 'revision',
          v_uid, private.actor_name(), coalesce(auth.jwt()->>'email', ''));
    end if;
  end loop;
  if v_exists then
    update public.coleta_listas set data = data || v_metadata, revision = revision + 1,
      firebase_uid = v_uid, user_name = private.actor_name(), user_email = coalesce(auth.jwt()->>'email', ''), updated_at = now()
      where id = v_id;
  end if;
  perform private.audit('lista', v_id, case when v_create then 'create' else 'mutate' end,
    jsonb_build_object('metadata', v_metadata, 'upserts', v_upserts, 'removedIds', v_removed));
  return true;
end;
$$;

create function private.reset_refugo() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.refugo_state where id = 'current' for update;
  update public.refugo_state set generation = gen_random_uuid(), firebase_uid = private.firebase_uid(),
    user_name = private.actor_name(), user_email = coalesce(auth.jwt()->>'email', ''), updated_at = now()
    where id = 'current';
  delete from public.refugo_scans;
end;
$$;
create function public.upsert_operational_base(p_kind text, p_raw_text text, p_total_rows integer,
  p_file_name text, p_expected_revision bigint default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_revision bigint;
begin
  perform private.require_access(case when p_kind = 'refugo' then null else 'upload' end);
  if p_kind not in ('coletor','refugo') then raise exception 'Base inválida.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('base:' || p_kind, 0));
  select revision into v_revision from public.bases_operacionais where kind = p_kind for update;
  if v_revision is distinct from p_expected_revision then
    raise exception 'A base foi alterada em outro dispositivo.' using errcode = 'PT409';
  end if;
  insert into public.bases_operacionais(kind, raw_text, total_rows, file_name, firebase_uid, user_name, user_email)
    values (p_kind, p_raw_text, p_total_rows, p_file_name, private.firebase_uid(), private.actor_name(), coalesce(auth.jwt()->>'email', ''))
  on conflict (kind) do update set raw_text = excluded.raw_text, total_rows = excluded.total_rows,
    file_name = excluded.file_name, revision = bases_operacionais.revision + 1, firebase_uid = excluded.firebase_uid,
    user_name = excluded.user_name, user_email = excluded.user_email, updated_at = now();
  if p_kind = 'refugo' then perform private.reset_refugo(); end if;
  perform private.audit('base', p_kind, 'import', jsonb_build_object('totalRows', p_total_rows, 'fileName', p_file_name));
  return true;
end;
$$;
create function public.clear_operational_base(p_kind text, p_expected_revision bigint default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_revision bigint;
begin
  perform private.require_access();
  if p_kind not in ('coletor','refugo') then raise exception 'Base inválida.' using errcode = '22023'; end if;
  if p_kind = 'coletor' and not (private.has_group('upload') or private.has_group('remover')) then
    raise exception 'Acesso não autorizado para remover a base.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('base:' || p_kind, 0));
  select revision into v_revision from public.bases_operacionais where kind = p_kind for update;
  if v_revision is distinct from p_expected_revision then
    raise exception 'A base foi alterada em outro dispositivo.' using errcode = 'PT409';
  end if;
  delete from public.bases_operacionais where kind = p_kind;
  if p_kind = 'refugo' then perform private.reset_refugo(); end if;
  perform private.audit('base', p_kind, 'clear', '{}');
  return true;
end;
$$;
create function public.mutate_refugo_scans(p_scans jsonb, p_generation uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_generation uuid; v_scan jsonb; v_key text;
begin
  perform private.require_access();
  if jsonb_typeof(p_scans) <> 'array' then raise exception 'Scans inválidos.' using errcode = '22023'; end if;
  select generation into v_generation from public.refugo_state where id = 'current' for update;
  if v_generation is distinct from p_generation then
    raise exception 'O refugo foi reiniciado em outro dispositivo.' using errcode = 'PT409';
  end if;
  for v_scan in select value from jsonb_array_elements(p_scans) loop
    v_key := private.code_key(v_scan->>'id');
    if coalesce(length(v_key), 0) = 0 then raise exception 'Código inválido.' using errcode = '22023'; end if;
    if exists(select 1 from public.refugo_scans where id = v_key) then
      raise exception 'Este ID já foi bipado no refugo.' using errcode = '23505';
    end if;
    insert into public.refugo_scans(id, payload, generation, firebase_uid, user_name, user_email)
      values (v_key, (v_scan - 'generation') || jsonb_build_object('generation', p_generation, 'foundBy', private.actor_name()),
        p_generation, private.firebase_uid(), private.actor_name(), coalesce(auth.jwt()->>'email', ''));
  end loop;
  perform private.audit('refugo', 'current', 'scan', jsonb_build_object('scans', p_scans, 'generation', p_generation));
  return true;
end;
$$;
create function public.reset_refugo_scans() returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_access();
  perform private.reset_refugo();
  perform private.audit('refugo', 'current', 'reset', '{}');
  return true;
end;
$$;

create function public.mutate_individual_items(p_session text, p_items jsonb,
  p_removed_ids text[], p_clear boolean default false) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_uid text := private.firebase_uid(); v_item jsonb; v_revision bigint;
begin
  perform private.require_access('listas');
  if coalesce(length(p_session), 0) = 0 or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Sessão inválida.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('individual:' || v_uid || ':' || p_session, 0));
  if p_clear then delete from public.individual_items where firebase_uid = v_uid and session = p_session; end if;
  delete from public.individual_items where firebase_uid = v_uid and session = p_session and id = any(p_removed_ids);
  for v_item in select value from jsonb_array_elements(p_items) loop
    select revision into v_revision from public.individual_items
      where firebase_uid = v_uid and session = p_session and id = v_item->>'id';
    if v_revision is not null then
      if (v_item->>'revision')::bigint is distinct from v_revision then
        raise exception 'Este ID da sessão foi alterado em outro dispositivo.' using errcode = 'PT409';
      end if;
      update public.individual_items set codigo = private.code_key(v_item->>'codigo'),
        payload = v_item - 'syncStatus' - 'revision', revision = revision + 1,
        user_name = private.actor_name(), user_email = coalesce(auth.jwt()->>'email', ''), updated_at = now()
        where firebase_uid = v_uid and session = p_session and id = v_item->>'id';
    else
      if v_item ? 'revision' then raise exception 'Este ID da sessão foi removido.' using errcode = 'PT409'; end if;
      insert into public.individual_items(firebase_uid, session, id, codigo, payload, user_name, user_email)
        values (v_uid, p_session, v_item->>'id', private.code_key(v_item->>'codigo'), v_item - 'syncStatus' - 'revision',
          private.actor_name(), coalesce(auth.jwt()->>'email', ''));
    end if;
  end loop;
  perform private.audit('individual', p_session, case when p_clear then 'clear' else 'mutate' end,
    jsonb_build_object('items', p_items, 'removedIds', p_removed_ids));
  return true;
end;
$$;

create function public.promote_individual_session(p_session text, p_lista_id text,
  p_expected_items jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid text := private.firebase_uid();
  v_draft public.individual_items%rowtype;
  v_existing public.coleta_itens%rowtype;
  v_payload jsonb;
  v_id text;
  v_added integer := 0;
  v_updated integer := 0;
begin
  perform private.require_access('listas');
  perform pg_advisory_xact_lock(hashtextextended('lista:' || p_lista_id, 0));
  perform pg_advisory_xact_lock(hashtextextended('individual:' || v_uid || ':' || p_session, 0));
  perform 1 from public.coleta_listas where id = p_lista_id for update;
  if not found then raise exception 'A lista não existe mais.' using errcode = 'PT409'; end if;
  for v_draft in select * from public.individual_items
    where firebase_uid = v_uid and session = p_session order by created_at, id loop
    select * into v_existing from public.coleta_itens where lista_id = p_lista_id and codigo = v_draft.codigo;
    if found then
      if (p_expected_items->>v_existing.id)::bigint is distinct from v_existing.revision then
        raise exception 'Um ID foi alterado em outro dispositivo. Atualize a lista.' using errcode = 'PT409';
      end if;
      v_id := v_existing.id;
      v_payload := v_existing.payload;
      v_updated := v_updated + 1;
    else
      v_id := v_draft.id;
      v_payload := v_draft.payload;
      v_added := v_added + 1;
    end if;
    v_payload := v_payload || jsonb_build_object('id', v_id, 'validado', true,
      'responsavel', private.actor_name(),
      'scannedAt', coalesce(nullif(v_draft.payload->>'scannedAt', ''), now()::text),
      'saida', coalesce(nullif(v_draft.payload->>'saida', ''), v_existing.payload->>'saida', ''),
      'motivo', coalesce(nullif(v_draft.payload->>'motivo', ''), v_existing.payload->>'motivo', ''),
      'rota', case when coalesce(v_draft.payload->>'rota', '') not in ('', 'Sem Rota')
        then v_draft.payload->>'rota' else coalesce(nullif(v_existing.payload->>'rota', ''), nullif(v_draft.payload->>'rota', ''), 'Sem Rota') end);
    insert into public.coleta_itens(lista_id, id, codigo, payload, firebase_uid, user_name, user_email)
      values (p_lista_id, v_id, v_draft.codigo, v_payload - 'syncStatus' - 'revision',
        v_uid, private.actor_name(), coalesce(auth.jwt()->>'email', ''))
    on conflict (lista_id, id) do update set payload = excluded.payload, revision = coleta_itens.revision + 1,
      firebase_uid = excluded.firebase_uid, user_name = excluded.user_name, user_email = excluded.user_email, updated_at = now();
  end loop;
  delete from public.individual_items where firebase_uid = v_uid and session = p_session;
  if v_added + v_updated > 0 then
    update public.coleta_listas set revision = revision + 1, firebase_uid = v_uid,
      user_name = private.actor_name(), user_email = coalesce(auth.jwt()->>'email', ''), updated_at = now() where id = p_lista_id;
    perform private.audit('lista', p_lista_id, 'promote_individual',
      jsonb_build_object('session', p_session, 'addedCount', v_added, 'updatedCount', v_updated));
  end if;
  return jsonb_build_object('addedCount', v_added, 'updatedCount', v_updated);
end;
$$;

-- Restrict every newly declared function, including the private helpers. Grants
-- to policy helpers are needed for RLS; private is not an exposed API schema.
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.firebase_uid(), private.is_approved(), private.is_admin(), private.has_group(text) to authenticated;
revoke all on function public.mutate_lista(jsonb), public.upsert_operational_base(text,text,integer,text,bigint),
  public.clear_operational_base(text,bigint), public.mutate_refugo_scans(jsonb,uuid), public.reset_refugo_scans(),
  public.mutate_individual_items(text,jsonb,text[],boolean), public.promote_individual_session(text,text,jsonb),
  public.list_visible_profiles()
  from public, anon, authenticated;
grant execute on function public.mutate_lista(jsonb), public.upsert_operational_base(text,text,integer,text,bigint),
  public.clear_operational_base(text,bigint), public.mutate_refugo_scans(jsonb,uuid), public.reset_refugo_scans(),
  public.mutate_individual_items(text,jsonb,text[],boolean), public.promote_individual_session(text,text,jsonb),
  public.list_visible_profiles() to authenticated;

-- Tables have primary keys so DELETE notifications retain their identifiers.
-- No per-ID channels: clients subscribe by table or lista_id and read with RLS.
do $$
declare v_table text;
begin
  if not exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach v_table in array array['profiles','coleta_listas','coleta_itens','bases_operacionais',
    'refugo_state','refugo_scans','individual_items'] loop
    if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = v_table) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;
commit;
