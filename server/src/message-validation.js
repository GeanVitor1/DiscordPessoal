import {fail} from './auth.js';
import {validateAssetReferences} from './community-media.js';
export async function validateMessageContent(userId,content,channel,tx){
 const p=channel.permissions;
 if(!p.sendMessages)fail(403,'Você não pode enviar mensagens neste canal');
 if(/https?:\/\//i.test(content) && !p.embedLinks)fail(403,'Links não são permitidos neste canal');
 if((/@(everyone|here)\b/.test(content) || content.includes(`<@&everyone:${channel.server_id}>`)) && !p.mentionEveryone)fail(403,'Você não pode mencionar todos');
 if(/@[^\s]+/.test(content) && !p.mentionUsers)fail(403,'Menções não são permitidas');
 if(/^\//.test(content) && !p.useCommands)fail(403,'Comandos não são permitidos');
 await validateAssetReferences(userId,content,channel,tx);
}
