import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(name:string)=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
test('task navigation is delegated and includes Back to tasks',()=>{
 const script=read('simple-lab.js');
 assert.match(script,/document\.addEventListener\('click'/);
 assert.match(script,/function closeTask\(/);
 assert.match(script,/event\.target\.closest\?\.\('#taskClose'\)/);
 assert.match(script,/event\.target\.closest\?\.\('\[data-task\]'\)/);
});
test('surface overlay controls have feedback, validation and independent handlers',()=>{
 const script=read('comparison-lab.js');
 assert.match(script,/show\.addEventListener\('click'/);
 assert.match(script,/hide\.addEventListener\('click'/);
 assert.match(script,/Surface differences painted on the meshes/);
 assert.match(script,/Surface difference overlay hidden/);
 assert.match(script,/Invalid surface overlay coordinates/);
});
