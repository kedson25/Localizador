-- Hardening do login: a resolução username -> email acontece somente no backend Vercel.
-- Remove o RPC público criado na migração-base para evitar enumeração de contas.

revoke execute on function public.resolve_login_email(text) from anon, authenticated;
drop function if exists public.resolve_login_email(text);

-- Exclusão de usuários também é feita pelo backend com service role.
revoke execute on function public.admin_delete_user(uuid) from authenticated;
