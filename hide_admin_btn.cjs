const fs = require('fs');
const file = 'src/components/ToolsHub.tsx';
let code = fs.readFileSync(file, 'utf8');

const target = `{currentUser?.isAdmin && (
            <button
              onClick={() => navigate('/admin')}
              className="bg-purple-100 text-purple-700 hover:bg-purple-200 px-3 py-1.5 rounded-md text-sm font-bold transition-colors"
            >
              Painel Admin
            </button>
          )}`;

if (code.includes(target)) {
  code = code.replace(target, '');
  fs.writeFileSync(file, code);
  console.log('Admin button removed');
} else {
  console.log('Target not found');
}
