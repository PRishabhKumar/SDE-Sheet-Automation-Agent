// ──────────────────────────────────────────────────────────────────────────────
// Registers the SDE Agent as a Windows Service.
// Run ONCE with: node install-service.js
// Requires: npm install -g node-windows
// ──────────────────────────────────────────────────────────────────────────────

const path = require('path');
const Service = require('node-windows').Service;

const svc = new Service({
  name: 'SDE Sheet Challenge Agent',
  description: 'Automates daily folder creation, git commits, and LinkedIn posts for the SDE Sheet Challenge.',
  script: path.join(__dirname, 'main.js'),
  nodeOptions: ['--max-old-space-size=256'],
  env: [
    { name: 'NODE_ENV', value: 'production' },
  ],
  // Restart automatically if the process crashes
  allowServiceLogon: true,
});

svc.on('install', () => {
  console.log('✅ Windows Service installed.');
  svc.start();
  console.log('✅ Service started.');
  console.log('\nThe SDE Agent will now:');
  console.log('  • Start automatically when Windows boots');
  console.log('  • Restart automatically if it crashes');
  console.log('  • Appear in Task Manager > Services as "SDE Sheet Challenge Agent"');
});

svc.on('alreadyinstalled', () => {
  console.log('⚠️ Service already installed. Uninstall first if you need to re-install.');
});

svc.on('error', (err) => {
  console.error('Service installation error:', err);
});

svc.install();