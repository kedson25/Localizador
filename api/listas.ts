import listasIndexHandler from './_listas/index';
import listaIdHandler from './_listas/[id]';
import reconcileHandler from './_listas/reconcile';
import { requireApproved, requireAdmin, normalizeAuthError } from './_lib/auth';
import { sendError } from './_lib/response';

export default async function handler(req: any, res: any) {
  const { action } = req.query;

  try {
    const destructive = action === 'reconcile' || (action === 'id' && req.method === 'DELETE');
    if (destructive) await requireAdmin(req);
    else await requireApproved(req);
  } catch (err: any) {
    const authError = normalizeAuthError(err);
    return sendError(res, authError.statusCode, authError.code, authError.message);
  }

  switch (action) {
    case 'index': return listasIndexHandler(req, res);
    case 'id': return listaIdHandler(req, res);
    case 'reconcile': return reconcileHandler(req, res);
    default: return sendError(res, 404, 'NOT_FOUND', 'Ação não encontrada em listas');
  }
}
