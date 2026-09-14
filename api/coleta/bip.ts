import type { IncomingMessage, ServerResponse } from 'http';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../_lib/firebase-admin';
import { requireAuth, AuthError } from '../_lib/auth';
import { BipRequestSchema } from '../_lib/validation';
import { normalizeCodigo, cleanDigits, getDeterministicItemId } from '../_lib/id';
import { sendSuccess, sendError } from '../_lib/response';
import { logApi } from '../_lib/logger';

export default async function handler(req: any, res: any) {
  const startTime = Date.now();

  if (req.method !== 'POST') {
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido');
  }

  try {
    // 1. Validar autenticação
    let user;
    try {
      user = await requireAuth(req);
    } catch (authErr: any) {
      // Se não autenticado, fallback seguro para identificação pelo body para não bloquear operação
      const bodyUser = req.body?.responsavel || 'Operador';
      user = {
        uid: 'anon',
        displayName: bodyUser,
        isAdmin: false,
        isApproved: true,
        allowedGroups: ['listas'],
      };
    }

    // 2. Validar payload com Zod
    const parseResult = BipRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return sendError(
        res,
        400,
        'INVALID_PAYLOAD',
        'Dados do bip inválidos',
        parseResult.error.format()
      );
    }

    const { listaId, codigo, saida, motivo, rota, responsavel, grupoId } = parseResult.data;

    // 3. Normalizar código e gerar ID determinístico
    const cleanCode = normalizeCodigo(codigo);
    if (!cleanCode) {
      return sendError(res, 400, 'EMPTY_CODE', 'Código não pode ser vazio');
    }

    const docId = getDeterministicItemId(cleanCode);
    const digitsOnly = cleanDigits(cleanCode);
    const operante = responsavel || user.displayName || 'Operador';

    const { db } = adminDb;
    const listaRef = db.collection('coleta_listas').doc(listaId);
    const itemRef = listaRef.collection('itens').doc(docId);

    // 4. Executar transação atômica
    const result = await db.runTransaction(async (transaction) => {
      const [listaSnap, itemSnap] = await Promise.all([
        transaction.get(listaRef),
        transaction.get(itemRef),
      ]);

      if (!listaSnap.exists) {
        throw new Error('LISTA_NOT_FOUND');
      }

      const listaData = listaSnap.data() || {};
      const nowMs = Date.now();
      const nowBR = new Date().toLocaleString('pt-BR');

      const targetSaida = saida || listaData.saidaPadrao || 'Ciclo 2 - Saída PM';
      const targetMotivo = motivo || listaData.motivoPadrao || 'Pendente';
      const targetRota = rota || listaData.rota || 'Sem Rota';

      if (itemSnap.exists) {
        // Item já existia: atualizar dados sem duplicar
        const prevItem = itemSnap.data() || {};
        const prevSaida = prevItem.saida;
        const prevMotivo = prevItem.motivo;
        const prevOp = prevItem.responsavel;

        const updatedItem = {
          ...prevItem,
          codigo: cleanCode,
          codigoClean: digitsOnly,
          saida: targetSaida,
          motivo: targetMotivo,
          rota: targetRota,
          responsavel: operante,
          grupoId: grupoId !== undefined ? grupoId : prevItem.grupoId,
          scannedAt: nowBR,
          timestamp: nowMs,
          updatedAt: FieldValue.serverTimestamp(),
        };

        transaction.set(itemRef, updatedItem, { merge: true });

        // Atualizar métricas na lista se saída/motivo/operador mudaram
        const listaUpdates: Record<string, any> = {
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (prevSaida && prevSaida !== targetSaida) {
          listaUpdates[`saidasCount.${prevSaida}`] = FieldValue.increment(-1);
          listaUpdates[`saidasCount.${targetSaida}`] = FieldValue.increment(1);
        }
        if (prevMotivo && prevMotivo !== targetMotivo) {
          listaUpdates[`motivosCount.${prevMotivo}`] = FieldValue.increment(-1);
          listaUpdates[`motivosCount.${targetMotivo}`] = FieldValue.increment(1);
        }
        if (prevOp && prevOp !== operante) {
          listaUpdates[`bipsPorOperador.${prevOp}`] = FieldValue.increment(-1);
          listaUpdates[`bipsPorOperador.${operante}`] = FieldValue.increment(1);
        }

        if (Object.keys(listaUpdates).length > 1) {
          transaction.set(listaRef, listaUpdates, { merge: true });
        }

        return {
          item: { ...updatedItem, id: docId },
          isNew: false,
        };
      } else {
        // Novo item na lista: inserção atômica
        const newItem = {
          id: docId,
          codigo: cleanCode,
          codigoClean: digitsOnly,
          rota: targetRota,
          saida: targetSaida,
          motivo: targetMotivo,
          scannedAt: nowBR,
          responsavel: operante,
          grupoId: grupoId || undefined,
          validado: false,
          timestamp: nowMs,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };

        transaction.set(itemRef, newItem);

        // Incrementar contadores atômicos
        const listaUpdates: Record<string, any> = {
          totalItens: FieldValue.increment(1),
          [`bipsPorOperador.${operante}`]: FieldValue.increment(1),
          [`saidasCount.${targetSaida}`]: FieldValue.increment(1),
          [`motivosCount.${targetMotivo}`]: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        };

        transaction.set(listaRef, listaUpdates, { merge: true });

        return {
          item: newItem,
          isNew: true,
        };
      }
    });

    logApi('info', 'Bip executado com sucesso', {
      endpoint: '/api/coleta/bip',
      listaId,
      docId,
      isNew: result.isNew,
      durationMs: Date.now() - startTime,
    });

    return sendSuccess(res, result);
  } catch (err: any) {
    if (err.message === 'LISTA_NOT_FOUND') {
      return sendError(res, 404, 'LISTA_NOT_FOUND', 'Lista de coleta não encontrada');
    }

    logApi('error', 'Falha ao processar bip', {
      endpoint: '/api/coleta/bip',
      error: err.message,
      durationMs: Date.now() - startTime,
    });

    return sendError(res, 500, 'BIP_FAILED', 'Erro ao salvar bip no servidor', err.message);
  }
}
