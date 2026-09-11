import { beginSync, syncFailure, syncSuccess } from './syncStatus';

export class DataError extends Error {
  constructor(public readonly kind: 'network' | 'auth' | 'permission' | 'duplicate' | 'conflict' | 'timeout' | 'database', message: string) {
    super(message); this.name = 'DataError';
  }
}
export function toDataError(error: unknown): DataError {
  if (error instanceof DataError) return error;
  const value = error as { code?: string; message?: string; name?: string; status?: number } | null;
  const code = value?.code || '';
  const message = value?.message || '';
  if ((typeof navigator !== 'undefined' && !navigator.onLine) || /fetch|network|Failed to fetch/i.test(message))
    return new DataError('network', 'Sem conexão com o servidor. Reconecte e tente novamente.');
  if (/timeout|aborted|AbortError/i.test(message + value?.name) || code === '57014')
    return new DataError('timeout', 'O servidor não confirmou a operação a tempo. Atualize os dados antes de tentar novamente.');
  if (value?.status === 401 || /JWT|token|PGRST30|auth\//i.test(code + message))
    return new DataError('auth', 'Sua sessão precisa ser renovada. Entre novamente com sua conta Firebase.');
  if (code === '42501' || value?.status === 403)
    return new DataError('permission', 'Sua conta não tem permissão para esta operação. Verifique a aprovação e as permissões com um administrador.');
  if (code === '23505') return new DataError('duplicate', 'Este ID já foi registrado por outro usuário. A lista será atualizada.');
  if (['40001', 'PT409', 'P0002'].includes(code)) return new DataError('conflict', 'Os dados foram alterados em outro dispositivo. Confira a versão atual e tente novamente.');
  return new DataError('database', 'Não foi possível concluir a operação no Supabase. Verifique a configuração do banco e tente novamente.');
}
export async function databaseOperation<T>(context: string, action: () => PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const end = beginSync();
  try {
    const result = await action();
    if (result.error) throw result.error;
    syncSuccess(context); return result.data;
  } catch (cause) {
    const error = toDataError(cause); syncFailure(context, error.message);
    if (import.meta.env.DEV) console.warn('Supabase:', context, (cause as { code?: string })?.code || error.kind);
    throw error;
  } finally { end(); }
}
