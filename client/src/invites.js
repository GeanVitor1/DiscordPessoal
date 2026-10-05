export function parseInvite(value) {
  const input=String(value || '').trim();
  if(/^[\w-]{24}$/.test(input)) return input;
  try {
    const url=new URL(input);
    if(!['https:','http:'].includes(url.protocol) || url.username || url.password) return null;
    const code=url.searchParams.get('invite') || url.pathname.match(/^\/invite\/([\w-]{24})\/?$/)?.[1];
    return /^[\w-]{24}$/.test(code || '')?code:null;
  }catch{return null;}
}
export function inviteLink(origin,code) {
  if(!/^[\w-]{24}$/.test(code)) throw Error('Convite inválido');
  const url=new URL(origin);if(!['http:','https:'].includes(url.protocol)) throw Error('Endereço do convite indisponível');
  url.pathname='/';url.search='';url.hash='';url.searchParams.set('invite',code);return url.toString();
}
