import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/simple-lab.js', import.meta.url), 'utf8');
test('task navigation parks comparison panel before clearing taskExtra', () => {
  assert.match(source, /function open\(task\)\{parkComparisonViewer\(\);current=task;/);
  assert.match(source, /function closeTask\(\)\{\s*parkComparisonViewer\(\);/);
  assert.match(source, /parking\.append\(viewer\)/);
  assert.doesNotMatch(source, /\$\('#advancedTools \.legacy-content'\)\.append\(viewer\)/);
});
