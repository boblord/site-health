// The docs and templates tell sites which tag to use. They must all name the tag
// for the current standards version, or people following them get an error.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { STANDARDS_VERSION } from '../src/rules.js';

const root = new URL('../', import.meta.url);
const files = [
  'README.md',
  ...readdirSync(new URL('docs/', root)).map((f) => `docs/${f}`),
  ...readdirSync(new URL('templates/', root)).map((f) => `templates/${f}`),
  '.github/workflows/site-check.yml',
];
const PATTERNS = [/site-health#v(\d+)/g, /site-check\.yml@v(\d+)/g, /site-health-ref[\s\S]{0,200}?default: v(\d+)/g];

test(`docs and templates name tag v${STANDARDS_VERSION}`, () => {
  let found = 0;
  for (const file of files) {
    const text = readFileSync(new URL(file, root), 'utf8');
    for (const re of PATTERNS) {
      for (const [match, n] of text.matchAll(re)) {
        found++;
        assert.equal(Number(n), STANDARDS_VERSION, `${file}: "${match.slice(0, 60)}" should name v${STANDARDS_VERSION}`);
      }
    }
  }
  assert.ok(found >= 4, 'expected to find the version in the README, docs, template and workflow');
});
