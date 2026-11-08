import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Catalog} from '../src/catalog.ts';

test('v2 queue skips failures and resumes without losing existing features',()=>{
 const dir=mkdtempSync(join(tmpdir(),'numen-v2-'));
 const c=new Catalog(join(dir,'test.sqlite'));
 try{
  c.put([{id:'a',block:{height:3}},{id:'b',block:{height:2}},{id:'c',block:{height:1}}]);
  assert.deepEqual(c.unanalyzedV2(10),['a','b','c']);
  c.recordV2Failure('a','temporary upstream error');
  assert.deepEqual(c.unanalyzedV2(10),['b','c']);
  assert.equal(c.v2FailureStatus().retryCooldown,1);
  c.putFeaturesV2({id:'b',algorithm:'geometry-v2'});
  assert.deepEqual(c.unanalyzedV2(10),['c']);
  assert.equal(c.v2Count(),1);
  c.recordV2Failure('c','temporary error');
  assert.deepEqual(c.unanalyzedV2(10),[]);
  c.putFeaturesV2({id:'c',algorithm:'geometry-v2'});
  assert.equal(c.v2Count(),2);
  assert.equal(c.v2FailureStatus().failedObjects,1);
 }finally{c.close();rmSync(dir,{recursive:true,force:true});}
});
