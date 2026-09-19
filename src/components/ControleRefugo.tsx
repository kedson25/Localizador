import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Papa from 'papaparse';
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Barcode,
  Trash2,
  XCircle,
  Lock,
  Unlock,
  Download,
  FilePlus,
  X,
  FolderPlus,
  ListPlus,
  Check,
  Star,
  RefreshCw
} from 'lucide-react';
import { RefugoRow, ColetaItem, ColetaLista } from '../types';
import {
  saveRefugo,
  clearRefugo,
  clearRefugoScans,
  listenToRefugo,
  listenToRefugoScansIncremental,
  deleteRefugoScan,
  saveLista,
  listenToListas,
  addItemsBatchToLista,
  getAllItemsForExport,
  RefugoScan,
  RefugoScanChange
} from '../lib/firebase';
import { cleanTrackingId, normalizeTrackingCode } from '../utils/csvParser';
import { RefugoSyncQueue } from '../utils/refugoSyncQueue';
import type { User } from '../lib/auth';
import { ResultPagination, RESULTS_PAGE_SIZE } from './ResultPagination';
import { PageSkeleton } from './PageSkeleton';

let audioCtx: AudioContext | null = null;
const playBeep = () => {
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);

    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  } catch (e) {
    console.warn("Audio beep error:", e);
  }
};

function formatFirestoreDate(
  value: unknown
): string | null {
  if (!value) return null;

  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as {
      toDate?: unknown
    }).toDate === 'function'
  ) {
    const date =
      (value as {
        toDate: () => Date
      }).toDate();

    return date.toLocaleString('pt-BR');
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'seconds' in value
  ) {
    const seconds =
      Number(
        (value as {
          seconds: number
        }).seconds
      );

    if (Number.isFinite(seconds)) {
      return new Date(
        seconds * 1000
      ).toLocaleString('pt-BR');
    }
  }

  const date = new Date(
    value as string | number | Date
  );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date.toLocaleString('pt-BR');
}


const normalizeRoute = (route?: string | null) =>
  String(route || '').trim().toUpperCase();

const isSemRotaScan = (scan: Pick<RefugoScan, 'status' | 'rota'>) => {
  const route = normalizeRoute(scan.rota);
  return (
    scan.status === 'not_found' ||
    !route ||
    route === 'SEM ROTA' ||
    route.includes('BRANCA')
  );
};

const getScanTimestamp = (scan?: RefugoScan | null) => {
  const value = Number(scan?.timestamp || 0);
  return Number.isFinite(value) ? value : 0;
};

export function ControleRefugo({ currentUser }: { currentUser?: User | null }) {
  const [rows, setRows] = useState<RefugoRow[]>([]);
  const [scannedItems, setScannedItems] = useState<RefugoScan[]>([]);
  const [bipInput, setBipInput] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [lastScanResult, setLastScanResult] = useState<{
    status: 'success' | 'error' | 'high_priority' | 'high_priority_no_route' | 'success_no_route';
    message: string;
    rota?: string;
    id?: string;
  } | null>(null);

  const [baseDate, setBaseDate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [scansReady, setScansReady] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  // Busy state exclusivo para ações administrativas pesadas (upload CSV, clear, export)
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const resettingRefugoRef = useRef(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(0);

  // Índice em memória ultra-rápido de scans para verificação de duplicidade O(1) e merge realtime
  const scanByCodeRef = useRef<Map<string, RefugoScan>>(new Map());

  // Bips otimistas ainda não confirmados pelo listener realtime.
  // Impede que eventos antigos/removidos façam o contador voltar para trás.
  const pendingLocalScansRef = useRef<Map<string, RefugoScan>>(new Map());

  // Fila de sincronização em memória (executa gravações em background sem travar o scanner)
  const syncQueueRef = useRef<RefugoSyncQueue>(new RefugoSyncQueue());

  // Modal de exportação para Lista Branca
  const [existingListas, setExistingListas] = useState<ColetaLista[]>([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportDestinationType, setExportDestinationType] = useState<'new' | 'existing'>('new');
  const [exportListName, setExportListName] = useState('');
  const [selectedListId, setSelectedListId] = useState('');
  const [exportSaida, setExportSaida] = useState('Ciclo 2 - Saída PM');
  const [exportMotivo, setExportMotivo] = useState('Brancas');
  const [exportTargetCodes, setExportTargetCodes] = useState<string[]>([]);

  const resetRefugoLocalState = useCallback(() => {
    setRows([]);
    setScannedItems([]);
    scanByCodeRef.current.clear();
    pendingLocalScansRef.current.clear();
    setBipInput('');
    setLastScanResult(null);
    setBaseDate(null);
    setExportTargetCodes([]);
    setShowExportModal(false);
    setExportListName('');
    setSelectedListId('');
    setExportDestinationType('new');
    setPage(0);
    setPendingSyncCount(0);
    setSyncError(null);
  }, []);

  const showError = useCallback((error: unknown) => {
    setSyncError(error instanceof Error ? error.message : 'Não foi possível confirmar a operação no servidor. Tente novamente.');
  }, []);

  // Índice O(1) para lookups de pacotes da base CSV
  const rowByCode = useMemo(() => {
    const map = new Map<string, RefugoRow>();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      map.set(normalizeTrackingCode(row.id), row);
    }
    return map;
  }, [rows]);

  // Contadores derivados de uma única fonte de verdade.
  // "Sem Rota" inclui not_found, rota vazia, SEM ROTA e Brancas.
  const stats = useMemo(() => {
    let found = 0;
    let notFound = 0;
    let highPriority = 0;

    for (let i = 0; i < scannedItems.length; i++) {
      const scan = scannedItems[i];
      const normalizedId =
        scan.normalizedId || normalizeTrackingCode(scan.id);
      const row = rowByCode.get(normalizedId);

      if (isSemRotaScan(scan)) {
        notFound++;
      } else {
        found++;
      }

      if (row?.isHighPriority) {
        highPriority++;
      }
    }

    return {
      found,
      notFound,
      highPriority,
      total: scannedItems.length
    };
  }, [scannedItems, rowByCode]);

  const semRotaCount = stats.notFound;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(scannedItems.length / RESULTS_PAGE_SIZE) - 1));

  // Foco do scanner sem roubar o foco de modais, selects, botões ou outros inputs.
  const focusScanner = useCallback((force = false) => {
    if (
      isLocked ||
      busy ||
      showExportModal ||
      !inputRef.current ||
      document.activeElement === inputRef.current
    ) {
      return;
    }

    const activeElement = document.activeElement as HTMLElement | null;
    const activeTag = activeElement?.tagName;

    if (
      !force &&
      activeElement &&
      activeElement !== document.body &&
      (
        activeTag === 'INPUT' ||
        activeTag === 'TEXTAREA' ||
        activeTag === 'SELECT' ||
        activeTag === 'BUTTON' ||
        activeElement.isContentEditable
      )
    ) {
      return;
    }

    inputRef.current.focus({ preventScroll: true });
  }, [isLocked, busy, showExportModal]);

  // Foco inicial / ao destravar.
  useEffect(() => {
    if (!isLocked && !showExportModal && !busy) {
      requestAnimationFrame(() => focusScanner(true));
    }
  }, [isLocked, showExportModal, busy, focusScanner]);

  // Fecha o modal com Escape e evita scroll da página enquanto ele estiver aberto.
  useEffect(() => {
    if (!showExportModal) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowExportModal(false);
        setExportTargetCodes([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showExportModal]);

  // Configuração dos callbacks da fila de sincronização em memória
  useEffect(() => {
    syncQueueRef.current.setCallbacks({
      onQueueChange: (count) => {
        setPendingSyncCount(count);
      },
      onSyncError: (err, scan) => {
        setSyncError(`Aviso de sincronização: pacote ${scan.id} não pôde ser salvo no servidor. Verifique sua conexão.`);
      },
      onSyncSuccess: () => {
        setSyncError(null);
      }
    });
  }, []);

  const parseCSV = useCallback((text: string): RefugoRow[] => {
    const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
    if (result.errors.some(error => error.type === 'Quotes')) {
      throw new Error('O arquivo CSV contém aspas inválidas. Confira o arquivo.');
    }

    const headerRow = result.data.find(values => {
      const id = String(values[0] || '').trim().toUpperCase();
      return ['ID', 'CODIGO', 'CÓDIGO', 'PACOTE', 'TRACKING', 'ENVIO'].includes(id);
    });

    let valorRealIndex = -1;
    let valorUsdIndex = -1;

    if (headerRow) {
      headerRow.forEach((col, idx) => {
        const c = String(col).trim().toUpperCase();
        if (c.includes('VALOR REAL')) valorRealIndex = idx;
        if (c.includes('VALOR USD')) valorUsdIndex = idx;
      });
    } else {
      valorRealIndex = 5;
      valorUsdIndex = 6;
    }

    return result.data.flatMap(values => {
      const id = String(values[0] || '').trim().toUpperCase();
      if (!id || ['ID', 'CODIGO', 'CÓDIGO', 'PACOTE', 'TRACKING', 'ENVIO'].includes(id)) return [];

      let isHighPriority = false;
      [valorRealIndex, valorUsdIndex].forEach(idx => {
        if (idx >= 0 && values[idx]) {
          const valStr = values[idx].replace(/\./g, '').replace(',', '.').trim();
          const val = parseFloat(valStr);
          if (!isNaN(val) && val > 1000) {
            isHighPriority = true;
          }
        }
      });

      return [{
        id,
        rota: String(values[1] || 'Sem Rota').trim(),
        isHighPriority,
        rawFields: Object.fromEntries(values.map((value, index) => [String(index), value]))
      }];
    });
  }, []);

  // Inscrição aos dados: CSV de Refugo e Scans incrementais
  useEffect(() => {
    const unsubRefugo = listenToRefugo(data => {
      if (resettingRefugoRef.current) {
        if (!data) {
          setRows([]);
          setBaseDate(null);
        }
        return;
      }

      try {
        setRows(
          data?.rawText
            ? parseCSV(data.rawText)
            : []
        );
        setBaseDate(formatFirestoreDate(data?.updatedAt));
      } catch (error) {
        setRows([]);
        setBaseDate(null);
        showError(error);
      }
      setIsLoading(false);
    });

    // Processamento incremental com reconciliação segura entre UI otimista e Firestore.
    const unsubScans = listenToRefugoScansIncremental(
      (changes: RefugoScanChange[], isInitial: boolean, initialScans?: RefugoScan[]) => {
        if (isInitial) {
          const map = new Map<string, RefugoScan>();
          const source = initialScans || [];

          for (let i = 0; i < source.length; i++) {
            const scan = source[i];
            const normalizedId =
              scan.normalizedId || normalizeTrackingCode(scan.id);

            map.set(normalizedId, {
              ...scan,
              normalizedId
            });
          }

          // Se houver bips otimistas durante uma reconexão, preserve a versão
          // local até o servidor confirmar; o snapshot inicial não pode fazê-los sumir.
          pendingLocalScansRef.current.forEach((pendingScan, normalizedId) => {
            const remoteScan = map.get(normalizedId);
            const remoteTimestamp = getScanTimestamp(remoteScan);
            const pendingTimestamp = getScanTimestamp(pendingScan);

            if (
              !remoteScan ||
              remoteTimestamp === 0 ||
              pendingTimestamp >= remoteTimestamp
            ) {
              map.set(normalizedId, pendingScan);
            }
          });

          scanByCodeRef.current = map;
          setScannedItems(
            Array.from(map.values()).sort(
              (a, b) => getScanTimestamp(b) - getScanTimestamp(a)
            )
          );
          setScansReady(true);
          return;
        }

        if (!changes || changes.length === 0) {
          return;
        }

        setScannedItems(prev => {
          let updated = prev;
          let hasChanges = false;

          const ensureMutable = () => {
            if (!hasChanges) {
              updated = [...prev];
              hasChanges = true;
            }
          };

          for (let i = 0; i < changes.length; i++) {
            const change = changes[i];
            const scan = change.scan;
            const normalizedId =
              scan.normalizedId || normalizeTrackingCode(scan.id);

            const incomingScan: RefugoScan = {
              ...scan,
              normalizedId
            };

            const pendingLocal =
              pendingLocalScansRef.current.get(normalizedId);
            const currentLocal =
              scanByCodeRef.current.get(normalizedId);

            const incomingTimestamp =
              getScanTimestamp(incomingScan);
            const localTimestamp =
              getScanTimestamp(pendingLocal || currentLocal);

            // Se o servidor mandar uma versão comprovadamente mais antiga,
            // mantém o bip otimista mais novo.
            const incomingIsOlder =
              Boolean(pendingLocal) &&
              incomingTimestamp > 0 &&
              localTimestamp > incomingTimestamp;

            if (change.type === 'added' || change.type === 'modified') {
              if (incomingIsOlder) {
                continue;
              }

              // O listener confirmou o scan local (ou trouxe uma versão mais nova).
              pendingLocalScansRef.current.delete(normalizedId);
              scanByCodeRef.current.set(normalizedId, incomingScan);

              const index = updated.findIndex(item => {
                const itemId =
                  item.normalizedId || normalizeTrackingCode(item.id);
                return itemId === normalizedId;
              });

              ensureMutable();

              if (index >= 0) {
                updated[index] = incomingScan;
              } else {
                updated = [
                  incomingScan,
                  ...updated.filter(item => {
                    const itemId =
                      item.normalizedId ||
                      normalizeTrackingCode(item.id);
                    return itemId !== normalizedId;
                  })
                ];
              }

              continue;
            }

            if (change.type === 'removed') {
              // Um "removed" atrasado nunca pode apagar um bip que ainda
              // está aguardando confirmação de gravação.
              if (pendingLocal) {
                continue;
              }

              // Também ignora remoção baseada em uma versão mais antiga
              // que a versão atualmente mantida na UI.
              if (
                currentLocal &&
                incomingTimestamp > 0 &&
                getScanTimestamp(currentLocal) > incomingTimestamp
              ) {
                continue;
              }

              scanByCodeRef.current.delete(normalizedId);

              const filtered = updated.filter(item => {
                const itemId =
                  item.normalizedId || normalizeTrackingCode(item.id);
                return itemId !== normalizedId;
              });

              if (filtered.length !== updated.length) {
                updated = filtered;
                hasChanges = true;
              }
            }
          }

          return hasChanges ? updated : prev;
        });
      }
    );

    // Carregamento lazy/background das listas de coleta (NÃO bloqueia a inicialização do scanner)
    const unsubListas = listenToListas(data => {
      setExistingListas(data);
    });

    return () => {
      unsubRefugo();
      unsubScans();
      unsubListas();
    };
  }, [parseCSV, showError]);

  // Função para operações administrativas pesadas (upload CSV, limpar base, exportar)
  const runOperation = async (operation: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await operation();
      setSyncError(null);
    } catch (error) {
      showError(error);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  /**
   * FLUXO DO SCANNER ULTRA-RÁPIDO (< 5ms):
   * O scanner NUNCA espera o Firestore para permitir o próximo bip!
   * 1. Normalizar ID
   * 2. Verificar duplicidade no Map local O(1)
   * 3. Buscar pacote no rowByCode O(1)
   * 4. Limpar input e devolver foco imediatamente
   * 5. Mostrar resultado visual imediatamente
   * 6. Tocar som imediatamente
   * 7. Atualizar histórico local otimisticamente
   * 8. Enfileirar gravação remota em background na fila de sincronização
   */
  const handleBip = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bipInput.trim() || isLocked) return;

    const rawInput = bipInput;
    const cleanInput = cleanTrackingId(rawInput);
    if (!cleanInput) {
      setBipInput('');
      requestAnimationFrame(() => focusScanner(true));
      return;
    }

    const key = normalizeTrackingCode(cleanInput);

    // 1. Verificação instantânea de duplicidade no índice local
    const alreadyScanned = scanByCodeRef.current.get(key);
    if (alreadyScanned) {
      setLastScanResult({
        status: alreadyScanned.status === 'found' ? 'success' : 'error',
        message: 'O pacote já foi bipado anteriormente!',
        id: alreadyScanned.id,
        rota: alreadyScanned.rota
      });
      setBipInput('');
      requestAnimationFrame(() => focusScanner(true));
      return;
    }

    // 2. Busca O(1) na base CSV
    const foundRow = rowByCode.get(key);

    // 3. Monta o objeto de scan
    const newScan: RefugoScan = {
      id: foundRow?.id || cleanInput,
      normalizedId: key,
      rota: foundRow?.rota || '',
      scannedAt: new Date().toLocaleString('pt-BR'),
      timestamp: Date.now(),
      status: foundRow ? 'found' : 'not_found',
      foundBy: currentUser?.username || 'Operador',
      firestoreId: key
    };

    // 4. Registro local imediato no índice e no estado da UI (0ms de latência)
    scanByCodeRef.current.set(key, newScan);
    setScannedItems(prev => [newScan, ...prev.filter(s => s.normalizedId !== key)]);

    // 5. Limpa input e devolve o foco imediatamente para o próximo bip
    setBipInput('');
    requestAnimationFrame(() => focusScanner(true));

    // 6. Feedback visual imediato
    const isSemRota = isSemRotaScan({
      status: foundRow ? 'found' : 'not_found',
      rota: foundRow?.rota || ''
    });
    if (foundRow) {
      if (foundRow.isHighPriority) {
        setLastScanResult({
          status: isSemRota ? 'high_priority_no_route' : 'high_priority',
          message: '',
          rota: foundRow.rota,
          id: foundRow.id
        });
      } else {
        setLastScanResult({
          status: isSemRota ? 'success_no_route' : 'success',
          message: 'Pacote localizado!',
          rota: foundRow.rota,
          id: foundRow.id
        });
      }
    } else {
      setLastScanResult({
        status: 'error',
        message: `Bipado: ${cleanInput}`,
        id: cleanInput
      });
    }

    // 7. Som instantâneo
    playBeep();

    // 8. Garante visualização na primeira página
    setPage(0);

    // 9. Marca como pendente antes de enfileirar, evitando race com eventos realtime antigos.
    pendingLocalScansRef.current.set(key, newScan);
    syncQueueRef.current.enqueue(newScan);
  };

  /**
   * Exclusão instantânea de scan (0ms na UI com sincronização em background)
   */
  const removeScan = async (scan: RefugoScan) => {
    const targetId = scan.normalizedId || normalizeTrackingCode(scan.id);
    const prevScan = scanByCodeRef.current.get(targetId);

    // Remove imediatamente da UI e do índice local
    scanByCodeRef.current.delete(targetId);
    pendingLocalScansRef.current.delete(targetId);
    setScannedItems(prev => prev.filter(s => s.normalizedId !== targetId && s.id !== scan.id));
    syncQueueRef.current.cancel(targetId);

    // Executa deleção no Firestore em background
    try {
      await deleteRefugoScan(targetId);
    } catch (error) {
      // Em caso de falha de conexão, restaura o item e avisa o operador
      if (prevScan) {
        scanByCodeRef.current.set(targetId, prevScan);
        setScannedItems(prev => [prevScan, ...prev]);
      }
      showError(error);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await runOperation(async () => {
      const text = await file.text();
      const parsed = parseCSV(text);
      await saveRefugo(text, parsed.length);
      setLastScanResult(null);
      setPage(0);
    });
  };

  const clearData = async () => {
    const confirmed = window.confirm(
      'Deseja realmente limpar a base de faltantes? Isso também apagará os itens bipados.'
    );

    if (!confirmed) return;

    await runOperation(async () => {
      resettingRefugoRef.current = true;
      try {
        await syncQueueRef.current.resetAndWait();
        await clearRefugo();
        await clearRefugoScans();
        resetRefugoLocalState();
      } catch (error) {
        showError(error);
        setExportTargetCodes([]);
        setShowExportModal(false);
        throw error;
      } finally {
        resettingRefugoRef.current = false;
      }
    });
  };

  const clearScans = async () => {
    const confirmed = window.confirm(
      'Deseja limpar apenas o histórico de pacotes bipados?'
    );

    if (!confirmed) return;

    await runOperation(async () => {
      // Aguarda/cancela a fila antes de limpar o servidor para impedir
      // que uma gravação atrasada recrie itens depois do reset.
      await syncQueueRef.current.resetAndWait();
      scanByCodeRef.current.clear();
      pendingLocalScansRef.current.clear();
      await clearRefugoScans();

      setScannedItems([]);

      setExportTargetCodes([]);

      setShowExportModal(false);

      setLastScanResult(null);

      setPage(0);
    });
  };

  const exportScannedCSV = () => {
    if (scannedItems.length === 0) return;
    const csvContent = "ID,ROTA,ENCONTRADO POR\n" + scannedItems.map(r => `${r.id},${r.status === 'found' ? r.rota : 'SEM ROTA'},${r.foundBy || ''}`).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "log_coletor_bipados.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const closeExportModal = useCallback(() => {
    setShowExportModal(false);
    setExportTargetCodes([]);
  }, []);

  const canExportRefugo = scannedItems.length > 0;

  const handleOpenExportModal = () => {
    // Nunca reutilizar seleção de exportação antiga
    setExportTargetCodes([]);

    if (scannedItems.length === 0) {
      setShowExportModal(false);

      alert(
        'Nenhum pacote bipado disponível para exportar.'
      );

      return;
    }

    const scannedSemRota =
      scannedItems.filter(isSemRotaScan);

    let targetCodes: string[] = [];

    if (scannedSemRota.length > 0) {
      targetCodes =
        scannedSemRota.map(scan =>
          scan.id.trim().toUpperCase()
        );
    } else {
      const confirmed = window.confirm(
        'Não foram encontrados pacotes SEM ROTA bipados. Deseja exportar todos os pacotes bipados?'
      );

      if (!confirmed) {
        return;
      }

      targetCodes =
        scannedItems.map(scan =>
          scan.id.trim().toUpperCase()
        );
    }

    const uniqueCodes = Array.from(
      new Set(targetCodes)
    ).filter(Boolean);

    if (uniqueCodes.length === 0) {
      setShowExportModal(false);
      setExportTargetCodes([]);

      alert(
        'Nenhum pacote disponível para exportar.'
      );

      return;
    }

    setExportTargetCodes(uniqueCodes);

    const now = new Date();
    const todayBR = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    setExportListName(`Lista Branca - Refugo (${todayBR})`);
    setExportDestinationType('new');
    if (existingListas.length > 0) {
      setSelectedListId(existingListas[0].id);
    }
    setShowExportModal(true);
  };

  const handleConfirmExport = async () => {
    if (exportTargetCodes.length === 0 || busyRef.current) return;

    const currentAvailableCodes = new Set<string>([
      ...rows.map(row =>
        normalizeTrackingCode(row.id)
      ),
      ...scannedItems.map(scan =>
        scan.normalizedId ||
        normalizeTrackingCode(scan.id)
      )
    ]);

    const validExportCodes =
      exportTargetCodes.filter(code => {
        const normalized =
          normalizeTrackingCode(code);

        return currentAvailableCodes.has(
          normalized
        );
      });

    if (
      validExportCodes.length === 0
    ) {
      setExportTargetCodes([]);
      setShowExportModal(false);

      alert(
        'A base foi alterada ou limpa. Nenhum pacote disponível para exportar.'
      );

      return;
    }

    const operatorName = currentUser?.username || 'Operador';
    const now = new Date();
    const todayBR = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

    const newColetaItens: ColetaItem[] =
      validExportCodes.map((code, index) => ({
        id: `item-${Date.now()}-${index}-${Math.random()
          .toString(36)
          .substring(2, 5)}`,
        codigo: code,
        rota: 'Brancas',
        saida: exportSaida,
        motivo: exportMotivo,
        scannedAt: new Date().toISOString(),
        responsavel: operatorName,
        validado: true
      }));

    busyRef.current = true;
    setBusy(true);
    try {
      if (exportDestinationType === 'new') {
        const novaLista: ColetaLista = {
          id: `lista-${Date.now()}`,
          nome: exportListName.trim() || `Lista Branca - Refugo (${todayBR})`,
          tipo: 'comum',
          rota: 'Brancas',
          data: todayBR,
          responsavel: operatorName,
          status: 'em_andamento',
          saidaPadrao: exportSaida,
          motivoPadrao: exportMotivo,
          itens: newColetaItens
        };
        await saveLista(novaLista, true);
      } else {
        const targetList = existingListas.find(l => l.id === selectedListId);
        if (!targetList) {
          alert('Selecione uma lista existente válida.');
          return;
        }

        const currentItens = await getAllItemsForExport(targetList.id);
        const existingCodes = new Set(currentItens.map(i => i.codigo.toUpperCase()));
        const uniqueNewItems = newColetaItens.filter(i => !existingCodes.has(i.codigo.toUpperCase()));

        if (uniqueNewItems.length > 0) {
          await addItemsBatchToLista(targetList.id, uniqueNewItems);
        }
      }

      const csvHeader = "ID,ROTA\n";
      const csvBody =
        validExportCodes
          .map(code => `${code},Brancas`)
          .join('\n');
      const blob = new Blob([csvHeader + csvBody], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `lista_branca_refugo_${todayBR.replace(/\//g, '-')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setShowExportModal(false);
      setExportTargetCodes([]);
      setSelectedListId('');
      setExportListName('');

      alert(
        `✅ Exportação concluída!\n\n${validExportCodes.length} pacote(s) exportado(s).`
      );
    } catch (err) {
      showError(err);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // O scanner abre imediatamente após carregar o CSV e scans iniciais (NÃO depende de listasReady)
  if (isLoading || !scansReady) {
    return <PageSkeleton variant="detail" className="mx-auto max-w-7xl pb-12" />;
  }

  return (
    <div className="max-w-7xl mx-auto w-full min-w-0 overflow-x-hidden pb-12">
      {syncError && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-center justify-between">
          <span>{syncError}</span>
          <button onClick={() => setSyncError(null)} className="text-red-500 hover:text-red-700 font-bold ml-2">✕</button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-gray-300 rounded-2xl p-6 sm:p-12 flex flex-col items-center justify-center text-center mt-4 min-w-0">
          <div className="w-16 h-16 bg-[#E3F2FD] rounded-2xl flex items-center justify-center mb-4">
            <UploadCloud className="w-8 h-8 text-[#3483FA]" />
          </div>
          <h2 className="text-xl font-bold text-[#333333] mb-2">Controle de Refugo</h2>
          <p className="text-gray-500 mb-6 max-w-md">
            Importe a lista de pacotes faltantes em CSV para começar a bipar e dar baixa.
          </p>
          <label className="cursor-pointer bg-[#3483FA] hover:bg-blue-600 text-white px-6 py-3 rounded-xl text-sm font-bold shadow-sm transition-colors flex items-center gap-2">
            <UploadCloud className="w-5 h-5" />
            Carregar Base CSV
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      ) : (
        <div className="space-y-4 w-full mt-2">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 w-full min-w-0 items-stretch">
            {/* Scanner Area */}
            <div className="space-y-4 min-w-0">
              <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-8 shadow-sm h-full flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4 sm:mb-6">
                    <h3 className="text-xs sm:text-sm font-bold text-[#333333] uppercase tracking-wider">Leitura de Pacotes</h3>
                    {baseDate && (
                      <span className="text-[11px] sm:text-xs text-gray-400 font-medium truncate max-w-[55%]" title={baseDate || undefined}>
                        Base: {baseDate}
                      </span>
                    )}
                  </div>

                  <form onSubmit={handleBip} className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2 sm:mb-3">
                        <label className="block text-xs sm:text-sm font-bold text-gray-700">
                          Bipe o ID do pacote (Leitura Instantânea)
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const nextLocked = !isLocked;
                            setIsLocked(nextLocked);
                            if (!nextLocked) {
                              requestAnimationFrame(() => inputRef.current?.focus());
                            }
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors shadow-sm border cursor-pointer min-h-[36px] sm:min-h-0 ${
                            isLocked
                              ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          }`}
                        >
                          {isLocked ? (
                            <><Lock className="w-4 h-4" /> Bip Travado</>
                          ) : (
                            <><Unlock className="w-4 h-4" /> Bip Liberado</>
                          )}
                        </button>
                      </div>

                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 sm:pl-5 flex items-center pointer-events-none">
                          <Barcode className={`h-6 w-6 sm:h-8 sm:w-8 ${isLocked ? 'text-gray-300' : 'text-[#3483FA]'}`} />
                        </div>
                        <input
                          ref={inputRef}
                          type="text"
                          value={bipInput}
                          onChange={(e) => setBipInput(e.target.value)}
                          onBlur={() => {
                            if (!isLocked) {
                              requestAnimationFrame(() => focusScanner(false));
                            }
                          }}
                          disabled={isLocked}
                          className={`block w-full pl-12 sm:pl-16 pr-4 sm:pr-6 py-4 sm:py-7 border-2 rounded-xl text-xl sm:text-3xl font-mono font-bold transition-all min-h-[54px] ${
                            isLocked
                              ? 'bg-gray-50 border-gray-200 text-gray-400 placeholder-gray-300 cursor-not-allowed'
                              : 'border-[#3483FA]/30 focus:ring-4 focus:ring-[#3483FA]/20 focus:border-[#3483FA] text-[#333333] placeholder-gray-300'
                          }`}
                          placeholder={isLocked ? "SISTEMA TRAVADO" : "MLB..."}
                          autoFocus
                          autoComplete="off"
                          autoCorrect="off"
                          spellCheck="false"
                        />
                      </div>
                      <p className="text-[11px] sm:text-xs text-gray-400 mt-2.5 text-center font-medium">
                        {isLocked ? 'Desbloqueie para voltar a ler pacotes.' : 'Resposta imediata do bip com gravação em segundo plano.'}
                      </p>
                    </div>
                    <button type="submit" className="hidden" disabled={isLocked}>Verificar</button>
                  </form>
                </div>

                <div className="mt-6 sm:mt-8 min-h-[240px] sm:min-h-[320px] flex w-full min-w-0">
                {lastScanResult ? (
                  <div className={`w-full p-4 sm:p-8 rounded-2xl border-2 flex flex-col items-center justify-center text-center max-w-full overflow-hidden ${
                    lastScanResult.status === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                    lastScanResult.status === 'success_no_route' ? 'bg-orange-50 border-orange-200 text-orange-800' :
                    lastScanResult.status === 'high_priority' ? 'bg-yellow-400 border-yellow-500 text-yellow-900 shadow-[0_0_30px_rgba(250,204,21,0.5)]' :
                    lastScanResult.status === 'high_priority_no_route' ? 'bg-red-600 border-red-700 text-white shadow-[0_0_30px_rgba(220,38,38,0.6)]' :
                    'bg-red-50 border-red-200 text-red-800'
                  }`}>
                    {lastScanResult.status === 'high_priority' ? (
                      <AlertCircle className="w-14 h-14 sm:w-20 sm:h-20 text-yellow-800 mb-3 sm:mb-4" />
                    ) : lastScanResult.status === 'high_priority_no_route' ? (
                      <Star className="w-14 h-14 sm:w-20 sm:h-20 text-white mb-3 sm:mb-4 fill-yellow-400" />
                    ) : lastScanResult.status === 'success' || lastScanResult.status === 'success_no_route' ? (
                      <CheckCircle2 className={`w-14 h-14 sm:w-20 sm:h-20 mb-3 sm:mb-4 ${lastScanResult.status === 'success_no_route' ? 'text-orange-500' : 'text-emerald-500'}`} />
                    ) : (
                      <XCircle className="w-14 h-14 sm:w-20 sm:h-20 text-red-500 mb-3 sm:mb-4" />
                    )}
                    <div className="font-black text-xl sm:text-3xl uppercase tracking-wide flex flex-col items-center gap-2 sm:gap-3 max-w-full">
                      <span>{lastScanResult.status === 'high_priority' || lastScanResult.status === 'high_priority_no_route' ? 'ALTA PRIORIDADE BPP' : lastScanResult.status === 'success' || lastScanResult.status === 'success_no_route' ? 'ENCONTRADO' : 'NÃO ENCONTRADO'}</span>
                      {(lastScanResult.status === 'high_priority' || lastScanResult.status === 'high_priority_no_route') && lastScanResult.id && (
                        <span className="text-xl sm:text-3xl md:text-4xl font-mono bg-black/10 px-3 sm:px-6 py-1 sm:py-2 rounded-xl mt-1 tracking-widest break-all max-w-full">{lastScanResult.id}</span>
                      )}
                    </div>
                    <p className={`text-sm sm:text-xl font-bold mt-2 break-words ${lastScanResult.status === 'high_priority_no_route' ? 'text-red-100' : ''}`}>{lastScanResult.message}</p>
                    {lastScanResult.rota && (
                      <div className={`mt-3 sm:mt-4 px-4 sm:px-6 py-1.5 sm:py-2 rounded-lg text-lg sm:text-2xl font-black shadow-sm uppercase break-words max-w-full ${
                        lastScanResult.status === 'high_priority' ? 'bg-yellow-100 text-yellow-900' :
                        lastScanResult.status === 'high_priority_no_route' ? 'bg-red-800 text-white' :
                        lastScanResult.status === 'success_no_route' ? 'bg-orange-100 text-orange-900' :
                        'bg-white text-emerald-900'
                      }`}>
                        {lastScanResult.status === 'success_no_route' || lastScanResult.status === 'high_priority_no_route' || lastScanResult.rota.toUpperCase().includes('SEM ROTA') ? 'SEM ROTA' : `Rota: ${lastScanResult.rota}`}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-full min-h-[240px] sm:min-h-[320px] rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 flex flex-col items-center justify-center text-center px-4">
                    <Barcode className="w-10 h-10 text-gray-300 mb-3" />
                    <p className="text-sm font-bold text-gray-500">Aguardando leitura</p>
                    <p className="text-xs text-gray-400 mt-1">O resultado do próximo bip aparecerá aqui.</p>
                  </div>
                )}
                </div>
              </div>
            </div>

            {/* Scanned List Area */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm flex flex-col h-full min-h-[400px] sm:min-h-[500px] min-w-0 overflow-hidden">
              {/* Headers and Controls */}
              <div className="flex flex-col gap-3 sm:gap-4 mb-4 pb-4 border-b border-gray-100">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Histórico de Leitura</span>
                    {pendingSyncCount > 0 && (
                      <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md text-[11px] font-medium border border-amber-200 flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin text-amber-600" />
                        Sincronizando ({pendingSyncCount})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-start sm:justify-end">
                    <span className="bg-yellow-100 text-yellow-800 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md font-mono text-[11px] sm:text-xs font-bold border border-yellow-300 flex items-center gap-1 shadow-2xs">
                      <AlertCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-yellow-600 shrink-0" /> BPP: {stats.highPriority}
                    </span>
                    <span className="bg-emerald-100 text-emerald-800 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md font-mono text-[11px] sm:text-xs font-bold border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-600 shrink-0" /> Encontrados: {stats.found}
                    </span>
                    <span className="bg-red-100 text-red-800 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md font-mono text-[11px] sm:text-xs font-bold border border-red-200 flex items-center gap-1">
                      <XCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-red-600 shrink-0" /> Sem Rota: {stats.notFound}
                    </span>
                    <span className="bg-blue-100 text-blue-800 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md font-mono text-[11px] sm:text-xs font-bold border border-blue-200">
                      Total: {stats.total}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="cursor-pointer bg-[#3483FA] hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5 min-h-[36px] sm:min-h-0">
                    <UploadCloud className="w-4 h-4" />
                    <span>Carregar Base</span>
                    <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                  </label>
                  <button
                    onClick={clearData}
                    disabled={busy}
                    className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors flex items-center gap-1.5 disabled:opacity-50 min-h-[36px] sm:min-h-0 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Limpar</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenExportModal}
                    disabled={!canExportRefugo || semRotaCount === 0 || busy}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition-colors shadow-sm cursor-pointer border border-amber-600 min-h-[36px] sm:min-h-0 disabled:opacity-50"
                    title="Exporta pacotes sem rota (SEM ROTA) para uma Lista Branca no sistema e em CSV"
                  >
                    <FilePlus className="w-4 h-4" />
                    <span>Exportar Lista Branca</span>
                    {semRotaCount > 0 && (
                      <span className="bg-amber-700/60 text-white px-1.5 py-0.5 rounded text-[10px] font-mono">
                        {semRotaCount}
                      </span>
                    )}
                  </button>

                  {scannedItems.length > 0 && (
                    <>
                      <button
                        onClick={clearScans}
                        disabled={busy}
                        className="px-3 py-1.5 text-xs font-bold text-orange-600 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors flex items-center gap-1.5 disabled:opacity-50 min-h-[36px] sm:min-h-0 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Limpar Bipados</span>
                      </button>
                      <button
                        onClick={exportScannedCSV}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 text-[#333333] text-xs font-bold rounded-lg transition-colors border border-gray-300 shadow-sm min-h-[36px] sm:min-h-0 cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        <span>Baixar Bipados (CSV)</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              <ResultPagination total={scannedItems.length} page={currentPage} onPageChange={setPage} />

              <div className="overflow-y-auto overflow-x-hidden flex-1 pr-1 sm:pr-2 space-y-2 min-w-0">
                {scannedItems.length > 0 ? (
                  scannedItems.slice(currentPage * RESULTS_PAGE_SIZE, (currentPage + 1) * RESULTS_PAGE_SIZE).map((item) => {
                    const isItemSemRota = isSemRotaScan(item);
                    const itemRow = rowByCode.get(item.normalizedId || normalizeTrackingCode(item.id));
                    const isBpp = Boolean(itemRow?.isHighPriority);

                    let cardClasses = 'border-emerald-200 bg-emerald-50';
                    let idColor = 'text-emerald-900';
                    let badgeClasses = 'bg-emerald-100 text-emerald-800 border-emerald-200';

                    if (isItemSemRota) {
                      if (isBpp) {
                        cardClasses = 'border-yellow-300 bg-yellow-50';
                        idColor = 'text-yellow-900';
                        badgeClasses = 'bg-yellow-100 text-yellow-900 border-yellow-300';
                      } else {
                        cardClasses = 'border-red-200 bg-red-50';
                        idColor = 'text-red-900';
                        badgeClasses = 'bg-red-100 text-red-800 border-red-200';
                      }
                    }

                    return (
                      <div key={item.normalizedId || item.id} className={`flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors min-w-0 overflow-hidden ${cardClasses}`}>
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {!isItemSemRota ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          ) : isBpp ? (
                            <AlertCircle className="w-4 h-4 text-yellow-600 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                          )}
                          <span className={`font-mono font-bold text-sm truncate min-w-0 ${idColor}`} title={item.id}>{item.id}</span>
                          {isBpp && isItemSemRota && (
                            <span className="text-[10px] bg-yellow-200 text-yellow-800 font-bold px-1.5 py-0.5 rounded uppercase shrink-0">BPP</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 min-w-0 shrink-0 max-w-[58%]">
                          {!isItemSemRota ? (
                            <div className="flex flex-col items-end min-w-0">
                              <span className={`px-2.5 py-1 rounded text-xs font-bold border max-w-full truncate ${badgeClasses}`} title={item.rota || "SEM ROTA"}>
                                Rota: {item.rota}
                              </span>
                              {item.foundBy && (
                                <span className="text-[10px] text-gray-500 mt-0.5 font-medium">
                                  Encontrado por: <strong className="text-gray-700">{item.foundBy}</strong>
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col items-end min-w-0">
                              <span className={`px-2.5 py-1 rounded text-xs font-bold border max-w-full truncate ${badgeClasses}`}>
                                SEM ROTA
                              </span>
                              {item.foundBy && (
                                <span className="text-[10px] text-gray-500 mt-0.5 font-medium">
                                  Bipado por: <strong className="text-gray-700">{item.foundBy}</strong>
                                </span>
                              )}
                            </div>
                          )}
                          <button
                            onClick={() => removeScan(item)}
                            className="ml-1 shrink-0 text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50 border border-transparent hover:border-red-200"
                            title="Remover pacote"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-center text-gray-500">
                    <Barcode className="w-12 h-12 text-gray-300 mb-3" />
                    <p className="text-base font-bold text-[#333333]">Nenhum pacote bipado</p>
                    <p className="text-sm mt-1">Comece a ler os pacotes para ver o histórico.</p>
                  </div>
                )}
              </div>

              {scannedItems.length > 50 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <ResultPagination total={scannedItems.length} page={currentPage} onPageChange={setPage} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showExportModal && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeExportModal();
            }
          }}
        >
          <div
            className="bg-white rounded-2xl p-4 sm:p-6 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4 sm:mb-6">
              <div>
                <h2 className="text-lg sm:text-xl font-black text-gray-900 uppercase">Exportar Lista Branca</h2>
                <p className="text-xs sm:text-sm text-gray-500 mt-0.5 sm:mt-1 font-medium">Transferir pacotes sem rota para o sistema de coleta</p>
              </div>
              <button
                onClick={closeExportModal}
                className="text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-full p-2 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900">
                  <p className="font-bold text-sm text-amber-950">
                    {exportTargetCodes.length} pacote(s) sem rota selecionado(s)
                  </p>
                  <p className="mt-1 text-amber-800 line-clamp-2 font-mono">
                    {exportTargetCodes.slice(0, 6).join(', ')}{exportTargetCodes.length > 6 ? '...' : ''}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Destino da Exportação</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setExportDestinationType('new')}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
                      exportDestinationType === 'new' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <FolderPlus className="w-5 h-5 mb-1.5" />
                    <span className="text-xs font-bold uppercase">Criar Nova Lista</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportDestinationType('existing')}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
                      exportDestinationType === 'existing' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <ListPlus className="w-5 h-5 mb-1.5" />
                    <span className="text-xs font-bold uppercase">Lista Existente</span>
                  </button>
                </div>
              </div>

              {exportDestinationType === 'new' ? (
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Nome da Nova Lista</label>
                  <input
                    type="text"
                    value={exportListName}
                    onChange={(e) => setExportListName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-shadow"
                    placeholder="Ex: Lista Branca - Refugo"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Selecione a Lista</label>
                  {existingListas.length > 0 ? (
                    <select
                      value={selectedListId}
                      onChange={(e) => setSelectedListId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-amber-500 outline-none"
                    >
                      {existingListas.map(lista => (
                        <option key={lista.id} value={lista.id}>
                          {lista.nome} ({lista.rota || 'Geral'})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-sm text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                      Nenhuma lista de coleta encontrada no sistema. Crie uma nova lista.
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Saída Padrão</label>
                  <input
                    type="text"
                    value={exportSaida}
                    onChange={(e) => setExportSaida(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Motivo</label>
                  <input
                    type="text"
                    value={exportMotivo}
                    onChange={(e) => setExportMotivo(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 sm:mt-8 flex flex-col-reverse sm:flex-row justify-end gap-2.5 sm:gap-3">
              <button
                onClick={closeExportModal}
                className="w-full sm:w-auto px-5 py-2.5 sm:py-2 text-sm font-bold text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors uppercase min-h-[44px] sm:min-h-0 flex items-center justify-center cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmExport}
                disabled={busy || (exportDestinationType === 'existing' && existingListas.length === 0)}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 sm:py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-amber-500/20 disabled:opacity-50 uppercase cursor-pointer min-h-[44px] sm:min-h-0"
              >
                {busy ? (
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Confirmar Exportação</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
