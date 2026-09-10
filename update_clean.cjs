const fs = require('fs');

let fileContent = fs.readFileSync('src/components/ListasColeta.tsx', 'utf8');

// Replace all cleanCod with cleanInput in the exact spots that are causing issues
// Wait, we need to be careful to not break things further. Let's just find and replace cleanCod with cleanInput where it matters.
fileContent = fileContent.replace(/cleanCod/g, 'cleanInput');

fs.writeFileSync('src/components/ListasColeta.tsx', fileContent);
