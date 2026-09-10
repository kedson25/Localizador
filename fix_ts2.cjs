const fs = require('fs');

// Fix IdRemover.tsx
let idremover = fs.readFileSync('src/components/IdRemover.tsx', 'utf8');
if (!idremover.includes('useEffect')) {
  idremover = idremover.replace("import React, { useState, useMemo }", "import React, { useState, useMemo, useEffect }");
  fs.writeFileSync('src/components/IdRemover.tsx', idremover);
}
