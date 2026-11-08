import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const script=readFileSync(new URL('../public/comparison-lab.js',import.meta.url),'utf8');
test('overlay paints actual mesh vertices rather than sparse point sprites',()=>{
 assert.match(script,/geometry\.setAttribute\('color'/);
 assert.match(script,/vertexColors:true/);
 assert.match(script,/inverseObject\.clone\(\)\.multiply\(mesh\.matrixWorld\)/);
 assert.doesNotMatch(script,/new THREE\.Points\(/);
});
test('overlay is restored without destroying original mesh geometry',()=>{
 assert.match(script,/item\.mesh\.geometry=item\.originalGeometry/);
 assert.match(script,/item\.mesh\.material=item\.originalMaterial/);
 assert.match(script,/removeHeatmap\(\);for\(const f of active/);
});
