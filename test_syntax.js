try {
  require('child_process').execSync('npx tsc --noEmit', { stdio: 'inherit' });
  console.log('TS Compilation passed');
} catch (e) {
  console.error('TS Compilation failed');
}
