import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  AlertCircle,
  CheckSquare,
  Square,
  Filter,
  CheckCheck,
  Zap,
  Loader2,
  RotateCcw,
  Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  listenToRefugoScans, 
  saveRefugoScans, 
  listenToRefugo,
  listenToListas,
  saveLista,
  addItemToLista,
  updateItemInLista,
  deleteItemFromLista,
  addItemsBatchToLista,
  deleteItemsBatchFromLista,
  updateItemsBatchMotivo,
  deleteLista as deleteListaFirestore,
  getListaSortTimestamp,
  listenToListaItens,
  reconcileListaCounts
} from '../lib/firebase';
import { 
  apiBipItem, 
  apiUpdateItem, 
  apiDeleteItem, 
  apiGetItemsPage, 
  apiSearchItems, 
  apiBatchImport, 
  apiCreateLista, 
  apiUpdateListaMeta, 
  apiDeleteLista,
  apiReconcileListas
} from '../lib/api';
import { RefugoRow, ColetaItem, ColetaLista } from '../types';
import { User, getAllUsers } from '../lib/auth';
import { cleanTrackingId } from '../utils/csvParser';

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

if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
    } catch (_) {}
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('keydown', unlockAudio, { once: true });
}

const playShortBeep = () => {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(850, audioCtx.currentTime);
    
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.05); // 50ms ultra-short beep
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch (_) {}
    };

    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
  } catch (e) {
    console.error("Audio beep error:", e);
  }
};

const cleanDigits = (str: string) => (str || '').replace(/\D/g, '');

/**
 * Extrai apenas a identificação do ciclo para exportação/cópia (ex: "Ciclo 3 - Saída SD" -> "Ciclo 3")
 */
export const formatSaidaCiclo = (saida: string) => {
  if (!saida) return '';
  const trimmed = saida.trim();
  const match = trimmed.match(/Ciclo\s*\d+/i);
  if (match) {
    return match[0].replace(/ciclo/i, 'Ciclo');
  }
  // Se for "AM", "PM", "SD", converte para o respectivo ciclo padrão
  if (/am\b/i.test(trimmed)) return 'Ciclo 1';
  if (/pm\b/i.test(trimmed)) return 'Ciclo 2';
  if (/sd\b/i.test(trimmed)) return 'Ciclo 3';
  return trimmed;
};

interface BipScannerFormProps {
  onBip: (code: string) => void;
  isLocked: boolean;
  onToggleLock: () => void;
  inputRef?: React.RefObject<HTMLInputElement>;
}

const BipScannerForm: React.FC<BipScannerFormProps> = React.memo(({ onBip, isLocked, onToggleLock, inputRef: externalInputRef }) => {
  const [inputValue, setInputValue] = useState('');
  const localInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef || localInputRef;
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    if (!isLocked) {
      inputRef.current?.focus();
    }
  }, [isLocked, inputRef]);

  // Global scanner listener: auto-focus input when a barcode is scanned even if focus was blurred
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (isLocked) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isLocked, inputRef]);

  const submitCurrent = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isLocked || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    onBip(trimmed);
    setInputValue('');
    requestAnimationFrame(() => {
      isSubmittingRef.current = false;
      inputRef.current?.focus();
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitCurrent();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitCurrent();
    }
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-2">
          <Barcode className="w-5 h-5 text-[#3483FA]" />
          <span className="font-bold text-sm text-[#333333]">Leitor de Pacotes</span>
        </div>

        <button 
          type="button" 
          onClick={onToggleLock}
          className={`w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm border cursor-pointer ${
            isLocked 
              ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' 
              : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
          }`}
        >
          {isLocked ? <><Lock className="w-3.5 h-3.5" /> Travado</> : <><Unlock className="w-3.5 h-3.5" /> Liberado</>}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-3">
        <div className="relative flex items-center">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Barcode className={`h-5 w-5 ${isLocked ? 'text-gray-300' : 'text-[#3483FA]'}`} />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (!isLocked) {
                setTimeout(() => {
                  if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
                    inputRef.current?.focus();
                  }
                }, 150);
              }
            }}
            disabled={isLocked}
            className={`block w-full pl-11 pr-3 py-2.5 border rounded-xl text-lg font-mono font-bold transition-all ${
              isLocked 
                ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
                : 'border-[#3483FA]/40 focus:ring-2 focus:ring-[#3483FA]/20 focus:border-[#3483FA] text-[#333333] placeholder-gray-400'
            }`}
            placeholder="ID do pacote..."
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
          />
        </div>
        <button
          type="submit"
          disabled={isLocked || !inputValue.trim()}
          className="w-full mt-2 py-2.5 bg-[#3483FA] hover:bg-blue-600 disabled:bg-gray-200 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-sm"
        >
          Registrar Bip
        </button>
      </form>
    </>
  );
});

export const ListasColeta: React.FC<ListasColetaProps> = ({ currentUser }) => {
  const params = useParams();
  const navigate = useNavigate();
  const [listas, setListas] = useState<ColetaLista[]>([]);
  const activeListaId = params.id || null;
  const [registeredUsers, setRegisteredUsers] = useState<User[]>([]);
  
  const [isLocked, setIsLocked] = useState(false);
  const [lastScanResult, setLastScanResult] = useState<{ status: 'success' | 'error', message: string, code: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dashboardSearchTerm, setDashboardSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [refugoBaseRows, setRefugoBaseRows] = useState<RefugoRow[]>([]);
  const [isLoadingListas, setIsLoadingListas] = useState(true);

  // Configurações do scanner na tela de coleta
  const [selectedSaida, setSelectedSaida] = useState('Ciclo 2 - Saída PM');
  const [selectedMotivo, setSelectedMotivo] = useState('');
  const [selectedRotaItem, setSelectedRotaItem] = useState('');

  // Gaveta/Modal para mudar motivo do ID clicado
  const [itemParaMudarMotivo, setItemParaMudarMotivo] = useState<ColetaItem | null>(null);

  // Seleção e Alteração em Massa de Motivos
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [motivoEmMassaEscolha, setMotivoEmMassaEscolha] = useState<string>('');

  // Paginação para exibição de grandes volumes de IDs sem travar
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(100);
  const [jumpPageInput, setJumpPageInput] = useState<string>('1');

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

  const [listaParaFinalizar, setListaParaFinalizar] = useState<ColetaLista | null>(null);
  const [juntarComBrancas, setJuntarComBrancas] = useState(true);

  // Estados de Carregamento com Círculo Giratório (Spinner)
  const [isLoadingLista, setIsLoadingLista] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Carregando lista...');
  const [openingListaId, setOpeningListaId] = useState<string | null>(null);

  // Modo Individual (Sessão isolada zerada que se unifica na principal ao fechar)
  const [modoIndividual, setModoIndividual] = useState(false);
  const [itensModoIndividual, setItensModoIndividual] = useState<ColetaItem[]>([]);

  // Ref para itens ativos como cache em memória ultra-rápido prevenindo race-conditions em bips velozes
  const activeItensRef = useRef<ColetaItem[]>([]);
  const lastRefugoTextRef = useRef<string>('');

  const inputRef = useRef<HTMLInputElement>(null);

  const operanteNome = currentUser?.username || 'Usuário Atual';

  const [activeItens, setActiveItens] = useState<ColetaItem[]>([]);
  const [isItensLoaded, setIsItensLoaded] = useState(false);

  const [isCopiedPlanilha, setIsCopiedPlanilha] = useState(false);

  useEffect(() => {
    if (activeListaId) {
      setIsLoadingLista(true);
      setIsItensLoaded(false);
      return listenToListaItens(activeListaId, (itens) => {
        setActiveItens(itens);
        setIsItensLoaded(true);
        setIsLoadingLista(false);
        setOpeningListaId(null);
      });
    } else {
      setActiveItens([]);
      setIsItensLoaded(false);
      setIsLoadingLista(false);
      setOpeningListaId(null);
    }
  }, [activeListaId]);

  const rawListaAtiva = listas.find(l => l.id === activeListaId);
  const listaAtiva = rawListaAtiva ? { ...rawListaAtiva, itens: activeItens } : undefined;

  // Reconciliação automática caso os metadados da lista divirjam dos itens reais
  useEffect(() => {
    if (activeListaId && rawListaAtiva && activeItens.length > 0) {
      if (rawListaAtiva.totalItens !== activeItens.length) {
        reconcileListaCounts(activeListaId).catch(() => {});
      }
    }
  }, [activeListaId, rawListaAtiva?.totalItens, activeItens.length]);

  const [isReconciling, setIsReconciling] = useState(false);

  const handleSincronizarContadores = async (listaId?: string) => {
    setIsReconciling(true);
    try {
      await apiReconcileListas(listaId);
    } catch (e) {
      console.error('Erro ao sincronizar contadores:', e);
    } finally {
      setIsReconciling(false);
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
      setIsLoadingListas(false);
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

    return () => {
      unsubListas();
      unsubRefugo();
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
      setSelectedRotaItem(listaAtiva.rota);
      setSelectedSaida(listaAtiva.saidaPadrao || 'Ciclo 2 - Saída PM');
      setSelectedMotivo(listaAtiva.motivoPadrao || '');
    }
  }, [activeListaId]);

  // Timeout de segurança caso a conexão de rede demore ou caia
  useEffect(() => {
    if (activeListaId && !isItensLoaded && isLoadingLista) {
      const t = setTimeout(() => {
        setIsItensLoaded(true);
        setIsLoadingLista(false);
        setOpeningListaId(null);
      }, 7000);
      return () => clearTimeout(t);
    }
  }, [activeListaId, isItensLoaded, isLoadingLista]);

  const handleAbrirLista = (id: string) => {
    setOpeningListaId(id);
    setLoadingMessage('Carregando lista de coleta...');
    setIsLoadingLista(true);
    navigate(`/listas/${id}`);
  };

  // Mapa indexado em memória para busca O(1) instantânea de rota por ID (elimina qualquer lag de busca)
  const refugoMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!refugoBaseRows || refugoBaseRows.length === 0) return map;

    for (let i = 0; i < refugoBaseRows.length; i++) {
      const r = refugoBaseRows[i];
      if (!r.id) continue;
      const rota = (r.rota && r.rota.trim() !== '' && r.rota.toLowerCase() !== 'sem rota' && r.rota !== '-')
        ? r.rota.trim()
        : '';
      if (!rota) continue;

      const rId = r.id.trim().toUpperCase();
      map.set(rId, rota);
      const withoutM = rId.replace(/m$/i, '');
      if (!map.has(withoutM)) map.set(withoutM, rota);
      const digits = cleanDigits(rId);
      if (digits && !map.has(digits)) map.set(digits, rota);
    }
    return map;
  }, [refugoBaseRows]);

  // Lista indexada de IDs sem rota presentes na base de refugo (brancas)
  const idsBrancasRefugo = useMemo(() => {
    if (!refugoBaseRows || refugoBaseRows.length === 0) return [];
    const set = new Set<string>();
    for (let i = 0; i < refugoBaseRows.length; i++) {
      const r = refugoBaseRows[i];
      if (!r || !r.id) continue;
      const cleanId = String(r.id || '').trim().toUpperCase();
      if (!cleanId || ['ID', 'CODIGO', 'CÓDIGO', 'PACOTE', 'TRACKING', 'ENVIO'].includes(cleanId)) continue;
      const isSemRota = !r.rota || 
                        r.rota.trim() === '' || 
                        r.rota.toLowerCase() === 'sem rota' || 
                        r.rota.toLowerCase() === 'sem_rota' || 
                        r.rota.trim() === '-' || 
                        r.rota.toLowerCase().includes('branca');
      if (isSemRota) {
        set.add(cleanId);
      }
    }
    return Array.from(set);
  }, [refugoBaseRows]);

  // IDs sem rota da base de refugo (brancas) que não constam fisicamente na lista bipada
  const idsBrancasNaoNaLista = useMemo(() => {
    if (!idsBrancasRefugo || idsBrancasRefugo.length === 0 || !listaAtiva) return [];
    const list = modoIndividual ? itensModoIndividual : (listaAtiva.itens || []);
    const codigosNaLista = new Set(
      list.map(i => (i.codigo || '').toString().trim().toUpperCase())
    );
    const digitosNaLista = new Set(
      list.map(i => cleanDigits(i.codigo)).filter(Boolean)
    );

    return idsBrancasRefugo.filter(id => {
      const digits = cleanDigits(id);
      return !codigosNaLista.has(id) && (!digits || !digitosNaLista.has(digits));
    });
  }, [idsBrancasRefugo, listaAtiva, modoIndividual, itensModoIndividual]);

  // Obter rota oficial baseada estritamente no arquivo de refugo atual (busca ultra-rápida O(1))
  const getRotaItem = useCallback((item: { codigo: string; rota?: string }): string => {
    if (refugoMap.size > 0) {
      const cleanCod = (item.codigo || '').trim().toUpperCase();
      const cleanCodWithoutM = cleanCod.replace(/m$/i, '');
      const cleanCodDigits = cleanDigits(cleanCod);

      const matchedRota = refugoMap.get(cleanCod) || 
                          refugoMap.get(cleanCodWithoutM) || 
                          (cleanCodDigits ? refugoMap.get(cleanCodDigits) : undefined);

      if (matchedRota) {
        return matchedRota;
      }
    }
    return (item.rota && item.rota.trim() !== '' && item.rota.toLowerCase() !== 'sem rota' && item.rota !== '-')
      ? item.rota.trim()
      : 'Sem Rota';
  }, [refugoMap]);

  // Sincronizar automaticamente as rotas dos itens da lista ativa com o arquivo de refugo atual
  useEffect(() => {
    if (!listaAtiva || !refugoBaseRows || refugoBaseRows.length === 0) return;

    const itensParaAtualizar: ColetaItem[] = [];
    listaAtiva.itens.forEach(item => {
      const rotaAtualizada = getRotaItem(item);
      if (rotaAtualizada !== 'Sem Rota' && item.rota !== rotaAtualizada) {
        itensParaAtualizar.push({ ...item, rota: rotaAtualizada });
      }
    });

    if (itensParaAtualizar.length > 0) {
      addItemsBatchToLista(listaAtiva.id, itensParaAtualizar).catch(err => 
        console.error('Erro ao sincronizar rotas do refugo:', err)
      );
    }
  }, [refugoBaseRows, listaAtiva?.id]);

  // Abrir Modal de Verificação de IDs do Ciclo
  const handleAbrirVerificar = () => {
    if (!listaAtiva) return;
    const listToVerify = modoIndividual ? itensModoIndividual : listaAtiva.itens;
    const mapInicial: Record<string, 'valido' | 'verificado' | 'em_rota'> = {};
    listToVerify.forEach(item => {
      if (modoIndividual || !item.validado) {
        mapInicial[item.id] = 'valido'; // por padrão, inicia como Válido
      }
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

    const cleanInput = cleanTrackingId(verificarInput);
    const cleanInputDigits = cleanDigits(cleanInput);

    playShortBeep();

    const listToVerify = modoIndividual ? itensModoIndividual : listaAtiva.itens;
    const matchedItem = listToVerify.find(i => {
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

    const rawIds = verificarLoteText.split(/[\n\t,;]+/).map(i => i.trim()).filter(Boolean);
    let processados = 0;

    const listToVerify = modoIndividual ? itensModoIndividual : listaAtiva.itens;

    const itensAtualizados = listToVerify.map(item => {
      if (item.validado) return item;

      const itemDigits = cleanDigits(item.codigo);
      const matched = rawIds.some(rawId => {
        const cleanPId = cleanTrackingId(rawId);
        const pIdDigits = cleanDigits(cleanPId);
        
        return item.codigo === cleanPId || (itemDigits && pIdDigits && itemDigits === pIdDigits);
      });

      if (matched) {
        processados++;
        return { ...item, validado: true };
      }
      return item;
    });

    if (modoIndividual) {
      setItensModoIndividual(itensAtualizados);
    } else {
      const validadosNovos = itensAtualizados.filter(i => i.validado && !listToVerify.find(orig => orig.id === i.id && orig.validado));
      if (validadosNovos.length > 0) {
        await addItemsBatchToLista(listaAtiva.id, validadosNovos);
      }
    }
    
    setShowVerificarLoteModal(false);
    setVerificarLoteText('');
    setShowVerificarModal(false); // Fecha o modal principal
    
    alert(`${processados} pacotes encontrados e validados com sucesso!`);
  };

  const handleCopiarIdsVerificacao = () => {
    if (!listaAtiva) return;
    const listToVerify = modoIndividual ? itensModoIndividual : listaAtiva.itens;
    const itensPendentes = modoIndividual ? listToVerify : listToVerify.filter(i => !i.validado);
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

  const handleCopiarParaPlanilha = () => {
    if (!listaAtiva) return;
    const itensParaCopiar = modoIndividual 
      ? itensModoIndividual 
      : (filteredItems.length > 0 ? filteredItems : listaAtiva.itens);

    if (itensParaCopiar.length === 0) {
      alert('Não há itens para copiar.');
      return;
    }

    const cleanIdOnly = (code: string) => (code || '').toString().trim().replace(/["\r\n\t]/g, '').replace(/\s+/g, '');

    // Formato tabulado (TSV) sem divisores (|) e sem prefixos (Saída:, Motivo:, Grupo:).
    // Ao colar no Excel ou Google Sheets, cada dado vai perfeitamente para sua própria coluna:
    // Coluna 1: ID | Coluna 2: Ciclo | Coluna 3: Motivo | Coluna 4: Grupo (se houver)
    const linhas = itensParaCopiar.map(i => {
      const codigoLimpo = cleanIdOnly(i.codigo);
      const saidaBruta = (i.saida || listaAtiva.saidaPadrao || '').trim();
      const ciclo = formatSaidaCiclo(saidaBruta);
      const motivo = (i.motivo || 'Pendente').trim();
      const grupoNome = (listaAtiva.grupos?.find(g => g.id === i.grupoId)?.nome || '').trim();

      if (listaAtiva.tipo === 'grupos' && grupoNome) {
        return `${codigoLimpo}\t${ciclo}\t${motivo}\t${grupoNome}`;
      }
      return `${codigoLimpo}\t${ciclo}\t${motivo}`;
    });

    const texto = linhas.join('\n');

    navigator.clipboard.writeText(texto).then(() => {
      setIsCopiedPlanilha(true);
      setTimeout(() => setIsCopiedPlanilha(false), 2000);
    }).catch(err => {
      console.error('Erro ao copiar:', err);
    });
  };

  const handleCopiarSelecionadosParaPlanilha = () => {
    if (!listaAtiva || selectedItemIds.length === 0) return;
    const list = modoIndividual ? itensModoIndividual : listaAtiva.itens;
    const selecionados = list.filter(i => selectedItemIds.includes(i.id));
    if (selecionados.length === 0) return;

    const cleanIdOnly = (code: string) => (code || '').toString().trim().replace(/["\r\n\t]/g, '').replace(/\s+/g, '');
    const texto = selecionados.map(i => {
      const codigoLimpo = cleanIdOnly(i.codigo);
      const saidaBruta = (i.saida || listaAtiva.saidaPadrao || '').trim();
      const ciclo = formatSaidaCiclo(saidaBruta);
      const motivo = (i.motivo || 'Pendente').trim();
      const grupoNome = (listaAtiva.grupos?.find(g => g.id === i.grupoId)?.nome || '').trim();
      if (listaAtiva.tipo === 'grupos' && grupoNome) {
        return `${codigoLimpo}\t${ciclo}\t${motivo}\t${grupoNome}`;
      }
      return `${codigoLimpo}\t${ciclo}\t${motivo}`;
    }).join('\n');

    navigator.clipboard.writeText(texto).then(() => {
      setIsCopiedPlanilha(true);
      setTimeout(() => setIsCopiedPlanilha(false), 2000);
    }).catch(err => console.error('Erro ao copiar:', err));
  };

  const handleCopiarLinhaCompleta = (item: ColetaItem) => {
    if (!listaAtiva) return;
    const cleanIdOnly = (code: string) => (code || '').toString().trim().replace(/["\r\n\t]/g, '').replace(/\s+/g, '');
    const codigoLimpo = cleanIdOnly(item.codigo);
    const saidaBruta = (item.saida || listaAtiva.saidaPadrao || '').trim();
    const ciclo = formatSaidaCiclo(saidaBruta);
    const motivo = (item.motivo || 'Pendente').trim();
    const texto = `${codigoLimpo}\t${ciclo}\t${motivo}`;

    navigator.clipboard.writeText(texto).then(() => {
      setCopiedId(item.codigo);
      setTimeout(() => setCopiedId(null), 1500);
    }).catch(err => console.error('Erro ao copiar item:', err));
  };

  const handleCopiarSoIds = () => {
    if (!listaAtiva) return;
    const itensParaCopiar = modoIndividual 
      ? itensModoIndividual 
      : (filteredItems.length > 0 ? filteredItems : listaAtiva.itens);

    if (itensParaCopiar.length === 0) {
      alert('Não há itens para copiar.');
      return;
    }

    const cleanIdOnly = (code: string) => (code || '').toString().trim().replace(/["\r\n\t]/g, '').replace(/\s+/g, '');
    const texto = itensParaCopiar.map(i => cleanIdOnly(i.codigo)).filter(Boolean).join('\n');

    navigator.clipboard.writeText(texto).then(() => {
      alert(`${itensParaCopiar.length} IDs copiados (apenas códigos)!`);
    }).catch(err => {
      console.error('Erro ao copiar:', err);
    });
  };

  const handleCopiarIdsComMotivoESaida = handleCopiarParaPlanilha;

  const handleBaixarListaSoIds = () => {
    if (!listaAtiva) return;
    const itensParaExportar = modoIndividual ? itensModoIndividual : activeItens;
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

    const itensParaUsar = Array.isArray(itensCustom) ? itensCustom : itensModoIndividual;

    if (itensParaUsar.length === 0) {
      const key = getModoIndKey(listaAtiva.id, operanteNome);
      try { localStorage.removeItem(key); } catch (_) {}
      setModoIndividual(false);
      return;
    }

    const currentItens = activeItensRef.current && activeItensRef.current.length > 0
      ? activeItensRef.current
      : listaAtiva.itens;

    // Mapa de itens existentes por código e dígitos limpos
    const mapaItens = new Map<string, number>();
    currentItens.forEach((item, index) => {
      mapaItens.set(item.codigo, index);
      const digits = cleanDigits(item.codigo);
      if (digits) mapaItens.set(digits, index);
    });

    let novosItens = [...currentItens];
    let countNovos = 0;
    let countAtualizados = 0;

    const itensParaSalvar: ColetaItem[] = [];

    itensParaUsar.forEach(itemInd => {
      const cleanCod = itemInd.codigo;
      const cleanCodDigits = cleanDigits(cleanCod);

      const idxExistente = mapaItens.has(cleanCod)
        ? mapaItens.get(cleanCod)!
        : (cleanCodDigits && mapaItens.has(cleanCodDigits) ? mapaItens.get(cleanCodDigits)! : -1);

      if (idxExistente !== -1 && idxExistente < novosItens.length) {
        novosItens[idxExistente] = {
          ...novosItens[idxExistente],
          validado: itemInd.validado !== undefined ? itemInd.validado : true,
          responsavel: operanteNome,
          scannedAt: itemInd.scannedAt || new Date().toLocaleString('pt-BR')
        };
        itensParaSalvar.push(novosItens[idxExistente]);
        countAtualizados++;
      } else {
        const novoItem: ColetaItem = {
          ...itemInd,
          validado: itemInd.validado !== undefined ? itemInd.validado : true,
          responsavel: operanteNome
        };
        novosItens = [novoItem, ...novosItens];
        itensParaSalvar.push(novoItem);
        mapaItens.set(cleanCod, 0);
        if (cleanCodDigits) mapaItens.set(cleanCodDigits, 0);
        countNovos++;
      }
    });

    activeItensRef.current = novosItens;
    await addItemsBatchToLista(listaAtiva.id, itensParaSalvar);
    try {
      await reconcileListaCounts(listaAtiva.id);
    } catch (_) {}

    // Limpar sessão individual salva após unificar
    const key = getModoIndKey(listaAtiva.id, operanteNome);
    try { localStorage.removeItem(key); } catch (_) {}

    alert(`${itensParaUsar.length} IDs validados foram unificados com a lista principal com sucesso! (${countAtualizados} validados, ${countNovos} novos)`);
    setModoIndividual(false);
    setItensModoIndividual([]);
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
      const idsParaExcluir = listToVerify.filter(i => verificarMap[i.id] === 'em_rota').map(i => i.id);
      const validadosNovos = itensAtualizados.filter(i => verificarMap[i.id] !== undefined);

      if (idsParaExcluir.length > 0) {
        await deleteItemsBatchFromLista(listaAtiva.id, idsParaExcluir);
      }
      if (validadosNovos.length > 0) {
        await addItemsBatchToLista(listaAtiva.id, validadosNovos);
      }
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

    const itemTarget = currentItens.find(i => i.id === itemId);
    if (itemTarget) {
      await updateItemInLista(listaAtiva.id, itemId, { validado: !itemTarget.validado }, itemTarget);
    }
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

      const nowIso = new Date().toISOString();
      const novaLista: ColetaLista = {
        id: 'lista-' + Date.now(),
        nome: nomeGerado,
        tipo: novoTipo,
        grupos: novoTipo === 'grupos' ? [] : undefined,
        grupoAtivoId: '',
        rota: rotaPadrao,
        data: dataFormatada,
        createdAt: nowIso,
        responsavel: operanteNome, // Criador real
        status: 'em_andamento',
        saidaPadrao: novaSaida, // Ciclo/Saída da lista
        motivoPadrao: '',
        itens: []
      };

      // Atualização otimista no estado local para que a lista seja encontrada instantaneamente
      setListas(prev => [novaLista, ...prev.filter(l => l.id !== novaLista.id)]);

      setShowModalNovaLista(false);
      
      // Salva no banco de dados em segundo plano
      saveLista(novaLista, true).catch(err => {
        console.error('Erro ao salvar nova lista no banco:', err);
      });

      setIsLoadingLista(false);
      setOpeningListaId(null);
      navigate(`/listas/${novaLista.id}`);
    } catch (err) {
      console.error('Erro ao criar lista:', err);
      setIsLoadingLista(false);
      setShowModalNovaLista(false);
    }
  };

  // Bipar ID na tela de coleta (Otimizado O(1) sem travamento ou atraso)
  const handleBipCode = useCallback(async (codeToBip: string) => {
    if (!codeToBip.trim() || !listaAtiva) return;

    const cleanInput = cleanTrackingId(codeToBip);
    const cleanInputDigits = cleanDigits(cleanInput);

    // Beep curto de 50ms instantâneo
    playShortBeep();

    // Fast O(1) Map lookup para puxar a rota exata em 0ms
    const cleanInputWithoutM = cleanInput.replace(/m$/i, '');
    const matchedRota = refugoMap.get(cleanInput) || 
                        refugoMap.get(cleanInputWithoutM) || 
                        (cleanInputDigits ? refugoMap.get(cleanInputDigits) : undefined);

    const rotaItemFinal = matchedRota || 'Sem Rota';

    // Usar obrigatoriamente a saída do ciclo configurada
    const saidaItemFinal = selectedSaida || listaAtiva.saidaPadrao || 'Ciclo 2 - Saída PM';

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
          id: 'ind-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
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
      return;
    }

    // Usar activeItensRef.current para prevenir race-conditions em bips rápidos
    const currentItens = activeItensRef.current && activeItensRef.current.length > 0
      ? activeItensRef.current
      : (listaAtiva.itens || []);

    // Verificar se o item já existe nesta lista
    const idx = currentItens.findIndex(
      item => item.codigo === cleanInput || (cleanDigits(item.codigo) === cleanInputDigits && cleanInputDigits !== '')
    );

    let novosItens = [...currentItens];
    const targetMotivo = selectedMotivo || 'Pendente';
    const targetSaida = saidaItemFinal;
    const targetRota = rotaItemFinal;

    if (idx !== -1) {
      // Atualizar item existente otimisticamente
      const existingItem = currentItens[idx];
      const updates = {
        saida: targetSaida,
        motivo: targetMotivo,
        rota: targetRota,
        scannedAt: new Date().toLocaleString('pt-BR'),
        responsavel: operanteNome,
        grupoId: listaAtiva.tipo === 'grupos' && listaAtiva.grupoAtivoId ? listaAtiva.grupoAtivoId : existingItem.grupoId
      };
      novosItens[idx] = { ...existingItem, ...updates };
      setLastScanResult({
        status: 'success',
        code: cleanInput,
        message: `ID já existente atualizado! (Rota: ${targetRota})`
      });
      activeItensRef.current = novosItens;
      setActiveItens(novosItens);
    } else {
      // Adicionar novo ID na lista otimisticamente com ID determinístico
      const safeDocId = `pkg_${cleanInput.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      const novoItem: ColetaItem = {
        id: safeDocId,
        codigo: cleanInput,
        rota: targetRota,
        saida: targetSaida,
        motivo: targetMotivo,
        scannedAt: new Date().toLocaleString('pt-BR'),
        responsavel: operanteNome,
        grupoId: listaAtiva.tipo === 'grupos' ? listaAtiva.grupoAtivoId : undefined,
        validado: false,
        timestamp: Date.now()
      };
      novosItens = [novoItem, ...novosItens];
      setLastScanResult({
        status: 'success',
        code: cleanInput,
        message: `Novo ID coletado na lista! (Rota: ${targetRota})`
      });
      activeItensRef.current = novosItens;
      setActiveItens(novosItens);
    }

    // Persistência server-side atômica via API O(1)
    apiBipItem({
      listaId: listaAtiva.id,
      codigo: cleanInput,
      saida: targetSaida,
      motivo: targetMotivo,
      rota: targetRota,
      responsavel: operanteNome,
      grupoId: listaAtiva.tipo === 'grupos' ? listaAtiva.grupoAtivoId : undefined
    }).then(res => {
      if (res && res.item) {
        setActiveItens(prev => [res.item, ...prev.filter(i => i.id !== res.item.id && i.codigo !== cleanInput)]);
      }
    }).catch(err => {
      console.warn('Erro ao processar bip via API, fallback direto:', err);
      if (idx !== -1) {
        const existingItem = currentItens[idx];
        updateItemInLista(listaAtiva.id, existingItem.id, {
          saida: targetSaida,
          motivo: targetMotivo,
          rota: targetRota,
          responsavel: operanteNome
        }, existingItem).catch(e => console.error(e));
      } else {
        addItemToLista(listaAtiva.id, {
          codigo: cleanInput,
          rota: targetRota,
          saida: targetSaida,
          motivo: targetMotivo,
          scannedAt: new Date().toLocaleString('pt-BR'),
          responsavel: operanteNome,
          grupoId: listaAtiva.tipo === 'grupos' ? listaAtiva.grupoAtivoId : undefined,
          validado: false
        }).catch(e => console.error(e));
      }
    });
  }, [listaAtiva, refugoMap, selectedSaida, modoIndividual, itensModoIndividual, selectedMotivo, operanteNome]);

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
      await updateItemInLista(listaAtiva.id, itemParaMudarMotivo.id, { motivo: novoMotivoEscolha }, itemParaMudarMotivo);
    }

    setItemParaMudarMotivo(null);
  };

  // Limpar seleção de itens ao trocar de lista
  useEffect(() => {
    setSelectedItemIds([]);
    setServerSearchResults(null);
  }, [activeListaId]);

  const [serverSearchResults, setServerSearchResults] = useState<ColetaItem[] | null>(null);

  useEffect(() => {
    setCurrentPage(1);
    setJumpPageInput('1');

    if (!activeListaId || !searchTerm.trim() || searchTerm.trim().length < 2) {
      setServerSearchResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await apiSearchItems(activeListaId, searchTerm.trim());
        if (res && Array.isArray(res.items)) {
          setServerSearchResults(res.items);
        }
      } catch (err) {
        console.warn('Erro na busca global server-side:', err);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [activeListaId, searchTerm]);

  const itemsFiltradosBase = modoIndividual 
    ? itensModoIndividual 
    : (serverSearchResults !== null ? serverSearchResults : (listaAtiva?.itens || []));

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return itemsFiltradosBase;
    const term = searchTerm.toLowerCase();
    const gruposMap = new Map((listaAtiva?.grupos || []).map(g => [g.id, g.nome.toLowerCase()]));

    return itemsFiltradosBase.filter(item => {
      const nomeGrupo = String(item.grupoId ? (gruposMap.get(item.grupoId) || '') : '');
      const rotaCalculada = getRotaItem(item).toLowerCase();
      return item.codigo.toLowerCase().includes(term) || 
             rotaCalculada.includes(term) || 
             (item.motivo && item.motivo.toLowerCase().includes(term)) || 
             (item.saida && item.saida.toLowerCase().includes(term)) ||
             (item.responsavel && item.responsavel.toLowerCase().includes(term)) ||
             nomeGrupo.includes(term);
    });
  }, [itemsFiltradosBase, searchTerm, listaAtiva?.grupos, getRotaItem]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
      setJumpPageInput(String(totalPages));
    }
  }, [totalPages, currentPage]);

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(filteredItems.length, startIndex + pageSize);

  const displayedItems = useMemo(() => {
    return filteredItems.slice(startIndex, endIndex);
  }, [filteredItems, startIndex, endIndex]);

  const selectedItemIdsSet = useMemo(() => new Set(selectedItemIds), [selectedItemIds]);
  const allPageSelected = displayedItems.length > 0 && displayedItems.every(i => selectedItemIdsSet.has(i.id));

  const handleToggleSelectPage = useCallback(() => {
    const pageIds = displayedItems.map(i => i.id);
    const allSelected = pageIds.length > 0 && pageIds.every(id => selectedItemIdsSet.has(id));
    if (allSelected) {
      setSelectedItemIds(prev => prev.filter(id => !pageIds.includes(id)));
    } else {
      const newSet = new Set([...selectedItemIds, ...pageIds]);
      setSelectedItemIds(Array.from(newSet));
    }
  }, [displayedItems, selectedItemIdsSet, selectedItemIds]);

  const renderPagination = (position: 'top' | 'bottom') => {
    if (filteredItems.length === 0) return null;

    const delta = 2;
    const range: number[] = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
        range.push(i);
      }
    }

    const rangeWithDots: (number | string)[] = [];
    let prevNum: number | undefined;
    for (const num of range) {
      if (prevNum) {
        if (num - prevNum === 2) {
          rangeWithDots.push(prevNum + 1);
        } else if (num - prevNum !== 1) {
          rangeWithDots.push('...');
        }
      }
      rangeWithDots.push(num);
      prevNum = num;
    }

    const handleJump = (e: React.FormEvent) => {
      e.preventDefault();
      const p = parseInt(jumpPageInput, 10);
      if (!isNaN(p) && p >= 1 && p <= totalPages) {
        setCurrentPage(p);
      } else {
        setJumpPageInput(String(currentPage));
      }
    };

    return (
      <div className={`px-4 py-2.5 bg-gray-50 border-gray-200 flex flex-col lg:flex-row items-center justify-between gap-3 text-xs text-gray-600 ${
        position === 'top' ? 'border-b rounded-t-xl' : 'border-t rounded-b-xl'
      }`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span>
            Mostrando <strong className="text-gray-900 font-mono">{filteredItems.length === 0 ? 0 : startIndex + 1}</strong>–<strong className="text-gray-900 font-mono">{endIndex}</strong> de <strong className="text-[#3483FA] font-mono">{filteredItems.length.toLocaleString('pt-BR')}</strong> pacotes
          </span>
          <span className="text-gray-300 hidden sm:inline">|</span>
          <span className="text-gray-500">
            Pág. <strong className="text-gray-800 font-mono">{currentPage}</strong> de <strong className="text-gray-800 font-mono">{totalPages}</strong>
          </span>
        </div>

        <div className="flex items-center gap-1 flex-wrap justify-center">
          <button
            type="button"
            onClick={() => { setCurrentPage(1); setJumpPageInput('1'); }}
            disabled={currentPage === 1}
            className="p-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs font-bold"
            title="Primeira página"
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              const nextP = Math.max(1, currentPage - 1);
              setCurrentPage(nextP);
              setJumpPageInput(String(nextP));
            }}
            disabled={currentPage === 1}
            className="p-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs font-bold"
            title="Página anterior"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <div className="hidden sm:flex items-center gap-1">
            {rangeWithDots.map((p, idx) => {
              if (p === '...') {
                return <span key={`ellipsis-${position}-${idx}`} className="px-1 text-gray-400 font-mono select-none">...</span>;
              }
              const isCurrent = p === currentPage;
              return (
                <button
                  key={`page-${position}-${p}`}
                  type="button"
                  onClick={() => { setCurrentPage(Number(p)); setJumpPageInput(String(p)); }}
                  className={`min-w-[28px] h-7 px-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                    isCurrent
                      ? 'bg-[#3483FA] text-white shadow-sm'
                      : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              const nextP = Math.min(totalPages, currentPage + 1);
              setCurrentPage(nextP);
              setJumpPageInput(String(nextP));
            }}
            disabled={currentPage >= totalPages}
            className="p-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs font-bold"
            title="Próxima página"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => { setCurrentPage(totalPages); setJumpPageInput(String(totalPages)); }}
            disabled={currentPage >= totalPages}
            className="p-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs font-bold"
            title="Última página"
          >
            <ChevronsRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-gray-500">Por pág:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
                setJumpPageInput('1');
              }}
              className="px-2 py-1 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-700 outline-none focus:border-[#3483FA] cursor-pointer"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
            </select>
          </div>

          <form onSubmit={handleJump} className="flex items-center gap-1">
            <span className="text-[11px] text-gray-500">Ir:</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={jumpPageInput}
              onChange={(e) => setJumpPageInput(e.target.value)}
              onBlur={handleJump}
              className="w-12 px-1 py-1 bg-white border border-gray-300 rounded-lg text-xs font-mono font-bold text-center text-gray-800 outline-none focus:border-[#3483FA]"
            />
          </form>
        </div>
      </div>
    );
  };

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
      await updateItemsBatchMotivo(listaAtiva.id, selectedItemIds, novoMotivoEscolha);
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
        await deleteItemsBatchFromLista(listaAtiva.id, selectedItemIds);
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
    if (!loteText.trim() || !listaAtiva) return;

    const codigos = loteText.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    if (codigos.length === 0) return;

    setIsImporting(true);
    setImportProgress(0);
    setImportStatusText('Iniciando processamento do lote...');

    const saidaCicloFinal = selectedSaida || listaAtiva.saidaPadrao || 'Ciclo 2 - Saída PM';
    const motivoFinal = loteMotivo || selectedMotivo || 'Desconteinerizado';

    if (modoIndividual) {
      const codigosSet = new Set(itensModoIndividual.map(i => i.codigo));
      const novosIndividuais: ColetaItem[] = [];

      codigos.forEach(cod => {
        const cleanCod = cleanTrackingId(cod);
        if (!cleanCod || codigosSet.has(cleanCod)) return;
        codigosSet.add(cleanCod);

        const cleanCodDigits = cleanDigits(cleanCod);
        const cleanCodWithoutM = cleanCod.replace(/m$/i, '');
        const matchedRota = refugoMap.get(cleanCod) || 
                            refugoMap.get(cleanCodWithoutM) || 
                            (cleanCodDigits ? refugoMap.get(cleanCodDigits) : undefined);
        const rotaItemFinal = matchedRota || 'Sem Rota';
        const itemPrincipal = listaAtiva.itens.find(i => i.codigo === cleanCod || (cleanDigits(i.codigo) === cleanCodDigits && cleanCodDigits !== ''));
        const rotaParaUsar = rotaItemFinal !== 'Sem Rota' ? rotaItemFinal : (itemPrincipal?.rota || 'Sem Rota');

        novosIndividuais.push({
          id: 'ind-lote-' + Date.now() + '-' + Math.floor(Math.random() * 100000),
          codigo: cleanCod,
          rota: rotaParaUsar,
          saida: saidaCicloFinal,
          motivo: motivoFinal,
          scannedAt: new Date().toLocaleString('pt-BR'),
          responsavel: operanteNome,
          validado: true
        });
      });

      setItensModoIndividual(prev => [...novosIndividuais, ...prev]);
      setIsImporting(false);
      setShowModalLote(false);
      setLoteText('');
      alert(`${novosIndividuais.length} IDs adicionados e validados na sessão individual!`);
      return;
    }

    const novosItensMap = new Map<string, ColetaItem>();
    listaAtiva.itens.forEach(i => novosItensMap.set(i.codigo, i));

    const CHUNK_SIZE = 500;
    const total = codigos.length;

    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const chunk = codigos.slice(i, i + CHUNK_SIZE);

      chunk.forEach(cod => {
        const cleanCod = cleanTrackingId(cod);
        const cleanCodDigits = cleanDigits(cleanCod);
        const cleanCodWithoutM = cleanCod.replace(/m$/i, '');

        const matchedRota = refugoMap.get(cleanCod) || 
                            refugoMap.get(cleanCodWithoutM) || 
                            (cleanCodDigits ? refugoMap.get(cleanCodDigits) : undefined);
        const rotaItemFinal = matchedRota || 'Sem Rota';

        if (novosItensMap.has(cleanCod)) {
          const item = novosItensMap.get(cleanCod)!;
          novosItensMap.set(cleanCod, {
            ...item,
            saida: saidaCicloFinal,
            motivo: motivoFinal,
            rota: rotaItemFinal,
            scannedAt: new Date().toLocaleString('pt-BR'),
            responsavel: operanteNome,
            grupoId: listaAtiva.tipo === 'grupos' && listaAtiva.grupoAtivoId ? listaAtiva.grupoAtivoId : item.grupoId
          });
        } else {
          novosItensMap.set(cleanCod, {
            id: 'item-' + Date.now() + '-' + Math.floor(Math.random() * 1000000),
            codigo: cleanCod,
            rota: rotaItemFinal,
            saida: saidaCicloFinal,
            motivo: motivoFinal,
            scannedAt: new Date().toLocaleString('pt-BR'),
            responsavel: operanteNome,
            grupoId: listaAtiva.tipo === 'grupos' ? listaAtiva.grupoAtivoId : undefined
          });
        }
      });

      const percent = Math.min(100, Math.round(((i + chunk.length) / total) * 100));
      setImportProgress(percent);
      setImportStatusText(`Carregando IDs na lista... ${percent}% (${i + chunk.length} de ${total})`);
      
      // Permitir renderização fluida da UI sem travamentos
      await new Promise(r => setTimeout(r, 10));
    }

    setImportStatusText('Salvando lista completa sem perdas na nuvem...');
    const novosItens = Array.from(novosItensMap.values());
    await addItemsBatchToLista(listaAtiva.id, novosItens);

    setIsImporting(false);
    setLoteText('');
    setShowModalLote(false);
  };

  const handleExcluirLista = async (lista: ColetaLista) => {
    if (!window.confirm(`Tem certeza que deseja excluir a lista "${lista.nome}"?\nEsta ação não pode ser desfeita.`)) {
      return;
    }
    // Atualização otimista imediata 0ms na UI
    setListas(prev => prev.filter(l => l.id !== lista.id));
    await deleteListaFirestore(lista.id);
    if (activeListaId === lista.id) {
      navigate('/listas');
    }
  };

  const handleAbrirFinalizar = async (lista: ColetaLista) => {
    setIsLoadingLista(true);
    setLoadingMessage('Buscando itens da lista...');
    try {
      const itens = await getAllItemsForExport(lista.id);
      setListaParaFinalizar({ ...lista, itens });
    } catch (e) {
      console.error(e);
      alert('Erro ao carregar itens da lista');
    } finally {
      setIsLoadingLista(false);
    }
  };

  const handleReabrirLista = async (listaId: string) => {
    const lista = listas.find(l => l.id === listaId) || (listaAtiva?.id === listaId ? listaAtiva : null);
    if (lista) {
      setListas(prev => prev.map(l => l.id === listaId ? { ...l, status: 'em_andamento' } : l));
      await saveLista({ id: listaId, status: 'em_andamento' });
    }
  };

  const handleFinalizarLista = async (listaId: string, unificarBrancas: boolean = false) => {
    // Pegar metadados da lista
    const listaMeta = listas.find(l => l.id === listaId) || (listaAtiva?.id === listaId ? listaAtiva : null);
    if (!listaMeta) return;

    setIsLoadingLista(true);
    setLoadingMessage('Buscando itens e finalizando lista...');

    try {
      // Buscar todos os itens reias da subcoleção para exportação/finalização
      const itensReais = await getAllItemsForExport(listaId);
      
      const cleanIdOnly = (code: string) => {
        if (!code) return '';
        return code.toString().trim().replace(/["\r\n\t]/g, '').replace(/\s+/g, '');
      };

      // 1. Obter os itens validados da lista (se existirem itens validados, filtra eles; senão considera todos)
      const itensValidados = itensReais.some(i => i.validado)
        ? itensReais.filter(i => i.validado)
        : itensReais;

      const idsValidados = itensValidados.map(item => cleanIdOnly(item.codigo)).filter(Boolean);

      // 2. Se optou por juntar com as brancas do refugo
      let rowsCsv: string[] = [];
      if (unificarBrancas && idsBrancasRefugo.length > 0) {
        const validadosSet = new Set(idsValidados.map(id => id.toUpperCase()));
        const brancasAdicionais = idsBrancasRefugo.filter(id => !validadosSet.has(id.toUpperCase()));
        
        // CSV unificado: validados primeiro, depois as brancas
        rowsCsv = [...idsValidados, ...brancasAdicionais];

        // Adicionar itens na lista finalizada para registro no histórico
        const itensBrancasNovos: ColetaItem[] = brancasAdicionais.map((code, idx) => ({
          id: `branca-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 5)}`,
          codigo: code,
          rota: 'Brancas',
          saida: listaMeta.saidaPadrao || 'Ciclo 2 - Saída PM',
          motivo: 'Brancas',
          scannedAt: new Date().toLocaleString('pt-BR'),
          responsavel: operanteNome,
          validado: true
        }));

        if (itensBrancasNovos.length > 0) {
          await addItemsBatchToLista(listaId, itensBrancasNovos);
        }
      } else {
        rowsCsv = idsValidados;
      }

      // 3. Atualizar status da lista no banco
      setListas(prev => prev.map(l => l.id === listaId ? { ...l, status: 'finalizada' } : l));
      await saveLista({ id: listaId, status: 'finalizada' });

      // 4. Download do CSV
      if (rowsCsv.length > 0) {
        const csvContent = rowsCsv.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const sufixoNome = unificarBrancas ? '_Validados_Com_Brancas.csv' : '_Validados.csv';
        link.setAttribute('download', `${listaMeta.nome.replace(/\s+/g, '_')}${sufixoNome}`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        alert('Nenhum item válido para baixar.');
      }

      setListaParaFinalizar(null);
    } catch (error) {
      console.error("Erro ao finalizar lista", error);
      alert('Erro ao finalizar a lista. Tente novamente.');
    } finally {
      setIsLoadingLista(false);
    }
  };

  const handleRemoverItem = async (itemId: string) => {
    if (!listaAtiva) return;
    if (modoIndividual) {
      setItensModoIndividual(prev => prev.filter(i => i.id !== itemId));
    } else {
      const itemData = listaAtiva.itens.find(i => i.id === itemId);
      await deleteItemFromLista(listaAtiva.id, itemId, itemData);
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

  const exportListaCSV = async (lista: ColetaLista) => {
    setIsLoadingLista(true);
    setLoadingMessage('Buscando itens da lista...');
    try {
      const itens = await getAllItemsForExport(lista.id);
      exportarApenasIdsCSV(lista, itens);
    } catch (e) {
      console.error(e);
      alert('Erro ao carregar itens da lista');
    } finally {
      setIsLoadingLista(false);
    }
  };

  // -------------------------------------------------------------
  // VIEW 1: DASHBOARD DE LISTAS (EXIBIÇÃO EM TABELA/LISTA SEM DADOS FAKE)
  // -------------------------------------------------------------
  if (activeListaId) {
    if (!rawListaAtiva && isLoadingListas) {
      return (
        <div className="w-full min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center shadow-xs">
            <Loader2 className="w-8 h-8 text-[#3483FA] animate-spin" />
          </div>
          <div className="max-w-md">
            <h3 className="text-base font-bold text-gray-900">Carregando lista de coleta...</h3>
            <p className="text-xs text-gray-500 mt-1">Conectando ao banco de dados em tempo real.</p>
          </div>
        </div>
      );
    }

    if (!rawListaAtiva && !isLoadingListas) {
      return (
        <div className="w-full min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4">
          <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center shadow-xs text-red-500">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div className="max-w-md">
            <h3 className="text-base font-bold text-gray-900">Esta lista não foi encontrada ou foi excluída</h3>
            <p className="text-xs text-gray-500 mt-1">A lista de coleta que você estava acessando foi excluída ou não existe mais no sistema.</p>
          </div>
          <button
            onClick={() => navigate('/listas')}
            className="mt-2 px-4 py-2 bg-[#3483FA] text-white rounded-xl text-xs font-bold hover:bg-[#2c6ecf] transition-all cursor-pointer shadow-sm flex items-center gap-2"
          >
            Voltar para Todas as Listas
          </button>
        </div>
      );
    }

    // Se a lista foi encontrada mas os itens ainda estão carregando pela primeira vez:
    if (rawListaAtiva && !isItensLoaded && (rawListaAtiva.totalItens || 0) > 0) {
      return (
        <div className="w-full min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center shadow-xs">
            <Loader2 className="w-8 h-8 text-[#3483FA] animate-spin" />
          </div>
          <div className="max-w-md">
            <h3 className="text-base font-bold text-gray-900">{rawListaAtiva.nome}</h3>
            <p className="text-xs text-gray-500 mt-1">
              Carregando {rawListaAtiva.totalItens.toLocaleString('pt-BR')} pacotes em tempo real...
            </p>
          </div>
        </div>
      );
    }
  }

  if (!listaAtiva) {
    const totalListas = listas.length;
    const listasAtivas = listas.filter(l => l.status === 'em_andamento').length;
    const totalItensColetados = listas.reduce((acc, l) => acc + (l.totalItens || 0), 0);

    const filteredDashboardListas = listas.filter(l => {
      if (!dashboardSearchTerm.trim()) return true;
      const term = dashboardSearchTerm.toLowerCase();
      return (
        l.nome.toLowerCase().includes(term) || 
        l.rota.toLowerCase().includes(term) || 
        l.responsavel.toLowerCase().includes(term) ||
        (l.saidaPadrao && l.saidaPadrao.toLowerCase().includes(term)) ||
        (l.motivoPadrao && l.motivoPadrao.toLowerCase().includes(term)) ||
        (l.itens || []).some(i => 
          i.codigo.toLowerCase().includes(term) || 
          (i.motivo && i.motivo.toLowerCase().includes(term)) || 
          (i.saida && i.saida.toLowerCase().includes(term))
        )
      );
    }).sort((a, b) => {
      const tA = getListaSortTimestamp(a);
      const tB = getListaSortTimestamp(b);
      if (tA !== tB) return tB - tA; // Mais recente no topo!
      return (b.id || '').localeCompare(a.id || '');
    });

    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full space-y-6 pb-12"
      >
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

          <button
            onClick={() => setShowModalNovaLista(true)}
            className="w-full sm:w-auto bg-[#3483FA] hover:bg-blue-600 text-white font-bold px-5 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            Criar Nova Lista
          </button>
        </div>



        {/* TABELA DE LISTAS (EXIBIÇÃO EM LISTA E NÃO EM BLOCOS) */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#3483FA]" />
              <h3 className="text-base font-bold text-[#333333]">Lista</h3>
              <span className="bg-gray-100 text-gray-700 font-mono text-xs font-bold px-2.5 py-0.5 rounded-full">
                {listas.length}
              </span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => handleSincronizarContadores()}
                disabled={isReconciling}
                title="Sincronizar contadores de pacotes com o servidor"
                className="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg border border-gray-200 transition-colors flex items-center gap-1.5 text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isReconciling ? 'animate-spin text-[#3483FA]' : ''}`} />
                <span>Sincronizar</span>
              </button>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
                <input
                  type="text"
                  value={dashboardSearchTerm}
                  onChange={(e) => setDashboardSearchTerm(e.target.value)}
                  placeholder="Filtrar por nome, rota ou criador..."
                  className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium focus:outline-none focus:border-[#3483FA]"
                />
              </div>
            </div>
          </div>

          {isLoadingListas ? (
            <div className="space-y-3 py-4">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl animate-pulse">
                  <div className="flex items-center gap-4 w-1/3">
                    <div className="w-6 h-6 bg-gray-200 rounded-full" />
                    <div className="space-y-2 w-full">
                      <div className="h-4 bg-gray-200 rounded w-3/4" />
                      <div className="h-3 bg-gray-200 rounded w-1/2" />
                    </div>
                  </div>
                  <div className="w-1/6 h-4 bg-gray-200 rounded" />
                  <div className="w-1/6 h-4 bg-gray-200 rounded" />
                  <div className="w-1/6 h-8 bg-gray-200 rounded-lg" />
                </div>
              ))}
            </div>
          ) : filteredDashboardListas.length > 0 ? (
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
                        {lista.totalItens || 0} pacotes
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
                            onClick={() => handleExcluirLista(lista)}
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
              <p className="font-bold text-gray-600 text-sm">Nenhuma lista criada ainda</p>
              <p className="text-xs text-gray-400 mt-1">Clique em "Criar Nova Lista" para definir uma rota e começar a bipar.</p>
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
      </motion.div>
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

  // Contagem de IDs sem rota a somar sem estar na lista
  const totalBrancasSemRota = idsBrancasNaoNaLista.length;
  // Total somado exibido no card de IDs Coletados
  const totalColetadosComBrancas = modoIndividual ? totalColetados : (totalColetados + totalBrancasSemRota);

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

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full space-y-4 pb-12"
    >
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
            className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 rounded text-[10px] font-bold uppercase transition-colors ml-auto shadow-sm cursor-pointer"
          >
            <Users className="w-3 h-3" /> Transferir Admin
          </button>
        )}
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
                        <span>{itensModoIndividual.length} {itensModoIndividual.length === 1 ? 'pacote validado' : 'pacotes validados'} nesta sessão</span>
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md font-bold border border-emerald-200 inline-flex items-center gap-1 shadow-2xs">
                          <Save className="w-2.5 h-2.5 text-emerald-600" /> Salvo no navegador
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleFecharEUnificarModoIndividual}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Fechar e Unificar com a Principal
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
                        onClick={handleCopiarParaPlanilha}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs ${isCopiedPlanilha ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                        title="Copiar lista com IDs, Ciclo e Motivo (pronto para colar em planilha)"
                      >
                        {isCopiedPlanilha ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5 text-gray-500" />}
                        {isCopiedPlanilha ? 'Copiado!' : 'Copiar'}
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

                      <button
                        type="button"
                        onClick={handleCopiarParaPlanilha}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs ${isCopiedPlanilha ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                        title="Copiar lista com IDs, Ciclo e Motivo (pronto para colar em planilha)"
                      >
                        {isCopiedPlanilha ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5 text-gray-500" />}
                        {isCopiedPlanilha ? 'Copiado!' : 'Copiar'}
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
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopiarSelecionadosParaPlanilha}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shadow-xs ${isCopiedPlanilha ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
                      title="Copiar apenas os selecionados com IDs, Ciclo e Motivo para planilha"
                    >
                      {isCopiedPlanilha ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {isCopiedPlanilha ? 'Copiado!' : `Copiar ${selectedItemIds.length} Selecionados`}
                    </button>
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
              <div className="flex flex-col border border-gray-200 rounded-xl shadow-sm overflow-hidden bg-white">
                {allPageSelected && filteredItems.length > displayedItems.length && (
                  <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-xs text-blue-900 flex flex-col sm:flex-row items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-[#3483FA] flex-shrink-0" />
                      <span>
                        Todos os <strong>{displayedItems.length}</strong> pacotes desta página estão selecionados.
                      </span>
                    </div>
                    {selectedItemIds.length === filteredItems.length ? (
                      <button
                        type="button"
                        onClick={() => setSelectedItemIds([])}
                        className="font-bold text-blue-700 hover:text-blue-900 underline cursor-pointer text-xs"
                      >
                        Limpar seleção de todos ({selectedItemIds.length} selecionados)
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSelectedItemIds(filteredItems.map(i => i.id))}
                        className="font-bold text-white bg-[#3483FA] hover:bg-blue-600 px-3 py-1 rounded-lg text-xs transition-colors shadow-2xs cursor-pointer"
                      >
                        Selecionar todos os {filteredItems.length.toLocaleString('pt-BR')} pacotes da lista
                      </button>
                    )}
                  </div>
                )}

                <div className="overflow-x-auto max-h-[70vh]">
                  <table className="w-full text-[10px] xl:text-xs text-gray-700 border-collapse">
                    <thead className="bg-gray-100 sticky top-0 z-20 shadow-sm text-gray-700 font-black uppercase tracking-wider">
                      <tr>
                        <th className="py-1 px-1 sm:px-2 text-center bg-gray-100 border-b border-r border-gray-200">
                          <input
                            type="checkbox"
                            checked={displayedItems.length > 0 && displayedItems.every(i => selectedItemIdsSet.has(i.id))}
                            onChange={handleToggleSelectPage}
                            className="w-4 h-4 text-[#3483FA] focus:ring-[#3483FA] cursor-pointer"
                            title="Selecionar/Desmarcar Todos desta página"
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
                      {displayedItems.map((item, idx) => {
                        const isSelected = selectedItemIdsSet.has(item.id);
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
                            <td className="py-1 px-1 sm:px-2 text-center text-gray-500 font-bold border-r border-gray-200">{filteredItems.length - (startIndex + idx)}</td>
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

                          {/* COLUNA DE STATUS DE VALIDAÇÃO - TEM COR */}
                          <td className="py-1 px-1 sm:px-2 text-center border-r border-gray-200">
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
                                type="button"
                                onClick={() => handleCopiarLinhaCompleta(item)}
                                className="p-1 hover:bg-emerald-100 text-emerald-700 transition-colors cursor-pointer rounded"
                                title="Copiar ID, Saída e Motivo deste item"
                              >
                                {copiedId === item.codigo ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={() => handleRemoverItem(item.id)}
                                className="p-1 hover:bg-red-100 text-red-600 transition-colors cursor-pointer rounded"
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
              {renderPagination('bottom')}
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
            <BipScannerForm 
              onBip={handleBipCode} 
              isLocked={isLocked} 
              onToggleLock={() => {
                setIsLocked(!isLocked);
                if (isLocked) setTimeout(() => inputRef.current?.focus(), 50);
              }}
              inputRef={inputRef}
            />

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
                <p className="text-4xl font-black text-[#3483FA] tracking-tighter">{totalColetadosComBrancas}</p>
                <p className="text-xs font-bold text-gray-700 uppercase tracking-widest mt-1">
                  {modoIndividual ? 'IDs Bipados na Sessão Individual' : 'IDs Coletados'}
                </p>
                {!modoIndividual && totalBrancasSemRota > 0 && (
                  <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-white/90 border border-blue-200 rounded-full text-[11px] font-semibold text-gray-700 shadow-2xs">
                    <span>{totalColetados} na lista</span>
                    <span className="text-gray-300">•</span>
                    <span className="text-amber-700 font-bold">+{totalBrancasSemRota} sem rota (brancas)</span>
                  </div>
                )}
              </div>

              {/* Botões de Ação Direta nas Métricas */}
              <div className={`grid ${listaAtiva.status === 'em_andamento' && !modoIndividual ? 'grid-cols-2' : 'grid-cols-1 max-w-xs mx-auto'} gap-3 pt-4 border-t border-blue-200/50`}>
                {listaAtiva.status === 'em_andamento' && !modoIndividual && (
                  <button
                    type="button"
                    onClick={() => {
                      setJuntarComBrancas(true);
                      handleAbrirFinalizar(listaAtiva);
                    }}
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
                const listToVerify = modoIndividual ? itensModoIndividual : listaAtiva.itens;
                const itensNaoValidados = modoIndividual ? listToVerify : listToVerify.filter(i => !i.validado);
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
                          <option value={100}>100 por vez</option>
                          <option value={250}>250 por vez</option>
                          <option value={500}>500 por vez</option>
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
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={paginaAtualSafe === 0}
                          onClick={() => {
                            setVerificarPagina(0);
                            setCopiedPage(null);
                          }}
                          className="p-1.5 bg-white border border-blue-200 text-blue-600 rounded-md disabled:opacity-40 cursor-pointer font-bold hover:bg-blue-50 transition-colors"
                          title="Primeira página"
                        >
                          <ChevronsLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={paginaAtualSafe === 0}
                          onClick={() => {
                            setVerificarPagina(paginaAtualSafe - 1);
                            setCopiedPage(null);
                          }}
                          className="px-2.5 py-1.5 bg-white border border-blue-200 text-blue-600 rounded-md disabled:opacity-40 cursor-pointer font-bold hover:bg-blue-50 transition-colors flex items-center gap-1"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                          <span>Anterior</span>
                        </button>
                        <button
                          type="button"
                          disabled={paginaAtualSafe >= totalPaginas - 1}
                          onClick={() => {
                            setVerificarPagina(paginaAtualSafe + 1);
                            setCopiedPage(null);
                          }}
                          className="px-2.5 py-1.5 bg-[#3483FA] text-white rounded-md disabled:opacity-40 cursor-pointer font-black hover:bg-blue-600 transition-colors shadow-sm flex items-center gap-1"
                        >
                          <span>Próximo</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={paginaAtualSafe >= totalPaginas - 1}
                          onClick={() => {
                            setVerificarPagina(Math.max(0, totalPaginas - 1));
                            setCopiedPage(null);
                          }}
                          className="p-1.5 bg-white border border-blue-200 text-blue-600 rounded-md disabled:opacity-40 cursor-pointer font-bold hover:bg-blue-50 transition-colors"
                          title="Última página"
                        >
                          <ChevronsRight className="w-3.5 h-3.5" />
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
                    className="px-4 py-2 bg-[#3483FA] hover:bg-blue-600 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer"
                  >
                    Adicionar Lote
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
      {/* POPUP DE CONFIRMAÇÃO DE FINALIZAÇÃO DE LISTA */}
      <AnimatePresence>
        {listaParaFinalizar && (() => {
          const cleanIdOnly = (code: string) => (code || '').toString().trim().replace(/["\r\n\t]/g, '').replace(/\s+/g, '');
          const itensValidadosModal = listaParaFinalizar.itens.some(i => i.validado)
            ? listaParaFinalizar.itens.filter(i => i.validado)
            : listaParaFinalizar.itens;
          const codigosValidadosModal = itensValidadosModal.map(i => cleanIdOnly(i.codigo)).filter(Boolean);
          const codigosValidadosSet = new Set(codigosValidadosModal.map(c => c.toUpperCase()));
          const brancasDisponiveis = idsBrancasRefugo.filter(id => !codigosValidadosSet.has(id.toUpperCase()));
          const totalComBrancasModal = codigosValidadosModal.length + brancasDisponiveis.length;

          return (
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
                className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden z-10"
              >
                <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-emerald-50/60">
                  <div className="flex items-center gap-2 text-emerald-700">
                    <CheckCircle2 className="w-5 h-5" />
                    <h3 className="text-base font-black uppercase tracking-tight">Finalizar Lista e Baixar CSV</h3>
                  </div>
                  <button 
                    onClick={() => setListaParaFinalizar(null)}
                    className="p-1.5 hover:bg-emerald-100 rounded-full text-emerald-600 transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-6 space-y-5">
                  <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-4 space-y-2">
                    <p className="text-[10px] uppercase font-black text-emerald-600 tracking-wider">Lista Selecionada:</p>
                    <div className="flex items-center justify-between">
                      <p className="text-base font-black text-emerald-900">{listaParaFinalizar.nome}</p>
                      <span className="text-xs font-bold text-emerald-700 bg-white px-2.5 py-1 rounded-lg border border-emerald-200">
                        {codigosValidadosModal.length} IDs validados
                      </span>
                    </div>
                  </div>

                  {/* PERGUNTA: JUNTAR COM AS BRANCAS DO REFUGO */}
                  {brancasDisponiveis.length > 0 ? (
                    <div className="bg-gradient-to-br from-amber-50/80 to-orange-50/50 border border-amber-200/80 rounded-xl p-4 space-y-3">
                      <div className="flex items-start gap-2.5">
                        <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-sm font-black text-amber-900">
                            Deseja juntar a lista validada com as brancas?
                          </h4>
                          <p className="text-xs text-amber-800/80 mt-0.5 leading-relaxed">
                            Foram encontrados <strong>{brancasDisponiveis.length} IDs sem rota (brancas)</strong> na base do refugo.
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setJuntarComBrancas(true)}
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                            juntarComBrancas
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm ring-2 ring-emerald-300'
                              : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black flex items-center gap-1.5">
                              <CheckCircle2 className={`w-4 h-4 ${juntarComBrancas ? 'text-white' : 'text-emerald-600'}`} />
                              Sim, Juntar Tudo
                            </span>
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${juntarComBrancas ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
                              {totalComBrancasModal} IDs
                            </span>
                          </div>
                          <span className={`text-[10px] leading-tight ${juntarComBrancas ? 'text-emerald-50' : 'text-gray-500'}`}>
                            Validados ({codigosValidadosModal.length}) + Brancas ({brancasDisponiveis.length})
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setJuntarComBrancas(false)}
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                            !juntarComBrancas
                              ? 'bg-[#3483FA] text-white border-blue-600 shadow-sm ring-2 ring-blue-300'
                              : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black flex items-center gap-1.5">
                              <Square className={`w-4 h-4 ${!juntarComBrancas ? 'text-white' : 'text-[#3483FA]'}`} />
                              Apenas a Lista
                            </span>
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${!juntarComBrancas ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-800'}`}>
                              {codigosValidadosModal.length} IDs
                            </span>
                          </div>
                          <span className={`text-[10px] leading-tight ${!juntarComBrancas ? 'text-blue-50' : 'text-gray-500'}`}>
                            Apenas os {codigosValidadosModal.length} IDs validados da lista
                          </span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-600">
                      Nenhum ID sem rota (brancas) pendente na base de refugo. O CSV será baixado com os {codigosValidadosModal.length} IDs validados da lista.
                    </div>
                  )}

                  <div className="space-y-2">
                    <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Resumo do Arquivo CSV:</h4>
                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 text-xs space-y-1.5">
                      <div className="flex justify-between text-gray-600">
                        <span>IDs validados na lista:</span>
                        <strong className="text-gray-800">{codigosValidadosModal.length}</strong>
                      </div>
                      {brancasDisponiveis.length > 0 && juntarComBrancas && (
                        <div className="flex justify-between text-amber-700">
                          <span>+ IDs sem rota (brancas do refugo):</span>
                          <strong>{brancasDisponiveis.length}</strong>
                        </div>
                      )}
                      <div className="pt-1.5 border-t border-gray-200 flex justify-between text-emerald-800 font-black">
                        <span>Total de IDs no CSV final:</span>
                        <span>
                          {brancasDisponiveis.length > 0 && juntarComBrancas 
                            ? totalComBrancasModal 
                            : codigosValidadosModal.length} IDs
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-5 bg-gray-50 border-t border-gray-100 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setListaParaFinalizar(null)}
                    className="flex-1 py-3 bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 font-bold rounded-xl text-xs transition-all cursor-pointer"
                  >
                    CANCELAR
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFinalizarLista(listaParaFinalizar.id, brancasDisponiveis.length > 0 ? juntarComBrancas : false)}
                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                  >
                    <Download className="w-4 h-4" />
                    <span>
                      {brancasDisponiveis.length > 0 && juntarComBrancas 
                        ? `FINALIZAR E BAIXAR (${totalComBrancasModal} IDs)` 
                        : `FINALIZAR E BAIXAR (${codigosValidadosModal.length} IDs)`}
                    </span>
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
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
    </motion.div>
  );
};
