import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// 1. Detecta IP LAN prioritário
const networkInterfaces = os.networkInterfaces();
let lanIps = [];

for (const name of Object.keys(networkInterfaces)) {
  for (const net of networkInterfaces[name]) {
    if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
      lanIps.push({ name, address: net.address });
    }
  }
}

lanIps.sort((a, b) => {
  const isPhysA = /wi-fi|ethernet/i.test(a.name) && !/vethernet/i.test(a.name);
  const isPhysB = /wi-fi|ethernet/i.test(b.name) && !/vethernet/i.test(b.name);
  if (isPhysA && !isPhysB) return -1;
  if (!isPhysA && isPhysB) return 1;
  return 0;
});

const targetIp = process.env.VITE_LAN_IP || (lanIps.length > 0 ? lanIps[0].address : '192.168.23.58');
const certDir = path.resolve('certs');
const clientCertDir = path.resolve('client', 'certs');

if (!fs.existsSync(certDir)) {
  fs.mkdirSync(certDir, { recursive: true });
}
if (!fs.existsSync(clientCertDir)) {
  fs.mkdirSync(clientCertDir, { recursive: true });
}

console.log('\n======================================================');
console.log('🔒 Gerador de Certificados Confiáveis com mkcert');
console.log('======================================================');
console.log(`SANs configurados: localhost, 127.0.0.1, ${targetIp}`);
console.log('Diretório de saída: ./certs/ e ./client/certs/');

const certFile = path.join(certDir, 'cert.pem');
const keyFile = path.join(certDir, 'key.pem');

try {
  // Executa mkcert para gerar cert.pem e key.pem
  const cmd = `mkcert -key-file "${keyFile}" -cert-file "${certFile}" localhost 127.0.0.1 ${targetIp}`;
  console.log(`\nExecutando: ${cmd}\n`);
  execSync(cmd, { stdio: 'inherit' });

  // Copia também para client/certs para facilitar leitura relativa
  fs.copyFileSync(certFile, path.join(clientCertDir, 'cert.pem'));
  fs.copyFileSync(keyFile, path.join(clientCertDir, 'key.pem'));

  console.log('\n✅ Certificados gerados com sucesso!');
  console.log(`   - Cert: ${certFile}`);
  console.log(`   - Key:  ${keyFile}`);
  console.log('\nPara descobrir onde está o arquivo rootCA.pem para instalar no PC B, execute:');
  console.log('   mkcert -CAROOT\n');
} catch (err) {
  console.error('\n❌ Erro ao executar mkcert:', err.message);
  console.error('Certifique-se de que o mkcert está instalado no PC A e disponível no PATH.');
  console.error('Instalação rápida no Windows: winget install FiloSottile.mkcert');
  process.exit(1);
}
