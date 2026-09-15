import fs from 'fs';

let content = fs.readFileSync('src/lib/firebase.ts', 'utf8');

// We will change saveRefugoScans, clearRefugoScans, listenToRefugoScans
