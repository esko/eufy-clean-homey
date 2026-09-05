import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('widget command completion does not invoke gesture-only haptics',()=>{
  const source=readFileSync(new URL('../widgets/clean/public/widget.mts',import.meta.url),'utf8');
  assert.doesNotMatch(source,/hapticFeedback|shortHapticFeedback/);
});

test('buttons and selects suppress focus rings and mobile tap highlights',()=>{
  const css=readFileSync(new URL('../widgets/clean/public/style.css',import.meta.url),'utf8');
  assert.match(css,/button:focus,[\s\S]*?select:focus-visible\s*\{\s*outline: none !important;\s*box-shadow: none !important;/);
  assert.match(css,/-webkit-tap-highlight-color: transparent/);
  assert.doesNotMatch(css,/outline: 3px solid/);
});
