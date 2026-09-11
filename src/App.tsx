import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { CsvRow, GroupSummary } from './types';
import { parseCsvText } from './utils/csvParser';
import { ToolsHub } from './components/ToolsHub';
import { IdLookup } from './components/IdLookup';
import { IdRemover } from './components/IdRemover';
import { WhatsappReport } from './components/WhatsappReport';
import { CsvUploader } from './components/CsvUploader';
import { StatsSummary } from './components/StatsSummary';
import { ControleRefugo } from './components/ControleRefugo';
import { ListasColeta } from './components/ListasColeta';
import { Login } from './components/Login';
import { Navigate } from 'react-router-dom';
import { AdminPanel } from './components/AdminPanel';
import { getUserById, normalizeUser, User } from './lib/auth';
import { saveToColetor, listenToColetor, clearColetor, startListasSync } from './lib/firebase';

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === '/';

  const [rawText, setRawText] = useState<string>('');
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [notification, setNotification] = useState<string | null>(null);
  const [loadingFirebase, setLoadingFirebase] = useState<boolean>(true);
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const stored = sessionStorage.getItem('localizador_session_user');
      return stored ? normalizeUser(JSON.parse(stored) as User) : null;
    } catch {
      return null;
    }
  });
  const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAuthenticated = !!currentUser;
  const hasOperationalSession = isAuthenticated || location.pathname === '/refugo';

  useEffect(() => {
    if (!hasOperationalSession) return;
    const stopLists = startListasSync();
    return () => { stopLists(); };
  }, [hasOperationalSession]);

  useEffect(() => {
    if (!currentUser?.id) return;
    let active = true;
    void getUserById(currentUser.id).then(user => {
      if (!active) return;
      if (!user || !user.isApproved) {
        sessionStorage.removeItem('localizador_session_user');
        setCurrentUser(null);
        if (location.pathname !== '/login') navigate('/login', { replace: true });
        return;
      }
      const safeUser = normalizeUser(user);
      sessionStorage.setItem('localizador_session_user', JSON.stringify({ ...safeUser, password: undefined }));
      setCurrentUser(safeUser);
    });
    return () => { active = false; };
  }, [currentUser?.id]);


  const showNotification = (message: string) => {
    if (notificationTimer.current) clearTimeout(notificationTimer.current);
    setNotification(message);
    notificationTimer.current = setTimeout(() => { setNotification(null); notificationTimer.current = null; }, 4000);
  };
  useEffect(() => () => { if (notificationTimer.current) clearTimeout(notificationTimer.current); }, []);

  useEffect(() => {
    if (!isAuthenticated) { setLoadingFirebase(false); return; }
    setLoadingFirebase(true);
    let lastRawText: string | undefined;
    const loadingTimer = setTimeout(() => setLoadingFirebase(false), 10000);
    const unsubscribe = listenToColetor(data => {
      const text = data?.rawText || '';
      if (text !== lastRawText) {
        lastRawText = text;
        setRawText(text);
        const parsed = text ? parseCsvText(text) : { rows: [], groups: [], headers: [] };
        setRows(parsed.rows); setGroups(parsed.groups); setHeaders(parsed.headers);
      }
      setLoadingFirebase(false);
      clearTimeout(loadingTimer);
    }, () => { setLoadingFirebase(false); showNotification('Não foi possível sincronizar a base. Verifique a conexão.'); });
    return () => { unsubscribe(); clearTimeout(loadingTimer); };
  }, [isAuthenticated]);

  const handleParseAndSave = async (textToParse: string, fileName?: string) => {
    setRawText(textToParse);
    const parsed = parseCsvText(textToParse);
    setRows(parsed.rows);
    setGroups(parsed.groups);
    setHeaders(parsed.headers);

    try {
      const saved = await saveToColetor(textToParse, parsed.rows.length, fileName);
      if (saved) showNotification(`Dados processados e enviados para sincronização. (${parsed.rows.length} IDs)`);
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Falha ao salvar os dados.');
    }
  };

  const handleClear = async () => {
    try {
      await clearColetor();
      setRawText(''); setRows([]); setGroups([]); setHeaders([]);
      navigate('/');
      showNotification('Limpeza enviada para sincronização.');
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Falha ao limpar os dados.');
    }
  };

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/consulta': return 'Buscar grupos';
      case '/remover': return 'Remover IDs';
      case '/reporte': return 'Reporte WhatsApp';
      case '/upload': return 'Importar CSV';
      case '/listas': return 'Listas de Coleta';
      case '/refugo': return 'Controle Refugo';
      case '/admin': return 'Painel Admin';
      default: return '';
    }
  };

  return (
    <div className="min-h-screen bg-[#EBEBEB] text-[#333333] flex flex-col font-sans selection:bg-[#3483FA] selection:text-white">
      {/* Main Content Area */}
      <main className={`flex-1 w-full mx-auto ${location.pathname === "/login" ? "" : location.pathname === "/listas" ? "px-4 sm:px-6 py-6 space-y-4" : "max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-4"}`}>
        {/* Floating Notification */}
        {notification && (
          <div className="bg-[#111827] text-white px-4 py-2.5 rounded shadow-md text-xs font-mono flex items-center justify-between border border-gray-700 animate-in fade-in">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
              {notification}
            </span>
            <button
              onClick={() => setNotification(null)}
              className="ml-4 hover:text-gray-300 font-bold px-1"
            >
              ✕
            </button>
          </div>
        )}

        {loadingFirebase && ['/consulta', '/remover', '/reporte'].includes(location.pathname) ? (
          <div className="space-y-4 max-w-4xl mx-auto mt-4 animate-in fade-in duration-300">
            <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-2"></div>
            <div className="h-4 w-64 bg-gray-100 rounded animate-pulse mb-8"></div>
            
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-gray-100 rounded-lg animate-pulse"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/4 bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-3 w-2/3 bg-gray-100 rounded animate-pulse"></div>
                </div>
              </div>
              <div className="mt-6 space-y-4 border-t border-gray-50 pt-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="w-8 h-8 bg-gray-100 rounded-md animate-pulse"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-1/3 bg-gray-200 rounded animate-pulse"></div>
                      <div className="h-2 w-1/2 bg-gray-100 rounded animate-pulse"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {isAuthenticated && location.pathname !== '/' && location.pathname !== '/login' && !location.pathname.startsWith('/listas/') && (
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => navigate('/')}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 text-[#3483FA]" />
                  Voltar para o Hub
                </button>
                {getPageTitle() && (
                  <>
                    <div className="h-4 w-px bg-gray-300 mx-1"></div>
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                      {getPageTitle()}
                    </span>
                  </>
                )}
              </div>
            )}
            <Routes>
            {/* Public Routes */}
            <Route path="/refugo" element={<ControleRefugo currentUser={currentUser} />} />
            <Route path="/login" element={
              isAuthenticated ? <Navigate to="/" replace /> : <Login onLogin={(user) => {
                const safeUser = normalizeUser(user);
                sessionStorage.setItem('localizador_session_user', JSON.stringify({ ...safeUser, password: undefined }));
                setCurrentUser(safeUser);
                navigate('/');
              }} />
            } />
            
            {/* Protected Routes */}
            {isAuthenticated && (
              <>
                <Route path="/" element={<ToolsHub totalRows={rows.length} groups={groups} onClear={handleClear} currentUser={currentUser} onLogout={() => {
                  sessionStorage.removeItem('localizador_session_user');
                  setCurrentUser(null);
                  navigate('/login');
                }} />} />
                
                {currentUser?.isAdmin && (
                  <Route path="/admin" element={<AdminPanel currentUser={currentUser} />} />
                )}

                {(currentUser?.isAdmin || currentUser?.allowedGroups?.includes('consulta')) && (
                  <Route path="/consulta" element={<><StatsSummary totalRows={rows.length} groups={groups} /><IdLookup rows={rows} onNavigateToUpload={() => navigate('/upload')} /></>} />
                )}

                {(currentUser?.isAdmin || currentUser?.allowedGroups?.includes('remover')) && (
                  <Route path="/remover" element={<IdRemover rows={rows} headers={headers} />} />
                )}

                {(currentUser?.isAdmin || currentUser?.allowedGroups?.includes('reporte')) && (
                  <Route path="/reporte" element={<WhatsappReport rows={rows} />} />
                )}

                {(currentUser?.isAdmin || currentUser?.allowedGroups?.includes('listas')) && (
                  <>
                    <Route path="/listas" element={<ListasColeta currentUser={currentUser} />} />
                    <Route path="/listas/:id" element={<ListasColeta currentUser={currentUser} />} />
                  </>
                )}

                {(currentUser?.isAdmin || currentUser?.allowedGroups?.includes('upload')) && (
                  <Route path="/upload" element={<CsvUploader onLoadText={(text) => { handleParseAndSave(text); navigate('/'); }} currentTotalRows={rows.length} />} />
                )}
              </>
            )}
            
            {/* Fallback */}
            <Route path="*" element={isAuthenticated ? <Navigate to="/" replace /> : <Navigate to="/login" replace />} />
          </Routes>
          </>
        )}

      </main>
    </div>
  );
}
