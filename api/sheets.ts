import { google } from 'googleapis';
import { adminDb } from './_lib/firebase-admin';
import { requireApproved, normalizeAuthError } from './_lib/auth';
import { sendSuccess, sendError } from './_lib/response';
import { logApi } from './_lib/logger';

function getConfig() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  const tabName = process.env.GOOGLE_SHEET_TAB?.trim() || 'LISTA-PM/SD';

  if (!email || !privateKey || !sheetId) {
    throw new Error('GOOGLE_SHEETS_NOT_CONFIGURED');
  }

  return { email, privateKey, sheetId, tabName };
}

function getClient() {
  const config = getConfig();
  const auth = new google.auth.JWT({
    email: config.email,
    key: config.privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return {
    sheets: google.sheets({ version: 'v4', auth }),
    ...config,
  };
}

function formatCicloShort(value: string): string {
  const upper = String(value || '').toUpperCase();
  if (upper.includes('PM')) return 'PM';
  if (upper.includes('SD')) return 'SD';
  if (upper.includes('AM')) return 'AM';
  return String(value || '');
}

export default async function handler(req: any, res: any) {
  const { action } = req.query || {};

  try {
    await requireApproved(req);
  } catch (err: any) {
    const authError = normalizeAuthError(err);
    return sendError(res, authError.statusCode, authError.code, authError.message);
  }

  if (action === 'health') {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido');
    }

    try {
      const { sheets, sheetId } = getClient();
      await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: 'spreadsheetId' });
      return sendSuccess(res, { ok: true, google: true, spreadsheet: true });
    } catch (err: any) {
      const notConfigured = err?.message === 'GOOGLE_SHEETS_NOT_CONFIGURED';
      return sendSuccess(res, {
        ok: false,
        google: false,
        spreadsheet: false,
        notConfigured,
      });
    }
  }

  if (action === 'sync') {
    if (req.method !== 'POST') {
      return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido');
    }

    const listaId = req.body?.listaId;
    if (!listaId || typeof listaId !== 'string') {
      return sendError(res, 400, 'INVALID_REQUEST', 'Parâmetro listaId é obrigatório');
    }

    try {
      const { db } = adminDb;
      const listaRef = db.collection('coleta_listas').doc(listaId);
      const listaSnap = await listaRef.get();
      if (!listaSnap.exists) {
        return sendError(res, 404, 'LISTA_NOT_FOUND', 'Lista de coleta não encontrada');
      }

      const listaData = listaSnap.data() || {};
      const fallbackCiclo = formatCicloShort(
        listaData.saidaPadrao || listaData.saida || listaData.rota || listaData.nome || 'PM'
      );

      const itemsSnap = await listaRef.collection('itens').get();
      const rows = itemsSnap.docs
        .map((docSnap) => {
          const data = docSnap.data();
          const codigo = String(data.codigo || data.codigoClean || docSnap.id).trim().toUpperCase();
          const ciclo = formatCicloShort(data.saida || data.rota || fallbackCiclo || 'PM');
          const motivo = String(data.motivo || 'Pendente');
          const timestamp = typeof data.timestamp === 'number' ? data.timestamp : 0;
          return { codigo, ciclo, motivo, timestamp };
        })
        .filter((item) => item.codigo)
        .sort((a, b) => {
          const rank = (c: string) => c === 'PM' ? 1 : c === 'SD' ? 2 : c === 'AM' ? 3 : 4;
          const diff = rank(a.ciclo) - rank(b.ciclo);
          return diff !== 0 ? diff : b.timestamp - a.timestamp;
        });

      const { sheets, sheetId, tabName } = getClient();
      await sheets.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: `${tabName}!A:C`,
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${tabName}!A1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [
            ['ID', 'Ciclo', 'Motivo'],
            ...rows.map((item) => [item.codigo, item.ciclo, item.motivo]),
          ],
        },
      });

      logApi('info', 'Planilha sincronizada', {
        endpoint: '/api/sheets',
        listaId,
        syncedCount: rows.length,
      });

      return sendSuccess(res, { success: true, synced: rows.length });
    } catch (err: any) {
      if (err?.message === 'GOOGLE_SHEETS_NOT_CONFIGURED') {
        return sendSuccess(res, {
          success: false,
          notConfigured: true,
          message: 'Integração com Google Sheets não configurada.',
        });
      }

      logApi('error', 'Erro ao sincronizar Google Sheets', {
        endpoint: '/api/sheets',
        listaId,
        error: err?.message,
      });
      return sendError(res, 500, 'GOOGLE_SHEETS_SYNC_FAILED', 'Falha na sincronização com Google Sheets');
    }
  }

  return sendError(res, 404, 'NOT_FOUND', 'Ação não encontrada em sheets');
}
