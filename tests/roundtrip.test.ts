import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {toGLB, type Mesh} from '../src/geometry.ts';
import {decodeModel} from '../src/ai-first.ts';
import {meshFromGLB} from '../src/analysis.ts';
import {canonicalGeometry} from '../src/identity.ts';
const mesh:Mesh={id:'0000423093-acdfd',protocol:'poscan',vertexCount:4,faceCount:2,
 vertices:new Float64Array([0.123456789,0,0,1,0,0,0,1,0,0,0,1]),faces:new Uint16Array([0,1,2,0,2,3])};
test('Explorer GLB download then upload preserves canonical identity',()=>{
 const downloaded=toGLB(mesh);
 const uploaded=decodeModel({format:'glb',data:downloaded.toString('base64')}).mesh;
 const candidate=meshFromGLB(mesh.id,downloaded);
 assert.equal(canonicalGeometry(uploaded).hash,canonicalGeometry(candidate).hash);
 // GLB uses float32 positions, so source double coordinates are not always the export identity.
 assert.notEqual(canonicalGeometry(mesh).hash,canonicalGeometry(uploaded).hash);
});
test('an edited GLB cannot match simply because it shares a filename',()=>{
 const original=toGLB(mesh);
 const altered=toGLB({...mesh,vertices:new Float64Array([0.5,0,0,1,0,0,0,1,0,0,0,1])});
 assert.notEqual(canonicalGeometry(decodeModel({format:'glb',data:original.toString('base64')}).mesh).hash,
                 canonicalGeometry(decodeModel({format:'glb',data:altered.toString('base64')}).mesh).hash);
});
