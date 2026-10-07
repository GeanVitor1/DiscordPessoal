import assert from 'node:assert/strict';

// Runs against the real packaged React UI with an isolated authenticated account.
export async function verifyDesign({view,click,wait,resize,capture,account}) {
  const setInput=(selector,value)=>view(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
  await wait("!!document.querySelector('.profile-preview .profile-identity')",'live profile preview');
  const keyboard=await view(`(()=>{const last=document.querySelector('.settings-footer button:last-child'),first=document.querySelector('[aria-label="Buscar configurações"]');last.focus();last.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}));const forward=document.activeElement===first;first.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true}));return {forward,backward:document.activeElement===last};})()`);
  assert.deepEqual(keyboard,{forward:true,backward:true},'Keyboard focus stays inside the dialog');
  assert.equal(await view("document.querySelectorAll('.avatar-gallery img,.banner-gallery img').length"),0,'GIF galleries must not load until requested');
  const sizes=[];
  for(const width of [1440,1024,940,680,560]) {
    await resize(width,900);
    await view('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const layout=await view(`(()=>{const shell=document.querySelector('.settings-shell'),nav=document.querySelector('.settings-sidebar'),content=document.querySelector('.settings-content'),items=[...document.querySelectorAll('.settings-nav-item')].map(e=>e.getBoundingClientRect());return {width:innerWidth,shellOverflow:shell.scrollWidth-shell.clientWidth,navOverflow:nav.scrollWidth-nav.clientWidth,contentOverflow:content.scrollWidth-content.clientWidth,verticalNavigation:items.every((r,i)=>!i || r.top>=items[i-1].bottom),categories:items.length};})()`);
    assert.ok(layout.shellOverflow<=1 && layout.navOverflow<=1 && layout.contentOverflow<=1,JSON.stringify(layout));
    assert.equal(layout.verticalNavigation,true);assert.equal(layout.categories,9);sizes.push(layout);
    if([1440,940,560].includes(width))await capture(`design-settings-${width}.png`);
  }
  await resize(1440,900);
  await setInput('[aria-label="Buscar configurações"]','aparencia');
  await wait("document.querySelectorAll('.settings-nav-item').length===1",'accent insensitive settings search');
  assert.equal(await view("document.querySelector('.settings-nav-item').textContent.trim()"),'Aparência');
  await setInput('[aria-label="Buscar configurações"]','');
  await setInput('[aria-label="Nome de Exibição"]','Perfil de teste');
  await setInput('[aria-label="Sobre Mim (Biografia)"]','Uma biografia para conferir a prévia em tempo real.');
  await wait("document.querySelector('.profile-preview').textContent.includes('Perfil de teste') && document.querySelector('.profile-preview').textContent.includes('Uma biografia')",'preview follows profile edits');
  await click('Conta');await wait("document.body.textContent.includes('Dispositivos e sessões')",'account controls');
  await click('Perfil');await wait("document.querySelector('[aria-label=\"Nome de Exibição\"]')?.value==='Perfil de teste'",'switching category preserves profile draft');
  await capture('design-settings-preview.png');
  await click('Explorar avatares animados');await wait("document.querySelectorAll('.avatar-gallery img').length===5",'on demand animated avatar choices');
  await click('Ocultar opções animadas');
  await click('Cancelar');
  await click('Configurações de Usuário');
  await wait(`document.querySelector('[aria-label="Nome de Exibição"]')?.value===${JSON.stringify(account.user.username)}`,'cancel leaves saved profile intact');
  await click('Mais do perfil');await click('+ Adicionar conexão');
  await setInput('[aria-label="Nome da conexão 1"]','Meu site');
  await setInput('[aria-label="Link da conexão 1"]','https://example.com/profile');
  await click('Salvar informações');await wait("document.body.textContent.includes('Informações salvas.')",'structured connection saved');
  await capture('design-connections.png');
  await click('Fechar');
  await view(`window.dispatchEvent(new CustomEvent('open-user-profile',{detail:${JSON.stringify(account.user)}}))`);
  await wait("!!document.querySelector('.profile-shell .profile-connections')",'public profile displays saved connection');
  assert.equal(await view("document.querySelector('.profile-connections a').getAttribute('href')"),'https://example.com/profile');
  await capture('design-profile.png');
  await click('Em comum');await wait("document.body.textContent.includes('Vocês têm em comum')",'mutual profile tab');
  await click('Atividade');await wait("document.body.textContent.includes('Nenhuma atividade compartilhada no momento.')",'activity empty state');
  await resize(560,900);await view('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  assert.equal(await view("document.querySelector('.profile-shell').scrollWidth<=document.querySelector('.profile-shell').clientWidth+1"),true);
  await capture('design-profile-560.png');
  await resize(1440,900);await click('Editar perfil');await wait("!!document.querySelector('.settings-shell')",'own profile opens settings');
  // Keep the caller at the same initial settings state for its existing smoke checks.
  await view("document.querySelector('.settings-shell').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await wait("!document.querySelector('.settings-shell')",'escape closes settings');
  await click('Configurações de Usuário');await wait("!!document.querySelector('.profile-preview')",'settings reopen at profile');
  const result={passed:true,sizes,keyboardFocusTrap:true,escapeCloses:true,searchIgnoresAccents:true,livePreview:true,draftPreservedAcrossCategories:true,cancelPreservesSavedProfile:true,gifsLoadOnDemand:true,structuredConnectionsSaved:true,profileTabs:true,profileResponsive:true,ownProfileEdit:true};
  return result;
}
