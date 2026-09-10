const fs = require('fs');
const file = 'src/App.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace("{!isHome && (", "{!isHome && location.pathname !== '/login' && (");
// Also, remove padding from main when on login so it fills the screen
code = code.replace(
  'className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4"',
  'className={`flex-1 w-full mx-auto ${location.pathname === "/login" ? "" : "max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-4"}`}'
);

fs.writeFileSync(file, code);
console.log('Fixed header and main container padding');
