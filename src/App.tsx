import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
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
import { AdminPanel } from './components/AdminPanel';
import { User } from './lib/auth';
import { saveToColetor, loadFromColetor, clearColetor } from './lib/firebase';

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();

  const [rawText, setRawText] = useState<string>('');
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [notification, setNotification] = useState<string | null>(null);
  const [loadingFirebase, setLoadingFirebase] = useState<boolean>(true);
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      return JSON.parse(localStorage.getItem('currentUser') || 'null');
    } catch {
      return null;
    }
  });

  const isAuthenticated = !!currentUser;

  useEffect(() => {
    if (currentUser) {
      const tabName = location.pathname.startsWith('/refugo') ? 'Refugo' :
                      location.pathname.startsWith('/listas') ? 'Coleta (Listas)' :
                      location.pathname.startsWith('/consulta') ? 'Consulta' :
                      location.pathname.startsWith('/remover') ? 'Remover' :
                      location.pathname.startsWith('/reporte') ? 'Reporte' :
                      location.pathname.startsWith('/admin') ? 'Admin' : 'Hub / Início';
      
      try {
        const activePresences = JSON.parse(localStorage.getItem('app_active_presences') || '{}');
        activePresences[currentUser.id || currentUser.username] = {
          username: currentUser.username,
          tab: tabName,
          lastActive: Date.now()
        };
        localStorage.setItem('app_active_presences', JSON.stringify(activePresences));
      } catch {}
    }
  }, [location.pathname, currentUser]);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  useEffect(() => {
    async function initFromFirebase() {
      setLoadingFirebase(true);
      try {
        const savedData = await loadFromColetor();
        if (savedData && savedData.rawText) {
          setRawText(savedData.rawText);
          const parsed = parseCsvText(savedData.rawText);
          setRows(parsed.rows);
          setGroups(parsed.groups);
          setHeaders(parsed.headers);
        }
      } catch (err) {
        console.error('Erro ao carregar dados:', err);
      } finally {
        setLoadingFirebase(false);
      }
    }
    initFromFirebase();
  }, []);

  const handleParseAndSave = async (textToParse: string, fileName?: string) => {
    setRawText(textToParse);
    const parsed = parseCsvText(textToParse);
    setRows(parsed.rows);
    setGroups(parsed.groups);
    setHeaders(parsed.headers);

    const saved = await saveToColetor(textToParse, parsed.rows.length, fileName);
    if (saved) {
      showNotification(`Dados salvos: ${parsed.rows.length} IDs`);
    } else {
      showNotification('Processado localmente');
    }
  };

  const handleClear = async () => {
    setRawText('');
    setRows([]);
    setGroups([]);
    setHeaders([]);
    navigate('/');
    await clearColetor();
    showNotification('Dados zerados');
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
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col font-sans">
      <main className={`flex-1 w-full mx-auto ${location.pathname === "/login" ? "" : location.pathname === "/listas" ? "px-4 sm:px-6 py-5 space-y-4" : "max-w-7xl px-4 sm:px-6 lg:px-8 py-5 space-y-4"}`}>
        
        {notification && (
          <div className="bg-slate-900 text-white px-4 py-2 rounded text-xs font-mono flex items-center justify-between border border-slate-700">
            <span>{notification}</span>
            <button onClick={() => setNotification(null)} className="ml-4 font-bold text-slate-400 hover:text-white">
              ✕
            </button>
          </div>
        )}

        {loadingFirebase && location.pathname !== '/refugo' ? (
          <div className="py-12 text-center text-slate-500 text-xs font-medium">
            Carregando sistema...
          </div>
        ) : (
          <>
            {isAuthenticated && location.pathname !== '/' && location.pathname !== '/login' && !location.pathname.startsWith('/listas/') && (
              <div className="flex items-center gap-3 mb-2">
                <button
                  onClick={() => navigate('/')}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-[#3483FA]" />
                  <span>Voltar</span>
                </button>
                {getPageTitle() && (
                  <>
                    <div className="h-4 w-px bg-slate-300"></div>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {getPageTitle()}
                    </span>
                  </>
                )}
              </div>
            )}

            <Routes>
              <Route path="/refugo" element={<ControleRefugo currentUser={currentUser} />} />
              <Route path="/login" element={
                isAuthenticated ? <Navigate to="/" replace /> : <Login onLogin={(user) => { setCurrentUser(user); localStorage.setItem('currentUser', JSON.stringify(user)); navigate('/'); }} />
              } />
              
              {isAuthenticated && (
                <>
                  <Route path="/" element={<ToolsHub totalRows={rows.length} groups={groups} onClear={handleClear} currentUser={currentUser} />} />
                  
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
              
              <Route path="*" element={isAuthenticated ? <Navigate to="/" replace /> : <Navigate to="/login" replace />} />
            </Routes>
          </>
        )}
      </main>
    </div>
  );
}
