import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RULES } from '../src/rules.js';
import { score } from '../src/report.js';

const standards = readFileSync(new URL('../STANDARDS.md', import.meta.url), 'utf8');

test('every rule has a section in STANDARDS.md', () => {
  for (const rule of RULES) {
    assert.match(standards, new RegExp(`^### ${rule.id}\\b`, 'm'), `${rule.id} has no "### ${rule.id}" heading`);
  }
});

test('STANDARDS.md has no rule missing from rules.js', () => {
  const ids = new Set(RULES.map((r) => r.id));
  for (const [, id] of standards.matchAll(/^### ([A-Z0-9]+-\d+)\b/gm)) assert.ok(ids.has(id), `${id} is not in rules.js`);
});

test('recommended failures become warnings; exceptions apply until they expire', () => {
  const raw = [
    { id: 'DNS-3', status: 'fail', message: 'no CAA' },
    { id: 'HDR-1', status: 'fail', message: 'no HSTS' },
    { id: 'SEC-1', status: 'fail', message: 'missing' },
  ];
  const now = new Date('2026-06-01');
  const scored = score(raw, [
    { rule: 'HDR-1', reason: 'host cannot set headers' },
    { rule: 'SEC-1', reason: 'old', until: '2026-01-01' },
  ], now);
  const by = Object.fromEntries(scored.results.map((r) => [r.id, r.status]));
  assert.deepEqual(by, { 'DNS-3': 'warn', 'HDR-1': 'excepted', 'SEC-1': 'fail' });
  assert.equal(scored.outcome, 'fail');
  assert.match(scored.notes[0], /expired/);
});
