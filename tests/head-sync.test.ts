import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Catalog} from '../src/catalog.ts';
import {Indexer,GraphQLClient} from '../src/indexer.ts';
test('live head catches up while historical cursor remains unchanged',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'numen-head-'));
 const catalog=new Catalog(join(dir,'test.sqlite'));
 try{
  catalog.put([{id:'old',block:{height:1}}]);catalog.set('next_offset','200');
  const offsets:number[]=[];
  const gql={request:async(_q:string,v:{offset:number})=>{offsets.push(v.offset);return {minedObjects:v.offset===0?[{id:'new3',block:{height:3}},{id:'new2',block:{height:2}}]:[{id:'old',block:{height:1}}]};}};
  const indexer=new Indexer(catalog,gql as unknown as GraphQLClient,2,1000000);
  await indexer.pollHead();indexer.stop();
  assert.deepEqual(offsets,[0,2]);assert.equal(catalog.list(10,0).items[0].id,'new3');
  assert.equal(catalog.get('next_offset'),'200');assert.equal(catalog.status().headLatestHeight,3);
 }finally{catalog.close();rmSync(dir,{recursive:true,force:true});}
});
