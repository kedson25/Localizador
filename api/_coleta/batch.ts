import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../_lib/firebase-admin';
import { BatchImportSchema } from '../_lib/validation';
import { normalizeCodigo, cleanDigits, getDeterministicItemId } from '../_lib/id';
import { sendSuccess, sendError } from '../_lib/response';
import { logApi } from '../_lib/logger';

export default async function handler(req: any, res: any) {
  const startTime = Date.now();

  if (req.method !== 'POST') {
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido');
  }

  try {
    const parseResult = BatchImportSchema.safeParse(req.body);
    if (!parseResult.success) {
      return sendError(res, 400, 'INVALID_PAYLOAD', 'Dados do lote inválidos', parseResult.error.format());
    }

    const { listaId, items, overwrite } = parseResult.data;
    const { db } = adminDb;

    const listaRef = db.collection('coleta_listas').doc(listaId);
    const listaSnap = await listaRef.get();
    if (!listaSnap.exists) {
      return sendError(res, 404, 'LISTA_NOT_FOUND', 'Lista de coleta não encontrada');
    }

    const listaData = listaSnap.data() || {};
    const itemsCol = listaRef.collection('itens');

    let inserted = 0;
    let updated = 0;
    let duplicates = 0;
    let failed = 0;

    const nowMs = Date.now();
    const nowBR = new Date().toLocaleString('pt-BR');

    // Chunks seguros de 400 (limite do Firestore é 500 por batch)
    const CHUNK_SIZE = 400;

    // Deduplicação inicial em memória pelo código normalizado
    const uniqueMap = new Map<string, any>();
    for (const rawItem of items) {
      const code = normalizeCodigo(rawItem.codigo);
      if (!code) {
        failed++;
        continue;
      }
      if (uniqueMap.has(code)) {
        duplicates++;
        continue;
      }
      uniqueMap.set(code, rawItem);
    }

    const uniqueItems = Array.from(uniqueMap.values());

    for (let i = 0; i < uniqueItems.length; i += CHUNK_SIZE) {
      const chunk = uniqueItems.slice(i, i + CHUNK_SIZE);
      const batch = db.batch();

      // Busca prévia em paralelo para verificar documentos existentes neste chunk
      const refs = chunk.map((item) => {
        const cleanCode = normalizeCodigo(item.codigo);
        const docId = getDeterministicItemId(cleanCode);
        return { item, cleanCode, docId, ref: itemsCol.doc(docId) };
      });

      const docSnaps = await db.getAll(...refs.map((r) => r.ref));

      refs.forEach((itemObj, index) => {
        const snap = docSnaps[index];
        const exists = snap && snap.exists;

        if (exists && !overwrite) {
          duplicates++;
          return;
        }

        const cleanCode = itemObj.cleanCode;
        const item = itemObj.item;
        const itemData = {
          id: itemObj.docId,
          codigo: cleanCode,
          codigoClean: cleanDigits(cleanCode),
          rota: item.rota || listaData.rota || 'Sem Rota',
          saida: item.saida || listaData.saidaPadrao || 'Ciclo 2 - Saída PM',
          motivo: item.motivo || listaData.motivoPadrao || 'Pendente',
          scannedAt: item.scannedAt || nowBR,
          responsavel: item.responsavel || 'Operador',
          grupoId: item.grupoId || undefined,
          validado: Boolean(item.validado),
          timestamp: nowMs - index * 2,
          updatedAt: FieldValue.serverTimestamp(),
          ...(exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
        };

        batch.set(itemObj.ref, itemData, { merge: true });

        if (exists) {
          updated++;
        } else {
          inserted++;
        }
      });

      await batch.commit();
    }

    // Atualizar contadores na lista pai com contagem real e exata
    try {
      const countSnap = await listaRef.collection('itens').count().get();
      const realTotal = countSnap.data().count;
      await listaRef.set(
        {
          totalItens: realTotal,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (_) {}

    const summary = {
      received: items.length,
      inserted,
      updated,
      duplicates,
      failed,
    };

    logApi('info', 'Importação em lote concluída', {
      endpoint: '/api/coleta/batch',
      listaId,
      ...summary,
      durationMs: Date.now() - startTime,
    });

    return sendSuccess(res, summary);
  } catch (err: any) {
    return sendError(res, 500, 'BATCH_FAILED', 'Erro ao processar lote no servidor', err.message);
  }
}
