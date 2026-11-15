// Checks a site's source repository: dependency vulnerabilities, a committed
// lockfile, and automated dependency updates. Runs in the site's own CI.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const has = (dir, ...names) => names.some((n) => existsSync(join(dir, n)));

export function checkRepo(dir) {
  const results = [];
  const add = (id, status, message) => results.push({ id, status, message });

  if (!has(dir, 'package.json')) {
    for (const id of ['DEP-1', 'DEP-2']) add(id, 'skip', 'No package.json; not a Node project.');
  } else {
    const npmLock = has(dir, 'package-lock.json', 'npm-shrinkwrap.json');
    const otherLock = has(dir, 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb');
    add('DEP-2', npmLock || otherLock ? 'pass' : 'fail', npmLock || otherLock ? 'Lockfile committed.' : 'No lockfile is committed.');

    if (!npmLock) {
      add('DEP-1', 'skip', otherLock ? 'Not an npm lockfile; run your package manager\'s audit.' : 'No lockfile to audit.');
    } else {
      add('DEP-1', ...npmAudit(dir));
    }
  }

  const updates = has(dir, '.github/dependabot.yml', '.github/dependabot.yaml', 'renovate.json', '.github/renovate.json');
  add(
    'DEP-3',
    updates ? 'pass' : 'fail',
    updates ? 'Dependabot or Renovate is configured.' : 'No .github/dependabot.yml (or Renovate config).',
  );
  return results;
}

/** Runs npm audit against the lockfile (no install needed). */
function npmAudit(dir) {
  let out;
  try {
    out = execFileSync('npm', ['audit', '--json', '--package-lock-only'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    // npm audit exits non-zero when it finds vulnerabilities; the JSON is still on stdout.
    out = err.stdout;
    if (!out) return ['error', `npm audit failed: ${err.message.split('\n')[0]}`];
  }
  let report;
  try {
    report = JSON.parse(out);
  } catch {
    return ['error', 'npm audit did not return JSON.'];
  }
  const counts = report.metadata?.vulnerabilities || {};
  const severe = (counts.high || 0) + (counts.critical || 0);
  const names = Object.entries(report.vulnerabilities || {})
    .filter(([, v]) => ['high', 'critical'].includes(v.severity))
    .map(([name]) => name);
  const summary = ['critical', 'high', 'moderate', 'low'].filter((s) => counts[s]).map((s) => `${counts[s]} ${s}`).join(', ');
  if (severe) return ['fail', `${summary} (high or critical in ${names.join(', ')}). Run npm audit fix or update the packages.`];
  if (counts.moderate) return ['warn', `${summary}.`];
  return ['pass', summary ? `${summary}.` : 'No known vulnerabilities.'];
}
