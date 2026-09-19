import { google } from 'googleapis';
import { adminDb } from './_lib/firebase-admin';
import { sendSuccess, sendError } from './_lib/response';
import { logApi } from './_lib/logger';

// CONFIGURAÇÃO DIRETA NO CÓDIGO
// IMPORTANTE: mantenha este arquivo somente no backend (/api) e NÃO exponha essas credenciais no frontend.
const GOOGLE_SERVICE_ACCOUNT_EMAIL = 'SEU_SERVICE_ACCOUNT@SEU_PROJETO.iam.gserviceaccount.com';

const GOOGLE_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
COLE_AQUI_A_SUA_CHAVE_PRIVADA_COMPLETA
-----END PRIVATE KEY-----`;

const GOOGLE_SHEET_ID = 'COLE_AQUI_O_ID_DA_PLANILHA';
const SHEET_TAB_NAME = 'Lista do Dia';

function formatCicloShort(val: string): string {
  if (!val) return '';
  const upper = String(val).toUpperCase();
  if (upper.includes('PM')) return 'PM';
  if (upper.includes('AM')) return 'AM';
  if (upper.includes('SD')) return 'SD';
  return val;
}

function isGoogleSheetsConfigured() {
  return Boolean(
    GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    GOOGLE_PRIVATE_KEY &&
    GOOGLE_SHEET_ID &&
    GOOGLE_SERVICE_ACCOUNT_EMAIL.trim() !== '' &&
    GOOGLE_PRIVATE_KEY.trim() !== '' &&
    GOOGLE_SHEET_ID.trim() !== '' &&
    !GOOGLE_SERVICE_ACCOUNT_EMAIL.includes('planilhabot@kedson-fb038.iam.gserviceaccount.com') &&
    !GOOGLE_PRIVATE_KEY.includes('-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDOBqxtE6p54r/M\nzFZQ1jyXW7zV+qpFgE/B2XrE4AJZKUB82nB2wnnOaPJPlU0o1Avq5z49rCpmBwxM\nF0rFTG7WvqG+fByhIjVdVZPCMvlBrhtkhZU1cILgWJLSxHrEv7NJg4MtGYQGQxYT\nwYwQe14B8Zc96oIUCpUOht9dFxG5SLhPanBLxt6f+XS0BKi716ZGN40Yw2PuTIBZ\nV8zQWEwE/t4zfDaqQNY6cuE9P1tBb7MmNDoLau7lci+tY7u5bI/40y6nlwi0ehNg\nAaooSksbBKRJjzUGnOKw1Q5tX6lE1a5Cg0nl5MRqD4VWdW+HGRVXnMoX1hqOBh0H\ngweYSEXfAgMBAAECggEAQgPqaRMVm3OYIJ/TApj7Fka7ZdcpixaXt9YfXAkpR3eL\n5dW6lpsvG4AOMIj3Dd+QKAdLrshFV6bnflQyTbD1jRLNUfOD2u/SqKL8swvRSYXn\n2hhhnJt+HDPVa/qwGe4RHTuqIx/baYRChTcN0dQt5bKLUzga0SAo7dwyoyn6sGL1\nBvaKSOqhGKHVSbnVjpAuMacU/c7jEx7RR5rQy1WJNOxVmyUcB6kUSUedD3222TQf\nXYjC4QpsFuBK7OY4X/fpUr7Ap128kSA2zUkWnN/f+aq3YCKLB+G3bOoMGE16HNNY\nhoRdhcxsPSAE+R4F5UEHVrnlyzLoq54Vmq48fAxiyQKBgQDtLzt2/yXkZhQVG6Eh\nid3Ro8ISvSLpQZRHh9aReszL+ys0asltYMvYCcPzFlJKg7v5K3VZUnWiBfKFHZv2\nTeJgV7uN9r/zPIk5zpfkEWc2ibg+RKsG1aZyZQM//X+xU/dB/Pd81UBhXDrJHgxc\nXKA8nRTYkzz6rShWAkwvdRdQ6QKBgQDeXqwrg30CKL6TyIEWVyej7z00INUQxG6V\nuBRuL6VZpOFzW8oflQOYVolwhNJy5V8EokHknq71Pf8yP6YPc8oZQ24BsPaiZswT\nyoc76FMVuBZNLRdkTpbb+1FzH7g+9eqUNdViTvfVD73mlnM3qWQb5YsTgr+vfcuB\nwVs1E47jhwKBgQCuiM03WbYmhj9M8RH3Ph5uwBR1+ZwRDWLx6DGqyDSf/enjHpmu\n1UXrafQ5kzlm/915E9O8sQNDASFfd1RnQRTOVID9jI/fi7JnSXFYML5E0b80gw9f\nbiSXlWF42y/165XNhzsPL1W6z0Wq7WOnK7n2IJlQbbi3tmgyMmqhmYZY0QKBgHWm\nfU0gallkGUCzSqj5P73aa/VSkagnZaLNG/IYP1GojKeuHsiK3LYSwvDHNVkYxib7\negVtd3/FZ2m8hy2Rw5GOPXujlznhTYQDGX22s47AMPxwKPonImYNF9DjLWYSUiRM\nPzOeOD1/8Kc5XohKlO61idmuyaAd3DgwhwMT7/utAoGAHWCdiC7MCUa3iExggHQm\n3zXTyXrwdmVcTbO5LAPGv2k9NyHtTmTtWV2JOQDxvo4stvRT0wxF/JhPcU713g5R\nSpRGfNAKixdlxjk/92sXm9fr1PVJTXcd4HTgm2gkkvGie/y0z2iiP35/5VWv+K7Q\nuVWXCTQmzQVWdjc4nlMLjzI=\n-----END PRIVATE KEY-----\n') &&
    !GOOGLE_SHEET_ID.includes('1t4jwEUiYtNsh0S1kcRYrMfMdED3p8WbADWeLfSUyZbU')
  );
}

function getGoogleSheetsClient() {
  const email = GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = GOOGLE_PRIVATE_KEY;
  const sheetId = GOOGLE_SHEET_ID;

  if (!isGoogleSheetsConfigured()) {
    throw new Error('GOOGLE_SHEETS_NOT_CONFIGURED: Credenciais do Google Sheets não configuradas diretamente no arquivo.');
  }

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  return { sheets, sheetId };
}

export default async function handler(req: any, res: any) {
  const { action } = req.query || {};

  if (action === 'health') {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido');
    }
    try {
      const { sheets, sheetId } = getGoogleSheetsClient();
      await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: 'spreadsheetId' });
      return sendSuccess(res, {
        ok: true,
        google: true,
        spreadsheet: true,
      });
    } catch (err: any) {
      logApi('error', 'Health check do Google Sheets falhou', { error: err.message });
      return sendSuccess(res, {
        ok: false,
        google: false,
        spreadsheet: false,
        error: err.message,
      });
    }
  }

  if (action === 'sync') {
    if (req.method !== 'POST') {
      return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido');
    }

    if (!isGoogleSheetsConfigured()) {
      return sendSuccess(res, {
        success: false,
        notConfigured: true,
        message: 'Google Sheets não configurado diretamente no arquivo.',
      });
    }

    const { listaId } = req.body || {};
    if (!listaId || typeof listaId !== 'string') {
      return sendError(res, 400, 'INVALID_REQUEST', 'Parâmetro listaId é obrigatório');
    }

    try {
      const { db } = adminDb;

      // 1. Verificar se a lista existe no Firestore
      const listaRef = db.collection('coleta_listas').doc(listaId);
      const listaSnap = await listaRef.get();
      if (!listaSnap.exists) {
        return sendError(res, 404, 'LISTA_NOT_FOUND', 'Lista de coleta não encontrada');
      }

      const listaData = listaSnap.data() || {};
      const listaCicloPadrao = formatCicloShort(
        listaData.saidaPadrao || listaData.saida || listaData.rota || listaData.nome || 'PM'
      );

      // 2. Conectar ao Google Sheets e ler os dados atuais da planilha (para manter a lista contínua sem apagar outros ciclos)
      const { sheets, sheetId } = getGoogleSheetsClient();
      const sheetRange = `${SHEET_TAB_NAME}!A2:C`;
      let sheetRows: any[] = [];
      try {
        const sheetResponse = await sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: sheetRange,
        });
        sheetRows = sheetResponse.data.values || [];
      } catch (e) {
        sheetRows = [];
      }

      // 3. Buscar itens da lista atual no Firestore (fonte da verdade)
      const itemsSnap = await listaRef.collection('itens').get();
      const currentListItems: Array<{ codigo: string; ciclo: string; motivo: string; timestamp: number }> = [];
      const currentCodeSet = new Set<string>();
      const currentCycles = new Set<string>();

      itemsSnap.docs.forEach(docSnap => {
        const data = docSnap.data();
        const codigo = data.codigo || data.codigoClean || docSnap.id;
        if (codigo) {
          const codeStr = String(codigo).trim().toUpperCase();
          if (!currentCodeSet.has(codeStr)) {
            currentCodeSet.add(codeStr);
            const cicloItem = formatCicloShort(data.saida || data.rota || listaCicloPadrao);
            if (cicloItem) currentCycles.add(cicloItem);

            // Obter timestamp para ordenar mais recente no topo
            let ts = 0;
            if (typeof data.timestamp === 'number') {
              ts = data.timestamp;
            } else if (data.timestamp?.toMillis) {
              ts = data.timestamp.toMillis();
            } else if (data.timestamp?.seconds) {
              ts = data.timestamp.seconds * 1000;
            } else if (data.createdAt?.toMillis) {
              ts = data.createdAt.toMillis();
            } else if (data.createdAt?._seconds) {
              ts = data.createdAt._seconds * 1000;
            } else if (data.scannedAt) {
              const parsed = new Date(data.scannedAt).getTime();
              if (!isNaN(parsed)) ts = parsed;
            }

            currentListItems.push({
              codigo: codeStr,
              ciclo: cicloItem || 'PM',
              motivo: data.motivo || 'Pendente',
              timestamp: ts,
            });
          }
        }
      });

      // Se a lista não tiver itens ainda mas tem um ciclo padrão definido
      if (currentCycles.size === 0 && listaCicloPadrao) {
        currentCycles.add(listaCicloPadrao);
      }

      // 4. Ordenar itens da lista atual com mais recente no topo (mesma sequência do painel)
      currentListItems.sort((a, b) => b.timestamp - a.timestamp);

      // 5. Preservar itens da planilha que pertencem a outros ciclos (ex: SD quando salvando PM, ou PM quando salvando SD)
      // sem apagar o que já foi salvo de outros ciclos
      const otherCyclesItems: Array<{ codigo: string; ciclo: string; motivo: string; timestamp: number }> = [];
      sheetRows.forEach((row, idx) => {
        const cod = row[0] ? String(row[0]).trim().toUpperCase() : '';
        const cic = formatCicloShort(row[1] || '');
        const mot = row[2] ? String(row[2]).trim() : '';

        if (cod) {
          // Se o código não está na lista atual E o ciclo pertence a outro ciclo/lista diferente da atual
          if (!currentCodeSet.has(cod) && !currentCycles.has(cic)) {
            // Atribuir timestamp decrescente para preservar a ordem relativa das linhas existentes
            otherCyclesItems.push({
              codigo: cod,
              ciclo: cic,
              motivo: mot,
              timestamp: -idx,
            });
          }
        }
      });

      // 6. Unir todos os itens consolidados
      const allItems = [...currentListItems, ...otherCyclesItems];

      // 7. Organizar ciclos: PM primeiro, depois SD, depois outros ("tipo PM e abaixo SD")
      // e dentro de cada ciclo, os mais recentes no topo ("mesma sequência do painel")
      const getCicloRank = (c: string) => {
        const upper = (c || '').toUpperCase().trim();
        if (upper === 'PM') return 1;
        if (upper === 'SD') return 2;
        if (upper === 'AM') return 3;
        return 4;
      };

      allItems.sort((a, b) => {
        const rankA = getCicloRank(a.ciclo);
        const rankB = getCicloRank(b.ciclo);
        if (rankA !== rankB) {
          return rankA - rankB; // PM no topo, SD abaixo!
        }
        return b.timestamp - a.timestamp; // Mais recente no topo dentro do ciclo
      });

      // 8. Limpar o intervalo A:C da aba correspondente para reescrever de forma limpa e contínua
      const rangeClear = `${SHEET_TAB_NAME}!A:C`;
      await sheets.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: rangeClear,
      });

      // 9. Preparar matriz em lote com cabeçalho
      const values = [
        ['ID', 'Ciclo', 'Motivo'],
        ...allItems.map(item => [item.codigo, formatCicloShort(item.ciclo), item.motivo]),
      ];

      // 10. Escrever o estado consolidado contínuo em lote
      const rangeUpdate = `${SHEET_TAB_NAME}!A1`;
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: rangeUpdate,
        valueInputOption: 'RAW',
        requestBody: {
          values,
        },
      });

      logApi('info', 'Planilha atualizada com lista contínua (PM no topo, SD abaixo, mais recentes no topo)', {
        listaId,
        syncedCount: allItems.length,
        currentListCount: currentListItems.length,
        otherCyclesCount: otherCyclesItems.length,
      });

      return sendSuccess(res, {
        success: true,
        synced: allItems.length,
        currentCount: currentListItems.length,
      });

    } catch (err: any) {
      if (err.message && err.message.includes('GOOGLE_SHEETS_NOT_CONFIGURED')) {
        logApi('info', 'Sincronização com Google Sheets ignorada: credenciais diretas não configuradas', { listaId });
        return sendSuccess(res, {
          success: false,
          notConfigured: true,
          message: 'Google Sheets não configurado diretamente no arquivo.',
        });
      }
      logApi('error', 'Erro ao sincronizar com Google Sheets', { listaId, error: err.message });
      return sendError(res, 500, 'GOOGLE_SHEETS_SYNC_FAILED', 'Falha na sincronização com Google Sheets', err.message);
    }
  }

  return sendError(res, 404, 'NOT_FOUND', 'Ação não encontrada em sheets');
}
