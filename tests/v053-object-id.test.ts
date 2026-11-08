import test from 'node:test';
import assert from 'node:assert/strict';
import {Catalog} from '../src/catalog.ts';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('full blockchain object IDs are searchable only when explicitly mapped',()=>{
 const dir=mkdtempSync(join(tmpdir(),'numen-v053-'));const db=new Catalog(join(dir,'catalog.sqlite'));
 const full='0x'+'a'.repeat(64);db.put([{id:'0000481813-6ec55',blockchainObjectId:full,block:{height:481813}}]);
 assert.equal(db.resolveId(full.toUpperCase().replace('0X','0x')),'0000481813-6ec55');
 assert.equal(db.list(10,0,full).total,1);
 assert.equal(db.resolveId('0x'+'b'.repeat(64)),null);
 db.close();rmSync(dir,{recursive:true,force:true});
});
