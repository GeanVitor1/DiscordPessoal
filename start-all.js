import { spawn } from 'child_process';
import path from 'path';
import os from 'os';

// Detecta IP LAN prioritário (prioriza Wi-Fi e Ethernet sobre switches virtuais vEthernet)
const networkInterfaces = os.networkInterfaces();
let lanIps = [];

for (const name of Object.keys(networkInterfaces)) {
  for (const net of networkInterfaces[name]) {
    if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
      lanIps.push({ name, address: net.address });
    }
  }
}

// Ordena dando prioridade para Wi-Fi e Ethernet físico
lanIps.sort((a, b) => {
  const isPhysA = /wi-fi|ethernet/i.test(a.name) && !/vethernet/i.test(a.name);
  const isPhysB = /wi-fi|ethernet/i.test(b.name) && !/vethernet/i.test(b.name);
  if (isPhysA && !isPhysB) return -1;
  if (!isPhysA && isPhysB) return 1;
  return 0;
});

const primaryLanIp = lanIps.length > 0 ? lanIps[0].address : '127.0.0.1';

// LAN media capture requires HTTPS. Electron development opts into localhost HTTP.
const isHttps = process.env.VITE_USE_HTTPS !== 'false';
process.env.VITE_USE_HTTPS = String(isHttps);
const clientProto = isHttps ? 'https' : 'http';
const wsProto = isHttps ? 'wss' : 'ws';

console.log('\n======================================================');
console.log('🌐 Discord Clone - Painel de Inicialização LAN');
console.log('======================================================');
console.log(`Frontend LAN:    ${clientProto}://${primaryLanIp}:5173`);
console.log(`Backend:         ${clientProto}://${primaryLanIp}:5173/api  (Proxy -> :5000)`);
console.log(`Socket:          ${wsProto}://${primaryLanIp}:5173/socket.io (Proxy -> :5000)`);
console.log(`Secure Context:  ${isHttps ? 'YES (HTTPS Ativo)' : 'NO (HTTP - Para liberar getDisplayMedia na LAN, use: npm run dev:https)'}`);
console.log('======================================================\n');

console.log('Iniciando o Servidor Discord (Backend)...');
const serverProcess = spawn('npm', ['start'], {
  cwd: path.resolve('server'),
  stdio: 'inherit',
  shell: true,
  env: { ...process.env }
});

console.log('Iniciando o Frontend Discord (React / Vite na porta 5173 com strictPort: true)...');
const clientProcess = spawn('npm', ['run', 'dev', '--', '--host'], {
  cwd: path.resolve('client'),
  stdio: 'inherit',
  shell: true,
  env: { ...process.env }
});

clientProcess.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`\n❌ O processo do Vite encerrou com código ${code}.`);
    console.error('Se a porta 5173 estiver em uso por outra instância, encerre o processo anterior para evitar conflito de portas.\n');
  }
});

process.on('SIGINT', () => {
  serverProcess.kill();
  clientProcess.kill();
  process.exit();
});
