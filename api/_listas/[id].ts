import { sendSuccess, sendError } from '../_lib/response';
import { logApi } from '../_lib/logger';
import { getSupabaseAdmin } from '../_lib/supabase-admin';
import { listaFromRow, listaPatchToRow } from '../_lib/supabase-data';

export default async function handler(req: any, res: any) {
  const startTime = Date.now();
  const supabase = getSupabaseAdmin();
  const listaId =
    req.query?.id || req.query?.listaId || req.url?.split('/').pop()?.split('?')[0];

  if (!listaId) {
    return sendError(res, 400, 'MISSING_ID', 'ID da lista é obrigatório');
  }

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('coleta_listas')
        .select('*')
        .eq('id', String(listaId))
        .maybeSingle();

      if (error) throw error;
      if (!data) return sendError(res, 404, 'NOT_FOUND', 'Lista não encontrada');
      return sendSuccess(res, listaFromRow(data));
    } catch (err: any) {
      return sendError(res, 500, 'FETCH_FAILED', 'Erro ao obter lista', err?.message);
    }
  }

  if (req.method === 'PATCH') {
    try {
      const updates = { ...(req.body || {}) };
      delete updates.id;
      delete updates.itens;

      const { data, error } = await supabase
        .from('coleta_listas')
        .update(listaPatchToRow(updates))
        .eq('id', String(listaId))
        .select('*')
        .maybeSingle();

      if (error) throw error;
      if (!data) return sendError(res, 404, 'NOT_FOUND', 'Lista não encontrada');
      return sendSuccess(res, listaFromRow(data));
    } catch (err: any) {
      return sendError(res, 500, 'UPDATE_FAILED', 'Erro ao atualizar lista', err?.message);
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { count, error: countError } = await supabase
        .from('coleta_itens')
        .select('*', { count: 'exact', head: true })
        .eq('lista_id', String(listaId));

      if (countError) throw countError;

      const { error } = await supabase
        .from('coleta_listas')
        .delete()
        .eq('id', String(listaId));

      if (error) throw error;

      logApi('info', 'Lista Supabase excluída com cascade', {
        endpoint: '/api/listas/[id]',
        listaId,
        deletedItems: count || 0,
        durationMs: Date.now() - startTime,
      });

      return sendSuccess(res, {
        deleted: true,
        listaId: String(listaId),
        deletedItems: count || 0,
      });
    } catch (err: any) {
      return sendError(res, 500, 'DELETE_FAILED', 'Erro ao excluir lista', err?.message);
    }
  }

  return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido');
}
