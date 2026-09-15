import listasIndexHandler from './_listas/index';
import listaIdHandler from './_listas/[id]';
import reconcileHandler from './_listas/reconcile';
import { sendError } from './_lib/response';

export default async function handler(req: any, res: any) {
  const { action } = req.query;
  switch (action) {
    case 'index': return listasIndexHandler(req, res);
    case 'id': return listaIdHandler(req, res);
    case 'reconcile': return reconcileHandler(req, res);
    default: return sendError(res, 404, 'NOT_FOUND', 'Ação não encontrada em listas');
  }
}
