import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Catalog} from '../src/catalog.ts';
test('SQLite catalog persists and sorts newest block first',()=>{
 const dir=mkdtempSync(join(tmpdir(),'numen-cat-'));
 try{
  let c=new Catalog(join(dir,'index.sqlite'));
  c.put([{id:'old',block:{height:1}},{id:'new',block:{height:50}},{id:'mid',block:{height:10}}]);
  assert.deepEqual(c.list(2,0).items.map((x:any)=>x.id),['new','mid']);
  c.set('next_offset','24');c.close();
  c=new Catalog(join(dir,'index.sqlite'));
  assert.equal(c.get('next_offset'),'24');assert.equal(c.list(10,0).total,3);
  c.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
