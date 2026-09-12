-- Allow Refugo export metrics to be stored in the list JSON payload.
begin;

create or replace function public.mutate_lista(p_mutation jsonb) returns boolean
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
     'motivoPadrao','porcentagemAcerto','fechamentoGaiola','itensFaltaram',
     'pacotesSemRotaEmFluxo','rotasEncontradas')) then
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

revoke all on function public.mutate_lista(jsonb) from public, anon, authenticated;
grant execute on function public.mutate_lista(jsonb) to authenticated;
commit;
