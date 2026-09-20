import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from '../vendor/three/build/three.module.js';
import {frameBounds,farForBounds,validateViewpoint} from '../shared/camera.mjs';

test('imported models fit the viewport and clipping range at city scale and away from the origin',()=>{
 for(const [min,max]of [[[-1000,-33,-960],[940,32,880]],[[3000,80,-700],[3020,120,-650]],[[0,0,0],[0,0,0]]]){
  for(const aspect of [.4,1,2])for(const top of [false,true]){
   const v=frameBounds(min,max,aspect,55,top),far=farForBounds(v.position,min,max),c=new PerspectiveCamera(v.fov,aspect,.05,far);
   c.position.fromArray(v.position);c.lookAt(new Vector3(...v.target));c.updateMatrixWorld();
   for(const x of [min[0],max[0]])for(const y of [min[1],max[1]])for(const z of [min[2],max[2]]){
    const p=new Vector3(x,y,z).project(c);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1&&Math.abs(p.z)<1,`clipped corner ${p.toArray()}`);
   }
  }
 }
 assert.ok(farForBounds([10000,0,0],[-1000,-33,-960],[940,32,880])>11000);
});
test('starting viewpoints preserve model coordinates and reject invalid cameras',()=>{
 const v={position:[3000,20,-100],target:[3020,5,-80],fov:65};assert.deepEqual(validateViewpoint(v),v);
 assert.throws(()=>validateViewpoint({position:[0,0,0],target:[0,0,0]}));
 assert.throws(()=>validateViewpoint({...v,fov:180}));assert.throws(()=>validateViewpoint({...v,position:[NaN,0,0]}));
});
