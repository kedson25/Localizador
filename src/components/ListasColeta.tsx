import React, { useState, useEffect, useRef, useCallback } from 'react';
import Papa from 'papaparse';
import { 
  Barcode, 
  CheckCircle2, 
  XCircle, 
  Lock, 
  Unlock, 
  Trash2, 
  Download, 
  Search, 
  Package, 
  Tag, 
  Copy, 
  Check,
  Plus,
  ArrowLeft,
  MapPin,
  ListPlus,
  X,
  Users,
  User as UserIcon,
  PieChart,
  Clock,
  Layers,
  Edit2,
  ChevronRight,
  AlertCircle,
  CheckSquare,
  Square,
  Filter,
  CheckCheck,
  Zap,
  Loader2,
  RotateCcw,
  Save,
  Calendar,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  listenToRefugoScans, 
  saveRefugoScans, 
  listenToRefugo,
  listenToListas,
  fetchListaById,
  syncAllListas,
  listenToColetor,
  saveLista,
  saveListaItemsBatch,
  validateAndCleanIds,
  deleteLista as deleteListaFirestore
} from '../lib/firebase';
import { RefugoRow, ColetaItem, ColetaLista } from '../types';
import { User, getAllUsers } from '../lib/auth';
import { 
  enqueueBipLocally, 
  enqueueBatchBipsLocally, 
  subscribeSyncStatus, 
  processOutboxSync, 
  SyncEngineStatus 
} from '../lib/offlineQueue';

interface ListasColetaProps {
  currentUser?: User | null;
}

const SAIDAS_CICLOS_DISPONIVEIS = [
  'Ciclo 1 - Saída AM',
  'Ciclo 2 - Saída PM',
  'Ciclo 3 - Saída SD'
];

const MOTIVOS_DISPONIVEIS = [
  'Desconteinerizados',
  'Brancas',
  'Onway',
  'Inventário',
  'Parcial',
  'Insucesso',
  'Bipado',
  'Transferência',
  'Roteirizado',
  'Aguardando coleta'
];

let audioCtx: AudioContext | null = null;
const playShortBeep = () => {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(850, audioCtx.currentTime);
    
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.05); // 50ms ultra-short beep
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
  } catch (e) {
    console.error("Audio beep error:", e);
  }
};

export const ListasColeta: React.FC<ListasColetaProps> = ({ currentUser }) => {
  const params = useParams();
  const navigate = useNavigate();
  const [listas, setListas] = useState<ColetaLista[]>([]);
  const activeListaId = params.id || null;
  const [registeredUsers, setRegisteredUsers] = useState<User[]>([]);
  
  const [bipInput, setBipInput] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [lastScanResult, setLastScanResult] = useState<{ status: 'success' | 'error', message: string, code: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dashboardSearchTerm, setDashboardSearchTerm] = useState('');
  // Inicializa sem filtro de data para mostrar todas as listas criadas por padrão
  const [dashboardDateFilter, setDashboardDateFilter] = useState('');
  const [dashboardStatusFilter, setDashboardStatusFilter] = useState<'todas' | 'em_andamento' | 'finalizada'>('todas');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [refugoBaseRows, setRefugoBaseRows] = useState<RefugoRow[]>([]);

  // Configurações do scanner na tela de coleta
  const [selectedSaida, setSelectedSaida] = useState('Ciclo 2 - Saída PM');
  const [selectedMotivo, setSelectedMotivo] = useState('');
  const [selectedRotaItem, setSelectedRotaItem] = useState('');

  // Gaveta/Modal para mudar motivo do ID clicado
  const [itemParaMudarMotivo, setItemParaMudarMotivo] = useState<ColetaItem | null>(null);

  // Snapshot de itens para verificar no momento da abertura do modal
  const [itensVerificarSnap, setItensVerificarSnap] = useState<ColetaItem[]>([]);

  // Seleção e Alteração em Massa de Motivos
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [motivoEmMassaEscolha, setMotivoEmMassaEscolha] = useState<string>('');

  // Modal de Verificação de IDs (Em Rota vs Válidos)
  const [showVerificarModal, setShowVerificarModal] = useState(false);
  const [verificarModo, setVerificarModo] = useState<'10' | 'completo'>('10');
  const [verificarPagina, setVerificarPagina] = useState(0);
  const [copiedPage, setCopiedPage] = useState<number | null>(null);
  const [tamanhoLote, setTamanhoLote] = useState<number>(10);
  const [verificarMap, setVerificarMap] = useState<Record<string, 'valido' | 'verificado' | 'em_rota'>>({});
  const [verificarInput, setVerificarInput] = useState('');

  // Modais de Criação e Lote
  const [showModalNovaLista, setShowModalNovaLista] = useState(false);
  const [showTransferirModal, setShowTransferirModal] = useState(false);
  const [novaData, setNovaData] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0]; // YYYY-MM-DD
  });
  const [novaSaida, setNovaSaida] = useState('Ciclo 2 - Saída PM');
  const [novoTipo, setNovoTipo] = useState<'comum' | 'grupos'>('comum');

  const [showModalLote, setShowModalLote] = useState(false);
  const [loteText, setLoteText] = useState('');
  const [loteMotivo, setLoteMotivo] = useState('Desconteinerizado');

  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatusText, setImportStatusText] = useState('Carregando IDs na lista...');

  const [showVerificarLoteModal, setShowVerificarLoteModal] = useState(false);
  const [verificarLoteText, setVerificarLoteText] = useState('');

  // Estado para a gaveta de exclusão
  const [listaParaExcluir, setListaParaExcluir] = useState<ColetaLista | null>(null);
  const [listaParaFinalizar, setListaParaFinalizar] = useState<ColetaLista | null>(null);

  // Estados de Carregamento com Círculo Giratório (Spinner)
  const [isLoadingLista, setIsLoadingLista] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Carregando lista...');
  const [openingListaId, setOpeningListaId] = useState<string | null>(null);

  // Modo Individual (Sessão isolada zerada que se unifica na principal ao fechar)
  const [modoIndividual, setModoIndividual] = useState(false);
  const [itensModoIndividual, setItensModoIndividual] = useState<ColetaItem[]>([]);

  // Salvar modo individual no localStorage
  useEffect(() => {
    if (modoIndividual) {
      localStorage.setItem('app_modo_individual_ativo', 'true');
      localStorage.setItem('app_itens_modo_individual', JSON.stringify(itensModoIndividual));
    } else {
      localStorage.removeItem('app_modo_individual_ativo');
      localStorage.removeItem('app_itens_modo_individual');
    }
  }, [modoIndividual, itensModoIndividual]);

  // Carregar modo individual do localStorage
  useEffect(() => {
    const isAtivo = localStorage.getItem('app_modo_individual_ativo');
    if (isAtivo === 'true') {
      setModoIndividual(true);
      const savedItens = localStorage.getItem('app_itens_modo_individual');
      if (savedItens) {
        try {
          setItensModoIndividual(JSON.parse(savedItens));
        } catch (e) { }
      }
    }
  }, []);

  const [modoIndFiltroStatus, setModoIndFiltroStatus] = useState<'todos' | 'validados' | 'pendentes'>('todos');
  const [isSavingUnify, setIsSavingUnify] = useState(false);

  // Estado do Motor de Sincronização Offline-First
  const [syncEngineState, setSyncEngineState] = useState<SyncEngineStatus>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    pendingCount: 0,
    syncingCount: 0,
    syncedCount: 0,
    statusLabel: 'sincronizado',
    lastSyncTime: null
  });

  // Inscrever-se nos eventos do outbox do IndexedDB
  useEffect(() => {
    const unsub = subscribeSyncStatus((status) => {
      setSyncEngineState(status);
    });
    return () => unsub();
  }, []);

  // Runner de sincronização em segundo plano não-bloqueante
  const triggerBackgroundSync = useCallback(() => {
    processOutboxSync(
      async (listaId, items) => {
        return await saveListaItemsBatch(listaId, items);
      },
      (listaId, syncedItemIds) => {
        const syncedSet = new Set(syncedItemIds);
        setListas(prev => prev.map(l => {
          if (l.id === listaId) {
            const updatedItens = (l.itens || []).map(i => {
              if (syncedSet.has(i.id)) {
                return { ...i, syncStatus: 'sincronizado' as const };
              }
              return i;
            });
            return { ...l, itens: updatedItens };
          }
          return l;
        }));
      }
    );
  }, []);

  useEffect(() => {
    triggerBackgroundSync();
    const timer = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        triggerBackgroundSync();
      }
    }, 3500);

    const handleOnline = () => triggerBackgroundSync();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
    }
    return () => {
      clearInterval(timer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
      }
    };
  }, [triggerBackgroundSync]);

  // Ref para itens ativos como cache em memória ultra-rápido prevenindo race-conditions em bips velozes
  const activeItensRef = useRef<ColetaItem[]>([]);
  const lastRefugoTextRef = useRef<string>('');
  const lastColetorTextRef = useRef<string>('');

  const inputRef = useRef<HTMLInputElement>(null);

  const operanteNome = currentUser?.username || 'Usuário Atual';

  const listaAtiva = listas.find(l => l.id === activeListaId);

  // Estados para busca direta de lista e sincronização global
  const [isFetchingDirectLista, setIsFetchingDirectLista] = useState(false);
  const [directListaNotFound, setDirectListaNotFound] = useState(false);
  const [isSyncingAllListas, setIsSyncingAllListas] = useState(false);
  const [coletorBaseRows, setColetorBaseRows] = useState<RefugoRow[]>([]);

  // Tentar carregar lista ativa diretamente pelo ID do Firestore quando acessada via URL (/listas/:id)
  useEffect(() => {
    if (!activeListaId) {
      setDirectListaNotFound(false);
      return;
    }
    if (listaAtiva) {
      setDirectListaNotFound(false);
      return;
    }

    let isMounted = true;
    setIsFetchingDirectLista(true);

    fetchListaById(activeListaId)
      .then((loaded) => {
        if (!isMounted) return;
        if (loaded) {
          setListas(prev => {
            const exists = prev.some(l => l.id === loaded.id);
            if (exists) {
              return prev.map(l => l.id === loaded.id ? loaded : l);
            }
            return [loaded, ...prev];
          });
          setDirectListaNotFound(false);
        } else {
          setTimeout(() => {
            if (isMounted && !listas.some(l => l.id === activeListaId)) {
              setDirectListaNotFound(true);
            }
          }, 3000);
        }
      })
      .catch((err) => {
        console.error('Erro ao buscar lista diretamente por ID:', err);
        if (isMounted) setDirectListaNotFound(true);
      })
      .finally(() => {
        if (isMounted) setIsFetchingDirectLista(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeListaId, Boolean(listaAtiva)]);

  // Forçar sincronização global de todas as listas criadas no Firestore
  const handleForceSyncAll = async () => {
    setIsSyncingAllListas(true);
    try {
      const fresh = await syncAllListas();
      setListas(fresh);
      if (activeListaId) {
        const found = fresh.find(l => l.id === activeListaId);
        if (found) {
          setDirectListaNotFound(false);
        }
      }
    } catch (err) {
      console.error('Erro ao sincronizar listas:', err);
    } finally {
      setIsSyncingAllListas(false);
    }
  };

  const getModoIndKey = useCallback((listaId: string, username: string) => {
    return `coleta_modo_ind_${listaId}_${username}`;
  }, []);

  // Auto-salvar sessão do Modo Individual no LocalStorage sempre que for alterada
  useEffect(() => {
    if (listaAtiva && modoIndividual) {
      const key = getModoIndKey(listaAtiva.id, operanteNome);
      try {
        localStorage.setItem(key, JSON.stringify(itensModoIndividual));
      } catch (e) {
        console.warn('Erro ao salvar sessão individual localmente:', e);
      }
    }
  }, [itensModoIndividual, modoIndividual, listaAtiva?.id, operanteNome, getModoIndKey]);

  // Restaurar automaticamente a sessão do Modo Individual se existir para esta lista
  useEffect(() => {
    if (listaAtiva) {
      const key = getModoIndKey(listaAtiva.id, operanteNome);
      try {
        const saved = localStorage.getItem(key);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setItensModoIndividual(parsed);
            setModoIndividual(true);
          }
        }
      } catch (e) {}
    } else {
      setModoIndividual(false);
      setItensModoIndividual([]);
    }
  }, [listaAtiva?.id, operanteNome, getModoIndKey]);

  // Buscar usuários registrados no sistema
  useEffect(() => {
    async function fetchSystemUsers() {
      try {
        const uList = await getAllUsers();
        if (uList && uList.length > 0) {
          setRegisteredUsers(uList);
        }
      } catch (e) {
        console.error("Erro ao buscar usuários do sistema:", e);
      }
    }
    fetchSystemUsers();
  }, []);

  // Carregar/Salvar listas (AGORA FIRESTORE)
  useEffect(() => {
    const unsubListas = listenToListas((listasServer) => {
      setListas(listasServer);
    });

    // Carregar base de refugo se existir com cache em memória para evitar re-parse pesado
    const unsubRefugo = listenToRefugo((data) => {
      if (data && data.rawText) {
        if (data.rawText === lastRefugoTextRef.current) {
          return; // Já está processado em memória RAM!
        }
        lastRefugoTextRef.current = data.rawText;

        Papa.parse(data.rawText, {
          skipEmptyLines: true,
          complete: (results) => {
            const parsedRows: RefugoRow[] = (results.data as any[]).map((row: any) => {
              const values = Array.isArray(row) ? row : Object.values(row);
              const idRaw = String(values[0] || '').trim().toUpperCase();
              if (!idRaw || idRaw === 'ID' || idRaw === 'CODIGO' || idRaw === 'CÓDIGO' || idRaw === 'PACOTE' || idRaw === 'TRACKING' || idRaw === 'ENVIO') return null;
              const rotaRaw = String(values[1] || 'Sem Rota').trim();
              const rawFieldsObj: Record<string, string> = {};
              values.forEach((p: any, idx: number) => { rawFieldsObj[idx.toString()] = String(p || ''); });
              return {
                id: idRaw,
                rota: rotaRaw || 'Sem Rota',
                rawFields: rawFieldsObj
              };
            }).filter(Boolean) as RefugoRow[];
            setRefugoBaseRows(parsedRows);
          }
        });
      } else {
        lastRefugoTextRef.current = '';
        setRefugoBaseRows([]);
      }
    });

    // Carregar base do coletor para complementar rotas
    const unsubColetor = listenToColetor((data) => {
      if (data && data.rawText) {
        if (data.rawText === lastColetorTextRef.current) {
          return;
        }
        lastColetorTextRef.current = data.rawText;

        Papa.parse(data.rawText, {
          skipEmptyLines: true,
          complete: (results) => {
            const parsedRows: RefugoRow[] = (results.data as any[]).map((row: any) => {
              const values = Array.isArray(row) ? row : Object.values(row);
              const idRaw = String(values[0] || '').trim().toUpperCase();
              if (!idRaw || idRaw === 'ID' || idRaw === 'SHP' || idRaw === 'CODIGO' || idRaw === 'CÓDIGO') return null;
              const rotaRaw = String(values[1] || '').trim();
              return {
                id: idRaw,
                rota: rotaRaw || 'Sem Rota',
                rawFields: {}
              };
            }).filter(Boolean) as RefugoRow[];
            setColetorBaseRows(parsedRows);
          }
        });
      } else {
        lastColetorTextRef.current = '';
        setColetorBaseRows([]);
      }
    });

    return () => {
      unsubListas();
      unsubRefugo();
      unsubColetor();
    };
  }, []);

  // Sincronizar cache em memória da lista ativa para evitar race-conditions
  useEffect(() => {
    if (listaAtiva) {
      activeItensRef.current = listaAtiva.itens || [];
    } else {
      activeItensRef.current = [];
    }
  }, [listaAtiva]);

  // Quando abre uma lista, ajusta a saída padrão para a Saída do Ciclo definida na lista
  useEffect(() => {
    if (listaAtiva) {
      setSelectedRotaItem(listaAtiva.rota || 'Geral');
      if (listaAtiva.saidaPadrao) {
        setSelectedSaida(listaAtiva.saidaPadrao);
      }
      setSelectedMotivo(listaAtiva.motivoPadrao || '');
    }
  }, [listaAtiva?.id, listaAtiva?.saidaPadrao]);

  // Quando a lista ativa for carregada, encerra o indicador de carregamento
  useEffect(() => {
    if (listaAtiva && isLoadingLista) {
      const t = setTimeout(() => {
        setIsLoadingLista(false);
        setOpeningListaId(null);
      }, 250);
      return () => clearTimeout(t);
    }
  }, [listaAtiva, isLoadingLista]);

  const handleAbrirLista = (id: string) => {
    setOpeningListaId(id);
    setLoadingMessage('Carregando lista de coleta...');
    setIsLoadingLista(true);
    navigate(`/listas/${id}`);
  };

  const cleanDigits = (str: string) => (str || '').replace(/\D/g, '');

  // Obter rota oficial baseada no arquivo de refugo ou na base do coletor
  const getRotaItem = useCallback((item: { codigo: string; rota?: string }): string => {
    const cleanInput = (item.codigo || '').trim().toUpperCase();
    const cleanInputWithoutM = cleanInput.replace(/m$/i, '');
    const cleanInputDigits = cleanDigits(cleanInput);

    if (refugoBaseRows && refugoBaseRows.length > 0) {
      const match = refugoBaseRows.find(r => {
        if (!r.id) return false;
        const rId = r.id.trim().toUpperCase();
        if (rId === cleanInput) return true;
        if (rId.replace(/m$/i, '') === cleanInputWithoutM) return true;
        const rDigits = cleanDigits(rId);
        return Boolean(rDigits && cleanInputDigits && rDigits === cleanInputDigits);
      });

      if (match && match.rota && match.rota.trim() !== '' && match.rota.toLowerCase() !== 'sem rota' && match.rota !== '-') {
        return match.rota.trim();
      }
    }

    if (coletorBaseRows && coletorBaseRows.length > 0) {
      const matchColetor = coletorBaseRows.find(r => {
        if (!r.id) return false;
        const rId = r.id.trim().toUpperCase();
        if (rId === cleanInput) return true;
        if (rId.replace(/m$/i, '') === cleanInputWithoutM) return true;
        const rDigits = cleanDigits(rId);
        return Boolean(rDigits && cleanInputDigits && rDigits === cleanInputDigits);
      });

      if (matchColetor && matchColetor.rota && matchColetor.rota.trim() !== '' && matchColetor.rota.toLowerCase() !== 'sem rota' && matchColetor.rota !== '-') {
        return matchColetor.rota.trim();
      }
    }

    return (item.rota && item.rota.trim() !== '' && item.rota.toLowerCase() !== 'sem rota' && item.rota !== '-')
      ? item.rota.trim()
      : 'Sem Rota';
  }, [refugoBaseRows, coletorBaseRows]);

  // Sincronizar automaticamente as rotas dos itens da lista ativa com o arquivo de refugo atual
  useEffect(() => {
    if (!listaAtiva || !refugoBaseRows || refugoBaseRows.length === 0) return;

    let hasChanges = false;
    const novosItens = listaAtiva.itens.map(item => {
      const rotaAtualizada = getRotaItem(item);
      if (rotaAtualizada !== 'Sem Rota' && item.rota !== rotaAtualizada) {
        hasChanges = true;
        return { ...item, rota: rotaAtualizada };
      }
      return item;
    });

    if (hasChanges) {
      const updatedLista = { ...listaAtiva, itens: novosItens };
      activeItensRef.current = novosItens;
      setListas(prev => prev.map(l => l.id === updatedLista.id ? updatedLista : l));
      saveLista(updatedLista).catch(err => console.error('Erro ao sincronizar rotas do refugo:', err));
    }
  }, [refugoBaseRows, listaAtiva?.id, getRotaItem]);

  // Abrir Modal de Verificação de IDs do Ciclo
  const handleAbrirVerificar = () => {
    if (!listaAtiva) return;
    const listToVerify = modoIndividual ? itensModoIndividual : listaAtiva.itens;
    const itensPendentes = listToVerify.filter(i => !i.validado);
    
    if (itensPendentes.length === 0) {
      alert("Não há IDs pendentes para verificar no momento.");
      return;
    }

    setItensVerificarSnap(itensPendentes);

    const mapInicial: Record<string, 'valido' | 'verificado' | 'em_rota'> = {};
    itensPendentes.forEach(item => {
      mapInicial[item.id] = 'valido'; // por padrão, inicia como Válido
    });
    setVerificarMap(mapInicial);
    setVerificarModo('10');
    setVerificarPagina(0);
    setCopiedPage(null);
    setVerificarInput('');
    setShowVerificarModal(true);
  };

  const handleToggleVerificarStatus = (itemId: string, novoStatus: 'valido' | 'verificado' | 'em_rota') => {
    setVerificarMap(prev => ({
      ...prev,
      [itemId]: novoStatus
    }));
  };

  const handleMarcarVisiveisVerificar = (itensVisiveis: ColetaItem[], status: 'valido' | 'verificado' | 'em_rota') => {
    setVerificarMap(prev => {
      const next = { ...prev };
      itensVisiveis.forEach(item => {
        next[item.id] = status;
      });
      return next;
    });
  };

  const handleVerificarPorInput = (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificarInput.trim() || !listaAtiva) return;

    let processedInput = verificarInput.trim();
    processedInput = processedInput.replace(/d[çc]?⁴/gi, '4');
    processedInput = processedInput.replace(/d[çc]?4/gi, '4');
    processedInput = processedInput.replace(/^[^0-9a-zA-Z]+/, '');
    const match47 = processedInput.match(/(47\d+)/);
    if (match47) {
      processedInput = match47[1];
    } else {
      processedInput = processedInput.replace(/m$/i, '');
    }
    const cleanInput = processedInput.toUpperCase();
    const cleanInputDigits = cleanDigits(cleanInput);

    playShortBeep();

    const matchedItem = itensVerificarSnap.find(i => {
      if (i.codigo === cleanInput) return true;
      const iDigits = cleanDigits(i.codigo);
      return iDigits && cleanInputDigits && iDigits === cleanInputDigits;
    });

    if (matchedItem) {
      if (verificarMap[matchedItem.id] === 'verificado') {
        setLastScanResult({
          status: 'success',
          message: `ID ${matchedItem.codigo} já estava verificado!`,
          code: matchedItem.codigo
        });
      } else {
        setVerificarMap(prev => ({
          ...prev,
          [matchedItem.id]: 'verificado'
        }));
        setLastScanResult({
          status: 'success',
          message: `ID ${matchedItem.codigo} verificado com sucesso!`,
          code: matchedItem.codigo
        });
      }
    } else {
      setLastScanResult({
        status: 'error',
        message: `ID ${cleanInput} não encontrado nesta lista.`,
        code: cleanInput
      });
    }

    setVerificarInput('');
  };

  const handleProcessarVerificarLote = async () => {
    if (!listaAtiva || !verificarLoteText.trim()) return;

    const rawIds = verificarLoteText.split(/[\n\r,;\t\s]+/).map(i => i.trim()).filter(Boolean);
    let processados = 0;

    if (modoIndividual) {
      // No modo individual, precisamos também ADICIONAR os IDs se não existirem
      const novos = [...itensModoIndividual];
      const saidaItemFinal = listaAtiva?.saidaPadrao || selectedSaida || 'Ciclo 2 - Saída PM';
      
      const cleanInputigos = validateAndCleanIds(rawIds);
      
      cleanInputigos.forEach(cleanInput => {
         const cleanInputDigits = cleanDigits(cleanInput);
         const index = novos.findIndex(
            i => i.codigo === cleanInput || (cleanDigits(i.codigo) === cleanInputDigits && cleanInputDigits !== '')
         );
         
         if (index >= 0) {
            if (!novos[index].validado) {
               novos[index] = { ...novos[index], validado: true };
               processados++;
            }
         } else {
            // Adiciona como validado
            const cleanInputWithoutM = cleanInput.replace(/m$/i, '');
            const refugoMatch = refugoBaseRows.find(r => {
              if (!r.id) return false;
              const rId = r.id.trim().toUpperCase();
              if (rId === cleanInput) return true;
              if (rId.replace(/m$/i, '') === cleanInputWithoutM) return true;
              const rDigits = cleanDigits(rId);
              return Boolean(rDigits && cleanInputDigits && rDigits === cleanInputDigits);
            });
            const rotaItemFinal = (refugoMatch && refugoMatch.rota && refugoMatch.rota.trim() !== '' && refugoMatch.rota.toLowerCase() !== 'sem rota' && refugoMatch.rota !== '-')
              ? refugoMatch.rota.trim() : 'Sem Rota';
            
            const itemPrincipal = listaAtiva?.itens.find(
              item => item.codigo === cleanInput || (cleanDigits(item.codigo) === cleanInputDigits && cleanInputDigits !== '')
            );
            const rotaParaUsar = rotaItemFinal !== 'Sem Rota' ? rotaItemFinal : (itemPrincipal?.rota || 'Sem Rota');

            novos.unshift({
              id: 'ind-' + Date.now().toString() + Math.random().toString(36).substring(2, 9),
              codigo: cleanInput,
              rota: rotaParaUsar,
              saida: saidaItemFinal,
              motivo: selectedMotivo || 'Desconteinerizado',
              scannedAt: new Date().toLocaleString('pt-BR'),
              responsavel: operanteNome,
              validado: true
            });
            processados++;
         }
      });
      setItensModoIndividual(novos);
    } else {
      const listToVerify = listaAtiva.itens;

      const itensAtualizados = listToVerify.map(item => {
        if (item.validado) return item;

        const itemDigits = cleanDigits(item.codigo);
        const matched = rawIds.some(rawId => {
          let pId = rawId;
          pId = pId.replace(/d[çc]?⁴/gi, '4');
          pId = pId.replace(/d[çc]?4/gi, '4');
          pId = pId.replace(/^[^0-9a-zA-Z]+/, '');
          const match47 = pId.match(/(47\d+)/);
          if (match47) pId = match47[1];
          else pId = pId.replace(/m$/i, '');
          
          const cleanPId = pId.toUpperCase();
          const pIdDigits = cleanDigits(cleanPId);
          
          return item.codigo === cleanPId || (itemDigits && pIdDigits && itemDigits === pIdDigits);
        });

        if (matched) {
          processados++;
          return { ...item, validado: true };
        }
        return item;
      });
      const updatedLista = { ...listaAtiva, itens: itensAtualizados };
      await saveLista(updatedLista);
    }
    
    setShowVerificarLoteModal(false);
    setVerificarLoteText('');
    setShowVerificarModal(false); // Fecha o modal principal
    
    alert(`${processados} pacotes encontrados e validados com sucesso!`);
  };

  const handleCopiarIdsVerificacao = () => {
    if (!listaAtiva) return;
    const itensPendentes = itensVerificarSnap;
    if (itensPendentes.length === 0) {
      alert('Não há IDs pendentes para copiar.');
      return;
    }
    const textoIds = itensPendentes.map(i => i.codigo).join('\n');
    navigator.clipboard.writeText(textoIds).then(() => {
      alert(`${itensPendentes.length} IDs pendentes copiados para a área de transferência!`);
    }).catch(err => {
      console.error('Erro ao copiar:', err);
    });
  };

  const handleCopiarIdsComMotivoESaida = () => {
    if (!listaAtiva) return;
    const itensParaCopiar = filteredItems.length > 0 ? filteredItems : listaAtiva.itens;
    if (itensParaCopiar.length === 0) {
      alert('Não há itens para copiar.');
      return;
    }
    const texto = itensParaCopiar.map(i => {
      const grupoNome = listaAtiva.grupos?.find(g => g.id === i.grupoId)?.nome || '';
      const saidaExibida = i.saida || listaAtiva.saidaPadrao || 'Ciclo 2 - Saída PM';
      return `${i.codigo} | Saída: ${saidaExibida} | Motivo: ${i.motivo || 'N/A'}${grupoNome ? ` | Grupo: ${grupoNome}` : ''}`;
    }).join('\n');

    navigator.clipboard.writeText(texto).then(() => {
      alert(`${itensParaCopiar.length} itens copiados (ID, Saída e Motivo)!`);
    }).catch(err => {
      console.error('Erro ao copiar:', err);
    });
  };

  const handleBaixarListaSoIds = () => {
    if (!listaAtiva) return;
    const itensParaExportar = modoIndividual ? itensModoIndividual : listaAtiva.itens;
    exportarApenasIdsCSV(listaAtiva, itensParaExportar, modoIndividual ? 'IDs_Individual' : 'IDs');
  };

  const handleEntrarModoIndividual = () => {
    setModoIndividual(true);
    if (listaAtiva) {
      const key = getModoIndKey(listaAtiva.id, operanteNome);
      try {
        const saved = localStorage.getItem(key);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setItensModoIndividual(parsed);
            setTimeout(() => {
              inputRef.current?.focus();
            }, 100);
            return;
          }
        }
      } catch (e) {}
    }
    setItensModoIndividual([]);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  const handleFecharEUnificarModoIndividual = async (itensCustom?: ColetaItem[] | React.MouseEvent) => {
    if (!listaAtiva) {
      setModoIndividual(false);
      return;
    }

    const itensParaUsar = (Array.isArray(itensCustom) && itensCustom.length > 0)
      ? itensCustom
      : itensModoIndividual;

    if (itensParaUsar.length === 0) {
      const key = getModoIndKey(listaAtiva.id, operanteNome);
      try { localStorage.removeItem(key); } catch (_) {}
      setModoIndividual(false);
      return;
    }

    setIsSavingUnify(true);

    try {
      const currentItens = activeItensRef.current && activeItensRef.current.length > 0
        ? activeItensRef.current
        : (listaAtiva.itens || []);

      const updatedMainItens = [...currentItens];

      const codeToIndexMap = new Map<string, number>();
      updatedMainItens.forEach((item, index) => {
        codeToIndexMap.set(item.codigo, index);
        const digits = cleanDigits(item.codigo);
        if (digits) codeToIndexMap.set(digits, index);
      });

      let countNovos = 0;
      let countAtualizados = 0;

      itensParaUsar.forEach(itemInd => {
        const cleanInput = itemInd.codigo;
        const cleanInputDigits = cleanDigits(cleanInput);

        const existingIndex = codeToIndexMap.has(cleanInput)
          ? codeToIndexMap.get(cleanInput)!
          : (cleanInputDigits && codeToIndexMap.has(cleanInputDigits) ? codeToIndexMap.get(cleanInputDigits)! : -1);

        if (existingIndex !== -1 && existingIndex < updatedMainItens.length) {
          updatedMainItens[existingIndex] = {
            ...updatedMainItens[existingIndex],
            validado: itemInd.validado !== undefined ? itemInd.validado : true,
            responsavel: operanteNome,
            scannedAt: itemInd.scannedAt || new Date().toLocaleString('pt-BR'),
            saida: itemInd.saida || updatedMainItens[existingIndex].saida,
            motivo: itemInd.motivo || updatedMainItens[existingIndex].motivo,
            rota: (itemInd.rota && itemInd.rota !== 'Sem Rota') ? itemInd.rota : updatedMainItens[existingIndex].rota
          };
          countAtualizados++;
        } else {
          const novoItem: ColetaItem = {
            ...itemInd,
            id: itemInd.id || ('ind-uni-' + Date.now() + '-' + Math.floor(Math.random() * 100000)),
            validado: itemInd.validado !== undefined ? itemInd.validado : true,
            responsavel: operanteNome,
            scannedAt: itemInd.scannedAt || new Date().toLocaleString('pt-BR')
          };
          // Inserir no TOPO da lista principal
          updatedMainItens.unshift(novoItem);
          codeToIndexMap.set(cleanInput, 0);
          if (cleanInputDigits) codeToIndexMap.set(cleanInputDigits, 0);
          countNovos++;
        }
      });

      activeItensRef.current = updatedMainItens;
      const updatedLista = { ...listaAtiva, itens: updatedMainItens };
      setListas(prev => prev.map(l => l.id === updatedLista.id ? updatedLista : l));

      await saveLista(updatedLista, true);

      // Limpar sessão individual salva após unificar
      const key = getModoIndKey(listaAtiva.id, operanteNome);
      try { localStorage.removeItem(key); } catch (_) {}

      alert(`${itensParaUsar.length} IDs da sessão individual foram unificados na lista principal com sucesso! (${countAtualizados} validados, ${countNovos} novos)`);
      setModoIndividual(false);
      setItensModoIndividual([]);
    } catch (err) {
      console.error("Erro ao unificar modo individual:", err);
      alert("Ocorreu um erro ao salvar a unificação. Tente novamente.");
    } finally {
      setIsSavingUnify(false);
    }
  };

  const handleCancelarModoIndividual = () => {
    if (itensModoIndividual.length > 0) {
      if (!confirm('Deseja fechar o Modo Individual sem unificar e descartar os pacotes desta sessão?')) {
        return;
      }
    }
    if (listaAtiva) {
      const key = getModoIndKey(listaAtiva.id, operanteNome);
      try { localStorage.removeItem(key); } catch (_) {}
    }
    setModoIndividual(false);
    setItensModoIndividual([]);
  };

  const handleRemoverItemIndividual = (itemId: string) => {
    setItensModoIndividual(prev => prev.filter(i => i.id !== itemId));
  };

  const handleConcluirVerificacao = async () => {
    if (!listaAtiva) return;

    const listToVerify = modoIndividual ? itensModoIndividual : listaAtiva.itens;

    const itensMantidos = listToVerify.filter(i => verificarMap[i.id] !== 'em_rota');
    
    const itensAtualizados = itensMantidos.map(i => {
      // Se estava no mapa de verificação (ou seja, não estava validado antes) e não foi removido, agora está validado.
      if (verificarMap[i.id] !== undefined) {
        return { ...i, validado: true };
      }
      return i; // Mantém os já validados intactos
    });

    if (modoIndividual) {
      setShowVerificarModal(false);
      await handleFecharEUnificarModoIndividual(itensAtualizados);
    } else {
      activeItensRef.current = itensAtualizados;
      const updatedLista = { ...listaAtiva, itens: itensAtualizados };
      setListas(prev => prev.map(l => l.id === updatedLista.id ? updatedLista : l));
      await saveLista(updatedLista);
      setShowVerificarModal(false);
    }
  };

  // Alternar validação de um item individualmente (Validado / Não Validado)
  const handleToggleItemValidado = async (itemId: string) => {
    if (!listaAtiva) return;

    if (modoIndividual) {
      setItensModoIndividual(prev => prev.map(i => {
        if (i.id === itemId) return { ...i, validado: !i.validado };
        return i;
      }));
      return;
    }

    const currentItens = activeItensRef.current && activeItensRef.current.length > 0
      ? activeItensRef.current
      : listaAtiva.itens;

    const novosItens = currentItens.map(i => {
      if (i.id === itemId) {
        return { ...i, validado: !i.validado };
      }
      return i;
    });

    activeItensRef.current = novosItens;
    const updatedLista = { ...listaAtiva, itens: novosItens };
    setListas(prev => prev.map(l => l.id === updatedLista.id ? updatedLista : l));
    await saveLista(updatedLista);
  };





  // Criar nova lista com dados reais (Data, Ciclo e Tipo de Lista)
  const handleCriarLista = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoadingLista(true);
    setLoadingMessage('Criando lista de coleta...');

    try {
      // Formatar data para exibição (DD/MM/YYYY)
      let dataFormatada = new Date().toLocaleDateString('pt-BR');
      if (novaData) {
        const parts = novaData.split('-');
        if (parts.length === 3) {
          dataFormatada = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
      }

      // Gerar nome limpo e direto sem "Lista Comum" ou "Rota Geral"
      let nomeCurto = novaSaida;
      if (novaSaida.includes('PM')) nomeCurto = 'Saída PM';
      else if (novaSaida.includes('AM')) nomeCurto = 'Saída AM';
      else if (novaSaida.includes('SD')) nomeCurto = 'Saída SD';

      const nomeGerado = `${nomeCurto} - ${dataFormatada}`;
      const rotaPadrao = novoTipo === 'grupos' ? 'Multirotas / Grupos' : 'Geral';

      const novaLista: ColetaLista = {
        id: 'lista-' + Date.now(),
        nome: nomeGerado,
        tipo: novoTipo,
        grupos: novoTipo === 'grupos' ? [] : undefined,
        grupoAtivoId: '',
        rota: rotaPadrao,
        data: dataFormatada,
        responsavel: operanteNome, // Criador real
        status: 'em_andamento',
        saidaPadrao: novaSaida, // Ciclo/Saída da lista
        motivoPadrao: '',
        itens: []
      };

      await saveLista(novaLista, true);
      setListas(prev => [novaLista, ...prev]);
      setOpeningListaId(novaLista.id);
      setShowModalNovaLista(false);
      navigate(`/listas/${novaLista.id}`);
    } catch (err) {
      console.error('Erro ao criar lista:', err);
      setIsLoadingLista(false);
    }
  };

  // Bipar ID na tela de coleta
  const handleBip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bipInput.trim() || !listaAtiva) return;

    let processedInput = bipInput.trim();
    processedInput = processedInput.replace(/d[çc]?⁴/gi, '4');
    processedInput = processedInput.replace(/d[çc]?4/gi, '4');

    // Remove noise before the actual tracking number (e.g. &^&^&^472727787272m -> 472727787272m)
    processedInput = processedInput.replace(/^[^0-9a-zA-Z]+/, '');
    
    const match47 = processedInput.match(/(47\d+)/);
    if (match47) {
      processedInput = match47[1];
    } else {
      processedInput = processedInput.replace(/m$/i, '');
    }

    const cleanInput = processedInput.toUpperCase();
    const cleanInputDigits = cleanDigits(cleanInput);

    // Beep curto de 50ms
    playShortBeep();

    // Tentar localizar se existe na base de refugo para puxar a rota exata
    const cleanInputWithoutM = cleanInput.replace(/m$/i, '');
    const refugoMatch = refugoBaseRows.find(r => {
      if (!r.id) return false;
      const rId = r.id.trim().toUpperCase();
      if (rId === cleanInput) return true;
      if (rId.replace(/m$/i, '') === cleanInputWithoutM) return true;
      const rDigits = cleanDigits(rId);
      return Boolean(rDigits && cleanInputDigits && rDigits === cleanInputDigits);
    });

    const rotaItemFinal = (refugoMatch && refugoMatch.rota && refugoMatch.rota.trim() !== '' && refugoMatch.rota.toLowerCase() !== 'sem rota' && refugoMatch.rota !== '-')
      ? refugoMatch.rota.trim()
      : 'Sem Rota';

    // Usar obrigatoriamente a saída do ciclo configurada
    const saidaItemFinal = listaAtiva.saidaPadrao || selectedSaida || 'Ciclo 2 - Saída PM';

    // Se estiver no Modo Individual, opera na lista zerada da sessão individual
    if (modoIndividual) {
      const jaExisteNaSessao = itensModoIndividual.some(
        item => item.codigo === cleanInput || (cleanDigits(item.codigo) === cleanInputDigits && cleanInputDigits !== '')
      );

      if (jaExisteNaSessao) {
        setLastScanResult({
          status: 'success',
          code: cleanInput,
          message: `ID já bipado e validado nesta sessão individual!`
        });
      } else {
        const itemPrincipal = listaAtiva.itens.find(
          item => item.codigo === cleanInput || (cleanDigits(item.codigo) === cleanInputDigits && cleanInputDigits !== '')
        );

        const rotaParaUsar = rotaItemFinal !== 'Sem Rota' ? rotaItemFinal : (itemPrincipal?.rota || 'Sem Rota');

        const novoItemIndividual: ColetaItem = {
          id: 'ind-' + Date.now() + '-' + Math.floor(Math.random() * 1000000) + '-' + cleanInput,
          codigo: cleanInput,
          rota: rotaParaUsar,
          saida: saidaItemFinal,
          motivo: selectedMotivo || itemPrincipal?.motivo || 'Pendente',
          scannedAt: new Date().toLocaleString('pt-BR'),
          responsavel: operanteNome,
          grupoId: listaAtiva.tipo === 'grupos' ? listaAtiva.grupoAtivoId : undefined,
          validado: true
        };

        setItensModoIndividual(prev => [novoItemIndividual, ...prev]);
        setLastScanResult({
          status: 'success',
          code: cleanInput,
          message: `ID validado na sessão individual! (Rota: ${novoItemIndividual.rota})`
        });
      }

      setBipInput('');
      inputRef.current?.focus();
      return;
    }

    // Usar activeItensRef.current para prevenir race-conditions em bips rápidos
    const currentItens = activeItensRef.current && activeItensRef.current.length > 0
      ? activeItensRef.current
      : listaAtiva.itens;

    // Verificar se o item já existe nesta lista
    const idx = currentItens.findIndex(
      item => item.codigo === cleanInput || (cleanDigits(item.codigo) === cleanInputDigits && cleanInputDigits !== '')
    );

    let novosItens = [...currentItens];
    let itemParaSalvar: ColetaItem;

    if (idx !== -1) {
      // Atualizar item existente
      novosItens[idx] = {
        ...novosItens[idx],
        saida: saidaItemFinal,
        motivo: selectedMotivo,
        rota: rotaItemFinal,
        scannedAt: new Date().toLocaleString('pt-BR'),
        responsavel: operanteNome,
        grupoId: listaAtiva.tipo === 'grupos' && listaAtiva.grupoAtivoId ? listaAtiva.grupoAtivoId : novosItens[idx].grupoId,
        syncStatus: 'pendente'
      };
      itemParaSalvar = novosItens[idx];
      setLastScanResult({
        status: 'success',
        code: cleanInput,
        message: `ID já existente atualizado! (Rota: ${rotaItemFinal})`
      });
    } else {
      // Adicionar novo ID na lista
      const novoItem: ColetaItem = {
        id: 'item-' + Date.now() + '-' + Math.floor(Math.random() * 1000000) + '-' + cleanInput,
        codigo: cleanInput,
        rota: rotaItemFinal,
        saida: saidaItemFinal, // Mesma saída do ciclo da lista
        motivo: selectedMotivo,
        scannedAt: new Date().toLocaleString('pt-BR'),
        responsavel: operanteNome,
        grupoId: listaAtiva.tipo === 'grupos' ? listaAtiva.grupoAtivoId : undefined,
        validado: false,
        syncStatus: 'pendente'
      };
      itemParaSalvar = novoItem;
      novosItens = [novoItem, ...novosItens];
      setLastScanResult({
        status: 'success',
        code: cleanInput,
        message: `Novo ID coletado na lista! (Rota: ${rotaItemFinal})`
      });
    }

    // 1. Gravação Instantânea na Fila Local IndexedDB (Outbox)
    enqueueBipLocally(listaAtiva.id, itemParaSalvar);

    // 2. Atualização Instantânea no Cliente e na Tela (0ms)
    activeItensRef.current = novosItens;

    const updatedLista = { ...listaAtiva, itens: novosItens };
    setListas(prev => prev.map(l => l.id === updatedLista.id ? updatedLista : l));

    // 3. Disparar Sincronização em Segundo Plano (Sem travar UI)
    triggerBackgroundSync();

    setBipInput('');
    inputRef.current?.focus();
  };

  // Alterar motivo do item selecionado na gaveta
  const handleMudarMotivoItem = async (novoMotivoEscolha: string) => {
    if (!itemParaMudarMotivo || !listaAtiva) return;

    if (modoIndividual) {
      setItensModoIndividual(prev => prev.map(item => {
        if (item.id === itemParaMudarMotivo.id) {
          return { ...item, motivo: novoMotivoEscolha };
        }
        return item;
      }));
    } else {
      const novosItens = listaAtiva.itens.map(item => {
        if (item.id === itemParaMudarMotivo.id) {
          return { ...item, motivo: novoMotivoEscolha };
        }
        return item;
      });

      const updatedLista = { ...listaAtiva, itens: novosItens };
      await saveLista(updatedLista);
    }

    setItemParaMudarMotivo(null);
  };

  // Limpar seleção de itens ao trocar de lista
  useEffect(() => {
    setSelectedItemIds([]);
  }, [activeListaId]);

  // Alternar seleção de item individual
  const handleToggleSelectItem = (itemId: string) => {
    setSelectedItemIds(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId) 
        : [...prev, itemId]
    );
  };

  // Selecionar/Desmarcar todos os visíveis
  const handleToggleSelectAll = (visibleItems: ColetaItem[]) => {
    const visibleIds = visibleItems.map(i => i.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedItemIds.includes(id));

    if (allVisibleSelected) {
      setSelectedItemIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      const newSet = new Set([...selectedItemIds, ...visibleIds]);
      setSelectedItemIds(Array.from(newSet));
    }
  };

  // Selecionar os que estão sem motivo ou com o motivo inicial padrão
  const handleSelectSemMotivoOuPadrão = (visibleItems: ColetaItem[]) => {
    const semMotivoIds = visibleItems.filter(item => {
      if (!item.motivo) return true;
      const m = item.motivo.trim().toLowerCase();
      return m === '' || m === 'sem motivo' || m === 'pendente' || m === '-' || m === 'vazio';
    }).map(i => i.id);

    if (semMotivoIds.length > 0) {
      setSelectedItemIds(semMotivoIds);
    } else {
      // Se não houver nenhum "sem motivo" explícito, selecionar os que tem o motivo inicial "Bipado" ou "Aguardando coleta"
      const padraoIds = visibleItems.filter(item => !item.motivo || item.motivo === 'Bipado' || item.motivo === 'Aguardando coleta').map(i => i.id);
      setSelectedItemIds(padraoIds);
    }
  };

  // Selecionar os N últimos coletados (ex: últimos 10)
  const handleSelectUltimosN = (visibleItems: ColetaItem[], qtd: number = 10) => {
    const ultimosIds = visibleItems.slice(0, qtd).map(i => i.id);
    setSelectedItemIds(ultimosIds);
  };

  // Aplicar motivo em massa nos selecionados
  const handleAplicarMotivoEmMassa = async (novoMotivoEscolha: string) => {
    if (selectedItemIds.length === 0 || !listaAtiva) return;

    if (modoIndividual) {
      setItensModoIndividual(prev => prev.map(item => {
        if (selectedItemIds.includes(item.id)) {
          return { ...item, motivo: novoMotivoEscolha };
        }
        return item;
      }));
    } else {
      const novosItens = listaAtiva.itens.map(item => {
        if (selectedItemIds.includes(item.id)) {
          return { ...item, motivo: novoMotivoEscolha };
        }
        return item;
      });

      const updatedLista = { ...listaAtiva, itens: novosItens };
      await saveLista(updatedLista);
    }

    setSelectedItemIds([]);
  };

  // Excluir selecionados em massa
  const handleExcluirSelecionadosEmMassa = async () => {
    if (selectedItemIds.length === 0 || !listaAtiva) return;
    if (window.confirm(`Confirma a exclusão de ${selectedItemIds.length} item(ns) selecionado(s)?`)) {
      if (modoIndividual) {
        setItensModoIndividual(prev => prev.filter(i => !selectedItemIds.includes(i.id)));
      } else {
        const novosItens = listaAtiva.itens.filter(i => !selectedItemIds.includes(i.id));
        activeItensRef.current = novosItens;
        const updatedLista = { ...listaAtiva, itens: novosItens };
        setListas(prev => prev.map(l => l.id === updatedLista.id ? updatedLista : l));
        await saveLista(updatedLista);
      }
      setSelectedItemIds([]);
    }
  };

  // Adicionar lote na lista ativa
  const handleCriarGrupo = async () => {
    if (!listaAtiva) return;
    const numGrupos = listaAtiva.grupos?.length || 0;
    const novoGrupo = {
      id: 'grp-' + Date.now(),
      nome: `Grupo ${numGrupos + 1}`
    };
    const updatedLista = {
      ...listaAtiva,
      grupos: [...(listaAtiva.grupos || []), novoGrupo],
      grupoAtivoId: novoGrupo.id
    };
    await saveLista(updatedLista);
  };

  const handleSetGrupoAtivo = async (grupoId: string) => {
    if (!listaAtiva) return;
    const updatedLista = { ...listaAtiva, grupoAtivoId: grupoId };
    await saveLista(updatedLista);
  };

  const handleExcluirGrupo = async (grupoId: string) => {
    if (!listaAtiva) return;
    const novosGrupos = (listaAtiva.grupos || []).filter(g => g.id !== grupoId);
    const novosItens = listaAtiva.itens.map(i => i.grupoId === grupoId ? { ...i, grupoId: undefined } : i);
    const novoGrupoAtivoId = listaAtiva.grupoAtivoId === grupoId ? (novosGrupos[0]?.id || '') : listaAtiva.grupoAtivoId;

    const updatedLista = {
      ...listaAtiva,
      grupos: novosGrupos,
      grupoAtivoId: novoGrupoAtivoId,
      itens: novosItens
    };
    await saveLista(updatedLista);
  };

  const handleAdicionarLote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loteText.trim() || !listaAtiva || isImporting) return;

    const rawCodigos = loteText.split(/[\n\r,;\t\s]+/).map(s => s.trim()).filter(Boolean);
    if (rawCodigos.length === 0) return;

    // Deduplicate and validate input IDs upfront
    const cleanInputigos = validateAndCleanIds(rawCodigos);
    if (cleanInputigos.length === 0) return;

    setIsImporting(true);
    setImportProgress(0);
    setImportStatusText('Iniciando processamento do lote...');

    const saidaCicloFinal = selectedSaida || listaAtiva.saidaPadrao || 'Ciclo 2 - Saída PM';
    const motivoFinal = loteMotivo || selectedMotivo || 'Desconteinerizado';

    if (modoIndividual) {
      const codigosSet = new Set(itensModoIndividual.map(i => i.codigo));
      const novosIndividuais: ColetaItem[] = [];
      const total = cleanInputigos.length;
      const BATCH_SIZE = 250;

      for (let i = 0; i < total; i += BATCH_SIZE) {
        const chunk = cleanInputigos.slice(i, i + BATCH_SIZE);
        
        chunk.forEach(cleanInput => {
          if (codigosSet.has(cleanInput)) return;
          codigosSet.add(cleanInput);

          const cleanInputDigits = cleanDigits(cleanInput);
          const cleanInputWithoutM = cleanInput.replace(/m$/i, '');
          const refugoMatch = refugoBaseRows.find(r => {
            if (!r.id) return false;
            const rId = r.id.trim().toUpperCase();
            if (rId === cleanInput) return true;
            if (rId.replace(/m$/i, '') === cleanInputWithoutM) return true;
            const rDigits = cleanDigits(rId);
            return Boolean(rDigits && cleanInputDigits && rDigits === cleanInputDigits);
          });
          const rotaItemFinal = (refugoMatch && refugoMatch.rota && refugoMatch.rota.trim() !== '' && refugoMatch.rota.toLowerCase() !== 'sem rota' && refugoMatch.rota !== '-')
            ? refugoMatch.rota.trim()
            : 'Sem Rota';
          const itemPrincipal = listaAtiva.itens.find(item => item.codigo === cleanInput || (cleanDigits(item.codigo) === cleanInputDigits && cleanInputDigits !== ''));
          const rotaParaUsar = rotaItemFinal !== 'Sem Rota' ? rotaItemFinal : (itemPrincipal?.rota || 'Sem Rota');

          novosIndividuais.push({
            id: 'ind-lote-' + Date.now() + '-' + Math.floor(Math.random() * 1000000) + '-' + cleanInput,
            codigo: cleanInput,
            rota: rotaParaUsar,
            saida: saidaCicloFinal,
            motivo: motivoFinal,
            scannedAt: new Date().toLocaleString('pt-BR'),
            responsavel: operanteNome,
            validado: true
          });
        });

        setImportProgress(Math.min(100, Math.round(((i + chunk.length) / total) * 100)));
        await new Promise(r => setTimeout(r, 10)); // Yield para atualizar UI
      }

      setItensModoIndividual(prev => [...novosIndividuais, ...prev]);
      setIsImporting(false);
      setShowModalLote(false);
      setLoteText('');
      alert(`${novosIndividuais.length} IDs adicionados como pendentes na sessão individual!`);
      return;
    }

    const novosItensMap = new Map<string, ColetaItem>();
    listaAtiva.itens.forEach(i => novosItensMap.set(i.codigo, i));

    const total = cleanInputigos.length;
    const BATCH_SIZE = 250;

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const chunk = cleanInputigos.slice(i, i + BATCH_SIZE);
      
      chunk.forEach(cleanInput => {
        const cleanInputDigits = cleanDigits(cleanInput);
        const cleanInputWithoutM = cleanInput.replace(/m$/i, '');

        const refugoMatch = refugoBaseRows.find(r => {
          if (!r.id) return false;
          const rId = r.id.trim().toUpperCase();
          if (rId === cleanInput) return true;
          if (rId.replace(/m$/i, '') === cleanInputWithoutM) return true;
          const rDigits = cleanDigits(rId);
          return Boolean(rDigits && cleanInputDigits && rDigits === cleanInputDigits);
        });
        const rotaItemFinal = (refugoMatch && refugoMatch.rota && refugoMatch.rota.trim() !== '' && refugoMatch.rota.toLowerCase() !== 'sem rota' && refugoMatch.rota !== '-')
          ? refugoMatch.rota.trim()
          : 'Sem Rota';

        if (novosItensMap.has(cleanInput)) {
          const item = novosItensMap.get(cleanInput)!;
          novosItensMap.set(cleanInput, {
            ...item,
            saida: saidaCicloFinal,
            motivo: motivoFinal,
            rota: rotaItemFinal,
            scannedAt: new Date().toLocaleString('pt-BR'),
            responsavel: operanteNome,
            grupoId: listaAtiva.tipo === 'grupos' && listaAtiva.grupoAtivoId ? listaAtiva.grupoAtivoId : item.grupoId,
            syncStatus: 'pendente'
          });
        } else {
          novosItensMap.set(cleanInput, {
            id: 'item-' + Date.now() + '-' + Math.floor(Math.random() * 1000000) + '-' + cleanInput,
            codigo: cleanInput,
            rota: rotaItemFinal,
            saida: saidaCicloFinal,
            motivo: motivoFinal,
            scannedAt: new Date().toLocaleString('pt-BR'),
            responsavel: operanteNome,
            grupoId: listaAtiva.tipo === 'grupos' ? listaAtiva.grupoAtivoId : undefined,
            syncStatus: 'pendente'
          });
        }
      });
      
      setImportProgress(Math.min(100, Math.round(((i + chunk.length) / total) * 100)));
      await new Promise(r => setTimeout(r, 10)); // Yield para atualizar UI
    }

    const novosItens = Array.from(novosItensMap.values());

    // 1. Gravar lote instantaneamente no Outbox local do IndexedDB
    await enqueueBatchBipsLocally(listaAtiva.id, novosItens);

    // 2. Atualizar estado da interface no cliente na hora (0ms)
    activeItensRef.current = novosItens;
    const updatedLista = { ...listaAtiva, itens: novosItens };
    setListas(prev => prev.map(l => l.id === updatedLista.id ? updatedLista : l));

    // 3. Disparar sincronização em segundo plano não-bloqueante
    triggerBackgroundSync();

    setIsImporting(false);
    setLoteText('');
    setShowModalLote(false);
  };

  const handleExcluirLista = async (listaId: string) => {
    await deleteListaFirestore(listaId);
    if (activeListaId === listaId) {
      navigate('/listas');
    }
    setListaParaExcluir(null);
  };

  const handleReabrirLista = async (listaId: string) => {
    const lista = listas.find(l => l.id === listaId) || (listaAtiva?.id === listaId ? listaAtiva : null);
    if (lista) {
      const updatedLista: ColetaLista = { ...lista, status: 'em_andamento' };
      setListas(prev => prev.map(l => l.id === listaId ? updatedLista : l));
      await saveLista(updatedLista);
    }
  };

  const handleFinalizarLista = async (listaId: string) => {
    const lista = listas.find(l => l.id === listaId) || (listaAtiva?.id === listaId ? listaAtiva : null);
    if (lista) {
      const updatedLista: ColetaLista = { ...lista, status: 'finalizada' };
      setListas(prev => prev.map(l => l.id === listaId ? updatedLista : l));
      await saveLista(updatedLista);

      if (lista.itens.length > 0) {
        const cleanIdOnly = (code: string) => {
          if (!code) return '';
          return code.toString().trim().replace(/["\r\n\t]/g, '').replace(/\s+/g, '');
        };

        // CSV contendo estritamente só com os IDs e mais nada
        const rowsCsv = lista.itens.map(item => cleanIdOnly(item.codigo)).filter(Boolean);
        const csvContent = rowsCsv.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${lista.nome.replace(/\s+/g, '_')}_IDs.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      setListaParaFinalizar(null);
    }
  };

  const handleRemoverItem = async (itemId: string) => {
    if (!listaAtiva) return;
    if (modoIndividual) {
      setItensModoIndividual(prev => prev.filter(i => i.id !== itemId));
    } else {
      const novosItens = listaAtiva.itens.filter(i => i.id !== itemId);
      activeItensRef.current = novosItens;
      const updatedLista = { ...listaAtiva, itens: novosItens };
      setListas(prev => prev.map(l => l.id === updatedLista.id ? updatedLista : l));
      await saveLista(updatedLista);
    }
  };

  const handleCopy = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const exportarApenasIdsCSV = (lista: ColetaLista, itensCustom?: ColetaItem[], sufixoNome?: string) => {
    const itens = itensCustom || lista.itens;
    if (itens.length === 0) {
      alert('Não há itens para exportar.');
      return;
    }
    const cleanIdOnly = (code: string) => {
      if (!code) return '';
      return code.toString().trim().replace(/["\r\n\t]/g, '').replace(/\s+/g, '');
    };
    const rows = itens.map(i => cleanIdOnly(i.codigo)).filter(Boolean);
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${lista.nome.toLowerCase().replace(/\s+/g, '_')}_${sufixoNome || 'IDs'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportListaCSV = (lista: ColetaLista) => {
    exportarApenasIdsCSV(lista);
  };

  // -------------------------------------------------------------
  // VIEW 1: DASHBOARD DE LISTAS (EXIBIÇÃO EM TABELA/LISTA SEM DADOS FAKE)
  // -------------------------------------------------------------
  if (activeListaId && !listaAtiva) {
    if (directListaNotFound) {
      return (
        <div className="w-full min-h-[60vh] flex flex-col items-center justify-center gap-4 p-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center shadow-xs">
            <AlertCircle className="w-8 h-8 text-amber-600" />
          </div>
          <div className="text-center max-w-md">
            <h3 className="text-lg font-bold text-[#333333]">Lista não encontrada</h3>
            <p className="text-sm text-gray-500 mt-1">
              A lista <span className="font-mono text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded text-xs">{activeListaId}</span> não foi localizada ou ainda está sincronizando com o servidor.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 mt-2 justify-center">
            <button
              onClick={() => navigate('/listas')}
              className="px-4 py-2.5 bg-[#3483FA] text-white text-sm font-semibold rounded-xl hover:bg-blue-600 transition shadow-xs flex items-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Ver Todas as Listas
            </button>
            <button
              onClick={handleForceSyncAll}
              disabled={isSyncingAllListas}
              className="px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200 transition flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncingAllListas ? 'animate-spin' : ''}`} />
              {isSyncingAllListas ? 'Sincronizando...' : 'Tentar Novamente'}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center shadow-xs">
          <Loader2 className="w-8 h-8 text-[#3483FA] animate-spin" />
        </div>
        <div className="text-center">
          <h3 className="text-base font-bold text-[#333333]">Carregando lista de coleta...</h3>
          <p className="text-xs text-gray-500 mt-1">Sincronizando dados em tempo real com o servidor</p>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={() => navigate('/listas')}
            className="text-xs text-[#3483FA] hover:underline font-semibold cursor-pointer"
          >
            ← Voltar para listagem
          </button>
          <button
            onClick={handleForceSyncAll}
            disabled={isSyncingAllListas}
            className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1 font-medium cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${isSyncingAllListas ? 'animate-spin' : ''}`} />
            Forçar sincronização
          </button>
        </div>
      </div>
    );
  }

  if (!listaAtiva) {
    const totalListas = listas.length;
    const listasAtivas = listas.filter(l => l.status === 'em_andamento').length;
    const totalItensColetados = listas.reduce((acc, l) => acc + l.itens.length, 0);

    const handleSetTodayFilter = () => {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      setDashboardDateFilter(prev => prev === todayStr ? '' : todayStr);
    };

    const handleSetYesterdayFilter = () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      setDashboardDateFilter(prev => prev === yesterdayStr ? '' : yesterdayStr);
    };

    const matchesDateFilter = (listaDataStr: string, filterValueStr: string) => {
      if (!filterValueStr) return true;
      let filterFormatted = filterValueStr;
      if (filterValueStr.includes('-')) {
        const [y, m, d] = filterValueStr.split('-');
        if (y && m && d) {
          filterFormatted = `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
        }
      }
      let listaFormatted = listaDataStr;
      if (listaDataStr && listaDataStr.includes('-')) {
        const [y, m, d] = listaDataStr.split('-');
        if (y && m && d) {
          listaFormatted = `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
        }
      }
      return (
        listaDataStr === filterValueStr ||
        listaFormatted === filterFormatted ||
        listaDataStr?.includes(filterValueStr) ||
        listaDataStr?.includes(filterFormatted)
      );
    };

    const filteredDashboardListas = listas.filter(l => {
      // 1. Filtro de Status
      if (dashboardStatusFilter !== 'todas' && l.status !== dashboardStatusFilter) {
        return false;
      }

      // 2. Filtro de Data
      if (dashboardDateFilter && !matchesDateFilter(l.data, dashboardDateFilter)) {
        return false;
      }

      // 3. Filtro de Texto (Nome, Rota, Criador, Ciclo, Motivo, Data ou IDs)
      if (!dashboardSearchTerm.trim()) return true;
      const term = dashboardSearchTerm.toLowerCase();
      return (
        (l.nome || '').toLowerCase().includes(term) || 
        (l.rota || '').toLowerCase().includes(term) || 
        (l.responsavel || '').toLowerCase().includes(term) ||
        (l.saidaPadrao && l.saidaPadrao.toLowerCase().includes(term)) ||
        (l.motivoPadrao && l.motivoPadrao.toLowerCase().includes(term)) ||
        (l.data && l.data.toLowerCase().includes(term)) ||
        (l.itens && l.itens.some(i => 
          (i.codigo || '').toLowerCase().includes(term) || 
          (i.motivo && i.motivo.toLowerCase().includes(term)) || 
          (i.saida && i.saida.toLowerCase().includes(term))
        ))
      );
    }).sort((a, b) => {
      // Ordenação cronológica decrescente: listas mais recentes no topo
      const getTimestamp = (id: string) => {
        const match = (id || '').match(/lista-(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      };
      const tA = getTimestamp(a.id);
      const tB = getTimestamp(b.id);
      if (tA && tB && tA !== tB) {
        return tB - tA; // Mais recente primeiro
      }
      return (b.id || '').localeCompare(a.id || '');
    });

    return (
      <div className="w-full space-y-6 pb-12">
        {/* Header Principal */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-[#3483FA]/10 text-[#3483FA] rounded-xl">
              <Package className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#333333]">Listas de Coleta</h2>
              <p className="text-xs text-gray-500">Crie listas reais e abra a tela de coleta para bipar pacotes.</p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleForceSyncAll}
              disabled={isSyncingAllListas}
              className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold px-4 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition shadow-xs cursor-pointer disabled:opacity-60"
              title="Sincronizar todas as listas criadas por todos os usuários do sistema"
            >
              <RefreshCw className={`w-4 h-4 text-[#3483FA] ${isSyncingAllListas ? 'animate-spin' : ''}`} />
              {isSyncingAllListas ? 'Sincronizando...' : 'Sincronizar Listas'}
            </button>
            <button
              onClick={() => setShowModalNovaLista(true)}
              className="flex-1 sm:flex-initial bg-[#3483FA] hover:bg-blue-600 text-white font-bold px-5 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors shadow-sm cursor-pointer"
            >
              <Plus className="w-5 h-5" />
              Criar Nova Lista
            </button>
          </div>
        </div>

        {/* TABELA DE LISTAS COM FILTROS DE TEXTO, DATA E STATUS */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#3483FA]" />
              <h3 className="text-base font-bold text-[#333333]">Listas</h3>
              <span className="bg-blue-50 text-[#3483FA] border border-blue-200 font-mono text-xs font-black px-2.5 py-0.5 rounded-full">
                {filteredDashboardListas.length} / {listas.length}
              </span>
            </div>

            {/* CONTROLES DE FILTRO */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Campo de Busca por Texto */}
              <div className="relative flex-1 sm:w-56 min-w-[200px]">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
                <input
                  type="text"
                  value={dashboardSearchTerm}
                  onChange={(e) => setDashboardSearchTerm(e.target.value)}
                  placeholder="Buscar nome, ciclo ou criador..."
                  className="w-full pl-8 pr-8 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium focus:outline-none focus:border-[#3483FA]"
                />
                {dashboardSearchTerm && (
                  <button
                    onClick={() => setDashboardSearchTerm('')}
                    className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 cursor-pointer"
                    title="Limpar busca"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filtro Selecionador de Data */}
              <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1">
                <Calendar className="w-3.5 h-3.5 text-gray-500" />
                <input
                  type="date"
                  value={dashboardDateFilter}
                  onChange={(e) => setDashboardDateFilter(e.target.value)}
                  className="bg-transparent text-xs font-bold text-gray-700 outline-none cursor-pointer"
                  title="Filtrar por data específica"
                />
                {dashboardDateFilter && (
                  <button
                    onClick={() => setDashboardDateFilter('')}
                    className="p-0.5 hover:bg-gray-200 rounded text-gray-500 cursor-pointer ml-1"
                    title="Limpar filtro de data"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Botões Rápidos (Todas as Listas / Hoje / Ontem) */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDashboardDateFilter('')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                    !dashboardDateFilter
                      ? 'bg-[#3483FA] text-white border-[#3483FA] shadow-2xs'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                  title="Exibir todas as listas criadas no sistema"
                >
                  Todas as Listas
                </button>
                <button
                  type="button"
                  onClick={handleSetTodayFilter}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                    dashboardDateFilter === new Date().toISOString().split('T')[0]
                      ? 'bg-[#3483FA] text-white border-[#3483FA] shadow-2xs'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={handleSetYesterdayFilter}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                    dashboardDateFilter === (() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 1);
                      return d.toISOString().split('T')[0];
                    })()
                      ? 'bg-[#3483FA] text-white border-[#3483FA] shadow-2xs'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  Ontem
                </button>
              </div>

              {/* Chips de Status (Todas / Ativas / Finalizadas) */}
              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg border border-gray-200">
                <button
                  type="button"
                  onClick={() => setDashboardStatusFilter('todas')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-extrabold transition-all cursor-pointer ${
                    dashboardStatusFilter === 'todas'
                      ? 'bg-white text-gray-800 shadow-2xs'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  Todas
                </button>
                <button
                  type="button"
                  onClick={() => setDashboardStatusFilter('em_andamento')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-extrabold transition-all cursor-pointer ${
                    dashboardStatusFilter === 'em_andamento'
                      ? 'bg-amber-500 text-white shadow-2xs'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  Ativas
                </button>
                <button
                  type="button"
                  onClick={() => setDashboardStatusFilter('finalizada')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-extrabold transition-all cursor-pointer ${
                    dashboardStatusFilter === 'finalizada'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  Finalizadas
                </button>
              </div>

              {/* Botão de Limpar Filtros Ativos */}
              {(dashboardSearchTerm || dashboardDateFilter || dashboardStatusFilter !== 'todas') && (
                <button
                  type="button"
                  onClick={() => {
                    setDashboardSearchTerm('');
                    setDashboardDateFilter('');
                    setDashboardStatusFilter('todas');
                  }}
                  className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                  title="Limpar todos os filtros"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Limpar</span>
                </button>
              )}
            </div>
          </div>

          {/* Alerta caso filtros estejam ocultando listas criadas */}
          {filteredDashboardListas.length < listas.length && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Exibindo <strong>{filteredDashboardListas.length}</strong> de <strong>{listas.length}</strong> listas criadas. Há listas ocultas pelos filtros aplicados (status, data ou busca).
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDashboardSearchTerm('');
                  setDashboardDateFilter('');
                  setDashboardStatusFilter('todas');
                }}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-md font-bold transition cursor-pointer whitespace-nowrap text-xs shadow-2xs"
              >
                Mostrar Todas as Listas ({listas.length})
              </button>
            </div>
          )}

          {filteredDashboardListas.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-700">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">#</th>
                    <th className="py-3 px-4">Nome da Lista</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4">Saída / Ciclo</th>
                    <th className="py-3 px-4">Data</th>
                    <th className="py-3 px-4">Criado Por</th>
                    <th className="py-3 px-4">IDs Coletados</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-sans">
                  {filteredDashboardListas.map((lista, idx) => (
                    <tr key={lista.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-gray-400">{filteredDashboardListas.length - idx}</td>
                      <td 
                        onClick={() => handleAbrirLista(lista.id)}
                        className="py-3.5 px-4 font-bold text-[#333333] text-sm cursor-pointer hover:text-[#3483FA] transition-colors"
                        title="Clique para abrir a coleta desta lista"
                      >
                        <div className="flex items-center gap-2">
                          <span>{lista.nome}</span>
                          {isLoadingLista && openingListaId === lista.id && (
                            <Loader2 className="w-3.5 h-3.5 text-[#3483FA] animate-spin flex-shrink-0" />
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded font-bold text-xs inline-flex items-center border ${
                          lista.tipo === 'grupos'
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}>
                          {lista.tipo === 'grupos' ? 'Grupo' : 'Comum'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded text-xs font-semibold">
                          {lista.saidaPadrao || 'Ciclo 2 - Saída PM'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-gray-600 font-medium">{lista.data}</td>
                      <td className="py-3.5 px-4 text-gray-700 font-bold">
                        {lista.responsavel}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-[#3483FA] text-sm">
                        {lista.itens.length} pacotes
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border ${
                          lista.status === 'finalizada' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {lista.status === 'finalizada' ? 'Finalizada' : 'Ativa'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleAbrirLista(lista.id)}
                            disabled={isLoadingLista && openingListaId === lista.id}
                            className="bg-[#3483FA] hover:bg-blue-600 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer disabled:opacity-75"
                          >
                            {isLoadingLista && openingListaId === lista.id ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Abrindo...</span>
                              </>
                            ) : (
                              <>
                                <Barcode className="w-4 h-4" />
                                <span>Abrir Coleta</span>
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => exportListaCSV(lista)}
                            className="p-1.5 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors border border-gray-200 cursor-pointer"
                            title="Exportar CSV (Apenas IDs)"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          {lista.status === 'finalizada' && (
                            <button
                              onClick={() => handleReabrirLista(lista.id)}
                              className="p-1.5 hover:bg-amber-50 text-amber-600 rounded-lg transition-colors border border-amber-200 cursor-pointer"
                              title="Reabrir Lista Finalizada"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleExcluirLista(lista.id)}
                            className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition-colors border border-red-200 cursor-pointer"
                            title="Excluir Lista"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center text-gray-400">
              <Package className="w-10 h-10 mx-auto text-gray-300 mb-2" />
              <p className="font-bold text-gray-600 text-sm">Nenhuma lista encontrada</p>
              <p className="text-xs text-gray-400 mt-1">
                {(dashboardSearchTerm || dashboardDateFilter || dashboardStatusFilter !== 'todas')
                  ? 'Tente alterar ou limpar os filtros de data, busca ou status selecionados.'
                  : 'Clique em "Criar Nova Lista" para definir uma rota e começar a bipar.'}
              </p>
              {(dashboardSearchTerm || dashboardDateFilter || dashboardStatusFilter !== 'todas') && (
                <button
                  type="button"
                  onClick={() => {
                    setDashboardSearchTerm('');
                    setDashboardDateFilter('');
                    setDashboardStatusFilter('todas');
                  }}
                  className="mt-3 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#3483FA] border border-blue-200 rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Limpar todos os filtros</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Modal Criar Nova Lista */}
        {showModalNovaLista && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-gray-100">
              <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100">
                <h3 className="text-base font-bold text-[#333333] flex items-center gap-2">
                  <Plus className="w-5 h-5 text-[#3483FA]" />
                  Criar Nova Lista de Coleta
                </h3>
                <button onClick={() => setShowModalNovaLista(false)} className="text-gray-400 hover:text-black">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCriarLista} className="space-y-4">
                {/* 1. DATA */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#3483FA]" />
                    Data da Lista *
                  </label>
                  <input
                    type="date"
                    value={novaData}
                    onChange={(e) => setNovaData(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-[#333333] font-medium focus:outline-none focus:border-[#3483FA]"
                    required
                  />
                </div>

                {/* 2. CICLO */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-amber-600" />
                    Selecione o Ciclo *
                  </label>
                  <select
                    value={novaSaida}
                    onChange={(e) => setNovaSaida(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-[#333333] focus:outline-none focus:border-[#3483FA]"
                    required
                  >
                    {SAIDAS_CICLOS_DISPONIVEIS.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {/* 3. TIPO DE LISTA (COMUM OU COM GRUPOS) */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-purple-600" />
                    Tipo da Lista *
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setNovoTipo('comum')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1 ${
                        novoTipo === 'comum'
                          ? 'bg-blue-50/70 border-[#3483FA] text-[#3483FA] shadow-xs'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <span className="font-bold text-xs flex items-center gap-1">
                        <Package className="w-4 h-4" />
                        Lista Comum
                      </span>
                      <span className="text-[10px] text-gray-500 font-normal">
                        Coleta contínua sem divisão em grupos.
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNovoTipo('grupos')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1 ${
                        novoTipo === 'grupos'
                          ? 'bg-purple-50/70 border-purple-600 text-purple-700 shadow-xs'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <span className="font-bold text-xs flex items-center gap-1">
                        <Layers className="w-4 h-4" />
                        Com Grupos
                      </span>
                      <span className="text-[10px] text-gray-500 font-normal">
                        Agrupa pacotes por rotas e setores.
                      </span>
                    </button>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setShowModalNovaLista(false)}
                    className="flex-1 sm:flex-none px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isLoadingLista}
                    className="flex-1 sm:flex-none px-4 py-2 bg-[#3483FA] hover:bg-blue-600 text-white rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-75 cursor-pointer"
                  >
                    {isLoadingLista ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Criando Lista...</span>
                      </>
                    ) : (
                      <span>Criar Lista</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Overlay com Círculo Giratório ao abrir ou criar lista */}
        {isLoadingLista && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-[9999] animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl p-6 shadow-2xl border border-gray-100 flex flex-col items-center gap-4 max-w-xs w-full text-center">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-[#3483FA] animate-spin" />
              </div>
              <div>
                <h4 className="text-base font-bold text-[#333333]">{loadingMessage}</h4>
                <p className="text-xs text-gray-500 mt-1">Aguarde um instante...</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW 2: TELA DE COLETA DA LISTA ATIVA (COM DADOS REAIS E PAINEL DIREITO SEM PENDENTES)
  // -------------------------------------------------------------
  const getShortSaida = (saida: string) => {
    if (!saida) return '-';
    if (saida.includes('AM')) return 'AM';
    if (saida.includes('PM')) return 'PM';
    if (saida.includes('SD')) return 'SD';
    if (saida.toLowerCase().includes('rota')) return 'ROTA';
    return saida;
  };

  const getMotivoStyle = (motivo: string) => {
    const m = motivo?.toLowerCase() || '';
    if (!m || m === 'sem motivo' || m === 'pendente' || m === '-') {
      return 'bg-gray-100 text-gray-400 border-gray-200';
    }
    
    if (m.includes('desconteinerizado')) return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    if (m.includes('branca')) return 'bg-slate-50 text-slate-700 border-slate-200';
    if (m.includes('onway')) return 'bg-blue-50 text-blue-700 border-blue-200';
    if (m.includes('inventário')) return 'bg-purple-50 text-purple-700 border-purple-200';
    if (m.includes('parcial')) return 'bg-orange-50 text-orange-700 border-orange-200';
    if (m.includes('insucesso')) return 'bg-red-50 text-red-700 border-red-200';
    if (m.includes('bipado')) return 'bg-cyan-50 text-cyan-700 border-cyan-200';
    if (m.includes('transferência')) return 'bg-violet-50 text-violet-700 border-violet-200';
    if (m.includes('roteirizado')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (m.includes('aguardando')) return 'bg-amber-50 text-amber-700 border-amber-200';
    
    return 'bg-blue-50 text-blue-700 border-blue-200';
  };

  const listToVerify = modoIndividual ? itensModoIndividual : listaAtiva.itens;
  const totalColetados = listToVerify.length;

  // Saídas presentes apenas nos IDs que realmente foram inseridos/bipados
  const saídasPresentes: string[] = Array.from(new Set(listToVerify.map(i => i.saida).filter(Boolean)));
  const contagemSaidas = saídasPresentes.reduce((acc, s: string) => {
    acc[s] = listToVerify.filter(i => i.saida === s).length;
    return acc;
  }, {} as Record<string, number>);

  // Motivos presentes apenas nos IDs que realmente foram inseridos/bipados
  const motivosPresentes: string[] = Array.from(new Set(listToVerify.map(i => i.motivo).filter(Boolean)));
  const contagemMotivos = motivosPresentes.reduce((acc, m: string) => {
    acc[m] = listToVerify.filter(i => i.motivo === m).length;
    return acc;
  }, {} as Record<string, number>);

  // Contagem de bips por operador na lista ativa (reflete em tempo real para todos)
  const contagemBips: Record<string, number> = {};
  listToVerify.forEach(item => {
    const op = item.responsavel || listaAtiva.responsavel || 'Operador';
    contagemBips[op] = (contagemBips[op] || 0) + 1;
  });
  if (operanteNome && contagemBips[operanteNome] === undefined) {
    contagemBips[operanteNome] = 0;
  }
  if (listaAtiva.responsavel && contagemBips[listaAtiva.responsavel] === undefined) {
    contagemBips[listaAtiva.responsavel] = 0;
  }
  const bipsPorOperador = Object.entries(contagemBips)
    .map(([nome, total]) => ({
      nome,
      total,
      isVoce: nome === operanteNome
    }))
    .sort((a, b) => b.total - a.total);

  // Lista de Usuários do Sistema para "Quem está na tela de lista online"
  const usuariosSistemaOnline = registeredUsers.length > 0 ? registeredUsers : [
    { id: 'usr-1', username: operanteNome, email: '', isAdmin: true, isApproved: true, allowedGroups: [] }
  ];

  const meusItensCount = listToVerify.filter(i => (i.responsavel || listaAtiva.responsavel) === operanteNome).length;

  const itemsFiltradosBase = modoIndividual 
    ? itensModoIndividual.filter(i => {
        if (modoIndFiltroStatus === 'validados') return i.validado !== false;
        if (modoIndFiltroStatus === 'pendentes') return i.validado === false;
        return true;
      })
    : listaAtiva.itens;

  const filteredItems = itemsFiltradosBase.filter(item => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const grupo = listaAtiva.grupos?.find(g => g.id === item.grupoId);
    const nomeGrupo = grupo ? grupo.nome.toLowerCase() : '';
    const rotaCalculada = getRotaItem(item).toLowerCase();
    return item.codigo.toLowerCase().includes(term) || 
           rotaCalculada.includes(term) || 
           item.motivo.toLowerCase().includes(term) || 
           (item.saida && item.saida.toLowerCase().includes(term)) ||
           (item.responsavel && item.responsavel.toLowerCase().includes(term)) ||
           nomeGrupo.includes(term);
  });

  return (
    <div className="w-full space-y-4 pb-12">
      {/* Botão de Voltar para Listas */}
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <button
          onClick={() => navigate('/listas')}
          className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#3483FA]" />
          Voltar para Listas
        </button>
        <div className="h-4 w-px bg-gray-300 mx-1"></div>
        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
          {listaAtiva?.nome || 'Coleta em Andamento'}
        </span>
        {listaAtiva?.status === 'finalizada' ? (
          <span className="bg-emerald-100 text-emerald-800 text-[11px] font-black px-2.5 py-1 rounded-lg border border-emerald-300 uppercase">
            Finalizada
          </span>
        ) : (
          <span className="bg-blue-50 text-[#3483FA] text-[11px] font-black px-2.5 py-1 rounded-lg border border-blue-200 uppercase">
            Em Andamento
          </span>
        )}
        {listaAtiva && (currentUser?.isAdmin || currentUser?.username === listaAtiva.responsavel) && (
          <button
            onClick={() => setShowTransferirModal(true)}
            className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 rounded text-[10px] font-bold uppercase transition-colors shadow-sm cursor-pointer"
          >
            <Users className="w-3 h-3" /> Transferir Admin
          </button>
        )}

        {/* INDICADOR DE SINCRONIZAÇÃO OFFLINE-FIRST */}
        <div className="ml-auto flex items-center gap-2">
          {!syncEngineState.isOnline ? (
            <span className="flex items-center gap-1.5 text-amber-900 bg-amber-50 border-amber-300 px-3 py-1 rounded-full border text-[11px] font-bold shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              offline {syncEngineState.pendingCount > 0 ? `(${syncEngineState.pendingCount} pendentes)` : ''}
            </span>
          ) : syncEngineState.syncingCount > 0 ? (
            <span className="flex items-center gap-1.5 text-blue-700 bg-blue-50 border-blue-200 px-3 py-1 rounded-full border text-[11px] font-bold shadow-2xs">
              <Loader2 className="w-3.5 h-3.5 text-[#3483FA] animate-spin" />
              sincronizando {syncEngineState.syncingCount}
            </span>
          ) : syncEngineState.pendingCount > 0 ? (
            <span className="flex items-center gap-1.5 text-amber-800 bg-amber-50 border-amber-200 px-3 py-1 rounded-full border text-[11px] font-bold shadow-2xs">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              {syncEngineState.pendingCount} pendentes
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-emerald-800 bg-emerald-50 border-emerald-200 px-3 py-1 rounded-full border text-[11px] font-bold shadow-2xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              sincronizado
            </span>
          )}
        </div>
      </div>

      {/* GRID COM TABELA À ESQUERDA E PAINEL DIREITO (SCANNER + MÉTRICAS) */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
        
        {/* COLUNA ESQUERDA (3 COLS) — TABELA DE IDS COMPLETA */}
        <div className="xl:col-span-3 space-y-4">
          
          {/* PAINEL DE GRUPOS (Se tipo = grupos) */}
          {listaAtiva.tipo === 'grupos' && (
            <div className="bg-white border border-purple-200 rounded-xl p-5 shadow-sm space-y-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 h-32 bg-purple-50 rounded-bl-full -z-10"></div>
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-purple-100 text-purple-700 rounded-lg">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-[#333333]">Grupos de Coleta</h3>
                    <p className="text-xs text-gray-500 font-medium mt-0.5">Organize os pacotes em blocos</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {(currentUser?.isAdmin || currentUser?.username === listaAtiva.responsavel) && (
                    <button
                      onClick={handleCriarGrupo}
                      className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      Criar / Próximo Grupo
                    </button>
                  )}
                </div>
              </div>

              {/* Lista de Grupos */}
              {listaAtiva.grupos && listaAtiva.grupos.length > 0 ? (
                <div className="flex flex-col sm:flex-row gap-3 overflow-x-auto pb-2 snap-x w-full">
                  {listaAtiva.grupos.map((grupo) => {
                    const isAtivo = listaAtiva.grupoAtivoId === grupo.id;
                    const qtdPacotes = listaAtiva.itens.filter(i => i.grupoId === grupo.id).length;
                    
                    return (
                      <div 
                        key={grupo.id}
                        onClick={() => handleSetGrupoAtivo(grupo.id)}
                        className={`w-full sm:w-[240px] sm:min-w-[240px] p-4 border-2 transition-all cursor-pointer snap-start flex flex-col gap-3 ${
                          isAtivo 
                            ? 'border-purple-600 bg-purple-50/50 shadow-md' 
                            : 'border-gray-200 bg-white hover:border-purple-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`font-black text-sm ${isAtivo ? 'text-purple-700' : 'text-gray-700'}`}>
                            {grupo.nome}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isAtivo ? 'bg-purple-200 text-purple-800' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {qtdPacotes} pacotes
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Deseja realmente excluir o grupo "${grupo.nome}"? Os pacotes deste grupo ficarão sem grupo.`)) {
                                  handleExcluirGrupo(grupo.id);
                                }
                              }}
                              className="p-1 hover:bg-red-100 text-red-500 rounded-lg transition-colors cursor-pointer"
                              title="Excluir grupo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-6 text-center">
                  <p className="text-gray-500 text-sm font-medium">Nenhum grupo criado. Clique em "Criar Grupo" para começar.</p>
                </div>
              )}
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
            
            {modoIndividual ? (
              <div className="space-y-4 animate-in fade-in">
                {/* Header do Modo Individual */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-blue-50/80 border border-blue-200 rounded-xl p-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">
                      <UserIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-[#333333]">Modo Individual</h3>
                        <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold">
                          {operanteNome}
                        </span>
                      </div>
                      <p className="text-xs text-blue-800 font-bold mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>{itensModoIndividual.length} {itensModoIndividual.length === 1 ? 'pacote nesta sessão' : 'pacotes nesta sessão'}</span>
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md font-bold border border-emerald-200 inline-flex items-center gap-1 shadow-2xs">
                          <Save className="w-2.5 h-2.5 text-emerald-600" /> Salvo no navegador
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      disabled={isSavingUnify}
                      onClick={() => handleFecharEUnificarModoIndividual()}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
                    >
                      {isSavingUnify ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Unificando e Salvando...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          Concluir e Unificar com a Principal
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelarModoIndividual}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                      title="Fechar sem unificar"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* PAINEL DE METRICAS E STATUS DE VALIDAÇÃO DO MODO INDIVIDUAL */}
                <div className="grid grid-cols-3 gap-2 sm:gap-3 my-2">
                  <button
                    type="button"
                    onClick={() => setModoIndFiltroStatus('todos')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      modoIndFiltroStatus === 'todos' 
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                        : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <div className="text-[10px] uppercase tracking-wider font-bold opacity-80">Total Sessão</div>
                    <div className="text-base sm:text-lg font-black mt-0.5">{itensModoIndividual.length}</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModoIndFiltroStatus('validados')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      modoIndFiltroStatus === 'validados' 
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' 
                        : 'bg-emerald-50/80 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                    }`}
                  >
                    <div className="text-[10px] uppercase tracking-wider font-bold opacity-90 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Validados
                    </div>
                    <div className="text-base sm:text-lg font-black mt-0.5">
                      {itensModoIndividual.filter(i => i.validado !== false).length}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModoIndFiltroStatus('pendentes')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      modoIndFiltroStatus === 'pendentes' 
                        ? 'bg-amber-600 text-white border-amber-600 shadow-sm' 
                        : 'bg-amber-50/80 border-amber-200 text-amber-900 hover:bg-amber-100'
                    }`}
                  >
                    <div className="text-[10px] uppercase tracking-wider font-bold opacity-90 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Pendentes
                    </div>
                    <div className="text-base sm:text-lg font-black mt-0.5">
                      {itensModoIndividual.filter(i => i.validado === false).length}
                    </div>
                  </button>
                </div>

                {/* Ações da Lista do Modo Individual (Mesmas Funções da Lista) */}
                <div className="flex flex-col gap-3 pb-3 border-b border-gray-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <button
                        onClick={() => setShowModalLote(true)}
                        className="px-2.5 py-1.5 bg-[#3483FA]/10 hover:bg-[#3483FA]/20 text-[#3483FA] rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <ListPlus className="w-3.5 h-3.5" />
                        Colar Lote
                      </button>

                      <button
                        onClick={handleBaixarListaSoIds}
                        className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Baixar lista contendo apenas os IDs da sessão individual"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Baixar Lista
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (itensModoIndividual.length === 0) {
                            alert('Nenhum ID nesta sessão para copiar.');
                            return;
                          }
                          const cleanIdOnly = (code: string) => (code || '').toString().trim().replace(/["\r\n\t]/g, '').replace(/\s+/g, '');
                          const texto = itensModoIndividual.map(i => cleanIdOnly(i.codigo)).filter(Boolean).join('\n');
                          navigator.clipboard.writeText(texto).then(() => {
                            alert(`${itensModoIndividual.length} IDs desta sessão copiados!`);
                          });
                        }}
                        className="px-2.5 py-1.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copiar IDs
                      </button>

                      <button
                        onClick={handleCopiarIdsComMotivoESaida}
                        className="px-2.5 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Copiar lista completa com IDs, saídas e motivos"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copiar com Detalhes
                      </button>
                    </div>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar ID, rota, motivo ou grupo..."
                        className="pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono focus:outline-none focus:border-[#3483FA] w-full sm:w-56"
                      />
                    </div>
                  </div>

                  {/* BARRA DE ATALHOS DE SELEÇÃO RÁPIDA */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-gray-400 font-semibold text-[11px] flex items-center gap-1 mr-1">
                        <Filter className="w-3 h-3 text-[#3483FA]" /> Seleção Rápida:
                      </span>

                      <button
                        type="button"
                        onClick={() => handleSelectSemMotivoOuPadrão(filteredItems)}
                        className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
                        title="Selecionar IDs sem motivo preenchido ou com motivo inicial"
                      >
                        <Zap className="w-3 h-3 text-amber-600" />
                        Selecionar Sem Motivo / Padrão
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleSelectAll(filteredItems)}
                        className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
                      >
                        <CheckCheck className="w-3 h-3 text-gray-600" />
                        {filteredItems.length > 0 && filteredItems.every(i => selectedItemIds.includes(i.id))
                          ? 'Desmarcar Todos'
                          : 'Selecionar Todos'}
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in">
                {/* Header da Tabela + Busca + Ações de Seleção Rápida */}
                <div className="flex flex-col gap-3 pb-3 border-b border-gray-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="font-bold text-base text-[#333333]">Lista</h3>

                      {/* BOTÃO INDIVIDUAL (Abre sessão zerada para bipagem e validação) */}
                      <button
                        type="button"
                        onClick={handleEntrarModoIndividual}
                        className="px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-sm bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100"
                        title="Abrir Modo Individual (sessão zerada para bipagem e validação)"
                      >
                        <UserIcon className="w-3.5 h-3.5 text-blue-600" />
                        <span>Modo Individual</span>
                      </button>

                      <button
                        onClick={() => setShowModalLote(true)}
                        className="px-2.5 py-1.5 bg-[#3483FA]/10 hover:bg-[#3483FA]/20 text-[#3483FA] rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <ListPlus className="w-3.5 h-3.5" />
                        Colar Lote
                      </button>

                      {/* COPIAR LISTA SÓ IDS VALIDADOS */}
                      {/* BAIXAR LISTA (SÓ IDS) */}
                      <button
                        onClick={handleBaixarListaSoIds}
                        className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Baixar lista contendo apenas os IDs (um por linha)"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Baixar Lista
                      </button>

                      {/* COPIAR COM DETALHES (MOTIVO E SAÍDA) */}
                      <button
                        onClick={handleCopiarIdsComMotivoESaida}
                        className="px-2.5 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Copiar lista completa com IDs, saídas e motivos"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copiar com Detalhes
                      </button>
                    </div>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar ID, rota, motivo ou grupo..."
                        className="pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono focus:outline-none focus:border-[#3483FA] w-full sm:w-56"
                      />
                    </div>
                  </div>

                {/* BARRA DE ATALHOS DE SELEÇÃO RÁPIDA */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-gray-400 font-semibold text-[11px] flex items-center gap-1 mr-1">
                    <Filter className="w-3 h-3 text-[#3483FA]" /> Seleção Rápida:
                  </span>

                  <button
                    type="button"
                    onClick={() => handleSelectSemMotivoOuPadrão(filteredItems)}
                    className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
                    title="Selecionar IDs sem motivo preenchido ou com motivo inicial"
                  >
                    <Zap className="w-3 h-3 text-amber-600" />
                    Selecionar Sem Motivo / Padrão
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleSelectAll(filteredItems)}
                    className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
                  >
                    <CheckCheck className="w-3 h-3 text-gray-600" />
                    {filteredItems.length > 0 && filteredItems.every(i => selectedItemIds.includes(i.id))
                      ? 'Desmarcar Todos'
                      : 'Selecionar Todos'}
                  </button>
                </div>
              </div>
            </div>
            </div>
            )}

            {/* PAINEL FLUTUANTE DE AÇÃO EM MASSA (QUANDO HÁ ITENS SELECIONADOS) */}
            {selectedItemIds.length > 0 && (
              <div className="bg-blue-50/50 border-2 border-[#3483FA]/40 rounded-xl p-4 shadow-sm space-y-4 animate-in fade-in">
                <div className="flex items-center justify-between border-b border-blue-200/50 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="bg-[#3483FA] text-white px-3 py-1 rounded-lg font-mono font-black text-sm shadow-sm">
                      {selectedItemIds.length} {selectedItemIds.length === 1 ? 'ID' : 'IDs'}
                    </span>
                    <span className="text-sm text-[#3483FA] font-black uppercase tracking-tight">
                      Edição em Massa
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleExcluirSelecionadosEmMassa}
                    className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5"
                    title="Excluir selecionados"
                  >
                    <Trash2 className="w-4 h-4" />
                    Excluir Itens
                  </button>
                </div>

                <div className="flex flex-col xl:flex-row gap-6 items-start">
                  <div className="flex-1 space-y-2 w-full max-w-md">
                    <label className="text-xs font-black text-gray-500 uppercase tracking-widest block">
                      Motivo Manual
                    </label>
                    <div className="flex gap-2 w-full">
                      <input
                        type="text"
                        placeholder="Escreva o motivo manualmente..."
                        value={motivoEmMassaEscolha}
                        onChange={(e) => setMotivoEmMassaEscolha(e.target.value)}
                        className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:border-[#3483FA] focus:ring-2 focus:ring-blue-100 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => handleAplicarMotivoEmMassa(motivoEmMassaEscolha)}
                        className="px-5 py-2 bg-[#3483FA] hover:bg-blue-600 text-white rounded-lg text-sm font-black transition-colors active:scale-95 shadow-sm cursor-pointer"
                      >
                        Aplicar
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex-1 w-full xl:border-l xl:border-gray-200 xl:pl-6">
                    <label className="text-xs font-black text-gray-500 uppercase tracking-widest mb-2 block">
                      Sugestões Rápidas (Clique para Aplicar)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {MOTIVOS_DISPONIVEIS.map((m) => {
                        const isSelectedM = motivoEmMassaEscolha === m;
                        return (
                          <button
                            key={m}
                            onClick={() => {
                              setMotivoEmMassaEscolha(m);
                              handleAplicarMotivoEmMassa(m);
                            }}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm hover:shadow active:scale-95 cursor-pointer ${
                              isSelectedM 
                                ? 'bg-[#3483FA] text-white border-[#3483FA]' 
                                : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'
                            }`}
                          >
                            {m}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {filteredItems.length > 0 ? (
              <div className="overflow-x-auto border border-gray-200 shadow-sm max-h-[70vh]">
                <table className="w-full text-[10px] xl:text-xs text-gray-700 border-collapse">
                  <thead className="bg-gray-100 sticky top-0 z-20 shadow-sm text-gray-700 font-black uppercase tracking-wider">
                    <tr>
                      <th className="py-1 px-1 sm:px-2 text-center bg-gray-100 border-b border-r border-gray-200">
                        <input
                          type="checkbox"
                          checked={filteredItems.length > 0 && filteredItems.every(i => selectedItemIds.includes(i.id))}
                          onChange={() => handleToggleSelectAll(filteredItems)}
                          className="w-4 h-4 text-[#3483FA] focus:ring-[#3483FA] cursor-pointer"
                          title="Selecionar/Desmarcar Todos os visíveis"
                        />
                      </th>
                      <th className="py-1 px-1 sm:px-2 text-center border-b border-r border-gray-200 bg-gray-100">#</th>
                      <th className="py-1 px-1 sm:px-2 text-left border-b border-r border-gray-200 bg-gray-100">ID / Código</th>
                      {listaAtiva.tipo === 'grupos' && (
                        <th className="py-1 px-1 sm:px-2 text-center border-b border-r border-gray-200 bg-gray-100 text-gray-700">Grupo</th>
                      )}
                      <th className="py-1 px-1 sm:px-2 text-center border-b border-r border-gray-200 bg-gray-100">Status</th>
                      <th className="py-1 px-1 sm:px-2 text-center border-b border-r border-gray-200 bg-gray-100">Bipado por</th>
                      <th className="py-1 px-1 sm:px-2 text-center border-b border-r border-gray-200 bg-gray-100">Rota</th>
                      <th className="py-1 px-1 sm:px-2 text-center border-b border-r border-gray-200 bg-gray-100">Saída</th>
                      <th className="py-1 px-1 sm:px-2 text-center border-b border-r border-gray-200 bg-gray-100">Motivo</th>
                      <th className="py-1 px-1 sm:px-2 text-center border-b border-r border-gray-200 bg-gray-100">Data / Hora</th>
                      <th className="py-1 px-1 sm:px-2 text-center border-b border-gray-200 bg-gray-100">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 font-sans">
                    {filteredItems.map((item, idx) => {
                      const isSelected = selectedItemIds.includes(item.id);
                      const isEditingMotivo = itemParaMudarMotivo?.id === item.id;
                      const itemRota = getRotaItem(item);
                      const hasRota = itemRota && itemRota.trim() !== '' && itemRota.toLowerCase() !== 'sem rota' && itemRota !== '-';
                      return (
                        <React.Fragment key={`frag-${item.id}-${idx}`}>
                        <tr 
                          className={`transition-all border-b border-gray-200 group ${
                            isSelected 
                              ? 'bg-blue-50/90 font-bold' 
                              : 'bg-white hover:bg-gray-50'
                          } ${isEditingMotivo ? 'bg-blue-50/40' : ''}`}
                        >
                          <td className="py-1 px-1 sm:px-2 text-center border-r border-gray-200">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectItem(item.id)}
                              className="w-4 h-4 text-[#3483FA] focus:ring-[#3483FA] cursor-pointer"
                            />
                          </td>
                          <td className="py-1 px-1 sm:px-2 text-center text-gray-500 font-bold border-r border-gray-200">{filteredItems.length - idx}</td>
                          <td 
                            onClick={() => setItemParaMudarMotivo(item)}
                            className="py-1 px-1 sm:px-2 text-left font-bold text-gray-900 cursor-pointer hover:text-blue-600 transition-colors border-r border-gray-200"
                            title="Clique para alterar o motivo deste ID"
                          >
                            <div className="flex items-center gap-1.5 font-mono text-xs">
                              <Barcode className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              <span>{item.codigo}</span>
                            </div>
                          </td>

                          {/* COLUNA DE GRUPO (Se tipo = grupos) - NEUTRA SEM COR */}
                          {listaAtiva.tipo === 'grupos' && (
                            <td 
                              onClick={() => setItemParaMudarMotivo(item)}
                              className="py-1 px-1 sm:px-2 text-center border-r border-gray-200 cursor-pointer"
                            >
                              {(() => {
                                const grupo = listaAtiva.grupos?.find(g => g.id === item.grupoId);
                                return grupo ? (
                                  <span className="text-gray-700 font-semibold text-xs truncate block max-w-[105px] mx-auto">
                                    {grupo.nome}
                                  </span>
                                ) : (
                                  <span className="text-gray-400 text-xs italic">Sem Grupo</span>
                                );
                              })()}
                            </td>
                          )}

                          {/* COLUNA DE STATUS DE VALIDAÇÃO E SINCRONIZAÇÃO */}
                          <td className="py-1 px-1 sm:px-2 text-center border-r border-gray-200">
                            <div className="flex items-center justify-center gap-1 flex-wrap">
                              <button
                                type="button"
                                onClick={() => handleToggleItemValidado(item.id)}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase transition-all cursor-pointer border shadow-2xs ${
                                  item.validado
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                    : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                                }`}
                                title="Clique para alternar entre Validado e Pendente"
                              >
                                {item.validado ? (
                                  <>
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    <span>Validado</span>
                                  </>
                                ) : (
                                  <>
                                    <AlertCircle className="w-3 h-3 text-amber-600" />
                                    <span>Pendente</span>
                                  </>
                                )}
                              </button>

                              {item.syncStatus === 'pendente' && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200" title="Item gravado no cliente, pendente de envio para o banco">
                                  <Clock className="w-2.5 h-2.5 text-amber-600" /> Sync Pend.
                                </span>
                              )}
                              {item.syncStatus === 'sincronizando' && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-800 border border-blue-200" title="Sincronizando com o Firebase...">
                                  <Loader2 className="w-2.5 h-2.5 text-[#3483FA] animate-spin" /> Syncing
                                </span>
                              )}
                            </div>
                          </td>

                          {/* COLUNA BIPADO POR - NEUTRA SEM COR */}
                          <td 
                            className="py-1 px-1 sm:px-2 text-center border-r border-gray-200"
                          >
                            <span 
                              className="text-gray-700 font-medium text-xs truncate max-w-[120px] inline-flex items-center justify-center gap-1"
                              title={`Bipado por: ${item.responsavel || listaAtiva.responsavel || 'Operador'}`}
                            >
                              <UserIcon className="w-2.5 h-2.5 text-gray-400 flex-shrink-0" />
                              <span className="truncate">{item.responsavel || listaAtiva.responsavel || 'Operador'}</span>
                            </span>
                          </td>

                          {/* COLUNA ROTA - BASEADA NO ARQUIVO DE REFUGO ATUAL, SÓ TEM COR SE TIVER ROTA */}
                          <td 
                            onClick={() => setItemParaMudarMotivo(item)}
                            className="py-1 px-1 sm:px-2 text-center cursor-pointer border-r border-gray-200"
                            title="Clique para alterar o motivo deste ID"
                          >
                            {hasRota ? (
                              <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-bold text-xs inline-block shadow-2xs">
                                {itemRota}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs italic">
                                Sem Rota
                              </span>
                            )}
                          </td>

                          {/* COLUNA SAÍDA - NEUTRA SEM COR */}
                          <td 
                            onClick={() => setItemParaMudarMotivo(item)}
                            className="py-1 px-1 sm:px-2 text-center cursor-pointer border-r border-gray-200"
                            title="Clique para alterar o motivo deste ID"
                          >
                            <span className="text-gray-600 font-semibold text-xs uppercase">
                              {getShortSaida(item.saida)}
                            </span>
                          </td>

                          {/* COLUNA MOTIVO - TEM COR */}
                          <td 
                            onClick={() => setItemParaMudarMotivo(item)}
                            className="py-1 px-1 sm:px-2 text-center cursor-pointer border-r border-gray-200"
                            title="Clique para abrir a gaveta e alterar o motivo"
                          >
                            <div className={`${getMotivoStyle(item.motivo)} border px-2 py-0.5 text-[10px] font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs group-hover:shadow mx-auto uppercase tracking-wide rounded`}>
                              <span>{item.motivo || 'Pendente'}</span>
                              <Edit2 className="w-3 h-3 opacity-50 group-hover:opacity-100" />
                            </div>
                          </td>

                          {/* COLUNA DATA / HORA - NEUTRA */}
                          <td className="py-1 px-1 sm:px-2 text-center text-gray-500 text-[11px] border-r border-gray-200">
                            {item.scannedAt}
                          </td>
                          <td className="py-1 px-1 sm:px-2 text-center">
                            <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleCopy(item.codigo)}
                                className="p-1 hover:bg-gray-200 text-gray-500 hover:text-black transition-colors cursor-pointer"
                                title="Copiar ID"
                              >
                                {copiedId === item.codigo ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={() => handleRemoverItem(item.id)}
                                className="p-1 hover:bg-red-100 text-red-600 transition-colors cursor-pointer"
                                title="Remover Item"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isEditingMotivo && (
                          <tr className="bg-blue-50/30 border-b border-gray-300 shadow-inner">
                            <td colSpan={listaAtiva.tipo === 'grupos' ? 11 : 10} className="p-0">
                              <div className="px-6 py-4 border-l-4 border-[#3483FA]">
                                <div className="flex flex-col xl:flex-row gap-6 items-start xl:items-center justify-between">
                                  <div className="flex-1 space-y-2 w-full max-w-md">
                                    <label className="text-xs font-black text-[#3483FA] uppercase tracking-widest flex items-center gap-2">
                                      <Edit2 className="w-4 h-4" /> Editando Motivo: {item.codigo}
                                    </label>
                                    <div className="flex gap-2 w-full">
                                      <input
                                        type="text"
                                        placeholder="Escreva o motivo manualmente..."
                                        value={itemParaMudarMotivo.motivo}
                                        onChange={(e) => setItemParaMudarMotivo({ ...itemParaMudarMotivo, motivo: e.target.value })}
                                        className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:border-[#3483FA] focus:ring-2 focus:ring-blue-100 transition-all"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleMudarMotivoItem(itemParaMudarMotivo.motivo)}
                                        className="px-5 py-2 bg-[#3483FA] hover:bg-blue-600 text-white rounded-lg text-sm font-black transition-colors active:scale-95 shadow-sm cursor-pointer"
                                      >
                                        Salvar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setItemParaMudarMotivo(null)}
                                        className="px-3 py-2 bg-white hover:bg-gray-100 border border-gray-300 text-gray-500 rounded-lg text-sm font-black transition-colors active:scale-95 cursor-pointer"
                                        title="Cancelar"
                                      >
                                        <X className="w-5 h-5" />
                                      </button>
                                    </div>
                                  </div>
                                  
                                  <div className="flex-1 w-full xl:border-l xl:border-gray-200 xl:pl-6">
                                    <label className="text-xs font-black text-gray-500 uppercase tracking-widest mb-2 block">
                                      Sugestões Rápidas
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                      {MOTIVOS_DISPONIVEIS.map((m) => {
                                        const isSelectedM = itemParaMudarMotivo.motivo === m;
                                        return (
                                          <button
                                            key={m}
                                            onClick={() => handleMudarMotivoItem(m)}
                                            className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm hover:shadow active:scale-95 cursor-pointer ${
                                              isSelectedM 
                                                ? 'bg-[#3483FA] text-white border-[#3483FA]' 
                                                : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'
                                            }`}
                                          >
                                            {m}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-gray-400">
                <Barcode className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                <p className="font-bold text-gray-600 text-sm">Nenhum ID nesta lista ainda</p>
                <p className="text-xs text-gray-400 mt-1">Bipe pacotes para dar entrada nesta lista.</p>
              </div>
            )}
          </div>
        </div>

        {/* COLUNA DIREITA — SCANNER + MÉTRICAS + OPERADORES */}
        <div className="space-y-6">
          
          {/* Card Bip Scanner (AGORA NA DIREITA PERTO DAS MÉTRICAS) */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white border border-gray-200 rounded-2xl p-6 shadow-md border-t-8 border-t-[#3483FA]"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-2">
                <Barcode className="w-5 h-5 text-[#3483FA]" />
                <span className="font-bold text-sm text-[#333333]">Leitor de Pacotes</span>
              </div>

              <button 
                type="button" 
                onClick={() => {
                  setIsLocked(!isLocked);
                  if (isLocked) setTimeout(() => inputRef.current?.focus(), 50);
                }}
                className={`w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm border cursor-pointer ${
                  isLocked 
                    ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' 
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                {isLocked ? <><Lock className="w-3.5 h-3.5" /> Travado</> : <><Unlock className="w-3.5 h-3.5" /> Liberado</>}
              </button>
            </div>

            {/* Form de Bip */}
            <form onSubmit={handleBip} className="mt-3">
              <div className="relative flex items-center">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Barcode className={`h-5 w-5 ${isLocked ? 'text-gray-300' : 'text-[#3483FA]'}`} />
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  value={bipInput}
                  onChange={(e) => setBipInput(e.target.value)}
                  onPaste={async (e) => {
                    const pastedData = e.clipboardData.getData('text');
                    if (pastedData && (pastedData.includes('\n') || pastedData.includes(',') || pastedData.includes(' '))) {
                      e.preventDefault();
                      const rawCodigos = pastedData.split(/[\n,;\t\s]+/).map(s => s.trim()).filter(Boolean);
                      const cleanInputigos = validateAndCleanIds(rawCodigos);
                      if (cleanInputigos.length > 0) {
                        if (modoIndividual) {
                          // No modo individual, colar significa "bipar" todos. Adiciona e valida!
                          const novos = [...itensModoIndividual];
                          const saidaItemFinal = listaAtiva?.saidaPadrao || selectedSaida || 'Ciclo 2 - Saída PM';
                          
                          cleanInputigos.forEach(cleanInput => {
                             const cleanInputDigits = cleanDigits(cleanInput);
                             const jaExiste = novos.some(
                               i => i.codigo === cleanInput || (cleanDigits(i.codigo) === cleanInputDigits && cleanInputDigits !== '')
                             );
                             if (!jaExiste) {
                               const cleanInputWithoutM = cleanInput.replace(/m$/i, '');
                               const refugoMatch = refugoBaseRows.find(r => {
                                 if (!r.id) return false;
                                 const rId = r.id.trim().toUpperCase();
                                 if (rId === cleanInput) return true;
                                 if (rId.replace(/m$/i, '') === cleanInputWithoutM) return true;
                                 const rDigits = cleanDigits(rId);
                                 return Boolean(rDigits && cleanInputDigits && rDigits === cleanInputDigits);
                               });
                               const rotaItemFinal = (refugoMatch && refugoMatch.rota && refugoMatch.rota.trim() !== '' && refugoMatch.rota.toLowerCase() !== 'sem rota' && refugoMatch.rota !== '-')
                                 ? refugoMatch.rota.trim() : 'Sem Rota';
                               
                               const itemPrincipal = listaAtiva?.itens.find(
                                 item => item.codigo === cleanInput || (cleanDigits(item.codigo) === cleanInputDigits && cleanInputDigits !== '')
                               );
                               const rotaParaUsar = rotaItemFinal !== 'Sem Rota' ? rotaItemFinal : (itemPrincipal?.rota || 'Sem Rota');

                               novos.unshift({
                                 id: 'ind-' + Date.now().toString() + Math.random().toString(36).substring(2, 9),
                                 codigo: cleanInput,
                                 rota: rotaParaUsar,
                                 saida: saidaItemFinal,
                                 motivo: selectedMotivo || 'Desconteinerizado',
                                 scannedAt: new Date().toLocaleString('pt-BR'),
                                 responsavel: operanteNome,
                                 validado: true
                               });
                             }
                          });
                          setItensModoIndividual(novos);
                          setLastScanResult({
                            status: 'success',
                            code: 'LOTE',
                            message: `${cleanInputigos.length} IDs colados e validados na sessão!`
                          });
                        } else {
                          // Na lista normal, agilizar usando verificação em lote
                          setVerificarLoteText(cleanInputigos.join('\n'));
                          setShowVerificarLoteModal(true);
                        }
                      }
                    }
                  }}

                  onBlur={() => {
                    if (!isLocked) setTimeout(() => inputRef.current?.focus(), 150);
                  }}
                  disabled={isLocked}
                  className={`block w-full pl-11 pr-3 py-2.5 border rounded-xl text-lg font-mono font-bold transition-all ${
                    isLocked 
                      ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
                      : 'border-[#3483FA]/40 focus:ring-2 focus:ring-[#3483FA]/20 focus:border-[#3483FA] text-[#333333] placeholder-gray-400'
                  }`}
                  placeholder="ID do pacote..."
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={isLocked || !bipInput.trim()}
                className="w-full mt-2 py-2.5 bg-[#3483FA] hover:bg-blue-600 disabled:bg-gray-200 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-sm"
              >
                Registrar Bip
              </button>
            </form>

            {/* Feedback Bip */}
            {lastScanResult && (
              <div className={`mt-3 px-3 py-2 rounded-lg border text-[10px] flex items-center gap-2 font-bold animate-in slide-in-from-top-1 ${
                lastScanResult.status === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
              }`}>
                {lastScanResult.status === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <XCircle className="w-4 h-4 text-red-600 shrink-0" />}
                <div className="truncate">
                  <span className="font-mono">{lastScanResult.code}</span> — {lastScanResult.message}
                </div>
              </div>
            )}
          </motion.div>

          {/* Painel 1: Quantidades e Métricas (APENAS O QUE EXISTE NOS IDS) */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white border border-gray-200 rounded-2xl p-6 shadow-md space-y-5"
          >
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <PieChart className="w-5 h-5 text-[#3483FA]" />
                <h3 className="font-bold text-sm text-[#333333]">
                  {modoIndividual ? `Métricas - Modo Individual (${operanteNome})` : 'Métricas de Coleta'}
                </h3>
              </div>
            </div>

            {/* Total de Coletados Card Grande */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 p-5 rounded-2xl text-center space-y-3 shadow-inner">
              <div>
                <p className="text-4xl font-black text-[#3483FA] tracking-tighter">{totalColetados}</p>
                <p className="text-xs font-bold text-gray-700 uppercase tracking-widest mt-1">
                  {modoIndividual ? 'IDs Bipados na Sessão Individual' : 'IDs Coletados'}
                </p>
              </div>

              {/* Botões de Ação Direta nas Métricas */}
              <div className={`grid ${listaAtiva.status === 'em_andamento' && !modoIndividual ? 'grid-cols-2' : 'grid-cols-1 max-w-xs mx-auto'} gap-3 pt-4 border-t border-blue-200/50`}>
                {listaAtiva.status === 'em_andamento' && !modoIndividual && (
                  <button
                    type="button"
                    onClick={() => setListaParaFinalizar(listaAtiva)}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Finalizar
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAbrirVerificar}
                  className="w-full py-2.5 bg-[#3483FA] hover:bg-blue-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  <CheckSquare className="w-4 h-4" />
                  {modoIndividual ? 'Verificar Lista Individual' : 'Verificar'}
                </button>
              </div>
            </div>
          </motion.div>

          {/* Painel: Quem está na tela de lista e quantos bips teve (reflete em tempo real para todos) */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 }}
            className="bg-white border border-gray-200 rounded-2xl p-5 shadow-md space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-[#3483FA]" />
                <div>
                  <h3 className="font-bold text-sm text-[#333333]">Bips por Operador</h3>
                  <p className="text-[10px] text-gray-400 font-medium">Contagem de bips nesta lista</p>
                </div>
              </div>
              <span className="text-[10px] font-extrabold text-[#3483FA] bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                {bipsPorOperador.length} {bipsPorOperador.length === 1 ? 'operador' : 'operadores'}
              </span>
            </div>

            <div className="space-y-2.5">
              {bipsPorOperador.length === 0 ? (
                <div className="p-4 text-center text-gray-400 text-xs bg-gray-50 rounded-xl">
                  Nenhum bip registrado ainda.
                </div>
              ) : (
                bipsPorOperador.map((op) => {
                  const pct = totalColetados > 0 ? Math.round((op.total / totalColetados) * 100) : 0;
                  return (
                    <div 
                      key={op.nome} 
                      className={`p-3 rounded-xl border transition-all ${
                        op.isVoce 
                          ? 'bg-blue-50/70 border-blue-200 shadow-xs' 
                          : 'bg-gray-50/80 border-gray-100 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-8 h-8 rounded-xl font-bold text-xs flex items-center justify-center flex-shrink-0 shadow-xs ${
                            op.isVoce 
                              ? 'bg-[#3483FA] text-white' 
                              : 'bg-gray-300 text-gray-700'
                          }`}>
                            {op.nome.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[#333333] truncate flex items-center gap-1.5">
                              {op.nome}
                              {op.isVoce && (
                                <span className="text-[9px] bg-blue-100 text-[#3483FA] px-1.5 py-0.2 rounded font-black uppercase tracking-tight">
                                  VOCÊ
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="text-right flex-shrink-0">
                          <span className="text-xs font-black text-gray-800">
                            {op.total} <span className="text-[10px] font-semibold text-gray-500">{op.total === 1 ? 'bip' : 'bips'}</span>
                          </span>
                          {totalColetados > 0 && (
                            <p className="text-[10px] font-bold text-gray-400">{pct}%</p>
                          )}
                        </div>
                      </div>

                      {/* Barra de Progresso visual dos bips */}
                      <div className="w-full bg-gray-200/80 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-300 ${
                            op.isVoce ? 'bg-[#3483FA]' : 'bg-gray-500'
                          }`}
                          style={{ width: `${Math.max(pct, op.total > 0 ? 3 : 0)}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>

        </div>

      </div>

      {/* MODAL DE VERIFICAÇÃO DE IDS DO CICLO (VERIFICAR) */}
      {showVerificarModal && listaAtiva && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-2xl border border-gray-100 flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100 flex-shrink-0">
              <div>
                <h3 className="text-base font-bold text-[#333333] flex items-center gap-2">
                  <CheckSquare className="w-5 h-5 text-[#3483FA]" />
                  Verificação de IDs do Ciclo
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Todos os pacotes são <strong className="text-emerald-700">Válidos</strong> por padrão. Marque apenas os que deseja remover (<strong className="text-amber-700">Não Validar</strong>).
                </p>
              </div>
              <button onClick={() => setShowVerificarModal(false)} className="text-gray-400 hover:text-black cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Lista de Itens */}
            <div className="overflow-y-auto flex-1 pr-1 space-y-3 pt-2">
              {/* Input de Scanner / Verificação Rápida */}
              <form onSubmit={handleVerificarPorInput} className="bg-gray-50 p-3 rounded-xl border border-gray-200 shadow-xs">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                    Opcional: Bipar ID para conferência rápida
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowVerificarLoteModal(true)}
                      className="text-[10px] bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-2 py-1 rounded-lg font-bold flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <ListPlus className="w-3 h-3" />
                      Modo Lote
                    </button>
                  </div>
                </div>
                <div className="relative flex gap-2">
                  <div className="relative flex-1">
                    <Barcode className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                    <input
                      type="text"
                      value={verificarInput}
                      onChange={(e) => setVerificarInput(e.target.value)}
                      placeholder="Bipe ou digite o ID do pacote..."
                      className="w-full bg-white border border-gray-300 rounded-xl pl-9 pr-3 py-2 text-xs font-mono font-bold text-[#333333] focus:outline-none focus:border-[#3483FA] focus:ring-2 focus:ring-blue-100"
                      autoFocus
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#3483FA] hover:bg-blue-600 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer"
                  >
                    Verificar
                  </button>
                </div>
              </form>

              {(() => {
                const itensNaoValidados = itensVerificarSnap;
                const totalItens = itensNaoValidados.length;
                if (totalItens === 0) {
                  return (
                    <div className="py-8 text-center text-gray-400 text-xs">
                      Nenhum item pendente de verificação nesta lista.
                    </div>
                  );
                }

                // Controle de exibição (paginação de verificação)
                const totalPaginas = Math.ceil(totalItens / tamanhoLote);
                // Garantir que a página atual seja válida caso o tamanho do lote mude
                const paginaAtualSafe = verificarPagina >= totalPaginas ? Math.max(0, totalPaginas - 1) : verificarPagina;
                const itensExibidos = itensNaoValidados.slice(paginaAtualSafe * tamanhoLote, (paginaAtualSafe + 1) * tamanhoLote);

                return (
                  <>
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center bg-blue-50/50 p-2 rounded-lg border border-blue-100 text-xs text-blue-900 font-bold mb-2 gap-2">
                      <div className="flex items-center gap-2">
                        <span>Página {paginaAtualSafe + 1} de {Math.max(1, totalPaginas)} ({itensExibidos.length} pacotes)</span>
                        <select
                          value={tamanhoLote}
                          onChange={(e) => {
                            setTamanhoLote(Number(e.target.value));
                            setVerificarPagina(0);
                            setCopiedPage(null);
                          }}
                          className="px-2 py-1 bg-white border border-blue-200 rounded text-blue-700 outline-none"
                        >
                          <option value={5}>5 por vez</option>
                          <option value={10}>10 por vez</option>
                          <option value={20}>20 por vez</option>
                          <option value={50}>50 por vez</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            const text = itensExibidos.map(i => i.codigo).join('\n');
                            navigator.clipboard.writeText(text).then(() => setCopiedPage(paginaAtualSafe));
                          }}
                          className={`px-4 py-1.5 rounded-lg shadow-sm flex items-center gap-2 cursor-pointer font-black text-xs transition-all active:scale-95 ${
                            copiedPage === paginaAtualSafe 
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md ring-2 ring-emerald-300'
                              : 'bg-[#3483FA] hover:bg-blue-600 text-white'
                          }`}
                          title="Copiar IDs para validação no sistema"
                        >
                          {copiedPage === paginaAtualSafe ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-white" />
                              <span>Copiado</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4 text-white" />
                              <span>Copiar {itensExibidos.length}</span>
                            </>
                          )}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={paginaAtualSafe === 0}
                          onClick={() => {
                            setVerificarPagina(paginaAtualSafe - 1);
                            setCopiedPage(null);
                          }}
                          className="px-3 py-1.5 bg-white border border-blue-200 text-blue-600 rounded-md disabled:opacity-40 cursor-pointer font-bold hover:bg-blue-50 transition-colors"
                        >
                          Anterior
                        </button>
                        <button
                          type="button"
                          disabled={paginaAtualSafe >= totalPaginas - 1}
                          onClick={() => {
                            setVerificarPagina(paginaAtualSafe + 1);
                            setCopiedPage(null);
                          }}
                          className="px-3 py-1.5 bg-[#3483FA] text-white rounded-md disabled:opacity-40 cursor-pointer font-black hover:bg-blue-600 transition-colors shadow-sm flex items-center gap-1"
                        >
                          Próximo <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {itensExibidos.map((item, idx) => {
                        const globalIndex = (paginaAtualSafe * tamanhoLote) + idx + 1;
                        const currentVerificarStatus = verificarMap[item.id] || 'valido';
                        const isEmRota = currentVerificarStatus === 'em_rota';
                        const isVerificado = currentVerificarStatus === 'verificado';

                        return (
                          <div 
                            key={item.id} 
                            className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                              isEmRota 
                                ? 'bg-amber-50/80 border-amber-300' 
                                : isVerificado
                                ? 'bg-emerald-50/80 border-emerald-300'
                                : 'bg-white border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-xs text-gray-400 font-bold w-6">#{globalIndex}</span>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-mono font-bold text-sm text-[#333333]">{item.codigo}</p>
                                  <span 
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-tight border ${
                                      (item.responsavel || listaAtiva.responsavel) === operanteNome
                                        ? 'bg-blue-50 text-[#3483FA] border-blue-200'
                                        : 'bg-gray-100 text-gray-700 border-gray-200'
                                    }`}
                                    title={`Bipado por: ${item.responsavel || listaAtiva.responsavel || 'Operador'}`}
                                  >
                                    <UserIcon className="w-2.5 h-2.5 opacity-60" />
                                    {item.responsavel || listaAtiva.responsavel || 'Operador'}
                                  </span>
                                  {isVerificado && (
                                    <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded font-black text-[10px] uppercase flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Verificado
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500">
                                  <span>Motivo: <strong className="text-gray-700">{item.motivo}</strong></span>
                                  <span>• {item.scannedAt}</span>
                                </div>
                              </div>
                            </div>

                            {/* BOTOES DE STATUS NO VERIFICAR */}
                            <div className="flex items-center gap-1.5 self-end sm:self-center">
                              <button
                                type="button"
                                onClick={() => handleToggleVerificarStatus(item.id, isEmRota ? 'valido' : 'em_rota')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                                  isEmRota 
                                    ? 'bg-amber-600 text-white shadow-xs' 
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                              >
                                <AlertCircle className="w-3.5 h-3.5" />
                                {isEmRota ? 'Desfazer' : 'Não Validar'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Modal Footer: Resumo + Concluir / Finalizar */}
            <div className="mt-4 pt-3 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
              {(() => {
                const totalValidos = Object.values(verificarMap).filter(s => s !== 'em_rota').length;
                const totalEmRota = Object.values(verificarMap).filter(s => s === 'em_rota').length;
                return (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 flex items-center gap-1">
                        <CheckSquare className="w-3.5 h-3.5" />
                        {totalValidos} Válidos
                      </span>
                      <span className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {totalEmRota} Não Validados
                      </span>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => setShowVerificarModal(false)}
                        className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleConcluirVerificacao}
                        className="px-4 py-2 bg-[#3483FA] hover:bg-blue-600 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
                        title="Salvar com os itens válidos e retornar para a tela de coleta"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Concluir
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>

          </div>
        </div>
      )}

      {/* Modal Verificar em Lote */}
      {showVerificarLoteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100">
              <h3 className="text-base font-bold text-[#333333] flex items-center gap-2">
                <ListPlus className="w-5 h-5 text-[#3483FA]" />
                Verificação em Lote (Colar IDs Válidos)
              </h3>
              <button onClick={() => setShowVerificarLoteModal(false)} className="text-gray-400 hover:text-black cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleProcessarVerificarLote(); }}>
              <div className="space-y-4">
                <div>
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 block">
                    Cole os códigos verificados (um por linha)
                  </label>
                  <textarea
                    value={verificarLoteText}
                    onChange={(e) => setVerificarLoteText(e.target.value)}
                    rows={8}
                    className="w-full bg-gray-50 border border-gray-300 rounded-xl p-3 text-xs font-mono focus:outline-none focus:border-[#3483FA] focus:ring-2 focus:ring-blue-100"
                    placeholder="Cole aqui a lista de IDs...&#10;123456789&#10;987654321&#10;..."
                    autoFocus
                  />
                  <p className="text-[10px] text-gray-500 mt-2">
                    Todos os pacotes que derem match com esta lista serão validados. Os restantes continuarão pendentes na lista (não validados).
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-6 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowVerificarLoteModal(false)}
                  className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!verificarLoteText.trim()}
                  className="flex-1 py-2.5 bg-[#3483FA] hover:bg-blue-600 disabled:bg-blue-300 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Validar Lote
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Colar Lote */}
      {showModalLote && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100">
              <h3 className="text-base font-bold text-[#333333] flex items-center gap-2">
                <ListPlus className="w-5 h-5 text-[#3483FA]" />
                Adicionar Lote de IDs na Lista
              </h3>
              <button onClick={() => setShowModalLote(false)} className="text-gray-400 hover:text-black cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {isImporting ? (
              <div className="py-8 space-y-6 text-center">
                <div className="inline-block p-4 bg-blue-50 text-[#3483FA] rounded-2xl">
                  <ListPlus className="w-8 h-8 animate-bounce" />
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-black text-gray-800">{importStatusText}</h4>
                  <div className="w-full bg-gray-100 rounded-full h-3.5 overflow-hidden border border-gray-200 p-0.5">
                    <div 
                      className="bg-[#3483FA] h-full transition-all duration-300 rounded-full" 
                      style={{ width: `${importProgress}%` }}
                    />
                  </div>
                  <p className="text-xs font-black text-[#3483FA]">{importProgress}% Concluído</p>
                </div>
                <p className="text-[11px] text-gray-400 font-medium">Processamento otimizado para carregar todos os IDs sem perdas.</p>
              </div>
            ) : (
              <form onSubmit={handleAdicionarLote} className="space-y-4">
                <p className="text-xs text-gray-500">
                  Cole múltiplos IDs abaixo (separados por linha ou vírgula). Todos serão vinculados ao ciclo <strong className="text-blue-700">{selectedSaida}</strong>.
                </p>
                <textarea
                  value={loteText}
                  onChange={(e) => setLoteText(e.target.value)}
                  placeholder="78230012345678&#10;78230098765432"
                  rows={5}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs font-mono focus:outline-none focus:border-[#3483FA]"
                  required
                />

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase tracking-wider font-bold text-gray-500">Motivo para o Lote</label>
                  <select
                    value={loteMotivo}
                    onChange={(e) => setLoteMotivo(e.target.value)}
                    className="w-full bg-white border border-gray-300 text-xs font-bold text-gray-700 rounded-lg p-2 focus:outline-none focus:border-[#3483FA]"
                  >
                    {MOTIVOS_DISPONIVEIS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowModalLote(false)}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isImporting || !loteText.trim()}
                    className="px-4 py-2 bg-[#3483FA] hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer transition-all flex items-center gap-1.5"
                  >
                    {isImporting ? 'Enviando...' : 'Adicionar Lote'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL TRANSFERIR ADMIN */}
      {showTransferirModal && listaAtiva && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-gray-100 flex flex-col">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100 flex-shrink-0">
              <div>
                <h3 className="text-base font-bold text-[#333333] flex items-center gap-2">
                  <Users className="w-5 h-5 text-amber-500" />
                  Transferir Admin da Lista
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">Selecione o novo responsável</p>
              </div>
              <button onClick={() => setShowTransferirModal(false)} className="text-gray-400 hover:text-black cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wider font-bold text-gray-500">Novo Responsável</label>
                <select 
                  id="selectTransferAdmin"
                  className="w-full bg-white border border-gray-300 text-sm text-gray-700 rounded-lg p-2.5 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Selecione um usuário...</option>
                  {usuariosSistemaOnline.filter(u => u.username !== listaAtiva.responsavel).map(u => (
                    <option key={u.id} value={u.username}>{u.username}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="mt-6 pt-3 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setShowTransferirModal(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const selectEl = document.getElementById('selectTransferAdmin') as HTMLSelectElement;
                  const newAdmin = selectEl?.value;
                  if (newAdmin) {
                    const updatedLista = { ...listaAtiva, responsavel: newAdmin };
                    await saveLista(updatedLista);
                    setShowTransferirModal(false);
                  }
                }}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Transferir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GAVETA DE CONFIRMAÇÃO DE EXCLUSÃO DE LISTA */}
      <AnimatePresence>
        {listaParaExcluir && (
          <div className="fixed inset-0 z-[60] flex justify-end overflow-hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setListaParaExcluir(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-sm bg-white shadow-2xl h-full flex flex-col"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-red-50/50">
                <div className="flex items-center gap-2 text-red-600">
                  <AlertCircle className="w-6 h-6" />
                  <h3 className="text-lg font-black uppercase tracking-tight">Confirmar Exclusão</h3>
                </div>
                <button 
                  onClick={() => setListaParaExcluir(null)}
                  className="p-2 hover:bg-red-100 rounded-full text-red-400 transition-colors cursor-pointer"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 p-6 space-y-6 overflow-y-auto">
                <div className="bg-red-50 border border-red-100 rounded-2xl p-5 space-y-3">
                  <p className="text-sm font-bold text-red-900 leading-relaxed">
                    Você está prestes a excluir permanentemente esta lista de coleta. Esta ação não pode ser desfeita.
                  </p>
                  <div className="pt-3 border-t border-red-200">
                    <p className="text-[10px] uppercase font-black text-red-500 tracking-wider">Lista Selecionada:</p>
                    <p className="text-base font-black text-red-700">{listaParaExcluir.nome}</p>
                    <p className="text-xs font-bold text-red-600/70">{listaParaExcluir.data} • {listaParaExcluir.itens.length} itens</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">O que acontece agora?</h4>
                  <ul className="space-y-3">
                    <li className="flex gap-3 items-start">
                      <div className="mt-1 p-1 bg-gray-100 rounded-md">
                        <XCircle className="w-3 h-3 text-gray-500" />
                      </div>
                      <p className="text-xs font-bold text-gray-600 leading-snug">
                        Todos os bips registrados nesta lista serão apagados do sistema.
                      </p>
                    </li>
                    <li className="flex gap-3 items-start">
                      <div className="mt-1 p-1 bg-gray-100 rounded-md">
                        <Users className="w-3 h-3 text-gray-500" />
                      </div>
                      <p className="text-xs font-bold text-gray-600 leading-snug">
                        Outros operadores deixarão de ver esta lista imediatamente.
                      </p>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="p-6 bg-gray-50 border-t border-gray-100 space-y-3">
                <button
                  onClick={() => handleExcluirLista(listaParaExcluir.id)}
                  className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black text-sm shadow-lg shadow-red-200 transition-all flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
                >
                  <Trash2 className="w-5 h-5" />
                  CONFIRMAR EXCLUSÃO
                </button>
                <button
                  onClick={() => setListaParaExcluir(null)}
                  className="w-full py-4 bg-white border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-2xl font-black text-sm transition-all cursor-pointer"
                >
                  CANCELAR
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* POPUP DE CONFIRMAÇÃO DE FINALIZAÇÃO DE LISTA */}
      <AnimatePresence>
        {listaParaFinalizar && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setListaParaFinalizar(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden z-10"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-emerald-50/50">
                <div className="flex items-center gap-2 text-emerald-600">
                  <CheckCircle2 className="w-6 h-6" />
                  <h3 className="text-lg font-black uppercase tracking-tight">Finalizar Lista</h3>
                </div>
                <button 
                  onClick={() => setListaParaFinalizar(null)}
                  className="p-2 hover:bg-emerald-100 rounded-full text-emerald-400 transition-colors cursor-pointer"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 space-y-3">
                  <p className="text-sm font-bold text-emerald-900 leading-relaxed">
                    Deseja realmente finalizar esta lista de coleta? Ao confirmar, o arquivo CSV com todos os IDs limpos e corrigidos será baixado automaticamente.
                  </p>
                  <div className="pt-3 border-t border-emerald-200">
                    <p className="text-[10px] uppercase font-black text-emerald-600 tracking-wider">Lista Selecionada:</p>
                    <p className="text-base font-black text-emerald-800">{listaParaFinalizar.nome}</p>
                    <p className="text-xs font-bold text-emerald-700/70">{listaParaFinalizar.data} • {listaParaFinalizar.itens.length} itens coletados</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">O que será feito?</h4>
                  <ul className="space-y-2">
                    <li className="flex gap-3 items-start">
                      <div className="mt-1 p-1 bg-gray-100 rounded-md">
                        <Check className="w-3 h-3 text-emerald-600" />
                      </div>
                      <p className="text-xs font-bold text-gray-600 leading-snug">
                        Todos os IDs serão limpos e corrigidos (removendo espaços extras e caracteres inválidos).
                      </p>
                    </li>
                    <li className="flex gap-3 items-start">
                      <div className="mt-1 p-1 bg-gray-100 rounded-md">
                        <Download className="w-3 h-3 text-emerald-600" />
                      </div>
                      <p className="text-xs font-bold text-gray-600 leading-snug">
                        O relatório CSV final será gerado e baixado no seu dispositivo.
                      </p>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
                <button
                  onClick={() => setListaParaFinalizar(null)}
                  className="flex-1 py-3 bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 font-bold rounded-xl text-xs transition-all cursor-pointer"
                >
                  CANCELAR
                </button>
                <button
                  onClick={() => handleFinalizarLista(listaParaFinalizar.id)}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  SIM, FINALIZAR E BAIXAR
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Overlay com Círculo Giratório ao abrir ou criar lista */}
      {isLoadingLista && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-[9999] animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl p-6 shadow-2xl border border-gray-100 flex flex-col items-center gap-4 max-w-xs w-full text-center">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-[#3483FA] animate-spin" />
            </div>
            <div>
              <h4 className="text-base font-bold text-[#333333]">{loadingMessage}</h4>
              <p className="text-xs text-gray-500 mt-1">Aguarde um instante...</p>
            </div>
          </div>
        </div>
      )}
      </div>
  );
};
