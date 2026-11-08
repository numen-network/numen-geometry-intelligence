import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openApiSpec} from '../src/api-docs.ts';
const root=new URL('../',import.meta.url);
const read=(path:string)=>readFileSync(new URL(path,root),'utf8');
test('product and API have consistent Numen Geometry Intelligence branding',()=>{
  assert.match(read('public/ai-lab.html'),/<title>Numen Geometry Intelligence<\/title>/);
  assert.match(read('public/index.html'),/Numen Geometry Intelligence/);
  assert.equal(openApiSpec().info.title,'Numen Geometry Intelligence API');
  assert.equal(JSON.parse(read('package.json')).name,'numen-geometry-intelligence');
});
test('semantic keywords are English-only',()=>{
  const src=read('src/intelligence.ts');
  assert.doesNotMatch(src,/pürüz|küre|yuvarlak|uzun|pürüzsüz/);
});
