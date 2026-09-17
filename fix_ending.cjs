const fs = require('fs');
let code = fs.readFileSync('src/components/ControleRefugo.tsx', 'utf8');

const missingEnding = `
                </div>
              )}
            </div>
            
            {scannedItems.length > 50 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <ResultPagination total={scannedItems.length} page={currentPage} onPageChange={setPage} />
              </div>
            )}
            
          </div>
        </div>
      </div>
    </div>
  );
}
`;

code = code + missingEnding.trim();

fs.writeFileSync('src/components/ControleRefugo.tsx', code);
