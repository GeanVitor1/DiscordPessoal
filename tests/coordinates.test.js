import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizedToPhysical} from '../desktop/coordinates.js';
import {CoordinateMapper} from '../client/src/interaction/CoordinateMapper.js';
test('100%, 125%, 150% preserve physical pixel edges, negative offsets and secondary displays',()=>{
  for(const scale of [1,1.25,1.5])for(const origin of [{x:0,y:0},{x:-1920,y:-1080},{x:1920,y:0}]){
    const physical={...origin,width:Math.round(1280*scale),height:Math.round(720*scale)};
    assert.deepEqual(normalizedToPhysical(physical,0,0),origin);
    assert.deepEqual(normalizedToPhysical(physical,1,1),{x:origin.x+physical.width-1,y:origin.y+physical.height-1});
    assert.deepEqual(normalizedToPhysical(physical,.5,.5),{x:Math.round(origin.x+(physical.width-1)/2),y:Math.round(origin.y+(physical.height-1)/2)});
  }
  assert.throws(()=>normalizedToPhysical({x:0,y:0,width:1920,height:1080},NaN,.5));
});
test('resize, fullscreen and letterboxing preserve the source center and exclude black bars',()=>{
  const mapper=new CoordinateMapper({width:800,height:600},{width:1920,height:1080});
  for(const [width,height] of [[800,600],[940,400],[1920,1080],[1080,1920]]) {
    mapper.updateBounds(width,height);
    const center=mapper.mapPixelsToNormalized(width/2,height/2);
    assert.equal(center.insideViewport,true);assert.equal(center.normX,.5);assert.equal(center.normY,.5);
    const view=mapper.getRenderViewport();
    if(view.offsetY>0)assert.equal(mapper.mapPixelsToNormalized(width/2,0).insideViewport,false);
    if(view.offsetX>0)assert.equal(mapper.mapPixelsToNormalized(0,height/2).insideViewport,false);
  }
});
