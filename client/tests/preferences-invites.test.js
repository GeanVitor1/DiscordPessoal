import test from 'node:test';
import assert from 'node:assert/strict';
import {parseInvite,inviteLink} from '../src/invites.js';
import {normalizePreferences,DEFAULT_PREFERENCES} from '../src/preferences.js';
test('invites accept links and codes without accepting executable URLs or path injection',()=>{
  const code='abcdefghijklmnopqrstuvwx';
  assert.equal(parseInvite(code),code);
  assert.equal(parseInvite(inviteLink('https://example.com',code)),code);
  assert.equal(parseInvite(`https://example.com/invite/${code}`),code);
  for(const value of ['javascript:alert(1)','file:///invite/'+code,'https://user:password@example.com/?invite='+code,'../../private','https://example.com/?invite=bad']) assert.equal(parseInvite(value),null);
});
test('saved preferences reject malformed data and constrain accessibility values',()=>{
  assert.deepEqual(normalizePreferences(null),DEFAULT_PREFERENCES);
  const p=normalizePreferences({theme:'unknown',accent:'red;display:none',fontSize:999,sounds:'false',compact:true,unknown:true});
  assert.equal(p.theme,'dark');assert.equal(p.accent,DEFAULT_PREFERENCES.accent);assert.equal(p.fontSize,20);assert.equal(p.sounds,true);assert.equal(p.compact,true);assert.equal(p.unknown,undefined);
  assert.equal(normalizePreferences({theme:'system',fontSize:1}).fontSize,12);
});
