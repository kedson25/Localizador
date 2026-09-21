import { SearchItemsSchema } from '../_lib/validation';
import { normalizeCodigo, cleanDigits, getDeterministicItemId } from '../_lib/id';
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
    const parsed = SearchItemsSchema.safeParse(req.query || {});
    if (!parsed.success) {
      return sendError(
        res,
        400,
        'INVALID_QUERY',
        'Termo de busca e listaId são obrigatórios'
      );
    }

    const { listaId, q, limit: maxResults } = parsed.data;
    const cleanQuery = normalizeCodigo(q);
    const digitsQuery = cleanDigits(cleanQuery);
    const deterministicId = getDeterministicItemId(cleanQuery);
    const supabase = getSupabaseAdmin();
    const found = new Map<string, any>();

    const { data: direct, error: directError } = await supabase
      .from('coleta_itens')
      .select('*')
      .eq('lista_id', listaId)
      .eq('id', deterministicId)
      .maybeSingle();

    if (directError) throw directError;
    if (direct) found.set(String(direct.id), direct);

    if (found.size < maxResults) {
      const { data, error } = await supabase
        .from('coleta_itens')
        .select('*')
        .eq('lista_id', listaId)
        .eq('codigo', cleanQuery)
        .limit(maxResults);
      if (error) throw error;
      (data || []).forEach((row: any) => found.set(String(row.id), row));
    }

    if (digitsQuery && found.size < maxResults) {
      const { data, error } = await supabase
        .from('coleta_itens')
        .select('*')
        .eq('lista_id', listaId)
        .eq('codigo_clean', digitsQuery)
        .limit(maxResults - found.size);
      if (error) throw error;
      (data || []).forEach((row: any) => found.set(String(row.id), row));
    }

    if (cleanQuery.length >= 3 && found.size < maxResults) {
      const escaped = cleanQuery.replace(/[%_]/g, '\\$&');
      const { data, error } = await supabase
        .from('coleta_itens')
        .select('*')
        .eq('lista_id', listaId)
        .ilike('codigo', `${escaped}%`)
        .limit(maxResults - found.size);
      if (error) throw error;
      (data || []).forEach((row: any) => found.set(String(row.id), row));
    }

    const items = Array.from(found.values()).slice(0, maxResults).map(itemFromRow);

    logApi('info', 'Busca Supabase realizada', {
      endpoint: '/api/coleta/search',
      listaId,
      query: cleanQuery,
      found: items.length,
      durationMs: Date.now() - startTime,
    });

    return sendSuccess(res, { items });
  } catch (err: any) {
    return sendError(res, 500, 'SEARCH_FAILED', 'Erro ao pesquisar itens', err?.message);
  }
}
