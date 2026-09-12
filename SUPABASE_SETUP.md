# Configuração do Supabase

O projeto usa o Supabase para autenticação, banco PostgreSQL, RLS e Realtime.
O navegador recebe somente `VITE_SUPABASE_URL` e a chave publicável. Nenhuma
Secret Key é necessária no frontend.

## Banco de dados

As migrações estão em `supabase/migrations`. Para aplicá-las no projeto remoto:

```powershell
npx supabase login
npx supabase link --project-ref uncspldfjqqaaszlglkp
npx supabase db push --linked
```

A migração `002_supabase_auth.sql` cria `public.users`, vinculada a
`auth.users`. Um trigger cria automaticamente a linha pública durante o
cadastro com:

- `is_admin = false`
- `is_approved = true`
- acesso padrão às ferramentas operacionais

As políticas RLS permitem que o usuário consulte o próprio registro. Somente
um administrador pode listar todos os usuários ou alterar permissões pelo
aplicativo.

## Primeiro administrador

Crie sua conta na tela **Criar usuário**. Depois abra **Table Editor > users**
no Supabase e altere apenas `is_admin` para `true` na sua linha.

Também é possível executar no SQL Editor:

```sql
update public.users
set is_admin = true, updated_at = now()
where email = 'seu-email@exemplo.com';
```

Saia e entre novamente no site para o menu administrativo aparecer. Os
cadastros futuros permanecem como usuários comuns até que um administrador
altere suas permissões.
