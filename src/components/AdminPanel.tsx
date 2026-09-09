import React, { useState, useEffect, useRef } from 'react';
import { User, getAllUsers, updateUserAdminStatus, getUserById } from '../lib/auth';
import { 
  Shield, ShieldAlert, CheckCircle, XCircle, Users, Activity, Settings2, 
  AlertTriangle, Package, CheckSquare, Edit3, BarChart3, X, FileText, 
  AlertCircle, CheckCircle2, Copy, Download, Search, Barcode, User as UserIcon, Check,
  Calendar, UserCheck, UserPlus, Clock, Filter, RotateCcw, MoreVertical, Trophy,
  ChevronRight, ChevronDown, RefreshCw
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { listenToListas, saveLista } from '../lib/firebase';
import { ColetaLista, ColetaItem } from '../types';

const TABS = [
  { id: 'consulta', label: 'Buscar grupos' },
  { id: 'remover', label: 'Remover IDs' },
  { id: 'reporte', label: 'Reporte WhatsApp' },
  { id: 'listas', label: 'Listas de Coleta' },
  { id: 'upload', label: 'Importar CSV' },
];

interface AdminPanelProps {
  currentUser?: User | null;
}

function parseToYYYYMMDD(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();

  // Se já for YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // Se for DD/MM/YYYY ou DD-MM-YYYY
  const brMatch = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (brMatch) {
    const day = brMatch[1].padStart(2, '0');
    const month = brMatch[2].padStart(2, '0');
    const year = brMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Tenta buscar padrão DD/MM/YYYY dentro do texto (ex: "Saída PM - 08/09/2026")
  const brInTextMatch = trimmed.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (brInTextMatch) {
    const day = brInTextMatch[1].padStart(2, '0');
    const month = brInTextMatch[2].padStart(2, '0');
    const year = brInTextMatch[3];
    return `${year}-${month}-${day}`;
  }

  return null;
}

// Gera string de data em fuso horário local no formato YYYY-MM-DD
function getLocalDateIso(offsetDays = 0): string {
  const d = new Date();
  if (offsetDays !== 0) {
    d.setDate(d.getDate() + offsetDays);
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Extrai a data ISO de uma lista de forma resiliente
function getListDateIso(l: ColetaLista): string | null {
  if (!l) return null;
  const dateFromData = parseToYYYYMMDD(l.data);
  if (dateFromData) return dateFromData;

  const dateFromNome = parseToYYYYMMDD(l.nome);
  if (dateFromNome) return dateFromNome;

  if ((l as any).createdAt) {
    const dateFromCreated = parseToYYYYMMDD((l as any).createdAt);
    if (dateFromCreated) return dateFromCreated;
  }

  if (l.id && l.id.startsWith('lista-')) {
    const ts = parseInt(l.id.replace('lista-', ''), 10);
    if (!isNaN(ts) && ts > 1000000000000) {
      const d = new Date(ts);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  return null;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser }) => {
  const [adminTab, setAdminTab] = useState<'metricas' | 'usuarios'>('metricas');
  const [isPresentationMode, setIsPresentationMode] = useState<boolean>(false);
  const [lastUpdatedTime, setLastUpdatedTime] = useState<string>(new Date().toLocaleTimeString('pt-BR'));
  
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [quickFilter, setQuickFilter] = useState<'todos' | 'hoje' | 'ontem' | '7dias' | '15dias' | 'mes_atual' | 'custom'>('todos');
  const [tableSearch, setTableSearch] = useState<string>('');
  
  const [users, setUsers] = useState<User[]>([]);
  const [listas, setListas] = useState<ColetaLista[]>([]);
  const [loading, setLoading] = useState(true);
  const [isVerifiedAdmin, setIsVerifiedAdmin] = useState(false);
  const navigate = useNavigate();

  // Modal de ranking completo de colaboradores
  const [showRankingModal, setShowRankingModal] = useState<boolean>(false);

  // Menu de ações ativo por ID de lista
  const [activeActionMenuId, setActiveActionMenuId] = useState<string | null>(null);

  // Modal de métricas para a lista selecionada
  const [selectedListaForMetrics, setSelectedListaForMetrics] = useState<ColetaLista | null>(null);
  const [formAcerto, setFormAcerto] = useState<string>('100');
  const [formGaiola, setFormGaiola] = useState<string>('Fechado com Sucesso');
  const [formFaltaram, setFormFaltaram] = useState<string>('0');
  const [formStatus, setFormStatus] = useState<'em_andamento' | 'finalizada'>('finalizada');
  const [formData, setFormData] = useState<string>('');

  // Painel Lateral (Drawer) de Relatório Detalhado
  const [selectedListaForReport, setSelectedListaForReport] = useState<ColetaLista | null>(null);
  const [reportTab, setReportTab] = useState<'nao_validados' | 'todos' | 'validados'>('nao_validados');
  const [reportSearch, setReportSearch] = useState('');
  const [copiedReportNaoValidados, setCopiedReportNaoValidados] = useState(false);
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);

  // Fechar menus de ação ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.action-menu-container')) {
        setActiveActionMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    verifyAndFetch();
    const unsubListas = listenToListas((data) => {
      setListas(data);
      setLastUpdatedTime(new Date().toLocaleTimeString('pt-BR'));
    });
    return () => {
      unsubListas();
    };
  }, [currentUser]);

  const verifyAndFetch = async () => {
    setLoading(true);
    if (!currentUser?.id) {
      setIsVerifiedAdmin(false);
      setLoading(false);
      return;
    }
    
    const freshUser = await getUserById(currentUser.id);
    if ((freshUser && freshUser.isAdmin) || (!freshUser && currentUser.isAdmin)) {
      setIsVerifiedAdmin(true);
      await fetchUsers();
    } else {
      setIsVerifiedAdmin(false);
    }
    setLoading(false);
  };

  const fetchUsers = async () => {
    const data = await getAllUsers();
    setUsers(data);
  };

  const toggleApproval = async (userId: string, currentStatus: boolean) => {
    await updateUserAdminStatus(userId, { isApproved: !currentStatus });
    fetchUsers();
  };

  const toggleAdmin = async (userId: string, currentStatus: boolean) => {
    await updateUserAdminStatus(userId, { isAdmin: !currentStatus });
    fetchUsers();
  };

  const toggleTabAccess = async (userId: string, currentGroups: string[], tabId: string) => {
    const newGroups = currentGroups.includes(tabId) 
      ? currentGroups.filter(t => t !== tabId)
      : [...currentGroups, tabId];
      
    await updateUserAdminStatus(userId, { allowedGroups: newGroups });
    fetchUsers();
  };

  const handleOpenMetricsModal = (lista: ColetaLista) => {
    setSelectedListaForMetrics(lista);
    setFormAcerto(lista.porcentagemAcerto !== undefined ? lista.porcentagemAcerto.toString() : '100');
    setFormGaiola(lista.fechamentoGaiola || 'Fechado com Sucesso');
    setFormFaltaram(lista.itensFaltaram !== undefined ? lista.itensFaltaram.toString() : '0');
    setFormStatus(lista.status || 'finalizada');
    setFormData(lista.data || getLocalDateIso(0));
    setActiveActionMenuId(null);
  };

  const handleSaveMetrics = async () => {
    if (!selectedListaForMetrics) return;
    const updated: ColetaLista = {
      ...selectedListaForMetrics,
      status: formStatus,
      data: formData || selectedListaForMetrics.data,
      porcentagemAcerto: parseFloat(formAcerto) || 0,
      fechamentoGaiola: formGaiola,
      itensFaltaram: parseInt(formFaltaram, 10) || 0
    };
    await saveLista(updated);
    setSelectedListaForMetrics(null);
  };

  // Manter selectedListaForReport atualizada com listas em tempo real
  useEffect(() => {
    if (selectedListaForReport) {
      const fresh = listas.find(l => l.id === selectedListaForReport.id);
      if (fresh) setSelectedListaForReport(fresh);
    }
  }, [listas]);

  // Alternar validação de um item específico no relatório
  const handleToggleValidadoInAdmin = async (itemId: string) => {
    if (!selectedListaForReport) return;
    const updatedItens = (selectedListaForReport.itens || []).map(it => {
      if (it.id === itemId) {
        return { ...it, validado: !it.validado };
      }
      return it;
    });
    const updatedLista: ColetaLista = {
      ...selectedListaForReport,
      itens: updatedItens
    };
    setSelectedListaForReport(updatedLista);
    await saveLista(updatedLista);
  };

  // Validar todos os pendentes de uma vez no relatório
  const handleValidarTodosPendentes = async () => {
    if (!selectedListaForReport) return;
    if (!window.confirm("Deseja marcar todos os IDs pendentes desta lista como validados?")) return;
    const updatedItens = (selectedListaForReport.itens || []).map(it => ({
      ...it,
      validado: true
    }));
    const updatedLista: ColetaLista = {
      ...selectedListaForReport,
      itens: updatedItens
    };
    setSelectedListaForReport(updatedLista);
    await saveLista(updatedLista);
  };

  // Copiar IDs Não Validados
  const handleCopyNaoValidados = () => {
    if (!selectedListaForReport) return;
    const naoValidados = (selectedListaForReport.itens || []).filter(i => !i.validado);
    if (naoValidados.length === 0) return;
    const text = naoValidados.map(i => i.codigo).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopiedReportNaoValidados(true);
      setTimeout(() => setCopiedReportNaoValidados(false), 2500);
    });
  };

  // Baixar CSV de IDs Não Validados
  const handleExportNaoValidadosCSV = () => {
    if (!selectedListaForReport) return;
    const naoValidados = (selectedListaForReport.itens || []).filter(i => !i.validado);
    if (naoValidados.length === 0) return;
    const csvContent = "data:text/csv;charset=utf-8," + naoValidados.map(i => i.codigo).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ids_nao_validados_${selectedListaForReport.nome.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopySingleCode = (codigo: string) => {
    navigator.clipboard.writeText(codigo).then(() => {
      setCopiedItemId(codigo);
      setTimeout(() => setCopiedItemId(null), 2000);
    });
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-gray-500 font-sans">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-[#3483FA] rounded-full animate-spin mx-auto mb-3" />
        <span className="text-xs font-semibold">Carregando dados da Barra Admin...</span>
      </div>
    );
  }
  
  if (!isVerifiedAdmin) {
    return (
      <div className="max-w-md mx-auto mt-12 bg-white p-8 rounded-xl shadow-xs border border-gray-200 text-center font-sans">
        <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
        <h2 className="text-base font-bold text-gray-900 mb-1">Acesso Restrito</h2>
        <p className="text-xs text-gray-500 mb-6">Permissão de administrador requerida para visualizar esta área.</p>
        <button 
          onClick={() => navigate('/')}
          className="bg-[#3483FA] text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-blue-600 transition-colors cursor-pointer"
        >
          Voltar para o Início
        </button>
      </div>
    );
  }

  const approvedUsers = users.filter(u => u.isApproved);
  const pendingUsers = users.filter(u => !u.isApproved);

  // Extrai todas as datas únicas existentes nas listas (formato YYYY-MM-DD)
  const availableDates: string[] = Array.from(
    new Set<string>(
      listas
        .map(l => getListDateIso(l))
        .filter((d): d is string => Boolean(d))
    )
  ).sort((a, b) => b.localeCompare(a));

  // Aplicar filtro rápido de atalho (Hoje, Ontem, 7 Dias, etc)
  const applyPreset = (preset: 'todos' | 'hoje' | 'ontem' | '7dias' | '15dias' | 'mes_atual') => {
    setQuickFilter(preset);
    const today = getLocalDateIso(0);

    if (preset === 'todos') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'hoje') {
      setStartDate(today);
      setEndDate(today);
    } else if (preset === 'ontem') {
      const yesterday = getLocalDateIso(-1);
      setStartDate(yesterday);
      setEndDate(yesterday);
    } else if (preset === '7dias') {
      setStartDate(getLocalDateIso(-6));
      setEndDate(today);
    } else if (preset === '15dias') {
      setStartDate(getLocalDateIso(-14));
      setEndDate(today);
    } else if (preset === 'mes_atual') {
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      setStartDate(`${yyyy}-${mm}-01`);
      setEndDate(today);
    }
  };

  // Filtrar listas por período selecionado e termo de busca
  const filteredListas = listas.filter(l => {
    if (startDate || endDate) {
      const listIso = getListDateIso(l);
      if (listIso) {
        if (startDate && listIso < startDate) return false;
        if (endDate && listIso > endDate) return false;
      }
    }

    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase().trim();
      const nameMatch = l.nome.toLowerCase().includes(q);
      const respMatch = (l.responsavel || '').toLowerCase().includes(q);
      const dataMatch = (l.data || '').toLowerCase().includes(q);
      if (!nameMatch && !respMatch && !dataMatch) return false;
    }

    return true;
  });

  // Métricas operacionais reais
  const listasFinalizadas = filteredListas.filter(l => l.status === 'finalizada');
  const totalItensColetados = filteredListas.reduce((acc, l) => acc + (l.itens?.length || 0), 0);
  const totalValidadosGeral = filteredListas.reduce((acc, l) => acc + (l.itens?.filter(i => i.validado).length || 0), 0);
  const totalNaoValidadosGeral = filteredListas.reduce((acc, l) => acc + (l.itens?.filter(i => !i.validado).length || 0), 0);

  const listasComPendencia = filteredListas.filter(l => {
    const pendingItens = (l.itens || []).some(i => !i.validado);
    const faltam = l.itensFaltaram && l.itensFaltaram > 0;
    return pendingItens || faltam;
  });

  const listas100Fechadas = filteredListas.filter(l => {
    const allValidados = (l.itens || []).length > 0 && !(l.itens || []).some(i => !i.validado);
    return l.status === 'finalizada' && allValidados;
  });

  const assertividadeGeral = totalItensColetados > 0 
    ? ((totalValidadosGeral / totalItensColetados) * 100)
    : 100;

  const assertividadeGeralFormatted = assertividadeGeral.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }) + '%';

  const totalItensFormatted = totalItensColetados.toLocaleString('pt-BR');

  // Cálculo de Ranking de Colaboradores (Bipado por / Responsável)
  const collaboratorMap = new Map<string, number>();
  filteredListas.forEach(l => {
    (l.itens || []).forEach(it => {
      const resp = (it.responsavel || l.responsavel || 'Operador').trim();
      if (resp) {
        collaboratorMap.set(resp, (collaboratorMap.get(resp) || 0) + 1);
      }
    });
  });

  const ranking = Array.from(collaboratorMap.entries())
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total);

  const topCollaborator = ranking[0] || { nome: 'Nenhum registro', total: 0 };

  return (
    <div className="bg-white text-gray-800 font-sans min-h-screen p-4 sm:p-6 space-y-5 rounded-2xl border border-gray-200 shadow-2xs">
      
      {/* 1. CABEÇALHO SIMPLES E EXECUTIVO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">
              Barra Admin
            </h1>
            {isPresentationMode && (
              <span className="px-2 py-0.5 bg-gray-900 text-white text-[10px] font-bold uppercase tracking-wider rounded">
                Modo Apresentação
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Visão consolidada dos fechamentos e resultados
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Informação de Última Atualização */}
          <div className="text-right">
            <span className="text-[10px] uppercase font-semibold text-gray-400 block tracking-wider">
              Última atualização
            </span>
            <span className="text-xs font-mono font-bold text-gray-700">
              {lastUpdatedTime}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              setLastUpdatedTime(new Date().toLocaleTimeString('pt-BR'));
            }}
            className="p-2 bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 rounded-lg text-xs transition-colors cursor-pointer"
            title="Atualizar dados agora"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Botão de Alternância de Modo Apresentação */}
          <button
            type="button"
            onClick={() => setIsPresentationMode(!isPresentationMode)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs ${
              isPresentationMode
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-[#3483FA]" />
            <span>{isPresentationMode ? 'Sair da Apresentação' : 'Modo Apresentação'}</span>
          </button>
        </div>
      </div>

      {/* NAVEGAÇÃO SECUNDÁRIA (OCULTA NO MODO APRESENTAÇÃO) */}
      {!isPresentationMode && (
        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAdminTab('metricas')}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                adminTab === 'metricas'
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Métricas & Resultados
            </button>
            <button
              type="button"
              onClick={() => setAdminTab('usuarios')}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer relative ${
                adminTab === 'usuarios'
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <span>Usuários & Permissões</span>
              {pendingUsers.length > 0 && (
                <span className="ml-1.5 bg-amber-500 text-white font-black px-1.5 py-0.2 rounded-full text-[9px]">
                  {pendingUsers.length}
                </span>
              )}
            </button>
          </div>

          {/* Filtros compactos de data */}
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="text-[11px] font-semibold text-gray-400">Filtrar:</span>
            <button
              onClick={() => applyPreset('todos')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium border cursor-pointer ${
                quickFilter === 'todos' && !startDate && !endDate
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Todas
            </button>
            <button
              onClick={() => applyPreset('hoje')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium border cursor-pointer ${
                quickFilter === 'hoje'
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Hoje
            </button>
            <button
              onClick={() => applyPreset('7dias')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium border cursor-pointer ${
                quickFilter === '7dias'
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              7 Dias
            </button>
            <button
              onClick={() => applyPreset('mes_atual')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium border cursor-pointer ${
                quickFilter === 'mes_atual'
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Mês Atual
            </button>
          </div>
        </div>
      )}

      {/* CONTEÚDO DA ABA MÉTRICAS (OU MODO APRESENTAÇÃO) */}
      {(adminTab === 'metricas' || isPresentationMode) && (
        <div className="space-y-5">
          
          {/* 2. FAIXA ÚNICA DE INDICADORES EXECUTIVOS */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 gap-4 sm:gap-0">
              
              {/* 1. Total Pacotes Bipados */}
              <div className="sm:px-4 py-1 flex flex-col justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Total Bipados
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold tracking-tight text-gray-900 font-mono">
                    {totalItensFormatted}
                  </span>
                  <span className="text-xs text-gray-400 font-medium">pacotes</span>
                </div>
              </div>

              {/* 2. Assertividade Geral */}
              <div className="sm:px-4 py-1 flex flex-col justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Assertividade Geral
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold tracking-tight text-emerald-700 font-mono">
                    {assertividadeGeralFormatted}
                  </span>
                  <span className="text-xs text-gray-400 font-medium">precisão</span>
                </div>
              </div>

              {/* 3. Listas Fechadas 100% */}
              <div className="sm:px-4 py-1 flex flex-col justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Listas Fechadas 100%
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold tracking-tight text-gray-900 font-mono">
                    {listas100Fechadas.length}
                  </span>
                  <span className="text-xs text-gray-400 font-medium">de {filteredListas.length} listas</span>
                </div>
              </div>

              {/* 4. Pendências Totais */}
              <div className="sm:px-4 py-1 flex flex-col justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Pendências Totais
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className={`text-2xl font-bold tracking-tight font-mono ${totalNaoValidadosGeral > 0 ? 'text-amber-700' : 'text-gray-900'}`}>
                    {totalNaoValidadosGeral.toLocaleString('pt-BR')}
                  </span>
                  <span className="text-xs text-gray-400 font-medium">não validados</span>
                </div>
              </div>

              {/* 5. Listas com Pendência */}
              <div className="sm:px-4 py-1 flex flex-col justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Listas c/ Pendência
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className={`text-2xl font-bold tracking-tight font-mono ${listasComPendencia.length > 0 ? 'text-amber-700' : 'text-gray-900'}`}>
                    {listasComPendencia.length}
                  </span>
                  <span className="text-xs text-gray-400 font-medium">com pendências</span>
                </div>
              </div>

            </div>
          </div>

          {/* 3. BLOCOS DE DESEMPENHO E DESTAQUE OPERACIONAL */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* BLOCO 1: DESEMPENHO DAS LISTAS */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Desempenho das Listas
                  </h3>
                  <span className="text-xs font-mono font-bold text-gray-600">
                    {listasFinalizadas.length} de {filteredListas.length} fechadas ({filteredListas.length > 0 ? Math.round((listasFinalizadas.length / filteredListas.length) * 100) : 0}%)
                  </span>
                </div>

                {/* Barra de Fechamento Simples */}
                <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden flex my-2">
                  <div 
                    className="bg-[#3483FA] h-full transition-all duration-300"
                    style={{ width: `${filteredListas.length > 0 ? (listasFinalizadas.length / filteredListas.length) * 100 : 0}%` }}
                    title={`Finalizadas: ${listasFinalizadas.length}`}
                  />
                  <div 
                    className="bg-amber-400 h-full transition-all duration-300"
                    style={{ width: `${filteredListas.length > 0 ? ((filteredListas.length - listasFinalizadas.length) / filteredListas.length) * 100 : 0}%` }}
                    title={`Em Andamento: ${filteredListas.length - listasFinalizadas.length}`}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500 mt-2.5 font-medium">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#3483FA]"></span>
                    <span>Finalizadas: <strong className="text-gray-800">{listasFinalizadas.length}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                    <span>Em Andamento: <strong className="text-gray-800">{filteredListas.length - listasFinalizadas.length}</strong></span>
                  </div>
                </div>
              </div>
            </div>

            {/* BLOCO 2: DESTAQUE OPERACIONAL (TOP 1) */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Destaque Operacional
                </h3>
                {ranking.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setShowRankingModal(true)}
                    className="text-xs font-semibold text-[#3483FA] hover:underline cursor-pointer"
                  >
                    Ver ranking completo ({ranking.length})
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3.5 my-1">
                <div className="w-10 h-10 rounded-full bg-gray-100 border border-gray-200 text-gray-800 font-extrabold flex items-center justify-center text-sm uppercase shrink-0">
                  {topCollaborator.nome !== 'Nenhum registro' ? topCollaborator.nome.substring(0, 2) : 'OP'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold uppercase rounded">
                      Top 1
                    </span>
                    <p className="text-sm font-bold text-gray-900 truncate">
                      {topCollaborator.nome}
                    </p>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    <strong className="text-gray-900 font-mono font-bold">{topCollaborator.total.toLocaleString('pt-BR')}</strong> pacotes bipados
                    {totalItensColetados > 0 && (
                      <span className="text-gray-400 ml-1.5">
                        ({((topCollaborator.total / totalItensColetados) * 100).toFixed(1)}% do total)
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

          </div>

          {/* 4. SEÇÃO LISTAS DO PERÍODO - TABELA CLEAN */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-gray-900">
                  Listas do Período
                </h2>
                <p className="text-xs text-gray-500">
                  {filteredListas.length} {filteredListas.length === 1 ? 'lista registrada' : 'listas registradas'}
                </p>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar lista ou responsável..."
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium focus:outline-none focus:border-[#3483FA] focus:bg-white transition-all"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-gray-700 border-collapse">
                <thead className="bg-gray-50 font-bold uppercase text-[11px] text-gray-500 border-b border-gray-200 sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-3">Lista</th>
                    <th className="py-2.5 px-3 text-center">Data</th>
                    <th className="py-2.5 px-3 text-center">Pacotes</th>
                    <th className="py-2.5 px-3 text-center">Validados</th>
                    <th className="py-2.5 px-3 text-center">Pendentes</th>
                    <th className="py-2.5 px-3 text-center">Assertividade</th>
                    <th className="py-2.5 px-3 text-center">Fechamento</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    {!isPresentationMode && (
                      <th className="py-2.5 px-3 text-right">Ações</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-sans">
                  {filteredListas.map(lista => {
                    const itensCount = lista.itens?.length || 0;
                    const validadosCount = (lista.itens || []).filter(i => i.validado).length;
                    const naoValidadosCount = (lista.itens || []).filter(i => !i.validado).length;

                    const porcentagem = itensCount > 0 
                      ? ((validadosCount / itensCount) * 100)
                      : (lista.porcentagemAcerto !== undefined ? lista.porcentagemAcerto : 100);

                    const dateBr = lista.data 
                      ? lista.data.split('-').reverse().join('/') 
                      : (getListDateIso(lista)?.split('-').reverse().join('/') || '-');

                    return (
                      <tr 
                        key={lista.id}
                        onClick={() => setSelectedListaForReport(lista)}
                        className="hover:bg-gray-50/80 transition-colors cursor-pointer group"
                      >
                        <td className="py-2.5 px-3 font-semibold text-gray-900">
                          <div className="flex items-center gap-2">
                            <span className="group-hover:text-[#3483FA] transition-colors">
                              {lista.nome}
                            </span>
                            {lista.tipo === 'grupos' && (
                              <span className="px-1.5 py-0.2 bg-purple-50 text-purple-700 rounded text-[9px] font-bold">
                                Grupos
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-2.5 px-3 text-center font-mono text-gray-600">
                          {dateBr}
                        </td>

                        <td className="py-2.5 px-3 text-center font-mono font-bold text-gray-900">
                          {itensCount.toLocaleString('pt-BR')}
                        </td>

                        <td className="py-2.5 px-3 text-center font-mono text-emerald-700 font-bold">
                          {validadosCount.toLocaleString('pt-BR')}
                        </td>

                        <td className="py-2.5 px-3 text-center font-mono">
                          {naoValidadosCount > 0 ? (
                            <span className="text-amber-800 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                              {naoValidadosCount.toLocaleString('pt-BR')}
                            </span>
                          ) : (
                            <span className="text-gray-400">0</span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 text-center font-mono font-bold text-gray-800">
                          {porcentagem.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                        </td>

                        <td className="py-2.5 px-3 text-center text-gray-600">
                          {lista.fechamentoGaiola || '-'}
                        </td>

                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            lista.status === 'finalizada'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-blue-50 text-blue-800 border border-blue-200'
                          }`}>
                            {lista.status === 'finalizada' ? 'Finalizada' : 'Em Andamento'}
                          </span>
                        </td>

                        {!isPresentationMode && (
                          <td 
                            className="py-2.5 px-3 text-right relative action-menu-container"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => setActiveActionMenuId(activeActionMenuId === lista.id ? null : lista.id)}
                              className="p-1 hover:bg-gray-100 text-gray-500 rounded transition-colors cursor-pointer"
                              title="Mais Ações"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>

                            {activeActionMenuId === lista.id && (
                              <div className="absolute right-3 top-8 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-30 text-left text-xs">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedListaForReport(lista);
                                    setActiveActionMenuId(null);
                                  }}
                                  className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2 font-medium text-gray-700 cursor-pointer"
                                >
                                  <FileText className="w-3.5 h-3.5 text-gray-400" />
                                  <span>Relatório Detalhado</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleOpenMetricsModal(lista)}
                                  className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2 font-medium text-gray-700 cursor-pointer border-t border-gray-100"
                                >
                                  <Edit3 className="w-3.5 h-3.5 text-gray-400" />
                                  <span>Editar Métricas / Gaiola</span>
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}

                  {filteredListas.length === 0 && (
                    <tr>
                      <td colSpan={isPresentationMode ? 8 : 9} className="py-10 text-center text-gray-400 font-medium">
                        Nenhuma lista de coleta encontrada para o filtro informado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ABA USUÁRIOS E SOLICITAÇÕES (EXIBIDA APENAS FORA DO MODO APRESENTAÇÃO) */}
      {!isPresentationMode && adminTab === 'usuarios' && (
        <div className="space-y-5">
          
          {/* SOLICITAÇÕES PENDENTES */}
          <div className="bg-white rounded-xl border border-amber-200 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-amber-600" />
                <h2 className="text-sm font-bold text-gray-900">
                  Solicitações de Acesso Pendentes ({pendingUsers.length})
                </h2>
              </div>
            </div>

            {pendingUsers.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">
                Nenhuma solicitação pendente no momento. Todos os usuários estão aprovados.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pendingUsers.map(pUser => (
                  <div key={pUser.id} className="bg-amber-50/50 border border-amber-200 rounded-lg p-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-xs text-gray-900">{pUser.username}</p>
                      <p className="text-[11px] text-gray-500 font-mono">{pUser.email}</p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => toggleApproval(pUser.id, false)}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded transition-colors cursor-pointer"
                      >
                        Aprovar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* GERENCIAR USUÁRIOS */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="text-sm font-bold text-gray-900">
                Usuários Cadastrados ({users.length})
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2">Usuário</th>
                    <th className="px-3 py-2 text-center">Aprovação</th>
                    <th className="px-3 py-2 text-center">Admin</th>
                    <th className="px-3 py-2">Permissão de Abas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map(user => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-gray-900">{user.username}</div>
                        <div className="text-[11px] text-gray-400 font-mono">{user.email}</div>
                      </td>

                      <td className="px-3 py-2.5 text-center">
                        <button
                          onClick={() => toggleApproval(user.id, user.isApproved)}
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold cursor-pointer ${
                            user.isApproved ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {user.isApproved ? 'Aprovado' : 'Pendente'}
                        </button>
                      </td>

                      <td className="px-3 py-2.5 text-center">
                        <button
                          onClick={() => toggleAdmin(user.id, user.isAdmin)}
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold cursor-pointer ${
                            user.isAdmin ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {user.isAdmin ? 'Sim' : 'Não'}
                        </button>
                      </td>

                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {TABS.map(tab => (
                            <button
                              key={tab.id}
                              onClick={() => toggleTabAccess(user.id, user.allowedGroups || [], tab.id)}
                              className={`px-2 py-0.5 rounded text-[10px] font-medium border cursor-pointer ${
                                (user.allowedGroups || []).includes(tab.id)
                                  ? 'bg-blue-50 border-blue-200 text-[#3483FA]'
                                  : 'bg-white border-gray-200 text-gray-400'
                              }`}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* PAINEL LATERAL (DRAWER) DE RELATÓRIO DETALHADO */}
      {selectedListaForReport && (() => {
        const itensLista = selectedListaForReport.itens || [];
        const naoValidadosList = itensLista.filter(i => !i.validado);
        const validadosList = itensLista.filter(i => !!i.validado);

        let listToDisplay = reportTab === 'nao_validados' 
          ? naoValidadosList 
          : reportTab === 'validados' 
          ? validadosList 
          : itensLista;

        if (reportSearch.trim()) {
          const q = reportSearch.toLowerCase().trim();
          listToDisplay = listToDisplay.filter(i => 
            i.codigo.toLowerCase().includes(q) ||
            (i.motivo && i.motivo.toLowerCase().includes(q)) ||
            (i.rota && i.rota.toLowerCase().includes(q)) ||
            (i.responsavel && i.responsavel.toLowerCase().includes(q))
          );
        }

        return (
          <div className="fixed inset-0 z-50 overflow-hidden">
            {/* Backdrop */}
            <div 
              className="fixed inset-0 bg-black/40 backdrop-blur-2xs transition-opacity"
              onClick={() => setSelectedListaForReport(null)}
            />

            <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
              <div className="w-screen max-w-3xl bg-white shadow-2xl flex flex-col border-l border-gray-200 font-sans">
                
                {/* Header do Drawer */}
                <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-gray-900">
                        {selectedListaForReport.nome}
                      </h2>
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                        selectedListaForReport.status === 'finalizada'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {selectedListaForReport.status === 'finalizada' ? 'Finalizada' : 'Em Andamento'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Data: {selectedListaForReport.data ? selectedListaForReport.data.split('-').reverse().join('/') : '-'} • 
                      Responsável: {selectedListaForReport.responsavel || 'Operador'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedListaForReport(null)}
                    className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-500 transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Resumo Métrico */}
                <div className="p-3 bg-white border-b border-gray-100 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                    <span className="text-[10px] uppercase font-bold text-gray-400 block">Total</span>
                    <span className="text-base font-bold text-gray-800 font-mono">{itensLista.length}</span>
                  </div>
                  <div className="bg-emerald-50 p-2.5 rounded-lg border border-emerald-100">
                    <span className="text-[10px] uppercase font-bold text-emerald-700 block">Validados</span>
                    <span className="text-base font-bold text-emerald-800 font-mono">{validadosList.length}</span>
                  </div>
                  <div className="bg-amber-50 p-2.5 rounded-lg border border-amber-100">
                    <span className="text-[10px] uppercase font-bold text-amber-700 block">Não Validados</span>
                    <span className="text-base font-bold text-amber-900 font-mono">{naoValidadosList.length}</span>
                  </div>
                </div>

                {/* Controles e Filtros */}
                <div className="p-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1 bg-gray-200 p-0.5 rounded-lg text-xs">
                    <button
                      onClick={() => setReportTab('nao_validados')}
                      className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                        reportTab === 'nao_validados' ? 'bg-amber-500 text-white' : 'text-gray-600'
                      }`}
                    >
                      Não Validados ({naoValidadosList.length})
                    </button>
                    <button
                      onClick={() => setReportTab('todos')}
                      className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                        reportTab === 'todos' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-600'
                      }`}
                    >
                      Todos ({itensLista.length})
                    </button>
                    <button
                      onClick={() => setReportTab('validados')}
                      className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                        reportTab === 'validados' ? 'bg-emerald-600 text-white' : 'text-gray-600'
                      }`}
                    >
                      Validados ({validadosList.length})
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div className="relative w-36">
                      <Search className="w-3 h-3 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Buscar..."
                        value={reportSearch}
                        onChange={(e) => setReportSearch(e.target.value)}
                        className="w-full pl-7 pr-2 py-1 bg-white border border-gray-200 rounded text-xs focus:outline-none"
                      />
                    </div>

                    <button
                      onClick={handleCopyNaoValidados}
                      disabled={naoValidadosList.length === 0}
                      className="px-2.5 py-1 bg-[#3483FA] hover:bg-blue-600 text-white rounded text-xs font-bold cursor-pointer disabled:opacity-40"
                    >
                      {copiedReportNaoValidados ? 'Copiado!' : 'Copiar IDs'}
                    </button>

                    <button
                      onClick={handleExportNaoValidadosCSV}
                      disabled={naoValidadosList.length === 0}
                      className="px-2.5 py-1 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded text-xs font-bold cursor-pointer disabled:opacity-40"
                    >
                      Baixar CSV
                    </button>

                    {!isPresentationMode && naoValidadosList.length > 0 && (
                      <button
                        onClick={handleValidarTodosPendentes}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold cursor-pointer"
                      >
                        Validar Todos
                      </button>
                    )}
                  </div>
                </div>

                {/* Tabela do Drawer */}
                <div className="flex-1 overflow-y-auto p-3">
                  {listToDisplay.length > 0 ? (
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="bg-gray-100 text-gray-600 font-bold uppercase text-[10px] sticky top-0 border-b border-gray-200">
                        <tr>
                          <th className="py-2 px-2 text-center w-8">#</th>
                          <th className="py-2 px-2">ID / Código</th>
                          <th className="py-2 px-2 text-center">Status</th>
                          <th className="py-2 px-2 text-center">Bipado Por</th>
                          <th className="py-2 px-2 text-center">Rota</th>
                          <th className="py-2 px-2 text-center">Motivo</th>
                          <th className="py-2 px-2 text-center">Hora</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {listToDisplay.map((item, idx) => (
                          <tr key={item.id} className={!item.validado ? 'bg-amber-50/40' : ''}>
                            <td className="py-2 px-2 text-center text-gray-400 font-mono">{idx + 1}</td>
                            <td className="py-2 px-2 font-mono font-bold text-gray-900">{item.codigo}</td>
                            <td className="py-2 px-2 text-center">
                              {!isPresentationMode ? (
                                <button
                                  onClick={() => handleToggleValidadoInAdmin(item.id)}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                                    item.validado ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {item.validado ? 'Validado' : 'Pendente'}
                                </button>
                              ) : (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  item.validado ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {item.validado ? 'Validado' : 'Pendente'}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-2 text-center text-gray-600">{item.responsavel || '-'}</td>
                            <td className="py-2 px-2 text-center text-gray-600">{item.rota || '-'}</td>
                            <td className="py-2 px-2 text-center text-gray-600">{item.motivo || '-'}</td>
                            <td className="py-2 px-2 text-center text-gray-400 font-mono text-[10px]">{item.scannedAt}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="py-12 text-center text-gray-400 text-xs">
                      Nenhum item encontrado nesta visualização.
                    </div>
                  )}
                </div>

                {/* Footer do Drawer */}
                <div className="p-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
                  <span>Exibindo {listToDisplay.length} de {itensLista.length} itens</span>
                  <button
                    onClick={() => setSelectedListaForReport(null)}
                    className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>

              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL DE RANKING COMPLETO */}
      {showRankingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-2xs">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md overflow-hidden font-sans">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                <h3 className="text-sm font-bold text-gray-900">Ranking Completo de Colaboradores</h3>
              </div>
              <button onClick={() => setShowRankingModal(false)} className="p-1 hover:bg-gray-100 rounded text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 max-h-[60vh] overflow-y-auto divide-y divide-gray-100">
              {ranking.map((col, idx) => (
                <div key={col.nome} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center font-mono font-bold text-[10px] ${
                      idx === 0 ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                      idx === 1 ? 'bg-gray-100 text-gray-700' :
                      idx === 2 ? 'bg-orange-100 text-orange-800' : 'text-gray-400'
                    }`}>
                      {idx + 1}
                    </span>
                    <span className="font-semibold text-gray-900">{col.nome}</span>
                  </div>

                  <div className="text-right">
                    <span className="font-mono font-bold text-gray-900">{col.total.toLocaleString('pt-BR')} bips</span>
                    {totalItensColetados > 0 && (
                      <span className="text-gray-400 text-[10px] block">
                        ({((col.total / totalItensColetados) * 100).toFixed(1)}%)
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 border-t border-gray-100 bg-gray-50 text-right">
              <button
                onClick={() => setShowRankingModal(false)}
                className="px-4 py-1.5 bg-gray-800 text-white font-bold text-xs rounded hover:bg-gray-900 cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE EDITAR MÉTRICAS DA LISTA */}
      {selectedListaForMetrics && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-2xs">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md overflow-hidden font-sans">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h3 className="text-sm font-bold text-gray-900">Editar Métricas - {selectedListaForMetrics.nome}</h3>
              <button onClick={() => setSelectedListaForMetrics(null)} className="p-1 hover:bg-gray-200 rounded text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-gray-600 mb-1">Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as 'em_andamento' | 'finalizada')}
                    className="w-full p-2 border border-gray-200 rounded font-semibold text-gray-800"
                  >
                    <option value="em_andamento">Em Andamento</option>
                    <option value="finalizada">Finalizada</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-gray-600 mb-1">Data</label>
                  <input
                    type="date"
                    value={formData}
                    onChange={(e) => setFormData(e.target.value)}
                    className="w-full p-2 border border-gray-200 rounded font-semibold text-gray-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-600 mb-1">Assertividade (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={formAcerto}
                  onChange={(e) => setFormAcerto(e.target.value)}
                  className="w-full p-2 border border-gray-200 rounded font-semibold text-gray-800"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-600 mb-1">Fechamento de Gaiola</label>
                <select
                  value={formGaiola}
                  onChange={(e) => setFormGaiola(e.target.value)}
                  className="w-full p-2 border border-gray-200 rounded font-semibold text-gray-800"
                >
                  <option value="Fechado com Sucesso">Fechado com Sucesso</option>
                  <option value="Fechamento Parcial">Fechamento Parcial</option>
                  <option value="Aguardando Recontagem">Aguardando Recontagem</option>
                  <option value="Divergência Encontrada">Divergência Encontrada</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-gray-600 mb-1">Quantos Faltaram (Itens Ausentes)</label>
                <input
                  type="number"
                  min="0"
                  value={formFaltaram}
                  onChange={(e) => setFormFaltaram(e.target.value)}
                  className="w-full p-2 border border-gray-200 rounded font-semibold text-gray-800"
                />
              </div>
            </div>

            <div className="p-3 border-t border-gray-100 bg-gray-50 flex gap-2">
              <button
                onClick={() => setSelectedListaForMetrics(null)}
                className="flex-1 py-1.5 bg-white border border-gray-200 text-gray-700 font-bold text-xs rounded hover:bg-gray-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveMetrics}
                className="flex-1 py-1.5 bg-[#3483FA] text-white font-bold text-xs rounded hover:bg-blue-600 cursor-pointer"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
