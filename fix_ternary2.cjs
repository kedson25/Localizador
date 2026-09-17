const fs = require('fs');
let code = fs.readFileSync('src/components/ControleRefugo.tsx', 'utf8');

const bad = `
          </div>
        </div>
      )}

      {showExportModal && (
`;

const good = `
          </div>
        </div>
      </div>
      )}

      {showExportModal && (
`;

code = code.replace(bad, good);
fs.writeFileSync('src/components/ControleRefugo.tsx', code);
