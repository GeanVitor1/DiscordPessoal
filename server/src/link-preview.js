import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';
import {route,fail} from './auth.js';

export function publicAddress(address) {
  if(net.isIP(address)===4){const [a,b]=address.split('.').map(Number);return !(a===0 || a===10 || a===127 || a>=224 || a===169 && b===254 || a===172 && b>=16 && b<=31 || a===192 && (b===168 || b===0) || a===100 && b>=64 && b<=127 || a===198 && (b===18 || b===19 || b===51) || a===203 && b===0);}
  if(net.isIP(address)===6){let a;try{a=new URL(`http://[${address}]/`).hostname.slice(1,-1).toLowerCase();}catch{return false;}return !(/^::|^fc|^fd|^fe[89ab]|^ff|^2001:db8|^2001:0:|^2002:|^64:ff9b:|^64:ff9b:1:/.test(a));}return false;
}
export async function previewUrl(value) {
  let url;try{url=new URL(value);}catch{fail(400,'Link inválido');}if(url.protocol!=='https:' || url.username || url.password || url.port && url.port!=='443' || url.href.length>2000)fail(400,'Prévia disponível somente para links HTTPS públicos');return url;
}
async function fetchHtml(url,redirects=0) {
  const hostname=url.hostname.replace(/^\[|\]$/g,''),addresses=await dns.lookup(hostname,{all:true});if(!addresses.length || addresses.some(a=>!publicAddress(a.address)))fail(400,'Endereço não permitido');const selected=addresses[0];
  return new Promise((resolve,reject)=>{
    const request=https.get(url,{headers:{'User-Agent':'MeuApp-LinkPreview','Accept':'text/html'},lookup:(_hostname,options,callback)=>callback(null,options?.all?[selected]:selected.address,selected.family)},response=>{
      if([301,302,303,307,308].includes(response.statusCode)){response.resume();if(redirects>=3)return reject(Error('Muitos redirecionamentos'));Promise.resolve().then(()=>previewUrl(new URL(response.headers.location,url).href)).then(next=>fetchHtml(next,redirects+1)).then(resolve,reject);return;}
      if(response.statusCode!==200 || !String(response.headers['content-type']).includes('text/html')){response.resume();return reject(Error('Prévia indisponível'));}
      let size=0,chunks=[];response.on('data',data=>{size+=data.length;if(size>512000){request.destroy();reject(Error('Página muito grande'));}else chunks.push(data);});response.on('end',()=>resolve({url:url.href,html:Buffer.concat(chunks).toString('utf8')}));response.on('error',reject);
    });request.setTimeout(5000,()=>request.destroy(Error('Tempo de prévia excedido')));request.on('error',reject);
  });
}
const decode=value=>value.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
export function installLinkPreview(app) {
  const cache=new Map(),requests=new Map();
  app.get('/api/link-preview',route(async(req,res)=>{
    const url=await previewUrl(String(req.query.url || '')),now=Date.now(),old=requests.get(req.user.id);if(!old || now-old.start>60000)requests.set(req.user.id,{start:now,count:1});else if(++old.count>20)fail(429,'Limite de prévias excedido');const cached=cache.get(url.href);if(cached?.until>now)return res.json(cached.value);
    try{const page=await fetchHtml(url),meta={};for(const tag of page.html.match(/<meta\b[^>]{0,3000}>/gi) || []){const attrs={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g))attrs[m[1].toLowerCase()]=decode(m[3]);if(attrs.property || attrs.name)meta[attrs.property || attrs.name]=attrs.content;}
      const value={url:page.url,title:String(meta['og:title'] || page.html.match(/<title[^>]*>([^<]{0,1000})<\/title>/i)?.[1] || url.hostname).slice(0,200),description:String(meta['og:description'] || meta.description || '').slice(0,400),site:url.hostname};cache.set(url.href,{until:now+600000,value});if(cache.size>500)cache.delete(cache.keys().next().value);res.json(value);
    }catch(e){if(e.status)throw e;res.json({url:url.href,title:url.hostname,description:'',site:url.hostname});}
  }));
}
