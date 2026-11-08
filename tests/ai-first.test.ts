import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeModel,inspectMesh,identifyModel} from '../src/ai-first.ts';
const obj='v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n';
test('AI-first model validation and mesh inspection',()=>{
 const m=decodeModel({format:'obj',data:Buffer.from(obj).toString('base64')});
 assert.equal(m.digest.length,64);const result=inspectMesh(m.mesh);
 assert.equal(result.faceCount,1);assert.equal(result.boundaryEdges,3);assert.equal(result.watertight,false);
});
test('AI-first similarity never claims identity proof',()=>{
 const m=decodeModel({format:'obj',data:Buffer.from(obj).toString('base64')});
 const result=identifyModel(m.mesh,[],50);
 assert.equal(result.identityVerified,false);assert.equal(result.coverage,'partial_v2_index');
});
test('rejects malformed model data',()=>{
 assert.throws(()=>decodeModel({format:'obj',data:'!!!!'}));
});
