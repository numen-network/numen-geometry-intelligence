import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../public/simple-lab.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/ai-lab.html',import.meta.url),'utf8');
test('explore task and its handlers are removed from AI Lab',()=>{
 assert.doesNotMatch(html,/data-task="explore"/);
 assert.doesNotMatch(js,/function renderExplore\(|function loadExplore\(|task==='explore'/);
});
test('remaining tasks and dedicated Explorer link are retained',()=>{
 for(const task of ['exact','similar','analyze','verify','compare'])assert.match(html,new RegExp('data-task="'+task+'"'));
 for(const task of ['explore','download','dataset'])assert.doesNotMatch(html,new RegExp('data-task="'+task+'"'));
 assert.match(html,/href="\/">Explorer<\/a>/);
});
