import fs from 'fs';
import { execSync } from 'child_process';

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const currentVersion = packageJson.version;

// Quebra a versão em major.minor.patch
const parts = currentVersion.split('.').map(Number);
parts[2] = (parts[2] || 0) + 1;
const nextVersion = parts.join('.');

console.log(`\n🚀 Iniciando lançamento automático de atualização: v${currentVersion} -> v${nextVersion}\n`);

// 1. Atualiza version no package.json
packageJson.version = nextVersion;
fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
console.log(`✅ [1/4] package.json atualizado para a versão ${nextVersion}`);

try {
  // 2. Commit das alterações
  console.log('📦 [2/4] Criando commit com a nova versão...');
  execSync('git add .', { stdio: 'inherit' });
  execSync(`git commit -m "release: v${nextVersion}"`, { stdio: 'inherit' });

  // 3. Criar tag Git correspondente
  console.log(`🏷️  [3/4] Criando tag v${nextVersion}...`);
  execSync(`git tag v${nextVersion}`, { stdio: 'inherit' });

  // 4. Enviar commit e tag para o GitHub
  console.log('☁️  [4/4] Enviando para o GitHub (Push)...');
  execSync('git push origin main', { stdio: 'inherit' });
  execSync(`git push origin v${nextVersion}`, { stdio: 'inherit' });

  console.log('\n' + '='.repeat(70));
  console.log(`🎉 Sucesso! A versão v${nextVersion} foi enviada para o GitHub.`);
  console.log('🤖 O GitHub Actions agora está compilando o novo instalador nas nuvens');
  console.log('   e publicando a release automaticamente!');
  console.log('📲 Em poucos minutos, os computadores com o app aberto vão receber');
  console.log('   a atualização e exibir o botão para reiniciar sozinhos!');
  console.log('='.repeat(70) + '\n');
} catch (error) {
  console.error('\n❌ Erro durante o processo de release:', error.message);
  process.exit(1);
}
