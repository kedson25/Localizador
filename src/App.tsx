import React, { useState, useEffect } from 'react';
import { ActiveTab, CsvRow, GroupSummary } from './types';
import { parseCsvText } from './utils/csvParser';
import { Header } from './components/Header';
import { IdLookup } from './components/IdLookup';
import { IdRemover } from './components/IdRemover';
import { CsvUploader } from './components/CsvUploader';
import { StatsSummary } from './components/StatsSummary';
import { saveToColetor, loadFromColetor, clearColetor } from './lib/firebase';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('upload');
  const [rawText, setRawText] = useState<string>('');
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [notification, setNotification] = useState<string | null>(null);
  const [loadingFirebase, setLoadingFirebase] = useState<boolean>(true);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  // On mount, load stored CSV from Firebase Firestore 'coletor' collection
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
          setActiveTab('lookup');
          showNotification(`Dados carregados da coleção 'coletor' no Firebase! (${parsed.rows.length} IDs)`);
        }
      } catch (err) {
        console.error('Erro ao carregar do Firebase:', err);
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

    // Save to Firebase 'coletor' collection
    const saved = await saveToColetor(textToParse, parsed.rows.length, fileName);
    if (saved) {
      showNotification(`Dados processados e salvos com sucesso na coleção 'coletor' no Firebase! (${parsed.rows.length} IDs)`);
    } else {
      showNotification('Processado localmente (atenção: falha ao salvar no Firebase).');
    }
  };

  const handleClear = async () => {
    setRawText('');
    setRows([]);
    setGroups([]);
    setHeaders([]);
    setActiveTab('upload');

    // Clear from Firebase 'coletor' collection
    await clearColetor();
    showNotification('Dados zerados e removidos da coleção \'coletor\' no Firebase com sucesso!');
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] text-[#1F2937] flex flex-col font-sans selection:bg-blue-500 selection:text-white">
      {/* Top Fixed High Density Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onClear={handleClear}
        totalRows={rows.length}
        totalGroups={groups.length}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-4">
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

        {loadingFirebase && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-2 rounded text-xs font-mono flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
            Verificando dados na coleção 'coletor' no Firebase...
          </div>
        )}

        {/* Stats Summary Bar */}
        <StatsSummary totalRows={rows.length} groups={groups} />

        {/* Tab Views */}
        {activeTab === 'lookup' && (
          <IdLookup
            rows={rows}
            onNavigateToUpload={() => setActiveTab('upload')}
          />
        )}

        {activeTab === 'remove' && (
          <IdRemover
            rows={rows}
            headers={headers}
          />
        )}

        {activeTab === 'upload' && (
          <CsvUploader
            onLoadText={(text) => {
              handleParseAndSave(text);
              setActiveTab('lookup');
            }}
            currentTotalRows={rows.length}
          />
        )}
      </main>
    </div>
  );
}
