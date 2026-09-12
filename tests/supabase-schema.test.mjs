import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// Real PostgreSQL execution in WASM. Supabase's gateway verifies signatures;
// these tests stub only auth.jwt() to exercise grants, RLS and actual SQL RPCs.
test('Supabase migration: identity, permissions, batching, conflicts and atomicity', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.jwt() to authenticated;
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/001_initial_schema.sql', import.meta.url), 'utf8'));
  await db.exec(`insert into public.profiles(firebase_uid,username,email,is_approved,is_admin,allowed_groups) values
    ('alice','Alice','alice@example.test',true,false,array['listas','upload']),
    ('bob','Bob','bob@example.test',true,false,array['listas']),
    ('pending','Pending','pending@example.test',false,false,array['listas']),
    ('restricted','Restricted','restricted@example.test',true,false,'{}'),
    ('admin','Admin','admin@example.test',true,true,'{}');`);
  const asUser = async (uid, overrides = {}) => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({
      sub: uid, iss: 'https://securetoken.google.com/ecooy-5b791', aud: 'ecooy-5b791',
      role: 'authenticated', name: uid.toUpperCase(), email: `${uid}@example.test`, ...overrides,
    })]);
    await db.exec('set role authenticated');
  };
  const mutation = overrides => ({ id: randomUUID(), listaId: 'shared', metadata: {}, upserts: [], removedIds: [], ...overrides });
  const mutate = value => db.query('select public.mutate_lista($1::jsonb)', [JSON.stringify(value)]);
  const item = (id, codigo = id, extra = {}) => ({ id, codigo, rota: 'A-1', saida: 'AM', motivo: 'Bipado', scannedAt: '2026-09-11T18:00:00Z', ...extra });
  const code = expected => error => error.code === expected;

  await t.test('anonymous callers have no direct table or RPC access', async () => {
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.coleta_listas'), code('42501'));
    await assert.rejects(mutate(mutation()), code('42501'));
  });
  await t.test('wrong Firebase issuer, audience and pending account cannot access operations', async () => {
    for (const [uid, overrides] of [['alice', { iss: 'https://securetoken.google.com/other' }], ['alice', { aud: 'other' }], ['pending', {}]]) {
      await asUser(uid, overrides);
      await assert.rejects(mutate(mutation()), code('42501'));
      assert.equal((await db.query('select * from public.coleta_listas')).rows.length, 0);
    }
    await asUser('pending');
    assert.deepEqual((await db.query('select firebase_uid from public.profiles')).rows.map(r => r.firebase_uid), ['pending']);
  });
  await t.test('write-only RPC boundary prevents profile escalation and forged audit records', async () => {
    await asUser('alice');
    await assert.rejects(db.query("update public.profiles set is_admin=true where firebase_uid='alice'"), code('42501'));
    await assert.rejects(db.query("insert into public.coleta_listas(id,data,firebase_uid) values ('fake','{}','bob')"), code('42501'));
    await assert.rejects(db.query("select private.audit('lista','x','forged','{}')"), code('42501'));
    await assert.rejects(db.query('delete from public.operational_history'), code('42501'));
    assert.equal((await db.query('select * from public.profiles')).rows.length, 1);
  });
  let creation;
  await t.test('1600 items commit as one batch with trusted Firebase identity', async () => {
    await asUser('alice');
    creation = mutation({ create: true, metadata: { nome: 'Shared', status: 'em_andamento', data: '2026-09-11' },
      upserts: Array.from({ length: 1600 }, (_, i) => item(`item-${i}`, String(47234567890 + i))) });
    await mutate(creation);
    assert.equal((await db.query('select count(*)::integer as count from public.coleta_itens')).rows[0].count, 1600);
    const actor = (await db.query("select firebase_uid,user_name,user_email,revision from public.coleta_itens where id='item-0'")).rows[0];
    assert.deepEqual(actor, { firebase_uid: 'alice', user_name: 'ALICE', user_email: 'alice@example.test', revision: 1 });
    assert.equal((await db.query('select * from public.operational_history')).rows.length, 1);
  });
  await t.test('retrying one mutation UUID is idempotent, changing its payload is rejected', async () => {
    await mutate(creation);
    assert.equal((await db.query('select * from public.operational_history')).rows.length, 1);
    await assert.rejects(mutate({ ...creation, metadata: { nome: 'Changed' } }), code('22023'));
  });
  await t.test('two accounts see shared records and duplicate normalized scans roll back the entire batch', async () => {
    await asUser('bob');
    assert.equal((await db.query('select count(*)::integer as count from public.coleta_itens')).rows[0].count, 1600);
    await assert.rejects(mutate(mutation({ upserts: [item('new-first', '999000'), item('duplicate', ' 47234567890M ')] })), code('23505'));
    assert.equal((await db.query("select count(*)::integer as count from public.coleta_itens where id='new-first'")).rows[0].count, 0);
    await assert.rejects(mutate(mutation({ upserts: [item('item-0', '47234567890')] })), code('PT409'));
  });
  await t.test('independent item edits survive together; stale edit/removal/metadata loses no data', async () => {
    await asUser('alice');
    await mutate(mutation({ upserts: [item('item-0', '47234567890', { motivo: 'Alice change' })], expectedItems: { 'item-0': 1 } }));
    await asUser('bob');
    await mutate(mutation({ upserts: [item('item-1', '47234567891', { motivo: 'Bob change' })], expectedItems: { 'item-1': 1 } }));
    await assert.rejects(mutate(mutation({ upserts: [item('item-0', '47234567890')], expectedItems: { 'item-0': 1 } })), code('PT409'));
    await assert.rejects(mutate(mutation({ removedIds: ['item-0'], expectedItems: { 'item-0': 1 } })), code('PT409'));
    await assert.rejects(mutate(mutation({ metadata: { nome: 'Stale overwrite' }, expectedRevision: 1 })), code('PT409'));
    const rows = (await db.query("select payload->>'motivo' motivo from public.coleta_itens where id in ('item-0','item-1') order by id")).rows;
    assert.deepEqual(rows, [{ motivo: 'Alice change' }, { motivo: 'Bob change' }]);
  });
  await t.test('granular list and upload permissions are enforced by PostgreSQL', async () => {
    await asUser('restricted');
    assert.equal((await db.query('select * from public.coleta_listas')).rows.length, 0);
    await assert.rejects(mutate(mutation()), code('42501'));
    await asUser('bob');
    await assert.rejects(db.query("select public.upsert_operational_base('coletor','header',0,'file.csv',null)"), code('42501'));
  });
  await t.test('CSV optimistic revision rejects stale updates, refugo imports rotate generation atomically', async () => {
    await asUser('alice');
    await db.query("select public.upsert_operational_base('coletor','header',0,'file.csv',null)");
    await assert.rejects(db.query("select public.upsert_operational_base('coletor','stale',0,'stale.csv',null)"), code('PT409'));
    await db.query("select public.upsert_operational_base('coletor','new',0,'file.csv',1)");
    await db.query('select public.mutate_refugo_scans($1::jsonb,null)', [JSON.stringify([{ id: '123', rota: 'A', status: 'found', foundBy: 'FORGED' }])]);
    assert.equal((await db.query("select payload->>'foundBy' actor from public.refugo_scans")).rows[0].actor, 'ALICE');
    await assert.rejects(db.query('select public.mutate_refugo_scans($1::jsonb,null)', [JSON.stringify([{ id: '001-new' }, { id: '123M' }])]), code('23505'));
    assert.equal((await db.query('select count(*)::integer count from public.refugo_scans')).rows[0].count, 1);
    await db.query("select public.upsert_operational_base('refugo','new',0,'refugo.csv',null)");
    assert.equal((await db.query('select count(*)::integer count from public.refugo_scans')).rows[0].count, 0);
    await assert.rejects(db.query('select public.mutate_refugo_scans($1::jsonb,null)', [JSON.stringify([{ id: '456' }])]), code('PT409'));
  });
  await t.test('individual draft sessions are private and promotion preserves existing IDs/routes atomically', async () => {
    await asUser('alice');
    const drafts = [item('draft-existing', '47234567890', { rota: 'Sem Rota' }), item('draft-new', '888888')];
    await db.query("select public.mutate_individual_items('session-a',$1::jsonb,'{}',false)", [JSON.stringify(drafts)]);
    await asUser('bob');
    assert.equal((await db.query('select * from public.individual_items')).rows.length, 0);
    await db.query("select public.mutate_individual_items('session-a',$1::jsonb,'{}',false)", [JSON.stringify([item('bob-own', '777777')])]);
    await asUser('alice');
    await assert.rejects(db.query("select public.promote_individual_session('session-a','shared','{}')"), code('PT409'));
    assert.equal((await db.query('select * from public.individual_items')).rows.length, 2);
    assert.equal((await db.query("select count(*)::integer count from public.coleta_itens where codigo='888888'")).rows[0].count, 0);
    const promoted = await db.query("select public.promote_individual_session('session-a','shared',$1::jsonb) result", [JSON.stringify({ 'item-0': 2 })]);
    assert.deepEqual(promoted.rows[0].result, { addedCount: 1, updatedCount: 1 });
    assert.equal((await db.query('select * from public.individual_items')).rows.length, 0);
    const existing = (await db.query("select id,payload,firebase_uid from public.coleta_itens where codigo='47234567890'")).rows[0];
    assert.equal(existing.id, 'item-0');
    assert.equal(existing.payload.rota, 'A-1');
    assert.equal(existing.payload.validado, true);
    assert.equal(existing.payload.responsavel, 'ALICE');
    await asUser('bob');
    assert.equal((await db.query('select * from public.individual_items')).rows.length, 1);
  });
  await t.test('admin reads profiles and audit, revocation immediately removes operational visibility', async () => {
    await asUser('admin');
    assert.equal((await db.query('select * from public.profiles')).rows.length, 5);
    assert.ok((await db.query('select * from public.operational_history')).rows.length > 4);
    await db.exec("reset role; update public.profiles set is_approved=false where firebase_uid='bob'");
    await asUser('bob');
    assert.equal((await db.query('select * from public.coleta_listas')).rows.length, 0);
    await assert.rejects(mutate(mutation()), code('42501'));
  });
  await t.test('approved collectors see the responsibility directory without private permission data', async () => {
    await asUser('alice');
    const visible = (await db.query('select * from public.list_visible_profiles()')).rows;
    // Bob was revoked in the preceding test, so only the three approved profiles remain.
    assert.equal(visible.length, 3);
    assert.ok(visible.every(row => row.email === '' && row.is_admin === false && row.is_approved === true));
    await asUser('admin');
    const administrative = (await db.query('select * from public.list_visible_profiles()')).rows;
    assert.equal(administrative.length, 5);
    assert.equal(administrative.find(row => row.firebase_uid === 'alice').email, 'alice@example.test');
  });
  await t.test('only the seven live state tables are published to Realtime', async () => {
    await db.exec('reset role');
    assert.deepEqual((await db.query("select tablename from pg_publication_tables where pubname='supabase_realtime' order by tablename")).rows.map(r => r.tablename),
      ['bases_operacionais', 'coleta_itens', 'coleta_listas', 'individual_items', 'profiles', 'refugo_scans', 'refugo_state']);
  });
});
