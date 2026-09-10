const fs = require('fs');
const file = 'src/App.tsx';
let code = fs.readFileSync(file, 'utf8');

// Fix import
code = code.replace("import { Login } from './components/ListasColeta';", "import { Login } from './components/Login';\nimport { Navigate } from 'react-router-dom';");

// Rewrite Routes block
const routesStart = code.indexOf('<Routes>');
const routesEnd = code.indexOf('</Routes>') + '</Routes>'.length;

const newRoutes = `<Routes>
            {/* Public Routes */}
            <Route path="/refugo" element={<ControleRefugo />} />
            
            <Route path="/login" element={
              isAuthenticated ? <Navigate to="/" replace /> : <Login onLogin={() => { setIsAuthenticated(true); localStorage.setItem('auth', 'true'); navigate('/'); }} />
            } />
            
            {/* Protected Routes */}
            {isAuthenticated ? (
              <>
                <Route path="/" element={
                  <ToolsHub
                    totalRows={rows.length}
                    groups={groups}
                    onClear={handleClear}
                  />
                } />
                
                <Route path="/consulta" element={
                  <>
                    <StatsSummary totalRows={rows.length} groups={groups} />
                    <IdLookup
                      rows={rows}
                      onNavigateToUpload={() => navigate('/upload')}
                    />
                  </>
                } />

                <Route path="/remover" element={
                  <IdRemover
                    rows={rows}
                    headers={headers}
                  />
                } />

                <Route path="/reporte" element={
                  <WhatsappReport
                    rows={rows}
                  />
                } />

                <Route path="/listas" element={
                  <ListasColeta />
                } />

                <Route path="/upload" element={
                  <CsvUploader
                    onLoadText={(text) => {
                      handleParseAndSave(text);
                      navigate('/');
                    }}
                    currentTotalRows={rows.length}
                  />
                } />
                
                {/* Fallback for authenticated users */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </>
            ) : (
              {/* Redirect unauthenticated users to login */}
              <Route path="*" element={<Navigate to="/login" replace />} />
            )}
          </Routes>`;

if (routesStart !== -1 && routesEnd !== -1) {
  code = code.substring(0, routesStart) + newRoutes + code.substring(routesEnd);
}

// But wait, if they are on /login, we shouldn't show the Global Header or the gray background wrapper with padding.
// The screenshot shows the login screen filling the whole screen.
// We can handle this by returning `<Login />` early if `location.pathname === '/login'`.
