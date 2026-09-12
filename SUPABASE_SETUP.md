# Configuração do Supabase e Firebase

O frontend usa somente `VITE_SUPABASE_URL` e a chave publicável. A chave secreta
fica exclusivamente no Firebase Secret Manager, onde as Cloud Functions criam e
administram os perfis vinculados ao Firebase Authentication.

## 1. Criar o banco

No painel do projeto `uncspldfjqqaaszlglkp`, abra **SQL Editor**, crie uma nova
consulta, cole todo o conteúdo de `supabase/migrations/001_initial_schema.sql` e
execute uma vez. O script é transacional: se uma instrução falhar, nenhuma tabela
parcial é mantida.

Como alternativa, após autenticar a CLI e obter a senha do banco:

```powershell
npx supabase login
npx supabase link --project-ref uncspldfjqqaaszlglkp
npx supabase db push
```

A migração cria `profiles`, `coleta_listas`, `coleta_itens`,
`bases_operacionais`, `refugo_state`, `refugo_scans`, `individual_items`,
`operational_history` e `operation_receipts`, junto com índices, constraints,
RPCs atômicas, RLS e a publicação Realtime.

## 2. Confiar no Firebase Authentication

No Supabase, abra **Authentication > Third-Party Auth**, adicione Firebase e use
o Project ID `ecooy-5b791`. A configuração equivalente para CLI já está em
`supabase/config.toml`.

Os tokens Firebase precisam ter o claim `role: "authenticated"`. As funções em
`firebase-functions/index.mjs` aplicam esse claim e criam o perfil pendente.

## 3. Publicar as Cloud Functions

Primeiro, gere uma nova Secret Key no Supabase. Não use a chave que tenha sido
compartilhada em mensagens ou salve-a no repositório. Depois execute:

```powershell
cd firebase-functions
npm install
firebase functions:secrets:set SUPABASE_SECRET_KEY --project ecooy-5b791
firebase deploy --only functions --project ecooy-5b791 --config ../firebase.json
```

O valor público `SUPABASE_URL` e a Firebase Web API Key já estão configurados
pelas definições seguras das funções. A chave secreta é lida apenas em runtime.

## 4. Primeiro administrador

Cadastre a primeira conta na tela de login. No SQL Editor, aprove apenas esse UID
e conceda administração:

```sql
update public.profiles
set is_approved = true, is_admin = true, updated_at = now()
where firebase_uid = 'UID_FIREBASE_DA_CONTA';
```

Depois disso, o painel administrativo aprova as demais contas e define suas
permissões. Usuários anônimos e contas pendentes não acessam os dados operacionais.
