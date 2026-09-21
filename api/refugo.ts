import refugoScansHandler from './_refugo/scans';
import { requireApproved, normalizeAuthError } from './_lib/auth';
import { sendError } from './_lib/response';

export default async function handler(req: any, res: any) {
  try {
    await requireApproved(req);
  } catch (err: any) {
    const authError = normalizeAuthError(err);
    return sendError(res, authError.statusCode, authError.code, authError.message);
  }

  const { action } = req.query;
  switch (action) {
    case 'scans': return refugoScansHandler(req, res);
    default: return sendError(res, 404, 'NOT_FOUND', 'Ação não encontrada em refugo');
  }
}
