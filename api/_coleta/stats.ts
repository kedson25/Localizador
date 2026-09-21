import { sendSuccess, sendError } from '../_lib/response';
import { getSupabaseAdmin } from '../_lib/supabase-admin';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido');
  }

  const { listaId } = req.query || {};
  if (!listaId) {
    return sendError(res, 400, 'MISSING_LISTA_ID', 'listaId é obrigatório');
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('coleta_listas')
      .select(
        'id, nome, status, total_itens, total_validados, saidas_count, motivos_count, rotas_count, bips_por_operador, updated_at'
      )
      .eq('id', String(listaId))
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return sendError(res, 404, 'LISTA_NOT_FOUND', 'Lista não encontrada');
    }

    return sendSuccess(res, {
      listaId: String(data.id),
      nome: data.nome,
      status: data.status,
      totalItens: Number(data.total_itens || 0),
      totalValidados: Number(data.total_validados || 0),
      totalPendentes: Math.max(
        0,
        Number(data.total_itens || 0) - Number(data.total_validados || 0)
      ),
      saidasCount: data.saidas_count || {},
      motivosCount: data.motivos_count || {},
      rotasCount: data.rotas_count || {},
      bipsPorOperador: data.bips_por_operador || {},
      updatedAt: data.updated_at,
    });
  } catch (err: any) {
    return sendError(
      res,
      500,
      'STATS_FAILED',
      'Erro ao obter estatísticas da lista',
      err?.message
    );
  }
}
