import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeObjectQuery,exactBlockMatches} from '../src/object-lookup.ts';
test('object lookup classifies IDs, blocks and wallet addresses',()=>{
 assert.equal(normalizeObjectQuery('0000481367-d4117').kind,'object');
 assert.deepEqual(normalizeObjectQuery('block-481367'),{kind:'block',query:'481367'});
 assert.equal(normalizeObjectQuery('481367').kind,'block');
 assert.equal(normalizeObjectQuery('0x'+'a'.repeat(40)).kind,'address');
});
test('block lookup only returns objects at the requested height',()=>{
 const items=[{id:'a',block:{height:481367}},{id:'b',block:{height:481366}}];
 assert.deepEqual(exactBlockMatches(items,481367).map(x=>x.id),['a']);
});
