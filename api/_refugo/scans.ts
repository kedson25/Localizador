import { normalizeCodigo } from '../_lib/id';
import { sendSuccess, sendError } from '../_lib/response';
import { getSupabaseAdmin } from '../_lib/supabase-admin';

export default async function handler(req: any, res: any) {
  const supabase = getSupabaseAdmin();

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('refugo_scans')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(500);

      if (error) throw error;

      const scans = (data || []).map((row: any) => ({
        id: String(row.id || ''),
        normalizedId: String(row.normalized_id || ''),
        firestoreId: String(row.normalized_id || ''),
        rota: String(row.rota || ''),
        scannedAt: String(row.scanned_at || ''),
        timestamp: Number(row.timestamp || 0),
        status: row.status === 'not_found' ? 'not_found' : 'found',
        foundBy: row.found_by || undefined,
      }));

      return sendSuccess(res, { scans });
    } catch (err: any) {
      return sendError(res, 500, 'FETCH_FAILED', 'Erro ao obter scans de refugo', err?.message);
    }
  }

  if (req.method === 'POST') {
    try {
      const { id, rota, status, foundBy } = req.body || {};
      if (!id) return sendError(res, 400, 'MISSING_ID', 'ID é obrigatório');

      const cleanId = normalizeCodigo(id);
      const scan = {
        normalized_id: cleanId,
        id: cleanId,
        rota: rota || 'Sem Rota',
        status: status === 'not_found' ? 'not_found' : 'found',
        found_by: foundBy || 'Operador',
        scanned_at: new Date().toISOString(),
        timestamp: Date.now(),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('refugo_scans')
        .upsert(scan, { onConflict: 'normalized_id' })
        .select('*')
        .single();

      if (error) throw error;

      return sendSuccess(
        res,
        {
          id: String(data.id || ''),
          normalizedId: String(data.normalized_id || ''),
          rota: String(data.rota || ''),
          scannedAt: String(data.scanned_at || ''),
          timestamp: Number(data.timestamp || 0),
          status: data.status === 'not_found' ? 'not_found' : 'found',
          foundBy: data.found_by || undefined,
        },
        201
      );
    } catch (err: any) {
      return sendError(res, 500, 'SAVE_FAILED', 'Erro ao salvar scan de refugo', err?.message);
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { error } = await supabase
        .from('refugo_scans')
        .delete()
        .neq('normalized_id', '__never__');

      if (error) throw error;
      return sendSuccess(res, { cleared: true });
    } catch (err: any) {
      return sendError(res, 500, 'CLEAR_FAILED', 'Erro ao limpar scans de refugo', err?.message);
    }
  }

  return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido');
}
