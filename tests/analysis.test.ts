import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFeatures, compareFeatures, meshFromGLB } from '../src/analysis.ts';
import { toGLB, type Mesh } from '../src/geometry.ts';
const mesh:Mesh={id:'tetra',protocol:'poscan',vertexCount:4,faceCount:4,vertices:new Float64Array([0,0,0,1,0,0,0,1,0,0,0,1]),faces:new Uint16Array([0,2,1,0,1,3,0,3,2,1,2,3])};
test('GLB can be reconstructed for deterministic analysis',()=>{const result=meshFromGLB('tetra',toGLB(mesh));assert.equal(result.vertexCount,4);assert.equal(result.faceCount,4);assert.equal(result.faces[5],3)});
test('features and self-comparison',()=>{const f=extractFeatures(mesh);assert.equal(f.watertight,true);assert.ok(Math.abs((f.volume??0)-1/6)<1e-8);assert.equal(f.descriptor.length,30);const c=compareFeatures(f,f);assert.equal(c.distance,0);assert.equal(c.similarityScore,1)});
test('radial descriptor ignores uniform scaling and translation',()=>{const other={...mesh,id:'moved',vertices:new Float64Array(Array.from(mesh.vertices,(x,i)=>x*3+[5,-2,7][i%3]))};const a=extractFeatures(mesh),b=extractFeatures(other);assert.ok(compareFeatures(a,b).distance<1e-10)});
