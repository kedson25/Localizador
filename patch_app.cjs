const fs = require('fs');
const file = 'src/App.tsx';
let code = fs.readFileSync(file, 'utf8');

// Imports
const importsToAdd = `import { AdminPanel } from './components/AdminPanel';
import { User } from './lib/auth';
`;

code = code.replace("import { Navigate } from 'react-router-dom';", "import { Navigate } from 'react-router-dom';\n" + importsToAdd);

// Replace isAuthenticated with currentUser
code = code.replace(
  "const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => localStorage.getItem('auth') === 'true');",
  `const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try { return JSON.parse(localStorage.getItem('currentUser') || 'null'); } catch { return null; }
  });
  const isAuthenticated = !!currentUser;`
);

// getPageTitle update
code = code.replace("case '/refugo': return 'Controle Refugo';", "case '/refugo': return 'Controle Refugo';\n      case '/admin': return 'Painel Admin';");

// Routes
const oldRoutes = `<Routes>
            {/* Public Routes */}
            <Route path="/refugo" element={<ControleRefugo />} />
            <Route path="/login" element={
              isAuthenticated ? <Navigate to="/" replace /> : <Login onLogin={() => { setIsAuthenticated(true); localStorage.setItem('auth', 'true'); navigate('/'); }} />
            } />
            
            {/* Protected Routes */}
            {isAuthenticated && <Route path="/" element={<ToolsHub totalRows={rows.length} groups={groups} onClear={handleClear} />} />}
            {isAuthenticated && <Route path="/consulta" element={<><StatsSummary totalRows={rows.length} groups={groups} /><IdLookup rows={rows} onNavigateToUpload={() => navigate('/upload')} /></>} />}
            {isAuthenticated && <Route path="/remover" element={<IdRemover rows={rows} headers={headers} />} />}
            {isAuthenticated && <Route path="/reporte" element={<WhatsappReport rows={rows} />} />}
            {isAuthenticated && <Route path="/listas" element={<ListasColeta />} />}
            {isAuthenticated && <Route path="/upload" element={<CsvUploader onLoadText={(text) => { handleParseAndSave(text); navigate('/'); }} currentTotalRows={rows.length} />} />}
            
            {/* Fallback */}
            <Route path="*" element={isAuthenticated ? <Navigate to="/" replace /> : <Navigate to="/login" replace />} />
          </Routes>`;

const newRoutes = `<Routes>
            {/* Public Routes */}
            <Route path="/refugo" element={<ControleRefugo />} />
            <Route path="/login" element={
              isAuthenticated ? <Navigate to="/" replace /> : <Login onLogin={(user) => { setCurrentUser(user); localStorage.setItem('currentUser', JSON.stringify(user)); navigate('/'); }} />
            } />
            
            {/* Protected Routes */}
            {isAuthenticated && (
              <>
                <Route path="/" element={<ToolsHub totalRows={rows.length} groups={groups} onClear={handleClear} currentUser={currentUser} />} />
                
                {currentUser?.isAdmin && (
                  <Route path="/admin" element={<AdminPanel />} />
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
                  <Route path="/listas" element={<ListasColeta />} />
                )}

                {(currentUser?.isAdmin || currentUser?.allowedGroups?.includes('upload')) && (
                  <Route path="/upload" element={<CsvUploader onLoadText={(text) => { handleParseAndSave(text); navigate('/'); }} currentTotalRows={rows.length} />} />
                )}
              </>
            )}
            
            {/* Fallback */}
            <Route path="*" element={isAuthenticated ? <Navigate to="/" replace /> : <Navigate to="/login" replace />} />
          </Routes>`;

if (code.includes('<Routes>')) {
  // Safer replace
  const routesStart = code.indexOf('<Routes>');
  const routesEnd = code.indexOf('</Routes>') + '</Routes>'.length;
  code = code.substring(0, routesStart) + newRoutes + code.substring(routesEnd);
}

fs.writeFileSync(file, code);
console.log('App patched');
