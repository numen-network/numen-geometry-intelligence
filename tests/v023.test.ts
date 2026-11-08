import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Catalog} from '../src/catalog.ts';
import {openApiSpec} from '../src/api-docs.ts';
import {tools} from '../src/mcp.ts';
test('v2 descriptors survive catalog restart without overwriting radial-v1',()=>{
 const dir=mkdtempSync(join(tmpdir(),'numen-v2-'));const db=join(dir,'catalog.db');
 try{let c=new Catalog(db);c.put([{id:'test-1',block:{height:1}}]);c.putFeatures({id:'test-1',algorithm:'radial-v1'});c.putFeaturesV2({id:'test-1',algorithm:'geometry-v2'});assert.equal(c.v2Count(),1);assert.equal(c.featureCount('radial-v1'),1);c.close();c=new Catalog(db);assert.equal(c.v2Count(),1);assert.equal(c.unanalyzedV2().length,0);assert.equal(c.v2Candidates().length,1);c.close();}finally{rmSync(dir,{recursive:true,force:true});}
});
test('OpenAPI documents new v2 and batch endpoints',()=>{const spec=openApiSpec();for(const path of ['/api/v1/search/by-model/v2','/api/v1/objects/batch','/api/v1/analysis/v2/status','/api/v1/metrics'])assert.ok(path in spec.paths);});
test('MCP exposes batch and v2 index status',()=>{assert.ok(tools.some(x=>x.name==='get_batch'));assert.ok(tools.some(x=>x.name==='get_v2_analysis_status'));});
