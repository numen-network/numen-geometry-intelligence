import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html=readFileSync('public/ai-lab.html','utf8');
const js=readFileSync('public/comparison-lab.js','utf8');
test('overlay controls follow both 3D stages and precede compare action',()=>{
 const stages=html.indexOf('id="indexedStage"');
 const controls=html.indexOf('id="surfaceOverlayControls"');
 const compare=html.indexOf('id="previewCompare"');
 assert.ok(stages>=0 && controls>stages && compare>controls);
});
test('overlay buttons render in dedicated controls instead of results',()=>{
 assert.match(js,/controls\.append\(show,document\.createTextNode\(' '\),hide,feedback\)/);
 assert.doesNotMatch(js,/section\.append\(show,document\.createTextNode\(' '\),hide,feedback\)/);
});
