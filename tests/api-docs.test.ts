import test from 'node:test';
import assert from 'node:assert/strict';
import { openApiSpec, llmsText } from '../src/api-docs.ts';
test('OpenAPI version, schema and relative URL',()=>{
 const spec=openApiSpec();
 assert.equal(spec.info.version,'0.54.0');
 assert.equal(spec.servers[0].url,'/');
 assert.ok((spec.paths['/api/v1/mined'].get.responses['200'].content['application/json'].schema as {$ref:string}).$ref);
 assert.ok(spec.components.schemas.MinedPage.properties.sync);
 assert.ok(spec.paths['/api/v1/mined'].get.parameters.some(p=>p.name==='q'));
});
test('Public base URL is opt-in and normalized',()=>{
 assert.equal(openApiSpec('https://geometry.numen-network.org/').servers[0].url,'https://geometry.numen-network.org');
 assert.match(llmsText('https://geometry.numen-network.org/'),/https:\/\/geometry.numen-network.org\/openapi.json/);
 assert.doesNotMatch(llmsText(),/127\.0\.0\.1/);
});
