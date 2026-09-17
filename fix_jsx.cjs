const fs = require('fs');
let code = fs.readFileSync('src/components/ControleRefugo.tsx', 'utf8');

// The broken code starts at return (
// <div className="max-w-7xl mx-auto animate-in fade-in duration-300 pb-12">
// className="w-full bg-yellow-600 ... > Confirmar Recebimento (BPP) </button> </div> </div> )}

const brokenStart = `
  return (
    <div className="max-w-7xl mx-auto animate-in fade-in duration-300 pb-12">
      
              className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-4 rounded-xl shadow-lg transition-colors text-lg cursor-pointer"
            >
              Confirmar Recebimento (BPP)
            </button>
          </div>
        </div>
      )}
`;

const fixedStart = `
  return (
    <div className="max-w-7xl mx-auto animate-in fade-in duration-300 pb-12">
`;

code = code.replace(brokenStart.trim(), fixedStart.trim());
fs.writeFileSync('src/components/ControleRefugo.tsx', code);
