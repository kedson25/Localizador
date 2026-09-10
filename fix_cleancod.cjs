const fs = require('fs');
let code = fs.readFileSync('src/components/ListasColeta.tsx', 'utf8');

code = code.replace(
  /id: 'item-' \+ Date\.now\(\) \+ '-' \+ Math\.floor\(Math\.random\(\) \* 1000000\) \+ '-' \+ cleanCod,/g,
  "id: 'item-' + Date.now() + '-' + Math.floor(Math.random() * 1000000) + '-' + cleanInput,"
);

fs.writeFileSync('src/components/ListasColeta.tsx', code);
