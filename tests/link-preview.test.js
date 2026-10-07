import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicAddress,previewUrl} from '../server/src/link-preview.js';
test('link preview rejects private, mapped, rebinding-sensitive and credential-bearing targets',async()=>{
 for(const ip of ['127.0.0.1','10.1.2.3','192.168.1.1','172.16.1.1','169.254.169.254','100.64.0.1','::1','0:0:0:0:0:0:0:1','::ffff:127.0.0.1','0:0:0:0:0:ffff:7f00:1','fd00::1','fe80::1','64:ff9b::a00:1'])assert.equal(publicAddress(ip),false,ip);
 for(const ip of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111'])assert.equal(publicAddress(ip),true,ip);
 for(const url of ['file:///etc/passwd','http://example.com','https://user:secret@example.com','https://example.com:8080'])await assert.rejects(previewUrl(url));
 assert.equal((await previewUrl('https://example.com/page')).hostname,'example.com');
});
