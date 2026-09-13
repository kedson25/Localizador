import fs from 'fs';
let code = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

code = code.replace(
  `    const unsubListas = listenToListas(data => {
      setListas(data);
      setListasReady(true);
    }, error => {
      setListas([]);
      setListasReady(true);
      setOperationError(error.message);
    });`,
  `    const unsubListas = listenToListas(data => {
      setListas(data);
      setListasReady(true);
    });`
);

code = code.replace(
  `    const unsubRefugo = listenToRefugoScans(scans => {
      setRefugoScans(scans);
    }, error => setOperationError(error.message));`,
  `    const unsubRefugo = listenToRefugoScans(scans => {
      setRefugoScans(scans);
    });`
);

fs.writeFileSync('src/components/AdminPanel.tsx', code);
