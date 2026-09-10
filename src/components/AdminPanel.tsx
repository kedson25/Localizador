import React, { useState, useEffect } from 'react';
import { User, getAllUsers, updateUserAdminStatus, getUserById } from '../lib/auth';
import { 
  Shield, ShieldAlert, CheckCircle, XCircle, Users, Activity, Settings2, 
  AlertTriangle, Package, CheckSquare, Edit3, BarChart3, X, FileText, 
  AlertCircle, CheckCircle2, Copy, Download, Search, Barcode, User as UserIcon, Check,
  Calendar, UserCheck, UserPlus, Clock, Filter, RotateCcw
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { listenToListas, saveLista } from '../lib/firebase';
import { ColetaLista } from '../types';

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
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [quickFilter, setQuickFilter] = useState<'todos' | 'hoje' | 'ontem' | '7dias' | '15dias' | 'mes_atual' | 'custom'>('todos');
  const [users, setUsers] = useState<User[]>([]);
  const [listas, setListas] = useState<ColetaLista[]>([]);
  const [loading, setLoading] = useState(true);
  const [isVerifiedAdmin, setIsVerifiedAdmin] = useState(false);
  const navigate = useNavigate();

  // Modal de métricas para a lista selecionada
  const [selectedListaForMetrics, setSelectedListaForMetrics] = useState<ColetaLista | null>(null);
  const [formAcerto, setFormAcerto] = useState<string>('100');
  const [formGaiola, setFormGaiola] = useState<string>('Fechado com Sucesso');
  const [formFaltaram, setFormFaltaram] = useState<string>('0');
  const [formStatus, setFormStatus] = useState<'em_andamento' | 'finalizada'>('finalizada');
  const [formData, setFormData] = useState<string>('');

  // Modal de Relatório da Lista (Visualização Não Validada & Completa)
  const [selectedListaForReport, setSelectedListaForReport] = useState<ColetaLista | null>(null);
  const [reportTab, setReportTab] = useState<'nao_validados' | 'todos' | 'validados'>('nao_validados');
  const [reportSearch, setReportSearch] = useState('');
  const [copiedReportNaoValidados, setCopiedReportNaoValidados] = useState(false);
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);

  useEffect(() => {
    verifyAndFetch();
    const unsubListas = listenToListas((data) => {
      setListas(data);
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

  // Alternar validação de um item específico no relatório do Admin
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

  // Validar todos os pendentes de uma vez no relatório do Admin
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

  // Baixar CSV de IDs Não Validados (somente IDs)
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
    return <div className="p-8 text-center text-gray-500">Verificando permissões...</div>;
  }
  
  if (!isVerifiedAdmin) {
    return (
      <div className="max-w-xl mx-auto mt-10 bg-white p-8 rounded-lg shadow border border-red-200 text-center">
        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-800 mb-2">Acesso Negado</h2>
        <p className="text-gray-600 mb-6">Você não tem permissões de administrador para visualizar esta página.</p>
        <button 
          onClick={() => navigate('/')}
          className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 transition-colors"
        >
          Voltar para Início
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
  ).sort((a, b) => b.localeCompare(a)); // Ordenado do mais recente para o mais antigo

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

  // Filtrar listas por período selecionado
  const filteredListas = listas.filter(l => {
    if (!startDate && !endDate) return true;

    const listIso = getListDateIso(l);
    if (!listIso) return true;

    if (startDate && listIso < startDate) return false;
    if (endDate && listIso > endDate) return false;

    return true;
  });

  // Texto legível descrevendo o período de cálculo ativo
  const getFilterDescription = () => {
    if (!startDate && !endDate) {
      return 'Exibindo acumulado geral de todas as datas de coleta registradas';
    }
    if (startDate && endDate && startDate === endDate) {
      return `Métricas operacionais para o dia ${startDate.split('-').reverse().join('/')}`;
    }
    if (startDate && endDate) {
      return `Métricas operacionais no período de ${startDate.split('-').reverse().join('/')} até ${endDate.split('-').reverse().join('/')}`;
    }
    if (startDate) {
      return `Métricas operacionais a partir de ${startDate.split('-').reverse().join('/')}`;
    }
    if (endDate) {
      return `Métricas operacionais até ${endDate.split('-').reverse().join('/')}`;
    }
    return '';
  };

  // Cálculos de métricas operacionais filtradas pelo Período de Cálculo
  const listasFinalizadas = filteredListas.filter(l => l.status === 'finalizada');
  const totalItensColetados = filteredListas.reduce((acc, l) => acc + (l.itens?.length || 0), 0);
  const totalValidadosGeral = filteredListas.reduce((acc, l) => acc + (l.itens?.filter(i => i.validado).length || 0), 0);
  const totalNaoValidadosGeral = filteredListas.reduce((acc, l) => acc + (l.itens?.filter(i => !i.validado).length || 0), 0);
  const totalFaltantesGeral = listasFinalizadas.reduce((acc, l) => acc + (l.itensFaltaram || 0), 0);
  const mediaAcertoGeral = listasFinalizadas.length > 0 
    ? (listasFinalizadas.reduce((acc, l) => acc + (l.porcentagemAcerto ?? 100), 0) / listasFinalizadas.length).toFixed(1)
    : '100.0';

  return (
    <div className="space-y-6 animate-in pb-12">
      {/* NAVEGAÇÃO DE ABAS DO PAINEL ADMIN */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-200 bg-white p-2 rounded-2xl shadow-sm gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setAdminTab('metricas')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
              adminTab === 'metricas'
                ? 'bg-[#3483FA] text-white shadow-md'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Métricas & Fechamentos</span>
            {(startDate || endDate) && (
              <span className="bg-white/20 px-2 py-0.5 rounded text-[10px] font-black">
                {startDate === endDate ? startDate.split('-').reverse().join('/') : 'Período Filtrado'}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setAdminTab('usuarios')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer relative ${
              adminTab === 'usuarios'
                ? 'bg-[#3483FA] text-white shadow-md'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Usuários & Solicitações</span>
            {pendingUsers.length > 0 && (
              <span className="bg-amber-500 text-white font-black px-2 py-0.5 rounded-full text-[10px] animate-pulse shadow-2xs">
                {pendingUsers.length} {pendingUsers.length === 1 ? 'pendente' : 'pendentes'}
              </span>
            )}
          </button>
        </div>

        <div className="text-xs text-gray-500 font-bold px-3 py-1">
          {adminTab === 'metricas' 
            ? `${filteredListas.length} ${filteredListas.length === 1 ? 'lista encontrada' : 'listas encontradas'}` 
            : `${users.length} usuários cadastrados`}
        </div>
      </div>

      {/* ABA 1: MÉTRICAS & CÁLCULOS */}
      {adminTab === 'metricas' && (
        <div className="space-y-6 animate-in fade-in">
          {/* SELETOR DE PERÍODO & DATA DE CÁLCULO */}
          <div className="bg-white border border-gray-200 p-5 rounded-2xl shadow-sm flex flex-col gap-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-gray-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-50 text-[#3483FA] rounded-xl border border-blue-100">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-gray-800 uppercase tracking-tight flex items-center gap-2">
                    <span>Período & Data de Cálculo</span>
                    {(startDate || endDate) && (
                      <span className="bg-blue-100 text-[#3483FA] px-2 py-0.5 rounded text-[10px] font-bold">
                        Filtrado
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {getFilterDescription()}
                  </p>
                </div>
              </div>

              {/* BOTOES DE ATALHO RÁPIDO */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => applyPreset('todos')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                    quickFilter === 'todos' && !startDate && !endDate
                      ? 'bg-[#3483FA] text-white border-[#3483FA] shadow-xs' 
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  Todas as Datas
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset('hoje')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                    quickFilter === 'hoje'
                      ? 'bg-[#3483FA] text-white border-[#3483FA] shadow-xs' 
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  Hoje
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset('ontem')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                    quickFilter === 'ontem'
                      ? 'bg-[#3483FA] text-white border-[#3483FA] shadow-xs' 
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  Ontem
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset('7dias')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                    quickFilter === '7dias'
                      ? 'bg-[#3483FA] text-white border-[#3483FA] shadow-xs' 
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  Última Semana (7d)
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset('15dias')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                    quickFilter === '15dias'
                      ? 'bg-[#3483FA] text-white border-[#3483FA] shadow-xs' 
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  15 Dias
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset('mes_atual')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                    quickFilter === 'mes_atual'
                      ? 'bg-[#3483FA] text-white border-[#3483FA] shadow-xs' 
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  Mês Atual
                </button>
              </div>
            </div>

            {/* BARRA DE INTERVALO CUSTOMIZADO DE DATAS */}
            <div className="flex items-center gap-3 flex-wrap pt-1">
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 shadow-2xs">
                <span className="text-[10px] font-black text-gray-500 uppercase">De:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setQuickFilter('custom');
                  }}
                  className="text-xs font-bold text-gray-800 bg-transparent focus:outline-none cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 shadow-2xs">
                <span className="text-[10px] font-black text-gray-500 uppercase">Até:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setQuickFilter('custom');
                  }}
                  className="text-xs font-bold text-gray-800 bg-transparent focus:outline-none cursor-pointer"
                />
              </div>

              {availableDates.length > 0 && (
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 shadow-2xs">
                  <span className="text-[10px] font-black text-gray-500 uppercase">Data com Lista:</span>
                  <select
                    value={startDate === endDate ? startDate : ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setStartDate(val);
                      setEndDate(val);
                      setQuickFilter('custom');
                    }}
                    className="text-xs font-bold text-gray-800 bg-transparent focus:outline-none cursor-pointer max-w-[160px]"
                  >
                    <option value="">Todas com registro...</option>
                    {availableDates.map(dateIso => {
                      const brDisplay = dateIso.split('-').reverse().join('/');
                      return (
                        <option key={dateIso} value={dateIso}>
                          {brDisplay}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => applyPreset('todos')}
                  className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Limpar Filtros</span>
                </button>
              )}
            </div>
          </div>

          {/* PAINEL DE CARDS DE MÉTRICAS */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Activity className="w-6 h-6 text-blue-600" />
                <div>
                  <h2 className="text-lg font-bold text-gray-800">Resultado Operacional de Cálculo</h2>
                  <p className="text-xs text-gray-500">Métricas geradas em tempo real com base na data selecionada</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="bg-blue-50/80 border border-blue-100 p-4 rounded-xl">
                <div className="text-2xl font-black text-blue-700">{totalItensColetados}</div>
                <div className="text-xs text-blue-600 font-bold uppercase mt-1">Total Coletado</div>
              </div>
              <div className="bg-emerald-50/80 border border-emerald-100 p-4 rounded-xl">
                <div className="text-2xl font-black text-emerald-700">{totalValidadosGeral}</div>
                <div className="text-xs text-emerald-600 font-bold uppercase mt-1">Validados</div>
              </div>
              <div className={`p-4 rounded-xl border ${
                totalNaoValidadosGeral > 0 
                  ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-200' 
                  : 'bg-gray-50 border-gray-100'
              }`}>
                <div className="text-2xl font-black text-amber-800">{totalNaoValidadosGeral}</div>
                <div className="text-xs text-amber-700 font-bold uppercase mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 text-amber-600" />
                  Não Validados
                </div>
              </div>
              <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-xl">
                <div className="text-2xl font-black text-blue-800">{mediaAcertoGeral}%</div>
                <div className="text-xs text-blue-600 font-bold uppercase mt-1">Média de Acerto</div>
              </div>
              <div className="bg-purple-50/80 border border-purple-100 p-4 rounded-xl">
                <div className="text-2xl font-black text-purple-700">{listasFinalizadas.length} / {filteredListas.length}</div>
                <div className="text-xs text-purple-600 font-bold uppercase mt-1">Finalizadas</div>
              </div>
            </div>
          </div>

          {/* TABELA DE LISTAS DA DATA DE CÁLCULO */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Package className="w-6 h-6 text-[#3483FA]" />
                <div>
                  <h2 className="text-lg font-bold text-gray-800">Listas de Coleta do Período</h2>
                  <p className="text-xs text-gray-500">
                    {getFilterDescription()}
                  </p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-gray-700">
                <thead className="bg-gray-50 font-bold uppercase tracking-wider text-gray-600 border-b border-gray-200">
                  <tr>
                    <th className="py-3 px-4">Nome da Lista</th>
                    <th className="py-3 px-4 text-center">Data</th>
                    <th className="py-3 px-4 text-center">Tipo</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Itens</th>
                    <th className="py-3 px-4 text-center">Validação</th>
                    <th className="py-3 px-4 text-center">Acerto (%)</th>
                    <th className="py-3 px-4 text-center">Gaiola</th>
                    <th className="py-3 px-4 text-center">Faltaram</th>
                    <th className="py-3 px-4 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredListas.map(lista => {
                    const itensCount = lista.itens?.length || 0;
                    const validadosCount = (lista.itens || []).filter(i => i.validado).length;
                    const naoValidadosCount = (lista.itens || []).filter(i => !i.validado).length;

                    return (
                    <tr key={lista.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-gray-900">{lista.nome}</td>
                      <td className="py-3.5 px-4 text-center font-mono text-gray-600">
                        {lista.data ? lista.data.split('-').reverse().join('/') : '-'}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded font-bold text-[11px]">
                          {lista.tipo === 'grupos' ? 'Grupo' : 'Comum'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                          lista.status === 'finalizada' 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {lista.status === 'finalizada' ? 'Finalizada' : 'Em Andamento'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-gray-800">{itensCount}</td>
                      
                      {/* Status de Validação da Lista */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedListaForReport(lista);
                            setReportTab(naoValidadosCount > 0 ? 'nao_validados' : 'todos');
                            setReportSearch('');
                          }}
                          className="inline-flex flex-col items-center gap-1 cursor-pointer group"
                          title="Clique para abrir o relatório detalhado desta lista"
                        >
                          <div className="flex items-center gap-1.5 flex-wrap justify-center">
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-bold text-[10px]">
                              {validadosCount} validados
                            </span>
                            {naoValidadosCount > 0 && (
                              <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-300 rounded font-black text-[10px] flex items-center gap-1 shadow-2xs">
                                <AlertCircle className="w-3 h-3 text-amber-600" />
                                {naoValidadosCount} pendentes
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-[#3483FA] group-hover:underline font-bold">
                            Ver relatório
                          </span>
                        </button>
                      </td>

                      <td className="py-3.5 px-4 text-center font-bold text-emerald-600">
                        {lista.porcentagemAcerto !== undefined ? `${lista.porcentagemAcerto}%` : '-'}
                      </td>
                      <td className="py-3.5 px-4 text-center font-medium">
                        {lista.fechamentoGaiola || '-'}
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-red-600">
                        {lista.itensFaltaram !== undefined ? lista.itensFaltaram : '-'}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenMetricsModal(lista)}
                            className="px-3 py-1.5 font-bold rounded-xl text-xs inline-flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer border bg-[#3483FA] hover:bg-blue-600 text-white border-blue-600"
                            title="Editar métricas (Acerto %, Gaiola, Faltaram, Status, Data)"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-white" />
                            <span>Editar Métricas</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedListaForReport(lista);
                              setReportTab(naoValidadosCount > 0 ? 'nao_validados' : 'todos');
                              setReportSearch('');
                            }}
                            className={`px-3 py-1.5 font-bold rounded-xl text-xs inline-flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer border ${
                              naoValidadosCount > 0
                                ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
                                : 'bg-blue-50 hover:bg-blue-100 text-[#3483FA] border-blue-200'
                            }`}
                            title="Abrir Relatório para ver IDs não validados e detalhes"
                          >
                            <FileText className="w-3.5 h-3.5 text-amber-700" />
                            <span>Relatório {naoValidadosCount > 0 ? `(${naoValidadosCount})` : ''}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                  {filteredListas.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-gray-400 font-medium">
                        Nenhuma lista de coleta encontrada para o período selecionado. ({getFilterDescription()})
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: USUÁRIOS & SOLICITAÇÕES */}
      {adminTab === 'usuarios' && (
        <div className="space-y-6 animate-in fade-in">
          {/* PAINEL 1: SOLICITAÇÕES DE ACESSO PENDENTES */}
          <div className="bg-white rounded-2xl shadow-sm border border-amber-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                  <UserPlus className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    Solicitações de Acesso Pendentes
                    {pendingUsers.length > 0 && (
                      <span className="bg-amber-500 text-white text-xs px-2.5 py-0.5 rounded-full font-black">
                        {pendingUsers.length}
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-gray-500">Novos usuários aguardando aprovação para acessar o sistema</p>
                </div>
              </div>
            </div>

            {pendingUsers.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-xs font-medium flex flex-col items-center gap-2">
                <UserCheck className="w-8 h-8 text-gray-300" />
                <span>Nenhuma solicitação de cadastro pendente no momento. Todos os usuários estão aprovados.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingUsers.map(pUser => (
                  <div key={pUser.id} className="bg-amber-50/60 border border-amber-200 rounded-2xl p-4 flex flex-col justify-between gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-amber-200 text-amber-900 font-bold flex items-center justify-center text-sm uppercase">
                          {pUser.username.substring(0, 2)}
                        </div>
                        <div>
                          <p className="font-bold text-sm text-gray-900">{pUser.username}</p>
                          <p className="text-xs text-gray-600 font-mono">{pUser.email}</p>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-[10px] font-black uppercase">
                        Pendente
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-amber-200/60">
                      <button
                        onClick={() => toggleApproval(pUser.id, false)}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Aprovar Acesso
                      </button>

                      <button
                        onClick={async () => {
                          await toggleApproval(pUser.id, false);
                          await toggleAdmin(pUser.id, false);
                        }}
                        className="py-2 px-3 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                        title="Aprovar com nível Administrador"
                      >
                        <Shield className="w-4 h-4" />
                        Aprovar como Admin
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PAINEL 2: GERENCIAR USUÁRIOS CADASTRADOS */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="w-6 h-6 text-gray-700" />
                <div>
                  <h2 className="text-lg font-bold text-gray-800">Usuários Cadastrados & Permissões</h2>
                  <p className="text-xs text-gray-500">Controle o status de aprovação, perfil admin e acesso às abas do sistema</p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-600 font-bold uppercase text-xs border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3">Usuário / E-mail</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center">Admin</th>
                    <th className="px-4 py-3">Permissão de Abas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map(user => (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-4">
                        <div className="font-bold text-gray-800">{user.username}</div>
                        <div className="text-xs text-gray-500 font-mono">{user.email}</div>
                      </td>
                      
                      <td className="px-4 py-4 text-center">
                        <button 
                          onClick={() => toggleApproval(user.id, user.isApproved)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                            user.isApproved 
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
                            : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                          }`}
                        >
                          {user.isApproved ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> : <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />}
                          {user.isApproved ? 'Aprovado' : 'Aprovar'}
                        </button>
                      </td>
                      
                      <td className="px-4 py-4 text-center">
                        <button 
                          onClick={() => toggleAdmin(user.id, user.isAdmin)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                            user.isAdmin 
                            ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' 
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          <Shield className="w-3.5 h-3.5" />
                          {user.isAdmin ? 'Sim' : 'Não'}
                        </button>
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {TABS.map(tab => (
                            <button
                              key={tab.id}
                              onClick={() => toggleTabAccess(user.id, user.allowedGroups || [], tab.id)}
                              className={`px-2.5 py-1 border rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                                (user.allowedGroups || []).includes(tab.id)
                                ? 'bg-blue-50 border-blue-200 text-[#3483FA] hover:bg-blue-100'
                                : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'
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

      {/* MODAL DE METRICAS E FECHAMENTO DE GAIOLA */}
      {selectedListaForMetrics && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-lg overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-blue-50/50">
              <div className="flex items-center gap-2 text-[#3483FA]">
                <BarChart3 className="w-6 h-6" />
                <h3 className="text-lg font-black uppercase tracking-tight">Finalizar & Registrar Métricas</h3>
              </div>
              <button 
                onClick={() => setSelectedListaForMetrics(null)}
                className="p-2 hover:bg-blue-100 rounded-full text-blue-400 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-xs font-bold text-gray-400 uppercase">Lista Selecionada</p>
                <p className="text-base font-black text-gray-800">{selectedListaForMetrics.nome}</p>
                <p className="text-xs font-bold text-gray-600 mt-1">Total de Bips Coletados: <span className="text-[#3483FA]">{selectedListaForMetrics.itens?.length || 0} itens</span></p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase text-gray-600">Status da Lista</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as 'em_andamento' | 'finalizada')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#3483FA]"
                  >
                    <option value="em_andamento">Em Andamento</option>
                    <option value="finalizada">Finalizada</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black uppercase text-gray-600">Data da Lista</label>
                  <input
                    type="date"
                    value={formData}
                    onChange={(e) => setFormData(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#3483FA]"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black uppercase text-gray-600">Porcentagem de Acerto (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={formAcerto}
                  onChange={(e) => setFormAcerto(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#3483FA]"
                  placeholder="Ex: 99.5"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black uppercase text-gray-600">Fechamento de Gaiola</label>
                <select
                  value={formGaiola}
                  onChange={(e) => setFormGaiola(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#3483FA]"
                >
                  <option value="Fechado com Sucesso">Fechado com Sucesso</option>
                  <option value="Fechamento Parcial">Fechamento Parcial</option>
                  <option value="Aguardando Recontagem">Aguardando Recontagem</option>
                  <option value="Divergência Encontrada">Divergência Encontrada</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black uppercase text-gray-600">Quantos Faltaram (Itens Ausentes)</label>
                <input
                  type="number"
                  min="0"
                  value={formFaltaram}
                  onChange={(e) => setFormFaltaram(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#3483FA]"
                  placeholder="Ex: 0"
                />
              </div>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setSelectedListaForMetrics(null)}
                className="flex-1 py-3 bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 font-bold rounded-xl text-xs transition-all cursor-pointer"
              >
                CANCELAR
              </button>
              <button
                onClick={handleSaveMetrics}
                className="flex-1 py-3 bg-[#3483FA] hover:bg-blue-600 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle className="w-4 h-4" />
                SALVAR E FINALIZAR LISTA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE RELATÓRIO DA LISTA (VISUALIZAÇÃO DE NÃO VALIDADOS & DETALHES) */}
      {selectedListaForReport && (() => {
        const itensLista = selectedListaForReport.itens || [];
        const naoValidadosList = itensLista.filter(i => !i.validado);
        const validadosList = itensLista.filter(i => !!i.validado);

        // Filtrar por aba
        let listToDisplay = reportTab === 'nao_validados' 
          ? naoValidadosList 
          : reportTab === 'validados' 
          ? validadosList 
          : itensLista;

        // Filtrar por busca
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
              {/* Header do Relatório */}
              <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-amber-50/70 via-blue-50/40 to-white">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl border border-amber-200 shadow-2xs">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">
                        Relatório: {selectedListaForReport.nome}
                      </h3>
                      <span className={`px-2 py-0.5 rounded font-black text-[10px] uppercase border ${
                        selectedListaForReport.status === 'finalizada'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-blue-50 text-[#3483FA] border-blue-200'
                      }`}>
                        {selectedListaForReport.status === 'finalizada' ? 'Finalizada' : 'Em Andamento'}
                      </span>
                      <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded font-black text-[10px] uppercase">
                        {selectedListaForReport.tipo === 'grupos' ? 'Lista de Grupos' : 'Lista Comum'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-3 font-medium">
                      <span>Data: <strong className="text-gray-700">{selectedListaForReport.data}</strong></span>
                      <span>•</span>
                      <span>Saída: <strong className="text-gray-700">{selectedListaForReport.saida}</strong></span>
                      <span>•</span>
                      <span>Responsável: <strong className="text-gray-700">{selectedListaForReport.responsavel || 'Operador'}</strong></span>
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedListaForReport(null)}
                  className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                  title="Fechar Relatório"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Cards de Métricas */}
              <div className="p-4 sm:p-5 border-b border-gray-100 bg-gray-50/50">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                  <div className="bg-white border border-gray-200 p-3.5 rounded-xl shadow-2xs">
                    <span className="text-[11px] font-black text-gray-400 uppercase tracking-wider block">Total Bipado</span>
                    <span className="text-2xl font-black text-gray-800">{itensLista.length}</span>
                    <span className="text-xs text-gray-500 font-medium block mt-0.5">IDs na lista</span>
                  </div>

                  <div className="bg-white border border-emerald-200 p-3.5 rounded-xl shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black text-emerald-600 uppercase tracking-wider block">IDs Validados</span>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    </div>
                    <span className="text-2xl font-black text-emerald-700">{validadosList.length}</span>
                    <span className="text-xs text-emerald-600 font-medium block mt-0.5">
                      {itensLista.length > 0 ? `${((validadosList.length / itensLista.length) * 100).toFixed(0)}% validado` : '0%'}
                    </span>
                  </div>

                  <div className={`p-3.5 rounded-xl shadow-2xs border ${
                    naoValidadosList.length > 0 
                      ? 'bg-amber-50/90 border-amber-300 ring-2 ring-amber-200' 
                      : 'bg-white border-gray-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black text-amber-800 uppercase tracking-wider block">IDs Não Validados</span>
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                    </div>
                    <span className="text-2xl font-black text-amber-900">{naoValidadosList.length}</span>
                    <span className="text-xs text-amber-700 font-bold block mt-0.5">
                      {naoValidadosList.length > 0 ? 'Requerem validação na base' : 'Todos validados'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Barra de Abas & Ações */}
              <div className="p-3.5 bg-white border-b border-gray-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                {/* Abas */}
                <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setReportTab('nao_validados')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                      reportTab === 'nao_validados'
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
                    }`}
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Não Validados</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      reportTab === 'nao_validados' ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-900'
                    }`}>
                      {naoValidadosList.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReportTab('todos')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                      reportTab === 'todos'
                        ? 'bg-white text-gray-900 shadow-xs'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
                    }`}
                  >
                    <span>Todos os IDs</span>
                    <span className="px-1.5 py-0.2 bg-gray-200 text-gray-700 rounded-full text-[10px] font-mono">
                      {itensLista.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReportTab('validados')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                      reportTab === 'validados'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Validados</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      reportTab === 'validados' ? 'bg-emerald-700 text-white' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {validadosList.length}
                    </span>
                  </button>
                </div>

                {/* Busca e Botões */}
                <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
                  <div className="relative flex-1 md:w-44">
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Buscar no relatório..."
                      value={reportSearch}
                      onChange={(e) => setReportSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium focus:outline-none focus:border-[#3483FA] focus:bg-white transition-all"
                    />
                  </div>

                  {/* Copiar IDs Não Validados com Feedback Verde/Azul */}
                  <button
                    type="button"
                    onClick={handleCopyNaoValidados}
                    disabled={naoValidadosList.length === 0}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-40 active:scale-95 ${
                      copiedReportNaoValidados
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md ring-2 ring-emerald-300'
                        : 'bg-[#3483FA] hover:bg-blue-600 text-white'
                    }`}
                    title="Copiar lista de códigos dos IDs não validados"
                  >
                    {copiedReportNaoValidados ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                        <span>Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-white" />
                        <span>Copiar Não Validados ({naoValidadosList.length})</span>
                      </>
                    )}
                  </button>

                  {/* Baixar CSV com apenas IDs */}
                  <button
                    type="button"
                    onClick={handleExportNaoValidadosCSV}
                    disabled={naoValidadosList.length === 0}
                    className="px-3 py-1.5 bg-white hover:bg-amber-50 text-amber-900 border border-amber-300 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-40"
                    title="Baixar CSV somente com os IDs não validados"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-700" />
                    <span>Baixar CSV</span>
                  </button>

                  {/* Validar Todos os Pendentes */}
                  {naoValidadosList.length > 0 && (
                    <button
                      type="button"
                      onClick={handleValidarTodosPendentes}
                      className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer"
                      title="Marcar todos os itens pendentes como validados nesta lista"
                    >
                      <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Validar Todos</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Tabela de Itens */}
              <div className="flex-1 overflow-y-auto p-4 max-h-[50vh]">
                {listToDisplay.length > 0 ? (
                  <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-xs text-left text-gray-700 border-collapse">
                      <thead className="bg-gray-100 text-gray-700 font-black uppercase tracking-wider sticky top-0 z-10 border-b border-gray-200">
                        <tr>
                          <th className="py-2.5 px-3 text-center w-12 bg-gray-100 border-r border-gray-200">#</th>
                          <th className="py-2.5 px-3 text-left bg-gray-100 border-r border-gray-200">ID / Código</th>
                          {selectedListaForReport.tipo === 'grupos' && (
                            <th className="py-2.5 px-3 text-center w-28 bg-purple-50 text-purple-900 border-r border-gray-200">Grupo</th>
                          )}
                          <th className="py-2.5 px-3 text-center w-28 bg-gray-100 border-r border-gray-200">Status Validação</th>
                          <th className="py-2.5 px-3 text-center w-32 bg-gray-100 border-r border-gray-200">Bipado por</th>
                          <th className="py-2.5 px-3 text-center w-20 bg-gray-100 border-r border-gray-200">Rota</th>
                          <th className="py-2.5 px-3 text-center w-20 bg-gray-100 border-r border-gray-200">Saída</th>
                          <th className="py-2.5 px-3 text-center w-40 bg-gray-100 border-r border-gray-200">Motivo</th>
                          <th className="py-2.5 px-3 text-center w-36 bg-gray-100 border-r border-gray-200">Data / Hora</th>
                          <th className="py-2.5 px-3 text-center w-16 bg-gray-100">Copiar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 font-sans">
                        {listToDisplay.map((item, idx) => {
                          const grupo = selectedListaForReport.grupos?.find(g => g.id === item.grupoId);
                          return (
                            <tr 
                              key={item.id}
                              className={`transition-colors hover:bg-gray-50 ${
                                !item.validado ? 'bg-amber-50/40' : 'bg-white'
                              }`}
                            >
                              <td className="py-2 px-3 text-center text-gray-400 font-bold border-r border-gray-200 w-12">
                                {idx + 1}
                              </td>
                              <td className="py-2 px-3 font-mono font-bold text-gray-900 border-r border-gray-200">
                                <div className="flex items-center gap-1.5">
                                  <Barcode className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                  <span>{item.codigo}</span>
                                </div>
                              </td>

                              {selectedListaForReport.tipo === 'grupos' && (
                                <td className="py-2 px-3 text-center border-r border-gray-200 w-28">
                                  {grupo ? (
                                    <span className="bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 rounded font-black text-[10px] uppercase truncate block max-w-[100px] mx-auto">
                                      {grupo.nome}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400 text-[10px] italic">Sem Grupo</span>
                                  )}
                                </td>
                              )}

                              <td className="py-2 px-3 text-center border-r border-gray-200 w-28">
                                <button
                                  type="button"
                                  onClick={() => handleToggleValidadoInAdmin(item.id)}
                                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase transition-all cursor-pointer border shadow-2xs ${
                                    item.validado
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                      : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                                  }`}
                                  title="Clique para alternar o status de validação"
                                >
                                  {item.validado ? (
                                    <>
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                      <span>Validado</span>
                                    </>
                                  ) : (
                                    <>
                                      <AlertCircle className="w-3 h-3 text-amber-600" />
                                      <span>Não Validado</span>
                                    </>
                                  )}
                                </button>
                              </td>

                              <td className="py-2 px-3 text-center border-r border-gray-200 w-32">
                                <span className="inline-flex items-center justify-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-[11px] font-bold truncate max-w-[120px]">
                                  <UserIcon className="w-2.5 h-2.5 opacity-60" />
                                  <span className="truncate">{item.responsavel || selectedListaForReport.responsavel || 'Operador'}</span>
                                </span>
                              </td>

                              <td className="py-2 px-3 text-center font-bold text-gray-800 border-r border-gray-200 w-20">
                                {item.rota && item.rota.trim() !== '' ? item.rota : '-'}
                              </td>

                              <td className="py-2 px-3 text-center border-r border-gray-200 w-20">
                                <span className="bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded font-black text-[10px]">
                                  {item.saida?.includes('PM') ? 'PM' : item.saida?.includes('AM') ? 'AM' : 'Ciclo'}
                                </span>
                              </td>

                              <td className="py-2 px-3 text-center border-r border-gray-200 w-40">
                                <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-800 border border-gray-200 font-bold text-[10px] uppercase truncate block max-w-[150px] mx-auto">
                                  {item.motivo || 'Sem Motivo'}
                                </span>
                              </td>

                              <td className="py-2 px-3 text-center text-gray-500 text-[11px] border-r border-gray-200 w-36">
                                {item.scannedAt}
                              </td>

                              <td className="py-2 px-3 text-center w-16">
                                <button
                                  type="button"
                                  onClick={() => handleCopySingleCode(item.codigo)}
                                  className="p-1 hover:bg-gray-200 text-gray-500 hover:text-black rounded transition-colors cursor-pointer inline-flex items-center justify-center"
                                  title="Copiar ID"
                                >
                                  {copiedItemId === item.codigo ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-12 text-center text-gray-400 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                    {reportTab === 'nao_validados' ? (
                      <div className="space-y-2">
                        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                        <p className="font-bold text-gray-700 text-sm">Nenhum ID não validado encontrado!</p>
                        <p className="text-xs text-gray-500">Todos os IDs desta lista já foram validados com sucesso.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Package className="w-10 h-10 text-gray-300 mx-auto" />
                        <p className="font-bold text-gray-600 text-sm">Nenhum item corresponde aos filtros aplicados.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer do Modal */}
              <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-500 font-bold">
                  Exibindo {listToDisplay.length} de {itensLista.length} itens registrados
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedListaForReport(null)}
                  className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Fechar Relatório
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
