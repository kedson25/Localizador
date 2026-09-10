const fs = require('fs');
const appFile = 'src/App.tsx';
let appCode = fs.readFileSync(appFile, 'utf8');

const target = `import { ControleRefugo } from './components/ControleRefugo';`;
if (appCode.includes(target) && !appCode.includes("import { ListasColeta }")) {
  appCode = appCode.replace(target, target + "\nimport { ListasColeta } from './components/ListasColeta';");
  fs.writeFileSync(appFile, appCode);
  console.log('Success adding import to App.tsx');
}
