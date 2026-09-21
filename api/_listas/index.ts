import { SaveListaMetaSchema } from '../_lib/validation';
import { sendSuccess, sendError } from '../_lib/response';
import { logApi } from '../_lib/logger';
import { getSupabaseAdmin } from '../_lib/supabase-admin';
import { listaFromRow, listaPatchToRow } from '../_lib/supabase-data';

export default async function handler(req: any, res: any) {
  const startTime = Date.now();
  const supabase = getSupabaseAdmin();

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('coleta_listas')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return sendSuccess(res, { listas: (data || []).map(listaFromRow) });
    } catch (err: any) {
      return sendError(res, 500, 'FETCH_FAILED', 'Erro ao listar listas', err?.message);
    }
  }

  if (req.method === 'POST') {
    try {
      const parsed = SaveListaMetaSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(
          res,
          400,
          'INVALID_PAYLOAD',
          'Dados da lista inválidos',
          parsed.error.format()
        );
      }

      const listaData = parsed.data;
      const listaId = listaData.id || `lista-${Date.now()}`;
      const payload = {
        id: listaId,
        ...listaPatchToRow(listaData),
        total_itens: 0,
        total_validados: 0,
        saidas_count: {},
        motivos_count: {},
        rotas_count: {},
        bips_por_operador: {},
        created_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('coleta_listas')
        .insert(payload)
        .select('*')
        .single();

      if (error) throw error;

      logApi('info', 'Nova lista Supabase criada', {
        endpoint: '/api/listas',
        listaId,
        nome: listaData.nome,
        durationMs: Date.now() - startTime,
      });

      return sendSuccess(res, listaFromRow(data), 201);
    } catch (err: any) {
      return sendError(res, 500, 'CREATE_FAILED', 'Erro ao criar lista', err?.message);
    }
  }

  return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido');
}
