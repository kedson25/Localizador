import { BipRequestSchema } from '../_lib/validation';
import { normalizeCodigo, cleanDigits, getDeterministicItemId } from '../_lib/id';
import { sendSuccess, sendError } from '../_lib/response';
import { logApi } from '../_lib/logger';
import { getSupabaseAdmin } from '../_lib/supabase-admin';
import { itemFromRow } from '../_lib/supabase-data';

export default async function handler(req: any, res: any) {
  const startTime = Date.now();

  if (req.method !== 'POST') {
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido');
  }

  try {
    const parsed = BipRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        res,
        400,
        'INVALID_PAYLOAD',
        'Dados do bip inválidos',
        parsed.error.format()
      );
    }

    const { listaId, codigo, saida, motivo, rota, responsavel, grupoId } = parsed.data;
    const cleanCode = normalizeCodigo(codigo);
    if (!cleanCode) {
      return sendError(res, 400, 'EMPTY_CODE', 'Código não pode ser vazio');
    }

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

    const itemId = getDeterministicItemId(cleanCode);
    const { data: existing, error: existingError } = await supabase
      .from('coleta_itens')
      .select('*')
      .eq('lista_id', listaId)
      .eq('id', itemId)
      .maybeSingle();

    if (existingError) throw existingError;

    const row = {
      lista_id: listaId,
      id: itemId,
      codigo: cleanCode,
      codigo_clean: cleanDigits(cleanCode),
      rota: rota || existing?.rota || lista.rota || 'Sem Rota',
      saida:
        saida || existing?.saida || lista.saida_padrao || 'Ciclo 2 - Saída PM',
      motivo: motivo || existing?.motivo || lista.motivo_padrao || 'Pendente',
      scanned_at: new Date().toLocaleString('pt-BR'),
      responsavel: responsavel || existing?.responsavel || 'Operador',
      grupo_id: grupoId !== undefined ? grupoId || null : existing?.grupo_id || null,
      // Bip individual não valida automaticamente.
      validado: existing ? Boolean(existing.validado) : false,
      timestamp: Date.now(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('coleta_itens')
      .upsert(row, { onConflict: 'lista_id,id' })
      .select('*')
      .single();

    if (error) throw error;

    const result = {
      item: itemFromRow(data),
      isNew: !existing,
    };

    logApi('info', 'Bip Supabase executado com sucesso', {
      endpoint: '/api/coleta/bip',
      listaId,
      itemId,
      isNew: result.isNew,
      durationMs: Date.now() - startTime,
    });

    return sendSuccess(res, result);
  } catch (err: any) {
    logApi('error', 'Falha ao processar bip Supabase', {
      endpoint: '/api/coleta/bip',
      error: err?.message,
      durationMs: Date.now() - startTime,
    });

    return sendError(
      res,
      500,
      'BIP_FAILED',
      'Erro ao salvar bip no servidor',
      err?.message
    );
  }
}
