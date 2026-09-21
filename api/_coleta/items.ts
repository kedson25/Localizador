import { QueryItemsSchema } from '../_lib/validation';
import { sendSuccess, sendError } from '../_lib/response';
import { logApi } from '../_lib/logger';
import { getSupabaseAdmin } from '../_lib/supabase-admin';
import { itemFromRow } from '../_lib/supabase-data';

export default async function handler(req: any, res: any) {
  const startTime = Date.now();

  if (req.method !== 'GET') {
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido');
  }

  try {
    const parsed = QueryItemsSchema.safeParse(req.query || {});
    if (!parsed.success) {
      return sendError(
        res,
        400,
        'INVALID_QUERY',
        'Parâmetros de paginação inválidos',
        parsed.error.format()
      );
    }

    const {
      listaId,
      limit: pageSize,
      cursor,
      direction,
      saida,
      motivo,
      validado,
      order,
    } = parsed.data;

    const supabase = getSupabaseAdmin();
    const { data: lista, error: listaError } = await supabase
      .from('coleta_listas')
      .select('id')
      .eq('id', listaId)
      .maybeSingle();

    if (listaError) throw listaError;
    if (!lista) {
      return sendError(res, 404, 'LISTA_NOT_FOUND', 'Lista de coleta não encontrada');
    }

    let offset = Number.parseInt(cursor || '0', 10);
    if (!Number.isFinite(offset) || offset < 0) offset = 0;
    if (direction === 'prev') offset = Math.max(0, offset - pageSize);

    const applyFilters = (query: any) => {
      let q = query.eq('lista_id', listaId);
      if (saida) q = q.eq('saida', saida);
      if (motivo) q = q.eq('motivo', motivo);
      if (validado !== undefined) q = q.eq('validado', validado === 'true');
      return q;
    };

    const dataQuery = applyFilters(supabase.from('coleta_itens').select('*'))
      .order('timestamp', { ascending: order === 'asc' })
      .order('id', { ascending: order === 'asc' })
      .range(offset, offset + pageSize - 1);

    const countQuery = applyFilters(
      supabase.from('coleta_itens').select('*', { count: 'exact', head: true })
    );

    const [dataResult, countResult] = await Promise.all([dataQuery, countQuery]);
    if (dataResult.error) throw dataResult.error;
    if (countResult.error) throw countResult.error;

    const items = (dataResult.data || []).map(itemFromRow);
    const total = countResult.count || 0;
    const nextOffset = offset + pageSize;
    const hasMore = nextOffset < total;

    logApi('info', 'Página Supabase carregada', {
      endpoint: '/api/coleta/items',
      listaId,
      itemsCount: items.length,
      total,
      durationMs: Date.now() - startTime,
    });

    return sendSuccess(res, {
      items,
      nextCursor: hasMore ? String(nextOffset) : null,
      prevCursor: offset > 0 ? String(Math.max(0, offset - pageSize)) : null,
      hasMore,
      total,
      pageSize,
    });
  } catch (err: any) {
    return sendError(
      res,
      500,
      'PAGINATION_FAILED',
      'Erro ao carregar página de itens',
      err?.message
    );
  }
}
