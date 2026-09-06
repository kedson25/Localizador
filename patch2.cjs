const fs = require('fs');
const appFile = 'src/App.tsx';
let appCode = fs.readFileSync(appFile, 'utf8');

const routeTarget = `            <Route path="/refugo" element={
              <ControleRefugo />
            } />`;
if (appCode.includes(routeTarget)) {
  appCode = appCode.replace(routeTarget, routeTarget + `\n\n            <Route path="/listas" element={
              <ListasColeta />
            } />`);
  fs.writeFileSync(appFile, appCode);
  console.log('Success App.tsx route');
} else {
  console.log('Route target not found in App.tsx');
}
