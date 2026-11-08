import {test} from 'node:test';import {strict as assert} from 'node:assert';
import {canonicalGeometry,provenanceResult} from '../src/identity.ts';
const m=(v:number[],f:number[])=>({id:'test',protocol:'test',vertexCount:v.length/3,faceCount:f.length/3,vertices:new Float64Array(v),faces:new Uint16Array(f)});
test('canonical exact identity ignores vertex reordering and face winding',()=>{const a=m([0,0,0,1,0,0,0,1,0,0,0,1],[0,1,2,0,2,3]);const b=m([0,0,1,0,1,0,1,0,0,0,0,0],[3,1,0,3,2,1]);assert.equal(canonicalGeometry(a).hash,canonicalGeometry(b).hash);});
test('canonical exact identity detects geometric edits',()=>{const a=m([0,0,0,1,0,0,0,1,0],[0,1,2]);const b=m([0,0,0,1.001,0,0,0,1,0],[0,1,2]);assert.notEqual(canonicalGeometry(a).hash,canonicalGeometry(b).hash);});
test('provenance never claims cryptographic verification from indexer',()=>{const r=provenanceResult({id:'x',hash:'a',liveGeometryHash:'a',sourceBlockHash:'b',liveBlockHash:'b'});assert.equal(r.sourceCrossChecked,true);assert.equal(r.cryptographicallyVerified,false);});
