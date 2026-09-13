import fs from 'fs';
let code = fs.readFileSync('src/components/ListasColeta.tsx', 'utf8');
code = code.replace(
  'const nomeGrupo = item.grupoId ? (gruposMap.get(item.grupoId) || \'\') : \'\';',
  'const nomeGrupo = String(item.grupoId ? (gruposMap.get(item.grupoId) || \'\') : \'\');'
);
fs.writeFileSync('src/components/ListasColeta.tsx', code);
