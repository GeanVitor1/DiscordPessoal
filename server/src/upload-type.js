import fs from 'node:fs/promises';
// Multipart headers are client-controlled. Recognize common media signatures before storing metadata.
export async function uploadType(filename,claimed=''){
 const file=await fs.open(filename,'r');let b;try{b=Buffer.alloc(512);const read=await file.read(b,0,512,0);b=b.subarray(0,read.bytesRead);}finally{await file.close();}
 const ascii=(start,end)=>b.toString('ascii',start,end);
 if(['GIF87a','GIF89a'].includes(ascii(0,6)))return 'image/gif';
 if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(b[0]===255 && b[1]===216 && b[2]===255)return 'image/jpeg';
 if(ascii(0,4)==='RIFF' && ascii(8,12)==='WEBP')return 'image/webp';
 if(ascii(0,4)==='RIFF' && ascii(8,12)==='WAVE')return 'audio/wav';
 if(ascii(0,3)==='ID3' || b[0]===255 && (b[1]&224)===224)return 'audio/mpeg';
 if(ascii(0,4)==='fLaC')return 'audio/flac';
 if(ascii(0,4)==='OggS')return 'audio/ogg';
 if(b.subarray(0,4).equals(Buffer.from([26,69,223,163])))return claimed.split(';')[0]==='audio/webm'?'audio/webm':'video/webm';
 if(ascii(4,8)==='ftyp')return claimed.split(';')[0]==='audio/mp4'?'audio/mp4':'video/mp4';
 // Unknown uploads remain downloadable files, never active HTML or script content.
 return 'application/octet-stream';
}
