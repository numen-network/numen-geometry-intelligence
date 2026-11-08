import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Catalog} from '../src/catalog.ts';
import {Indexer,GraphQLClient} from '../src/indexer.ts';
test('indexer continues after short page, reaches empty page, then rescans newest to oldest',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'numen-index-'));
 const catalog=new Catalog(join(dir,'catalog.sqlite'));
 const offsets:number[]=[];
 const pages:Record<number,string[]>={0:['new','mid'],2:['old'],3:[]};
 const gql={request:async (_q:string,v:{offset:number})=>{offsets.push(v.offset);return {minedObjects:(pages[v.offset]??[]).map(id=>({id,block:{height:id==='new'?3:id==='mid'?2:1}}))};}};
 const indexer=new Indexer(catalog,gql as unknown as GraphQLClient,2,1000000);
 try{
  await indexer.tick();assert.equal(catalog.get('next_offset'),'2');
  await indexer.tick();assert.equal(catalog.get('next_offset'),'3');assert.equal(catalog.get('complete'),'0');
  await indexer.tick();assert.equal(catalog.get('complete'),'1');assert.equal(catalog.get('next_offset'),'0');
  await indexer.tick();assert.deepEqual(offsets,[0,2,3,0]);assert.equal(catalog.list(10,0).total,3);
 }finally{indexer.stop();catalog.close();rmSync(dir,{recursive:true,force:true});}
});
