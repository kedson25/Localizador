import { sendSuccess, sendError } from '../_lib/response';
import { logApi } from '../_lib/logger';
import { getSupabaseAdmin } from '../_lib/supabase-admin';

export default async function handler(req: any, res: any) {
  const startTime = Date.now();

  if (req.method !== 'POST') {
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido');
  }

  try {
    const supabase = getSupabaseAdmin();
    const listaId = req.body?.listaId;

    const { data: listas, error: listasError } = listaId
      ? await supabase
          .from('coleta_listas')
          .select('id, nome')
          .eq('id', String(listaId))
      : await supabase.from('coleta_listas').select('id, nome');

    if (listasError) throw listasError;
    if (listaId && (!listas || listas.length === 0)) {
      return sendError(res, 404, 'NOT_FOUND', 'Lista não encontrada');
    }

    const results: Array<{
      id: string;
      nome: string;
      totalItens: number;
      totalValidados: number;
    }> = [];

    for (const lista of listas || []) {
      const { data, error } = await supabase.rpc('reconcile_lista_counts', {
        p_lista_id: String(lista.id),
      });

      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;

      results.push({
        id: String(lista.id),
        nome: String(lista.nome || ''),
        totalItens: Number(row?.total_itens || 0),
        totalValidados: Number(row?.total_validados || 0),
      });
    }

    logApi('info', 'Contadores Supabase reconciliados', {
      endpoint: '/api/listas/reconcile',
      durationMs: Date.now() - startTime,
      count: results.length,
    });

    return sendSuccess(res, { reconciled: results });
  } catch (err: any) {
    return sendError(
      res,
      500,
      'RECONCILE_FAILED',
      'Erro ao reconciliar contadores',
      err?.message
    );
  }
}
