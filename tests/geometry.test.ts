import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { reconstruct, meshInfo, exportMesh } from '../src/geometry.ts';
const sample=JSON.parse(readFileSync(new URL('../fixtures/poscan-sample.json',import.meta.url),'utf8'));
const obj=sample.data.minedObjectById, topo=sample.data.meshTopologyById;
test('reconstruct real GraphQL sample',()=>{
  const mesh=reconstruct(obj,topo); const info=meshInfo(mesh);
  assert.equal(mesh.vertexCount,2562); assert.equal(mesh.faceCount,5120); assert.equal(info.watertight,true);
  assert.equal(mesh.faces.length,15360); assert.equal(mesh.vertices.length,7686);
});
test('export OBJ STL GLB with valid structural headers',()=>{
  const mesh=reconstruct(obj,topo);
  const objOut=exportMesh(mesh,'obj'); assert.match(objOut.toString('utf8'),/^# Numen PoScan/);
  assert.equal((objOut.toString().match(/^v /gm)||[]).length,2562);
  const stl=exportMesh(mesh,'stl'); assert.equal(stl.length,84+5120*50); assert.equal(stl.readUInt32LE(80),5120);
  const glb=exportMesh(mesh,'glb'); assert.equal(glb.readUInt32LE(0),0x46546c67);
  assert.equal(glb.readUInt32LE(4),2); assert.equal(glb.readUInt32LE(8),glb.length);
  const jsonLength=glb.readUInt32LE(12);
  const json=JSON.parse(glb.subarray(20,20+jsonLength).toString('utf8'));
  assert.equal(json.accessors[0].count,2562); assert.equal(json.accessors[1].count,15360);
});

test('reconstruct when Explorer omits geometry counts',()=>{
  const o={...obj}; const t={...topo}; delete o.vertexCount; delete t.faceCount;
  const mesh=reconstruct(o,t); assert.equal(mesh.vertexCount,2562); assert.equal(mesh.faceCount,5120);
});
