const fs = require('fs');
const file = 'src/App.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  '<Route path="/admin" element={<AdminPanel />} />', 
  '<Route path="/admin" element={<AdminPanel currentUser={currentUser} />} />'
);

fs.writeFileSync(file, code);
console.log('App.tsx patched for AdminPanel props');
