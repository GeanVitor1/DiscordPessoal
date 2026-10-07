import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SessionGuard} from '../desktop/SessionGuard.js';
import {transferClipboard} from '../desktop/clipboard-transfer.js';
test('clipboard transfer requires separate consent, fresh sequence and active grant; never accesses the real clipboard',()=>{
  let now=0,value='fixture',touches=0;const clipboard={readText:()=>{touches++;return value;},writeText:v=>{touches++;value=v;}};
  const guard=new SessionGuard({now:()=>now}),token='a'.repeat(43),params={guard,clipboard,ownerId:1,sessionId:'clipboard-session',credentials:{token,guestId:'guest',sequence:0},text:'shared\ntext'};
  guard.authorize({sessionId:params.sessionId,guestId:'guest',ownerId:1,displayId:'1'});guard.activate(params.sessionId,1,'guest',token);
  assert.equal(transferClipboard(params).code,'CLIPBOARD_NOT_AUTHORIZED');assert.equal(touches,0);
  guard.authorize({sessionId:params.sessionId,guestId:'guest',ownerId:1,displayId:'1',clipboard:true});guard.activate(params.sessionId,1,'guest',token);
  assert.equal(transferClipboard({...params,credentials:{...params.credentials,token:'wrong'}}).code,'TOKEN_MISMATCH');assert.equal(touches,0);
  assert.equal(transferClipboard(params).success,true);assert.equal(value,'shared\ntext');
  assert.equal(transferClipboard(params).code,'REPLAYED_INPUT');
  assert.equal(transferClipboard({...params,read:true,credentials:{...params.credentials,sequence:1}}).clipboardText,value);
  now=6501;assert.equal(transferClipboard({...params,read:true,credentials:{...params.credentials,sequence:2}}).success,false);assert.equal(touches,2);
});
