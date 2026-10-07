import {test} from 'node:test';
import assert from 'node:assert/strict';
import {notificationAllowed,isMention,unreadCount} from '../src/notifications.js';
test('notification inheritance, temporary silence, mentions and badges follow the chosen scope',()=>{
 const settings={notifications:{default:{mode:'all'},servers:{s:{mode:'mentions'}},channels:{c:{mode:'none'},d:{mode:'all',mutedUntil:'2099-01-01'}}}},route={serverId:'s',channelId:'other'};
 assert.equal(notificationAllowed(settings,route,false),false);assert.equal(notificationAllowed(settings,route,true),true);assert.equal(notificationAllowed(settings,{serverId:'s',channelId:'c'},true),false);assert.equal(notificationAllowed(settings,{channelId:'d'},true),false);
 assert.equal(unreadCount(settings,{...route,unread:12,mentions:2}),2);assert.equal(unreadCount(settings,{channelId:'c',unread:12,mentions:2}),0);
 assert.equal(isMention('hello @bob',{id:'b',handle:'bob',status:'online'}),true);assert.equal(isMention('hello @bobby',{id:'b',handle:'bob'}),false);assert.equal(isMention('<@b>',{id:'b',handle:'bob'}),true);assert.equal(isMention('@here',{id:'b',status:'offline'}),false);
});
