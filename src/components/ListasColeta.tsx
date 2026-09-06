import React, { useState, useEffect, useRef } from 'react';
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
  Zap
} from 'lucide-react';
import { 
  listenToRefugoScans, 
  saveRefugoScans, 
  listenToRefugo 
} from '../lib/firebase';
import { RefugoRow } from '../types';
import { User, getAllUsers } from '../lib/auth';

interface ColetaItem {
  id: string;
  codigo: string;
  rota: string;
  saida: string;
  motivo: string;
  scannedAt: string;
  responsavel?: string;
}

interface ColetaLista {
  id: string;
  nome: string;
  tipo?: 'comum' | 'grupos';
  rota: string;
  data: string;
  responsavel: string;
  status: 'em_andamento' | 'finalizada';
  saidaPadrao: string;
  motivoPadrao: string;
  itens: ColetaItem[];
}

interface ListasColetaProps {
  currentUser?: User | null;
}

const SAIDAS_CICLOS_DISPONIVEIS = [
  'Ciclo 1 - Saída AM',
  'Ciclo 2 - Saída PM',
  'Ciclo 3 - Saída SD',
  'Em rota'
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
  const [listas, setListas] = useState<ColetaLista[]>([]);
  const [activeListaId, setActiveListaId] = useState<string | null>(null);
  const [registeredUsers, setRegisteredUsers] = useState<User[]>([]);
  
  const [bipInput, setBipInput] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [lastScanResult, setLastScanResult] = useState<{ status: 'success' | 'error', message: string, code: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dashboardSearchTerm, setDashboardSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [refugoBaseRows, setRefugoBaseRows] = useState<RefugoRow[]>([]);

  // Configurações do scanner na tela de coleta
  const [selectedSaida, setSelectedSaida] = useState('Ciclo 2 - Saída PM');
  const [selectedMotivo, setSelectedMotivo] = useState('');
  const [selectedRotaItem, setSelectedRotaItem] = useState('');

  // Gaveta/Modal para mudar motivo do ID clicado
  const [itemParaMudarMotivo, setItemParaMudarMotivo] = useState<ColetaItem | null>(null);

  // Seleção e Alteração em Massa de Motivos
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [mudarMotivoMassaModal, setMudarMotivoMassaModal] = useState(false);
  const [motivoEmMassaEscolha, setMotivoEmMassaEscolha] = useState<string>('Desconteinerizados');

  // Modal de Verificação de IDs (Em Rota vs Válidos)
  const [showVerificarModal, setShowVerificarModal] = useState(false);
  const [verificarModo, setVerificarModo] = useState<'10' | 'completo'>('10');
  const [verificarPagina, setVerificarPagina] = useState(0);
  const [verificarMap, setVerificarMap] = useState<Record<string, 'valido' | 'em_rota'>>({});

  // Modais de Criação e Lote
  const [showModalNovaLista, setShowModalNovaLista] = useState(false);
  const [novaData, setNovaData] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0]; // YYYY-MM-DD
  });
  const [novaSaida, setNovaSaida] = useState('Ciclo 2 - Saída PM');
  const [novoTipo, setNovoTipo] = useState<'comum' | 'grupos'>('comum');

  const [showModalLote, setShowModalLote] = useState(false);
  const [loteText, setLoteText] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);

  const operanteNome = currentUser?.username || 'Usuário Atual';

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

  // Carregar/Salvar listas
  useEffect(() => {
    const saved = localStorage.getItem('coleta_listas_v4');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setListas(parsed);
      } catch (e) {
        console.error("Erro ao carregar listas:", e);
      }
    }

    // Carregar base de refugo se existir
    const unsubRefugo = listenToRefugo((data) => {
      if (data && data.rawText) {
        const lines = data.rawText.split('\n').map(l => l.trim()).filter(Boolean);
        const parsedRows: RefugoRow[] = lines.map(line => {
          const parts = line.split(/[,;\t]+/);
          const id = parts[0]?.trim().toUpperCase();
          if (!id) return null;
          const rawFieldsObj: Record<string, string> = {};
          parts.forEach((p, idx) => { rawFieldsObj[idx.toString()] = p; });
          return {
            id,
            rota: parts[1]?.trim() || 'Sem Rota',
            rawFields: rawFieldsObj
          };
        }).filter(Boolean) as RefugoRow[];
        setRefugoBaseRows(parsedRows);
      }
    });

    return () => unsubRefugo();
  }, []);

  const salvarListas = (novasListas: ColetaLista[]) => {
    setListas(novasListas);
    localStorage.setItem('coleta_listas_v4', JSON.stringify(novasListas));
  };

  const listaAtiva = listas.find(l => l.id === activeListaId);

  // Quando abre uma lista, ajusta a saída padrão para a Saída do Ciclo definida na lista
  useEffect(() => {
    if (listaAtiva) {
      setSelectedRotaItem(listaAtiva.rota);
      setSelectedSaida(listaAtiva.saidaPadrao || 'Ciclo 2 - Saída PM');
      setSelectedMotivo(listaAtiva.motivoPadrao || '');
    }
  }, [activeListaId]);

  const cleanDigits = (str: string) => str.replace(/\D/g, '');

  // Abrir Modal de Verificação de IDs do Ciclo
  const handleAbrirVerificar = () => {
    if (!listaAtiva) return;
    const mapInicial: Record<string, 'valido' | 'em_rota'> = {};
    listaAtiva.itens.forEach(item => {
      mapInicial[item.id] = 'valido'; // por padrão, inicia como Válido
    });
    setVerificarMap(mapInicial);
    setVerificarModo('10');
    setVerificarPagina(0);
    setShowVerificarModal(true);
  };

  const handleToggleVerificarStatus = (itemId: string, novoStatus: 'valido' | 'em_rota') => {
    setVerificarMap(prev => ({
      ...prev,
      [itemId]: novoStatus
    }));
  };

  const handleMarcarVisiveisVerificar = (itensVisiveis: ColetaItem[], status: 'valido' | 'em_rota') => {
    setVerificarMap(prev => {
      const next = { ...prev };
      itensVisiveis.forEach(item => {
        next[item.id] = status;
      });
      return next;
    });
  };

  const handleConcluirVerificacao = () => {
    if (!listaAtiva) return;

    const itensMantidos = listaAtiva.itens.filter(i => verificarMap[i.id] !== 'em_rota');
    const qtdRemovidos = listaAtiva.itens.length - itensMantidos.length;

    const novasListas = listas.map(l => l.id === listaAtiva.id ? { ...l, itens: itensMantidos } : l);
    salvarListas(novasListas);
    setShowVerificarModal(false);

    alert(`Verificação concluída!\n\n• ${itensMantidos.length} pacote(s) VÁLIDO(S) mantidos na lista.\n• ${qtdRemovidos} pacote(s) EM ROTA removidos da lista.`);
  };

  // Criar nova lista com dados reais (Data, Ciclo e Tipo de Lista)
  const handleCriarLista = (e: React.FormEvent) => {
    e.preventDefault();

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
    if (novaSaida === 'Ciclo 2 - Saída PM') nomeCurto = 'Saída PM';
    else if (novaSaida === 'Ciclo 1 - Saída AM') nomeCurto = 'Saída AM';
    else if (novaSaida === 'Ciclo 3 - Saída SD') nomeCurto = 'Saída SD';

    const nomeGerado = `${nomeCurto} - ${dataFormatada}`;
    const rotaPadrao = novoTipo === 'grupos' ? 'Multirotas / Grupos' : 'Geral';

    const novaLista: ColetaLista = {
      id: 'lista-' + Date.now(),
      nome: nomeGerado,
      tipo: novoTipo,
      rota: rotaPadrao,
      data: dataFormatada,
      responsavel: operanteNome, // Criador real
      status: 'em_andamento',
      saidaPadrao: novaSaida, // Ciclo/Saída da lista
      motivoPadrao: '',
      itens: []
    };

    const novasListas = [novaLista, ...listas];
    salvarListas(novasListas);
    
    setActiveListaId(novaLista.id);
    setShowModalNovaLista(false);
  };

  // Bipar ID na tela de coleta
  const handleBip = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bipInput.trim() || !listaAtiva) return;

    let processedInput = bipInput.trim();
    processedInput = processedInput.replace(/d[çc]?⁴/gi, '4');
    processedInput = processedInput.replace(/d[çc]?4/gi, '4');
    
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
    const refugoMatch = refugoBaseRows.find(r => {
      if (r.id === cleanInput) return true;
      const rDigits = cleanDigits(r.id);
      return rDigits && cleanInputDigits && rDigits === cleanInputDigits;
    });

    const rotaItemFinal = refugoMatch ? refugoMatch.rota : (selectedRotaItem || listaAtiva.rota || 'Livre');

    // Usar obrigatoriamente a saída do ciclo configurada
    const saidaItemFinal = selectedSaida || listaAtiva.saidaPadrao || 'Ciclo 2 - Saída PM';

    // Verificar se o item já existe nesta lista
    const idx = listaAtiva.itens.findIndex(
      item => item.codigo === cleanInput || (cleanDigits(item.codigo) === cleanInputDigits && cleanInputDigits !== '')
    );

    let novosItens = [...listaAtiva.itens];

    if (idx !== -1) {
      // Atualizar item existente
      novosItens[idx] = {
        ...novosItens[idx],
        saida: saidaItemFinal,
        motivo: selectedMotivo,
        rota: rotaItemFinal,
        scannedAt: new Date().toLocaleString('pt-BR'),
        responsavel: operanteNome
      };
      setLastScanResult({
        status: 'success',
        code: cleanInput,
        message: `ID já existente atualizado! (Rota: ${rotaItemFinal})`
      });
    } else {
      // Adicionar novo ID na lista
      const novoItem: ColetaItem = {
        id: 'item-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        codigo: cleanInput,
        rota: rotaItemFinal,
        saida: saidaItemFinal, // Mesma saída do ciclo da lista
        motivo: selectedMotivo,
        scannedAt: new Date().toLocaleString('pt-BR'),
        responsavel: operanteNome
      };
      novosItens = [novoItem, ...novosItens];
      setLastScanResult({
        status: 'success',
        code: cleanInput,
        message: `Novo ID coletado na lista! (Rota: ${rotaItemFinal})`
      });
    }

    const novasListas = listas.map(l => l.id === listaAtiva.id ? { ...l, itens: novosItens } : l);
    salvarListas(novasListas);

    setBipInput('');
    inputRef.current?.focus();
  };

  // Alterar motivo do item selecionado na gaveta
  const handleMudarMotivoItem = (novoMotivoEscolha: string) => {
    if (!itemParaMudarMotivo || !listaAtiva) return;

    const novosItens = listaAtiva.itens.map(item => {
      if (item.id === itemParaMudarMotivo.id) {
        return { ...item, motivo: novoMotivoEscolha };
      }
      return item;
    });

    const novasListas = listas.map(l => l.id === listaAtiva.id ? { ...l, itens: novosItens } : l);
    salvarListas(novasListas);

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
  const handleAplicarMotivoEmMassa = (novoMotivoEscolha: string) => {
    if (selectedItemIds.length === 0 || !listaAtiva) return;

    const novosItens = listaAtiva.itens.map(item => {
      if (selectedItemIds.includes(item.id)) {
        return { ...item, motivo: novoMotivoEscolha };
      }
      return item;
    });

    const novasListas = listas.map(l => l.id === listaAtiva.id ? { ...l, itens: novosItens } : l);
    salvarListas(novasListas);

    setSelectedItemIds([]);
    setMudarMotivoMassaModal(false);
  };

  // Excluir selecionados em massa
  const handleExcluirSelecionadosEmMassa = () => {
    if (selectedItemIds.length === 0 || !listaAtiva) return;
    if (window.confirm(`Confirma a exclusão de ${selectedItemIds.length} item(ns) selecionado(s)?`)) {
      const novosItens = listaAtiva.itens.filter(i => !selectedItemIds.includes(i.id));
      const novasListas = listas.map(l => l.id === listaAtiva.id ? { ...l, itens: novosItens } : l);
      salvarListas(novasListas);
      setSelectedItemIds([]);
    }
  };

  // Adicionar lote na lista ativa
  const handleAdicionarLote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loteText.trim() || !listaAtiva) return;

    const codigos = loteText.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    if (codigos.length === 0) return;

    const saidaCicloFinal = selectedSaida || listaAtiva.saidaPadrao || 'Ciclo 2 - Saída PM';

    const novosItensMap = new Map<string, ColetaItem>();
    listaAtiva.itens.forEach(i => novosItensMap.set(i.codigo, i));

    codigos.forEach(cod => {
      const cleanCod = cod.toUpperCase();
      if (novosItensMap.has(cleanCod)) {
        const item = novosItensMap.get(cleanCod)!;
        novosItensMap.set(cleanCod, {
          ...item,
          saida: saidaCicloFinal,
          motivo: selectedMotivo,
          scannedAt: new Date().toLocaleString('pt-BR'),
          responsavel: operanteNome
        });
      } else {
        novosItensMap.set(cleanCod, {
          id: 'item-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
          codigo: cleanCod,
          rota: selectedRotaItem || listaAtiva.rota,
          saida: saidaCicloFinal,
          motivo: selectedMotivo,
          scannedAt: new Date().toLocaleString('pt-BR'),
          responsavel: operanteNome
        });
      }
    });

    const novosItens = Array.from(novosItensMap.values());
    const novasListas = listas.map(l => l.id === listaAtiva.id ? { ...l, itens: novosItens } : l);
    salvarListas(novasListas);

    setLoteText('');
    setShowModalLote(false);
  };

  const handleExcluirLista = (listaId: string) => {
    if (window.confirm("Deseja realmente excluir esta lista de coleta?")) {
      const novasListas = listas.filter(l => l.id !== listaId);
      salvarListas(novasListas);
      if (activeListaId === listaId) {
        setActiveListaId(null);
      }
    }
  };

  const handleFinalizarLista = (listaId: string) => {
    const novasListas = listas.map(l => l.id === listaId ? { ...l, status: 'finalizada' as const } : l);
    salvarListas(novasListas);
  };

  const handleRemoverItem = (itemId: string) => {
    if (!listaAtiva) return;
    const novosItens = listaAtiva.itens.filter(i => i.id !== itemId);
    const novasListas = listas.map(l => l.id === listaAtiva.id ? { ...l, itens: novosItens } : l);
    salvarListas(novasListas);
  };

  const handleCopy = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const exportListaCSV = (lista: ColetaLista) => {
    if (lista.itens.length === 0) return;
    const csvContent = "CODIGO,ROTA,SAIDA_CICLO,MOTIVO,DATA_HORA,CRIADO_POR\n" + 
      lista.itens.map(i => `${i.codigo},${i.rota},${i.saida},${i.motivo},${i.scannedAt},${i.responsavel || ''}`).join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${lista.nome.toLowerCase().replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // -------------------------------------------------------------
  // VIEW 1: DASHBOARD DE LISTAS (EXIBIÇÃO EM TABELA/LISTA SEM DADOS FAKE)
  // -------------------------------------------------------------
  if (!listaAtiva) {
    const totalListas = listas.length;
    const listasAtivas = listas.filter(l => l.status === 'em_andamento').length;
    const totalItensColetados = listas.reduce((acc, l) => acc + l.itens.length, 0);

    const filteredDashboardListas = listas.filter(l => {
      if (!dashboardSearchTerm.trim()) return true;
      const term = dashboardSearchTerm.toLowerCase();
      return l.nome.toLowerCase().includes(term) || l.rota.toLowerCase().includes(term) || l.responsavel.toLowerCase().includes(term);
    });

    return (
      <div className="max-w-7xl mx-auto space-y-6 pb-12 animate-in fade-in duration-300">
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

        {/* Resumo de Métricas Topo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 p-4 rounded-xl flex items-center gap-4 shadow-sm">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#333333]">{totalListas}</p>
              <p className="text-xs text-gray-500 font-medium">Total de Listas</p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 p-4 rounded-xl flex items-center gap-4 shadow-sm">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#333333]">{listasAtivas}</p>
              <p className="text-xs text-gray-500 font-medium">Listas Em Andamento</p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 p-4 rounded-xl flex items-center gap-4 shadow-sm sm:col-span-2 lg:col-span-1">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-600">{totalItensColetados}</p>
              <p className="text-xs text-gray-500 font-medium">Total de IDs Coletados</p>
            </div>
          </div>
        </div>

        {/* TABELA DE LISTAS (EXIBIÇÃO EM LISTA E NÃO EM BLOCOS) */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#3483FA]" />
              <h3 className="text-base font-bold text-[#333333]">Suas Listas de Coleta</h3>
              <span className="bg-gray-100 text-gray-700 font-mono text-xs font-bold px-2.5 py-0.5 rounded-full">
                {listas.length}
              </span>
            </div>

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

          {filteredDashboardListas.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-700">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">#</th>
                    <th className="py-3 px-4">Nome da Lista</th>
                    <th className="py-3 px-4">Rota</th>
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
                      <td className="py-3.5 px-4 font-bold text-[#333333] text-sm">
                        <div className="flex flex-col gap-1">
                          <span>{lista.nome}</span>
                          <span className={`w-fit text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                            lista.tipo === 'grupos'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}>
                            {lista.tipo === 'grupos' ? 'Lista com Grupos' : 'Lista Comum'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-mono font-bold text-xs flex items-center gap-1 w-fit">
                          <MapPin className="w-3 h-3" />
                          {lista.rota}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded text-xs font-semibold">
                          {lista.saidaPadrao || 'Ciclo 2 - Saída PM'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-gray-600 font-medium">{lista.data}</td>
                      <td className="py-3.5 px-4 text-gray-700 font-bold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
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
                            onClick={() => setActiveListaId(lista.id)}
                            className="bg-[#3483FA] hover:bg-blue-600 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                          >
                            <Barcode className="w-4 h-4" />
                            Abrir Coleta
                          </button>
                          <button
                            onClick={() => exportListaCSV(lista)}
                            className="p-1.5 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors border border-gray-200 cursor-pointer"
                            title="Exportar CSV"
                          >
                            <Download className="w-4 h-4" />
                          </button>
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
                    className="flex-1 sm:flex-none px-4 py-2 bg-[#3483FA] hover:bg-blue-600 text-white rounded-xl text-xs font-bold shadow-sm"
                  >
                    Criar Lista
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW 2: TELA DE COLETA DA LISTA ATIVA (COM DADOS REAIS E PAINEL DIREITO SEM PENDENTES)
  // -------------------------------------------------------------
  const totalColetados = listaAtiva.itens.length;

  // Saídas presentes apenas nos IDs que realmente foram inseridos/bipados
  const saídasPresentes: string[] = Array.from(new Set(listaAtiva.itens.map(i => i.saida).filter(Boolean)));
  const contagemSaidas = saídasPresentes.reduce((acc, s: string) => {
    acc[s] = listaAtiva.itens.filter(i => i.saida === s).length;
    return acc;
  }, {} as Record<string, number>);

  // Motivos presentes apenas nos IDs que realmente foram inseridos/bipados
  const motivosPresentes: string[] = Array.from(new Set(listaAtiva.itens.map(i => i.motivo).filter(Boolean)));
  const contagemMotivos = motivosPresentes.reduce((acc, m: string) => {
    acc[m] = listaAtiva.itens.filter(i => i.motivo === m).length;
    return acc;
  }, {} as Record<string, number>);

  // Lista de Usuários do Sistema para "Quem está na tela de lista online"
  const usuariosSistemaOnline = registeredUsers.length > 0 ? registeredUsers : [
    { id: 'usr-1', username: operanteNome, email: '', isAdmin: true, isApproved: true, allowedGroups: [] }
  ];

  const filteredItems = listaAtiva.itens.filter(item => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return item.codigo.toLowerCase().includes(term) || item.rota.toLowerCase().includes(term) || item.motivo.toLowerCase().includes(term);
  });

  return (
    <div className="max-w-7xl mx-auto space-y-4 pb-12 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            onClick={() => setActiveListaId(null)}
            className="w-full sm:w-auto px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar pras Listas
          </button>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-[#333333] truncate max-w-[200px] sm:max-w-none">{listaAtiva.nome}</h2>
              {listaAtiva.rota && listaAtiva.rota !== 'Geral' && (
                <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-xs font-mono font-bold flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Rota: {listaAtiva.rota}
                </span>
              )}
              <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded text-xs font-semibold">
                {listaAtiva.saidaPadrao || 'Ciclo 2 - Saída PM'}
              </span>
            </div>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">
              Criado por <strong className="text-gray-700">{listaAtiva.responsavel}</strong> em {listaAtiva.data}.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowModalLote(true)}
            className="flex-1 sm:flex-none px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 border border-blue-200 transition-colors cursor-pointer"
          >
            <ListPlus className="w-4 h-4" />
            Colar Lote
          </button>

          <button
            onClick={() => exportListaCSV(listaAtiva)}
            className="flex-1 sm:flex-none px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>

          {listaAtiva.status === 'em_andamento' && (
            <button
              onClick={() => handleFinalizarLista(listaAtiva.id)}
              className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Finalizar
            </button>
          )}
        </div>
      </div>

      {/* GRID COM SCANNER + TABELA À ESQUERDA E PAINEL DIREITO */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* COLUNA ESQUERDA (2 COLS) — SCANNER + TABELA DE IDS */}
        <div className="lg:col-span-2 space-y-4">
          
          {/* Card Bip Scanner ("bip menor") */}
          <div className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4 shadow-sm">
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
                {isLocked ? <><Lock className="w-3.5 h-3.5" /> Bip Travado</> : <><Unlock className="w-3.5 h-3.5" /> Bip Liberado</>}
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
                  onBlur={() => {
                    if (!isLocked) setTimeout(() => inputRef.current?.focus(), 150);
                  }}
                  disabled={isLocked}
                  className={`block w-full pl-11 pr-24 py-2.5 border rounded-xl text-lg font-mono font-bold transition-all ${
                    isLocked 
                      ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
                      : 'border-[#3483FA]/40 focus:ring-2 focus:ring-[#3483FA]/20 focus:border-[#3483FA] text-[#333333] placeholder-gray-400'
                  }`}
                  placeholder={isLocked ? "Bip travado..." : "Bipe ou digite o ID do pacote..."}
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={isLocked || !bipInput.trim()}
                  className="absolute right-1.5 top-1.5 bottom-1.5 px-4 bg-[#3483FA] hover:bg-blue-600 disabled:bg-gray-200 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer"
                >
                  Bipar
                </button>
              </div>
            </form>

            {/* Feedback Bip */}
            {lastScanResult && (
              <div className={`mt-2.5 px-3 py-2 rounded-lg border text-xs flex items-center justify-between font-bold animate-in fade-in ${
                lastScanResult.status === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
              }`}>
                <div className="flex items-center gap-2">
                  {lastScanResult.status === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
                  <span className="font-mono">{lastScanResult.code}</span>
                  <span>— {lastScanResult.message}</span>
                </div>
                <span className="text-[10px] opacity-75 font-normal">Bip: 50ms</span>
              </div>
            )}
          </div>

          {/* Tabela de IDs Coletados com Seleção Individual e em Massa */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
            
            {/* Header da Tabela + Busca + Ações de Seleção Rápida */}
            <div className="flex flex-col gap-3 pb-3 border-b border-gray-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-base text-[#333333]">IDs Coletados na Lista</h3>
                  <span className="bg-[#3483FA]/10 text-[#3483FA] px-2.5 py-0.5 rounded-full text-xs font-extrabold font-mono">
                    {totalColetados} Coletados
                  </span>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar ID, rota ou motivo..."
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

                {selectedItemIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedItemIds([])}
                    className="text-[11px] text-gray-500 hover:text-red-600 font-bold underline cursor-pointer"
                  >
                    Limpar Seleção ({selectedItemIds.length})
                  </button>
                )}
              </div>
            </div>

            {/* PAINEL FLUTUANTE DE AÇÃO EM MASSA (QUANDO HÁ ITENS SELECIONADOS) */}
            {selectedItemIds.length > 0 && (
              <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50 border-2 border-[#3483FA]/40 rounded-xl p-3 shadow-xs space-y-2 animate-in fade-in">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="bg-[#3483FA] text-white px-2.5 py-1 rounded-lg font-mono font-black text-xs shadow-xs">
                      {selectedItemIds.length} {selectedItemIds.length === 1 ? 'ID' : 'IDs'}
                    </span>
                    <span className="text-xs text-gray-600 font-semibold">
                      — Alterar em massa:
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="relative flex-1 sm:flex-none">
                      <input
                        type="text"
                        list="bulk-motivos-list"
                        placeholder="Escolha ou digite o motivo..."
                        value={motivoEmMassaEscolha}
                        onChange={(e) => setMotivoEmMassaEscolha(e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs font-bold text-[#333333] focus:outline-none focus:border-[#3483FA] shadow-2xs sm:w-48"
                      />
                      <datalist id="bulk-motivos-list">
                        {MOTIVOS_DISPONIVEIS.map(m => (
                          <option key={m} value={m} />
                        ))}
                      </datalist>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAplicarMotivoEmMassa(motivoEmMassaEscolha)}
                      className="px-4 py-1.5 bg-[#3483FA] hover:bg-blue-600 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-all"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Setar Motivo
                    </button>

                    <button
                      type="button"
                      onClick={handleExcluirSelecionadosEmMassa}
                      className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center"
                      title="Excluir selecionados"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {filteredItems.length > 0 ? (
              <div className="overflow-x-auto border border-gray-300 rounded-xl">
                <table className="w-full text-xs text-gray-700 border-collapse">
                  <thead className="bg-gray-100 border-b-2 border-gray-300 text-gray-700 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3 text-center w-12 border-r border-gray-300">
                        <input
                          type="checkbox"
                          checked={filteredItems.length > 0 && filteredItems.every(i => selectedItemIds.includes(i.id))}
                          onChange={() => handleToggleSelectAll(filteredItems)}
                          className="w-4 h-4 rounded text-[#3483FA] focus:ring-[#3483FA] cursor-pointer"
                          title="Selecionar/Desmarcar Todos os visíveis"
                        />
                      </th>
                      <th className="py-2.5 px-3 text-center border-r border-gray-300 w-12">#</th>
                      <th className="py-2.5 px-3 text-left border-r border-gray-300">ID / Código</th>
                      <th className="py-2.5 px-3 text-center border-r border-gray-300 w-24">Rota</th>
                      <th className="py-2.5 px-3 text-center border-r border-gray-300 w-32">Saída</th>
                      <th className="py-2.5 px-3 text-center border-r border-gray-300 w-48">Motivo</th>
                      <th className="py-2.5 px-3 text-center border-r border-gray-300 w-40">Data / Hora</th>
                      <th className="py-2.5 px-3 text-center w-24">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 font-mono">
                    {filteredItems.map((item, idx) => {
                      const isSelected = selectedItemIds.includes(item.id);
                      return (
                        <tr 
                          key={`item-${item.id}-${idx}`} 
                          className={`transition-colors border-b border-gray-200 ${
                            isSelected 
                              ? 'bg-blue-50 font-bold border-l-4 border-l-[#3483FA]' 
                              : idx % 2 === 0 ? 'bg-white hover:bg-blue-50/30' : 'bg-gray-50/50 hover:bg-blue-50/30'
                          }`}
                        >
                          <td className="py-2.5 px-3 text-center border-r border-gray-200 w-12">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectItem(item.id)}
                              className="w-4 h-4 rounded text-[#3483FA] focus:ring-[#3483FA] cursor-pointer"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-center text-gray-500 font-bold border-r border-gray-200 w-12">{filteredItems.length - idx}</td>
                          <td 
                            onClick={() => setItemParaMudarMotivo(item)}
                            className="py-2.5 px-3 text-left font-bold text-[#333333] border-r border-gray-200 cursor-pointer hover:bg-amber-50/60 transition-colors"
                            title="Clique para alterar o motivo deste ID"
                          >
                            {item.codigo}
                          </td>
                          <td 
                            onClick={() => setItemParaMudarMotivo(item)}
                            className="py-2.5 px-3 text-center font-semibold text-[#3483FA] border-r border-gray-200 cursor-pointer hover:bg-amber-50/60 transition-colors w-24"
                            title="Clique para alterar o motivo deste ID"
                          >
                            {item.rota}
                          </td>
                          <td 
                            onClick={() => setItemParaMudarMotivo(item)}
                            className="py-2.5 px-3 text-center font-sans border-r border-gray-200 cursor-pointer hover:bg-amber-50/60 transition-colors w-32"
                            title="Clique para alterar o motivo deste ID"
                          >
                            <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-semibold text-[11px] inline-block whitespace-nowrap">
                              {item.saida}
                            </span>
                          </td>
                          {/* ÁREA CLICÁVEL DO MOTIVO - ABRE GAVETA DE ALTERAÇÃO INDIVIDUAL */}
                          <td 
                            onClick={() => setItemParaMudarMotivo(item)}
                            className="py-2.5 px-3 text-center font-sans border-r border-gray-200 cursor-pointer hover:bg-amber-100/70 transition-colors w-48"
                            title="Clique para abrir a gaveta e alterar o motivo"
                          >
                            <div className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-2xs group mx-auto">
                              <span>{item.motivo || 'Sem motivo'}</span>
                              <Edit2 className="w-3 h-3 text-amber-700 opacity-70 group-hover:opacity-100" />
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center text-gray-500 font-sans text-[11px] border-r border-gray-200 w-40">
                            {item.scannedAt}
                          </td>
                          <td className="py-2.5 px-3 text-center w-24">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleCopy(item.codigo)}
                                className="p-1 hover:bg-gray-200 text-gray-500 hover:text-black rounded transition-colors cursor-pointer"
                                title="Copiar ID"
                              >
                                {copiedId === item.codigo ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={() => handleRemoverItem(item.id)}
                                className="p-1 hover:bg-red-100 text-red-600 rounded transition-colors cursor-pointer"
                                title="Remover Item"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-gray-400">
                <Barcode className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                <p className="font-bold text-gray-600 text-sm">Nenhum ID nesta lista ainda</p>
                <p className="text-xs text-gray-400 mt-1">Bipe pacotes acima para dar entrada nesta lista.</p>
              </div>
            )}
          </div>

        </div>

        {/* COLUNA DIREITA — PAINEL DE QUANTIDADE E QUEM ESTÁ ONLINE COLETANDO JUNTO (SEM PENDENTES) */}
        <div className="space-y-4">
          
          {/* Painel 1: Quantidades e Métricas (APENAS O QUE EXISTE NOS IDS) */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <PieChart className="w-5 h-5 text-[#3483FA]" />
                <h3 className="font-bold text-sm text-[#333333]">Métricas de Coleta</h3>
              </div>
              <span className="text-[10px] font-mono font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                Tempo Real
              </span>
            </div>

            {/* Total de Coletados Card Grande */}
            <div className="bg-[#3483FA]/10 border border-[#3483FA]/20 p-4 rounded-xl text-center space-y-2">
              <div>
                <p className="text-3xl font-black text-[#3483FA]">{totalColetados}</p>
                <p className="text-xs font-bold text-gray-700 mt-0.5">Total de IDs Coletados</p>
              </div>

              {/* Botões de Ação Direta nas Métricas */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#3483FA]/20">
                {listaAtiva.status === 'em_andamento' && (
                  <button
                    type="button"
                    onClick={() => handleFinalizarLista(listaAtiva.id)}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1 transition-all shadow-xs cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Finalizar
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAbrirVerificar}
                  className="w-full py-2 bg-[#3483FA] hover:bg-blue-600 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1 transition-all shadow-xs cursor-pointer"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  Verificar
                </button>
              </div>
            </div>

            {/* Contagem por Saídas Presentes */}
            <div className="pt-2 space-y-2">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Quantidades por Saída</h4>
              {saídasPresentes.length > 0 ? (
                <div className="space-y-1.5 text-xs">
                  {saídasPresentes.map(sKey => (
                    <div key={sKey} className="flex justify-between items-center bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
                      <span className="text-gray-700 font-semibold">{sKey}</span>
                      <span className="font-mono font-bold text-[#3483FA] bg-white px-2.5 py-0.5 rounded border border-gray-200">
                        {contagemSaidas[sKey] || 0}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">Nenhuma saída registrada ainda.</p>
              )}
            </div>

            {/* Contagem por Motivos Presentes */}
            <div className="pt-3 border-t border-gray-100 space-y-2">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Quantidades por Motivo</h4>
              {motivosPresentes.length > 0 ? (
                <div className="space-y-1.5 text-xs">
                  {motivosPresentes.map(mKey => (
                    <div key={mKey} className="flex justify-between items-center bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
                      <span className="text-gray-700 font-semibold">{mKey}</span>
                      <span className="font-mono font-bold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded border border-amber-200">
                        {contagemMotivos[mKey] || 0}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">Nenhum motivo registrado ainda.</p>
              )}
            </div>
          </div>

          {/* Painel 2: Quem Está Registrado no Sistema e Online na Tela */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-sm text-[#333333]">Usuários Registrados Online</h3>
              </div>
              <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                {usuariosSistemaOnline.length} Conectados
              </span>
            </div>

            <div className="space-y-2.5">
              {usuariosSistemaOnline.map((user) => (
                <div key={user.id} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex items-center gap-2.5">
                    <div className="relative">
                      <div className="w-8 h-8 rounded-full bg-[#3483FA] text-white font-bold text-xs flex items-center justify-center shadow-2xs">
                        {user.username.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full"></span>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#333333] flex items-center gap-1">
                        {user.username}
                        {user.username === operanteNome && (
                          <span className="text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-mono font-normal">
                            Você
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-gray-500 font-medium">
                        {user.isAdmin ? 'Administrador' : 'Operador Registrado'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded border border-emerald-200">
                      Online
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-gray-400 text-center italic pt-1">
              Operadores autenticados e ativos na sessão de coleta.
            </p>
          </div>

        </div>

      </div>

      {/* GAVETA / MODAL DE ALTERAÇÃO DE MOTIVO DO ID */}
      {itemParaMudarMotivo && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-[#333333] flex items-center gap-2">
                  <Edit2 className="w-5 h-5 text-[#3483FA]" />
                  Alterar Motivo do Pacote
                </h3>
                <p className="text-xs font-mono font-bold text-[#3483FA] mt-0.5">
                  ID: {itemParaMudarMotivo.codigo}
                </p>
              </div>
              <button onClick={() => setItemParaMudarMotivo(null)} className="text-gray-400 hover:text-black cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 space-y-1">
              <label className="block text-xs font-bold text-gray-700">Digite um Motivo Manual:</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Escreva o motivo manualmente..."
                  value={itemParaMudarMotivo.motivo}
                  onChange={(e) => setItemParaMudarMotivo({ ...itemParaMudarMotivo, motivo: e.target.value })}
                  className="flex-1 bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#3483FA]"
                />
                <button
                  type="button"
                  onClick={() => handleMudarMotivoItem(itemParaMudarMotivo.motivo)}
                  className="px-4 py-2 bg-[#3483FA] hover:bg-blue-600 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Salvar
                </button>
              </div>
            </div>

            <p className="text-xs text-gray-500 mb-2 font-bold">
              Ou escolha um dos motivos sugeridos:
            </p>

            <div className="grid grid-cols-1 gap-2 max-h-80 overflow-y-auto pr-1">
              {MOTIVOS_DISPONIVEIS.map((m) => {
                const isSelected = itemParaMudarMotivo.motivo === m;
                return (
                  <button
                    key={m}
                    onClick={() => handleMudarMotivoItem(m)}
                    className={`w-full text-left p-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                      isSelected 
                        ? 'bg-[#3483FA] text-white border-[#3483FA] shadow-sm' 
                        : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
                    }`}
                  >
                    <span>{m}</span>
                    {isSelected ? <Check className="w-4 h-4 text-white" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 pt-3 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => setItemParaMudarMotivo(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ALTERAÇÃO DE MOTIVO EM MASSA */}
      {mudarMotivoMassaModal && selectedItemIds.length > 0 && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-[#333333] flex items-center gap-2">
                  <Layers className="w-5 h-5 text-[#3483FA]" />
                  Setar Motivo em Massa
                </h3>
                <p className="text-xs font-mono font-bold text-[#3483FA] mt-0.5">
                  {selectedItemIds.length} ID(s) Selecionado(s)
                </p>
              </div>
              <button onClick={() => setMudarMotivoMassaModal(false)} className="text-gray-400 hover:text-black cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 space-y-1">
              <label className="block text-xs font-bold text-gray-700">Motivo Manual para os {selectedItemIds.length} selecionados:</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Escreva o motivo manual em massa..."
                  value={motivoEmMassaEscolha}
                  onChange={(e) => setMotivoEmMassaEscolha(e.target.value)}
                  className="flex-1 bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#3483FA]"
                />
                <button
                  type="button"
                  onClick={() => handleAplicarMotivoEmMassa(motivoEmMassaEscolha)}
                  className="px-4 py-2 bg-[#3483FA] hover:bg-blue-600 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Aplicar
                </button>
              </div>
            </div>

            <p className="text-xs text-gray-500 mb-2 font-bold">
              Ou selecione uma das sugestões abaixo:
            </p>

            <div className="grid grid-cols-1 gap-2 max-h-80 overflow-y-auto pr-1">
              {MOTIVOS_DISPONIVEIS.map((m) => {
                const isSelected = motivoEmMassaEscolha === m;
                return (
                  <button
                    key={m}
                    onClick={() => {
                      setMotivoEmMassaEscolha(m);
                      handleAplicarMotivoEmMassa(m);
                    }}
                    className={`w-full text-left p-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                      isSelected 
                        ? 'bg-[#3483FA] text-white border-[#3483FA] shadow-sm' 
                        : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
                    }`}
                  >
                    <span>{m}</span>
                    {isSelected ? <Check className="w-4 h-4 text-white" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 pt-3 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => setMudarMotivoMassaModal(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

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
                  Marque cada ID como <strong className="text-emerald-700">Válido</strong> (continua na lista) ou <strong className="text-amber-700">Em Rota</strong> (será removido).
                </p>
              </div>
              <button onClick={() => setShowVerificarModal(false)} className="text-gray-400 hover:text-black cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Controls: Modo de Exibição & Seleção em Bloco */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200 mb-4 flex-shrink-0">
              {/* Selector de Modo: De 10 em 10 vs Completo */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-700">Exibição:</span>
                <div className="bg-white border border-gray-300 rounded-lg p-0.5 flex items-center text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => { setVerificarModo('10'); setVerificarPagina(0); }}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                      verificarModo === '10' ? 'bg-[#3483FA] text-white shadow-xs' : 'text-gray-600 hover:text-black'
                    }`}
                  >
                    De 10 em 10
                  </button>
                  <button
                    type="button"
                    onClick={() => setVerificarModo('completo')}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                      verificarModo === 'completo' ? 'bg-[#3483FA] text-white shadow-xs' : 'text-gray-600 hover:text-black'
                    }`}
                  >
                    Lista Completa ({listaAtiva.itens.length})
                  </button>
                </div>
              </div>

              {/* Ações em Bloco na Tela */}
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    const itensDaTela = verificarModo === '10' 
                      ? listaAtiva.itens.slice(verificarPagina * 10, (verificarPagina + 1) * 10)
                      : listaAtiva.itens;
                    handleMarcarVisiveisVerificar(itensDaTela, 'valido');
                  }}
                  className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg font-bold hover:bg-emerald-100 transition-colors cursor-pointer"
                >
                  Marcar Tela Válido
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const itensDaTela = verificarModo === '10' 
                      ? listaAtiva.itens.slice(verificarPagina * 10, (verificarPagina + 1) * 10)
                      : listaAtiva.itens;
                    handleMarcarVisiveisVerificar(itensDaTela, 'em_rota');
                  }}
                  className="px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-lg font-bold hover:bg-amber-100 transition-colors cursor-pointer"
                >
                  Marcar Tela Em Rota
                </button>
              </div>
            </div>

            {/* Modal Body: Lista de Itens */}
            <div className="overflow-y-auto flex-1 pr-1 space-y-2">
              {(() => {
                const totalItens = listaAtiva.itens.length;
                if (totalItens === 0) {
                  return (
                    <div className="py-8 text-center text-gray-400 text-xs">
                      Nenhum item cadastrado nesta lista para verificar.
                    </div>
                  );
                }

                const itensExibidos = verificarModo === '10'
                  ? listaAtiva.itens.slice(verificarPagina * 10, (verificarPagina + 1) * 10)
                  : listaAtiva.itens;

                const totalPaginas = Math.ceil(totalItens / 10);

                return (
                  <>
                    {verificarModo === '10' && totalPaginas > 1 && (
                      <div className="flex justify-between items-center bg-blue-50/50 p-2 rounded-lg border border-blue-100 text-xs text-blue-900 font-bold mb-2">
                        <span>Página {verificarPagina + 1} de {totalPaginas} ({itensExibidos.length} pacotes)</span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            disabled={verificarPagina === 0}
                            onClick={() => setVerificarPagina(p => p - 1)}
                            className="px-2 py-0.5 bg-white border border-blue-200 rounded disabled:opacity-40 cursor-pointer"
                          >
                            Anterior
                          </button>
                          <button
                            type="button"
                            disabled={verificarPagina >= totalPaginas - 1}
                            onClick={() => setVerificarPagina(p => p + 1)}
                            className="px-2 py-0.5 bg-white border border-blue-200 rounded disabled:opacity-40 cursor-pointer"
                          >
                            Próximo
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      {itensExibidos.map((item, idx) => {
                        const globalIndex = verificarModo === '10' ? (verificarPagina * 10) + idx + 1 : idx + 1;
                        const currentVerificarStatus = verificarMap[item.id] || 'valido';
                        const isValido = currentVerificarStatus === 'valido';
                        const isEmRota = currentVerificarStatus === 'em_rota';

                        return (
                          <div 
                            key={item.id} 
                            className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                              isEmRota 
                                ? 'bg-amber-50/80 border-amber-300' 
                                : 'bg-white border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-xs text-gray-400 font-bold w-6">#{globalIndex}</span>
                              <div>
                                <p className="font-mono font-bold text-sm text-[#333333]">{item.codigo}</p>
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
                                onClick={() => handleToggleVerificarStatus(item.id, 'valido')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                                  isValido 
                                    ? 'bg-emerald-600 text-white shadow-xs' 
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                              >
                                <Check className="w-3.5 h-3.5" />
                                Válido (Fica)
                              </button>

                              <button
                                type="button"
                                onClick={() => handleToggleVerificarStatus(item.id, 'em_rota')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                                  isEmRota 
                                    ? 'bg-amber-600 text-white shadow-xs' 
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                              >
                                <AlertCircle className="w-3.5 h-3.5" />
                                Em Rota (Sai)
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

            {/* Modal Footer: Resumo + Concluir */}
            <div className="mt-4 pt-3 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
              {(() => {
                const totalValidos = Object.values(verificarMap).filter(s => s === 'valido').length;
                const totalEmRota = Object.values(verificarMap).filter(s => s === 'em_rota').length;
                return (
                  <>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {totalValidos} Válidos
                      </span>
                      <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {totalEmRota} Em Rota
                      </span>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => setShowVerificarModal(false)}
                        className="flex-1 sm:flex-none px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleConcluirVerificacao}
                        className="flex-1 sm:flex-none px-4 py-2 bg-[#3483FA] hover:bg-blue-600 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
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

            <form onSubmit={handleAdicionarLote} className="space-y-4">
              <p className="text-xs text-gray-500">
                Cole múltiplos IDs abaixo (separados por linha ou vírgula). Todos serão vinculados ao ciclo <strong className="text-blue-700">{selectedSaida}</strong>.
              </p>
              <textarea
                value={loteText}
                onChange={(e) => setLoteText(e.target.value)}
                placeholder="78230012345678&#10;78230098765432"
                rows={6}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs font-mono focus:outline-none focus:border-[#3483FA]"
                required
              />

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
          </div>
        </div>
      )}
    </div>
  );
};
