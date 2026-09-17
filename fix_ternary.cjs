const fs = require('fs');
let code = fs.readFileSync('src/components/ControleRefugo.tsx', 'utf8');

const bad = `
            {scannedItems.length > 50 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <ResultPagination total={scannedItems.length} page={currentPage} onPageChange={setPage} />
              </div>
            )}
            
          </div>
        </div>
      </div>

      {showExportModal && (
`;

const good = `
            {scannedItems.length > 50 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <ResultPagination total={scannedItems.length} page={currentPage} onPageChange={setPage} />
              </div>
            )}
            
          </div>
        </div>
      )}

      {showExportModal && (
`;

code = code.replace(bad.trim(), good.trim());
fs.writeFileSync('src/components/ControleRefugo.tsx', code);
