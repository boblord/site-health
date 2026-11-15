import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { checkUpkeep, repoFor } from '../src/upkeep.js';

const NOW = new Date('2026-11-15T00:00:00Z');
const daysAgo = (d) => new Date(NOW - d * 86_400_000).toISOString();
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

// Answers GitHub API requests from a table of path prefix -> [status, body].
function serve(routes) {
  globalThis.fetch = async (url) => {
    const path = new URL(url).pathname;
    const key = Object.keys(routes).sort((a, b) => b.length - a.length).find((k) => path.startsWith(k));
    const [status, body] = key ? routes[key] : [404, { message: 'Not Found' }];
    return new Response(JSON.stringify(body), { status });
  };
}
const byId = (results) => Object.fromEntries(results.map((r) => [r.id, r]));
const healthy = {
  '/repos/o/a/pulls': [200, [{ created_at: daysAgo(2), head: { ref: 'feature', repo: { full_name: 'o/a' } } }]],
  '/repos/o/a/actions/runs': [200, { workflow_runs: [
    { name: 'npm_and_yarn in /. - Update #2', path: 'dynamic/dependabot/dependabot-updates', status: 'completed', conclusion: 'success', created_at: daysAgo(3) },
    { name: 'github_actions in /. - Update #3', path: 'dynamic/dependabot/dependabot-updates', status: 'completed', conclusion: 'success', created_at: daysAgo(3) },
    { name: 'Push on main', path: 'dynamic/github-code-scanning/codeql', status: 'completed', conclusion: 'failure', created_at: daysAgo(1) },
  ] }],
  '/repos/o/a/branches': [200, [{ name: 'main', commit: { sha: 'm' } }, { name: 'feature', commit: { sha: 'f' } }, { name: 'old', commit: { sha: 'x' } }]],
  '/repos/o/a/commits/x': [200, { commit: { committer: { date: daysAgo(10) } } }],
  '/repos/o/a': [200, { default_branch: 'main' }],
};

test('repoFor reads sites.yml first, then SITE_HEALTH_REPOS', () => {
  assert.equal(repoFor({ url: 'https://example.org', repo: 'o/a' }, {}), 'o/a');
  assert.equal(repoFor({ url: 'https://www.example.org/' }, { SITE_HEALTH_REPOS: '{"www.example.org":"o/b"}' }), 'o/b');
  assert.equal(repoFor({ url: 'https://example.org' }, { SITE_HEALTH_REPOS: '{"other.example":"o/b"}' }), null);
  assert.equal(repoFor({ url: 'https://example.org' }, {}), null);
  assert.throws(() => repoFor({ url: 'https://example.org' }, { SITE_HEALTH_REPOS: 'nope' }), /not valid JSON/);
});

test('a healthy repository passes all three; other workflows and branches with pull requests are ignored', async () => {
  serve(healthy);
  const r = byId(await checkUpkeep('o/a', { now: NOW, env: { SITE_HEALTH_PULLS_TOKEN: 't' } }));
  assert.deepEqual([r['UPKEEP-1'].status, r['UPKEEP-2'].status, r['UPKEEP-3'].status], ['pass', 'pass', 'pass']);
  assert.match(r['UPKEEP-2'].message, /npm_and_yarn, github_actions/);
  assert.match(r['UPKEEP-3'].message, /^1 branch without an open pull request/);
});

test('a missing permission skips only that rule', async () => {
  serve({ ...healthy, '/repos/o/a/actions/runs': [403, { message: 'Resource not accessible by personal access token' }], '/repos/o/a/branches': [403, {}] });
  const r = byId(await checkUpkeep('o/a', { now: NOW, env: { SITE_HEALTH_PULLS_TOKEN: 't' } }));
  assert.equal(r['UPKEEP-1'].status, 'pass');
  assert.equal(r['UPKEEP-2'].status, 'skip');
  assert.match(r['UPKEEP-2'].message, /"Actions"/);
  assert.equal(r['UPKEEP-3'].status, 'skip');
  assert.match(r['UPKEEP-3'].message, /"Contents"/);
});

test('an unreachable repository: skipped with the workflow token, an error with the dedicated one, and never named', async () => {
  serve({});
  const plain = await checkUpkeep('o/private', { env: { GITHUB_TOKEN: 't' } });
  assert.ok(plain.every((r) => r.status === 'skip'));
  const dedicated = await checkUpkeep('o/private', { env: { SITE_HEALTH_PULLS_TOKEN: 't' } });
  assert.ok(dedicated.every((r) => r.status === 'error'));
  assert.doesNotMatch(JSON.stringify([plain, dedicated]), /o\/private/);
});

test('--skip leaves a rule out', async () => {
  serve(healthy);
  const r = byId(await checkUpkeep('o/a', { now: NOW, env: { GITHUB_TOKEN: 't' }, skip: ['UPKEEP-3'] }));
  assert.equal(r['UPKEEP-3'].status, 'skip');
});
