import test from 'node:test';
import assert from 'node:assert/strict';
import {registerSurfaces} from '../src/registration.ts';
import type {Mesh} from '../src/geometry.ts';
const mesh=(points:number[]):Mesh=>({id:'fixture',protocol:'test',vertexCount:points.length/3,faceCount:0,vertices:new Float64Array(points),faces:new Uint16Array()});
const pts=[0,0,0,1,0,0,0,2,0,0,0,3,2,1,1,1,3,2,3,2,1,2,4,3,1,2,4,4,0,1,3,3,5,1,5,4];
test('registration of same mesh is near zero',()=>{const r=registerSurfaces(mesh(pts),mesh(pts));assert.ok(r.distances.symmetricChamfer<1e-4);assert.ok(r.distances.approximateHausdorff<1e-3);});
test('registration is invariant to translation and uniform scale',()=>{const moved=pts.map((v,i)=>v*2.5+[10,-7,3][i%3]);const r=registerSurfaces(mesh(pts),mesh(moved));assert.ok(r.distances.symmetricChamfer<1e-3);});
test('registration reports nonzero difference for distorted mesh',()=>{const moved=[...pts];moved[0]+=3;moved[1]-=1;const r=registerSurfaces(mesh(pts),mesh(moved));assert.ok(r.distances.symmetricChamfer>.01);});
