import { DEFAULT_SERVER } from '../client/src/connection.js';
const value=process.env.VITE_API_URL || DEFAULT_SERVER;
try {
 const url=new URL(value);
 if(url.protocol!=='https:' || url.username || url.password || url.pathname!=='/' || url.search || url.hash || ['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error();
 console.log('[Build Desktop] HTTPS backend validated: '+url.origin);
}catch{console.error('Set VITE_API_URL to the public HTTPS backend origin. Runtime server selection remains available on the login screen.');process.exitCode=1;}
