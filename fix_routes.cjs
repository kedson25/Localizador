const fs = require('fs');
const file = 'src/App.tsx';
let code = fs.readFileSync(file, 'utf8');

const routesStart = code.indexOf('<Routes>');
const routesEnd = code.indexOf('</Routes>') + '</Routes>'.length;

const newRoutes = `<Routes>
            {/* Public Routes */}
            <Route path="/refugo" element={<ControleRefugo />} />
            
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

if (routesStart !== -1 && routesEnd !== -1) {
  code = code.substring(0, routesStart) + newRoutes + code.substring(routesEnd);
}

fs.writeFileSync(file, code);
