import { UpdateItemSchema, DeleteItemSchema } from '../_lib/validation';
import { sendSuccess, sendError } from '../_lib/response';
import { logApi } from '../_lib/logger';
import { getSupabaseAdmin } from '../_lib/supabase-admin';
import { itemFromRow } from '../_lib/supabase-data';

export default async function handler(req: any, res: any) {
  const startTime = Date.now();
  const supabase = getSupabaseAdmin();

  if (req.method === 'PATCH') {
    try {
      const parsed = UpdateItemSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(
          res,
          400,
          'INVALID_PAYLOAD',
          'Dados de atualização inválidos',
          parsed.error.format()
        );
      }

      const { listaId, itemId, changes } = parsed.data;
      const payload: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (changes.motivo !== undefined) payload.motivo = changes.motivo;
      if (changes.saida !== undefined) payload.saida = changes.saida;
      if (changes.rota !== undefined) payload.rota = changes.rota;
      if (changes.validado !== undefined) payload.validado = changes.validado;
      if (changes.responsavel !== undefined) payload.responsavel = changes.responsavel;
      if (changes.grupoId !== undefined) payload.grupo_id = changes.grupoId || null;

      const { data, error } = await supabase
        .from('coleta_itens')
        .update(payload)
        .eq('lista_id', listaId)
        .eq('id', itemId)
        .select('*')
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return sendError(res, 404, 'NOT_FOUND', 'Item não encontrado na lista');
      }

      return sendSuccess(res, itemFromRow(data));
    } catch (err: any) {
      return sendError(
        res,
        500,
        'UPDATE_FAILED',
        'Erro ao atualizar item',
        err?.message
      );
    }
  }

  if (req.method === 'DELETE') {
    try {
      const parsed = DeleteItemSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(
          res,
          400,
          'INVALID_PAYLOAD',
          'Identificadores inválidos',
          parsed.error.format()
        );
      }

      const { listaId, itemId } = parsed.data;
      const { error } = await supabase
        .from('coleta_itens')
        .delete()
        .eq('lista_id', listaId)
        .eq('id', itemId);

      if (error) throw error;

      logApi('info', 'Item Supabase excluído', {
        endpoint: '/api/coleta/item',
        listaId,
        itemId,
        durationMs: Date.now() - startTime,
      });

      return sendSuccess(res, { deleted: true, itemId });
    } catch (err: any) {
      return sendError(
        res,
        500,
        'DELETE_FAILED',
        'Erro ao excluir item',
        err?.message
      );
    }
  }

  return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido');
}
