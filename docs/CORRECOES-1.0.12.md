# Correções das configurações e mídia — 1.0.12

O modal de configurações referenciava `errorMessage` e `setErrorMessage` sem declarar o estado. O estado agora existe; o modal abre, salva e reabre, limpando erros anteriores e carregando o perfil atual.

HTTP pelo IP da rede não disponibiliza as APIs de captura do navegador. O início conjunto (`npm start`, `npm run dev`, `npm run dev:lan`) agora usa HTTPS por padrão. O certificado existente inclui `192.168.23.58` e expira em 01/01/2029. Abra `https://192.168.23.58:5173`; cada computador precisa confiar na CA emissora do mkcert. HTTPS solicitado com certificados ausentes interrompe a inicialização do Vite. `npm run desktop` mantém o desenvolvimento em HTTP/localhost.

A lista de dispositivos trata a ausência de `mediaDevices` sem acessar `enumerateDevices` de um objeto indefinido. Entrar na chamada sem a API necessária mostra uma orientação e preserva o estado desconectado. Câmera, troca de microfone e captura desktop verificam a disponibilidade da API antes de usá-la.

## Validação concluída

- `npm test`: 20 testes do cliente e 9 testes do backend/desktop passaram.
- `npm run test:ui`: configurações abrem, validam upload, salvam e reabrem; ausência de mídia é tratada; dois usuários trocam áudio, câmera, tela e mensagens, e a chamada recupera a conexão após reinício do backend.
- `$env:UI_TEST_HTTPS='true'; $env:UI_TEST_HOST='192.168.23.58'; npm run test:ui`: os mesmos fluxos passaram pelo IP da rede com HTTPS, usando o certificado existente e sem ignorar erros de certificado.
- `npm run test:rtc`, `npm run test:native` e o teste `tests/desktop-smoke.js`: passaram. Entrada nativa PT-BR e liberação das teclas foram verificadas em uma janela de teste local.
- `npm run build:native` compilou `desktop/NativeInputHost.cs`; `npm run build:client` gerou o frontend de produção.
- `npx --no-install electron-builder --win --publish never` gerou o instalador Windows x64.
- `node scripts/verify-package.js` confirmou que o ASAR contém o frontend compilado e que `dist/win-unpacked/resources/app.asar.unpacked/desktop/NativeInputHost.exe` é idêntico ao helper recompilado.
- `node tests/packaged-smoke.js --capture-test --ui-test`: aplicativo empacotado autenticou em backend isolado, abriu/salvou/reabriu configurações, entrou/saiu da chamada e compartilhou uma tela real. Captura adicional: 1920×1080, 30 FPS. Nenhum `ReferenceError` ou `TypeError` foi observado. O helper empacotado respondeu a PING.

Os testes usam bancos isolados e áudio sintético. A captura desktop é real. Não houve ensaio entre dois computadores físicos, microfone físico, rede externa ou TURN. O frontend emitiu aviso de chunk maior que 500 kB. Os testes de reconexão emitem erros de proxy esperados quando derrubam o backend deliberadamente.

## Artefato

Instalador: `C:\Users\geand\OneDrive\Documentos\Discord\dist\MeuApp-Setup-1.0.12.exe`.

Versão: **1.0.12**. Build: **05/10/2026 às 11:13:33 (America/Sao_Paulo)**, equivalente a `2026-10-05T14:13:33.881Z`.

SHA-256: `99c77eac3086d7d9dd08799610a595f7d96ee8720617f3b8122c0ab1cb04a9be`.

Relatórios: [build.json](validation/build.json), [packaged.json](validation/packaged.json) e [captura das configurações](validation/settings-packaged.png).
