import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/ai-lab.html',import.meta.url),'utf8');
const lab=readFileSync(new URL('../public/simple-lab.js',import.meta.url),'utf8');
const compare=readFileSync(new URL('../public/comparison-lab.js',import.meta.url),'utf8');
test('comparison is not numbered and accepts two indexed object IDs',()=>{
 assert.ok(!html.includes('6 · Side-by-side'));
 assert.ok(html.includes('id="previewFirstId"'));
 assert.ok(html.includes('id="previewId"'));
});
test('one compare workspace contains the viewer',()=>{
 assert.ok(lab.includes("viewer.classList.add('compare-panel-integrated')"));
 assert.ok(compare.includes("'/api/v1/geometry/advanced-compare'"));
 assert.ok(compare.includes("'/api/v1/geometry/advanced-analyze'"));
});
test('selected uploaded mesh is compared directly rather than via ranked candidates',()=>{
 assert.ok(compare.includes('modelPayload(file,a)'));
 assert.ok(compare.includes('modelPayload(null,b)'));
 assert.ok(!compare.includes('top 50 candidates'));
 assert.ok(compare.includes('not an exact mesh identity test'));
});
