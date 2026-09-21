import { BatchImportSchema } from '../_lib/validation';
import { normalizeCodigo, getDeterministicItemId } from '../_lib/id';
import { sendSuccess, sendError } from '../_lib/response';
import { logApi } from '../_lib/logger';
import { getSupabaseAdmin } from '../_lib/supabase-admin';
import { itemToRow } from '../_lib/supabase-data';

export default async function handler(req: any, res: any) {
  const startTime = Date.now();

  if (req.method !== 'POST') {
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido');
  }

  try {
    const parsed = BatchImportSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        res,
        400,
        'INVALID_PAYLOAD',
        'Dados do lote inválidos',
        parsed.error.format()
      );
    }

    const { listaId, items, overwrite } = parsed.data;
    const supabase = getSupabaseAdmin();

    const { data: lista, error: listaError } = await supabase
      .from('coleta_listas')
      .select('id, rota, saida_padrao, motivo_padrao')
      .eq('id', listaId)
      .maybeSingle();

    if (listaError) throw listaError;
    if (!lista) {
      return sendError(res, 404, 'LISTA_NOT_FOUND', 'Lista de coleta não encontrada');
    }

    let inserted = 0;
    let updated = 0;
    let duplicates = 0;
    let failed = 0;

    const unique = new Map<string, any>();
    for (const rawItem of items) {
      const code = normalizeCodigo(rawItem.codigo);
      if (!code) {
        failed++;
        continue;
      }
      if (unique.has(code)) {
        duplicates++;
        continue;
      }
      unique.set(code, { ...rawItem, codigo: code });
    }

    const uniqueItems = Array.from(unique.values());
    const CHUNK_SIZE = 500;

    for (let start = 0; start < uniqueItems.length; start += CHUNK_SIZE) {
      const chunk = uniqueItems.slice(start, start + CHUNK_SIZE);
      const rows = chunk.map((item, index) => {
        const id = getDeterministicItemId(item.codigo);
        return itemToRow(
          listaId,
          {
            ...item,
            timestamp: item.timestamp || Date.now() - (start + index),
          },
          {
            rota: lista.rota,
            saidaPadrao: lista.saida_padrao,
            motivoPadrao: lista.motivo_padrao,
          },
          id
        );
      });

      const ids = rows.map((row) => row.id);
      const { data: existingRows, error: existingError } = await supabase
        .from('coleta_itens')
        .select('id')
        .eq('lista_id', listaId)
        .in('id', ids);

      if (existingError) throw existingError;
      const existingIds = new Set((existingRows || []).map((row: any) => String(row.id)));

      const rowsToWrite = overwrite
        ? rows
        : rows.filter((row) => {
            if (existingIds.has(String(row.id))) {
              duplicates++;
              return false;
            }
            return true;
          });

      if (rowsToWrite.length === 0) continue;

      const { error: upsertError } = await supabase
        .from('coleta_itens')
        .upsert(rowsToWrite, { onConflict: 'lista_id,id' });

      if (upsertError) throw upsertError;

      for (const row of rowsToWrite) {
        if (existingIds.has(String(row.id))) updated++;
        else inserted++;
      }
    }

    const { error: reconcileError } = await supabase.rpc('reconcile_lista_counts', {
      p_lista_id: listaId,
    });
    if (reconcileError) throw reconcileError;

    const summary = {
      received: items.length,
      inserted,
      updated,
      duplicates,
      failed,
    };

    logApi('info', 'Importação Supabase em lote concluída', {
      endpoint: '/api/coleta/batch',
      listaId,
      ...summary,
      durationMs: Date.now() - startTime,
    });

    return sendSuccess(res, summary);
  } catch (err: any) {
    return sendError(
      res,
      500,
      'BATCH_FAILED',
      'Erro ao processar lote no servidor',
      err?.message
    );
  }
}
