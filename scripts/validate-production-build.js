#!/usr/bin/env node

/**
 * Validador estrito de build de produção para o Desktop (Electron)
 *
 * Garante que nenhuma build .exe de produção seja gerada sem VITE_API_URL pública definida,
 * prevenindo que executáveis sejam distribuídos apontando silenciosamente para localhost ou URLs vazias.
 */

const apiUrl = process.env.VITE_API_URL;

if (!apiUrl || !apiUrl.trim()) {
  console.error('\n' + '='.repeat(70));
  console.error('❌ ERRO CRÍTICO DE BUILD DESKTOP:');
  console.error('   VITE_API_URL não foi definida para a build de produção do Desktop.');
  console.error('   Para gerar um instalador que funcione fora da máquina do desenvolvedor,');
  console.error('   você deve fornecer a URL pública do seu Backend Central.');
  console.error('   Exemplo de uso:');
  console.error('   cross-env VITE_API_URL=https://api.meudominio.com npm run build:desktop');
  console.error('='.repeat(70) + '\n');
  process.exit(1);
}

// Rejeita explicitamente localhost em build de produção instalável
if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(apiUrl.trim())) {
  console.error('\n' + '='.repeat(70));
  console.error('❌ ERRO DE CONFIGURAÇÃO:');
  console.error(`   A URL de backend fornecida (${apiUrl}) aponta para localhost.`);
  console.error('   Instaladores .exe distribuídos não podem depender de localhost.');
  console.error('   Forneça a URL real do servidor ou o IP público da sua VPS.');
  console.error('='.repeat(70) + '\n');
  process.exit(1);
}

console.log(`\n✅ [Build Desktop] VITE_API_URL validada com sucesso: ${apiUrl}\n`);
process.exit(0);
