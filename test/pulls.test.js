import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { checkPulls, repoFor } from '../src/pulls.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const respond = (status, body = []) => { globalThis.fetch = async () => new Response(JSON.stringify(body), { status }); };

test('repoFor reads sites.yml first, then SITE_HEALTH_REPOS', () => {
  assert.equal(repoFor({ url: 'https://example.org', repo: 'o/a' }, {}), 'o/a');
  assert.equal(repoFor({ url: 'https://www.example.org/' }, { SITE_HEALTH_REPOS: '{"www.example.org":"o/b"}' }), 'o/b');
  assert.equal(repoFor({ url: 'https://example.org' }, { SITE_HEALTH_REPOS: '{"other.example":"o/b"}' }), null);
  assert.equal(repoFor({ url: 'https://example.org' }, {}), null);
  assert.throws(() => repoFor({ url: 'https://example.org' }, { SITE_HEALTH_REPOS: 'nope' }), /not valid JSON/);
});

test('checkPulls judges the open pull requests', async () => {
  respond(200, [{ created_at: '2026-10-01T00:00:00Z' }]);
  const r = await checkPulls('o/a', { now: new Date('2026-11-15T00:00:00Z'), env: { GITHUB_TOKEN: 't' } });
  assert.equal(r.id, 'UPKEEP-1');
  assert.equal(r.status, 'fail');
});

test('checkPulls skips without access unless a dedicated token was given', async () => {
  respond(404, { message: 'Not Found' });
  const plain = await checkPulls('o/private', { env: { GITHUB_TOKEN: 't' } });
  assert.equal(plain.status, 'skip');
  const dedicated = await checkPulls('o/private', { env: { SITE_HEALTH_PULLS_TOKEN: 't' } });
  assert.equal(dedicated.status, 'error');
  assert.doesNotMatch(plain.message + dedicated.message, /o\/private/, 'messages never name the repository');
});
