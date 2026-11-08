import {test} from 'node:test';import {strict as assert} from 'node:assert';import {parseOBJ,matchFeature,rankSimilar} from '../src/ai-search.ts';import {extractFeatures} from '../src/analysis.ts';
const obj='v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3';
test('OBJ parsing and similarity',()=>{const mesh=parseOBJ(obj);assert.equal(mesh.faceCount,1);const f=extractFeatures(mesh);assert.equal(rankSimilar(mesh,[f],1).results[0].similarityScore,1);assert.equal(matchFeature(f,{minVertices:3,maxVertices:3}),true);assert.equal(matchFeature(f,{minVertices:4}),false);});
test('reject malicious or invalid OBJ',()=>{assert.throws(()=>parseOBJ('v 0 0 0\nv 1 0 0\nv 0 1 0\nf -1 2 3'));assert.throws(()=>parseOBJ('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 4'));});
