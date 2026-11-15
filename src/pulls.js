// UPKEEP-1: checks how long a site's repository has left pull requests open. Optional:
// it runs only when a repository is named for the site, so the checker still works
// with no configuration or credentials.
//
// Token: SITE_HEALTH_PULLS_TOKEN (read-only access to pull requests, needed for a
// private repository checked from elsewhere), otherwise GITHUB_TOKEN (enough for a
// public repository, or a repository checking itself).

import { judgeOpenPulls } from './analyze.js';

const API = process.env.GITHUB_API_URL || 'https://api.github.com';

/** Finds the repository for a site: its `repo` in sites.yml, else SITE_HEALTH_REPOS ({"host": "owner/name"}). */
export function repoFor(site, env = process.env) {
  if (site.repo) return site.repo;
  if (!env.SITE_HEALTH_REPOS) return null;
  let map;
  try {
    map = JSON.parse(env.SITE_HEALTH_REPOS);
  } catch {
    throw new Error('SITE_HEALTH_REPOS is not valid JSON.');
  }
  return map[new URL(site.url).hostname] ?? null;
}

/**
 * @param {string} repo  owner/name
 * @returns {Promise<{ id, status, message }>}
 */
export async function checkPulls(repo, { now = new Date(), env = process.env } = {}) {
  const id = 'UPKEEP-1';
  const dedicated = env.SITE_HEALTH_PULLS_TOKEN;
  const token = dedicated || env.GITHUB_TOKEN;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { id, status: 'error', message: 'The repository must be written as owner/name.' };
  const headers = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'site-health-checker/1' };
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const pulls = [];
    for (let page = 1; page <= 10; page++) {
      const res = await fetch(`${API}/repos/${repo}/pulls?state=open&per_page=100&page=${page}`, { headers });
      if (!res.ok) {
        // Without the dedicated token, a repository the workflow cannot read is
        // treated as not configured rather than broken. Messages never name the
        // repository, since reports may be public.
        const why = `GitHub answered ${res.status} when listing the repository's pull requests`;
        if (!dedicated && [401, 403, 404].includes(res.status)) {
          return { id, status: 'skip', message: `${why}. Give the token read access to pull requests to check this rule.` };
        }
        return { id, status: 'error', message: `${why}. Check that the token can read this repository's pull requests.` };
      }
      const batch = await res.json();
      pulls.push(...batch);
      if (batch.length < 100) break;
    }
    return { id, ...judgeOpenPulls(pulls, now) };
  } catch (err) {
    return { id, status: 'error', message: `The check failed to run: ${err.message}` };
  }
}
