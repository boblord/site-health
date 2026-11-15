// Upkeep checks on a site's GitHub repository (UPKEEP-1 to UPKEEP-3). Optional: they run
// only when a repository is named for the site, so the checker still works with no
// configuration or credentials. Messages never name the repository, its branches or its
// pull requests, because reports can be public while the repository is private.
//
// Token: SITE_HEALTH_PULLS_TOKEN (a fine-grained token, needed for a private repository
// checked from elsewhere), otherwise GITHUB_TOKEN (enough for a public repository, or a
// repository checking itself). Each rule needs one read-only permission:
//   UPKEEP-1 Pull requests   UPKEEP-2 Actions   UPKEEP-3 Contents

import { judgeOpenPulls, judgeDependabotRuns, judgeStaleBranches } from './analyze.js';

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

class ApiError extends Error {
  constructor(status) {
    super(`GitHub answered ${status}`);
    this.status = status;
  }
}

function client(env) {
  const dedicated = Boolean(env.SITE_HEALTH_PULLS_TOKEN);
  const token = env.SITE_HEALTH_PULLS_TOKEN || env.GITHUB_TOKEN;
  const headers = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'site-health-checker/1' };
  if (token) headers.authorization = `Bearer ${token}`;
  const get = async (path) => {
    const res = await fetch(`${API}${path}`, { headers });
    if (!res.ok) throw new ApiError(res.status);
    return res.json();
  };
  // Lists every page of a list endpoint (at most 1,000 items). `pick` extracts the
  // array when the endpoint wraps it in an object.
  const list = async (path, pick = (x) => x) => {
    const out = [];
    for (let page = 1; page <= 10; page++) {
      const batch = pick(await get(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`));
      out.push(...batch);
      if (batch.length < 100) break;
    }
    return out;
  };
  return { dedicated, get, list };
}

// Turns an API failure into a result. A permission the token lacks is a skip, so an
// owner can choose which upkeep rules to grant. A repository the dedicated token cannot
// see at all is an error, because that token was set up for it.
function failure(id, err, { dedicated, what, permission }) {
  if (!(err instanceof ApiError)) return { id, status: 'error', message: `The check failed to run: ${err.message}` };
  const why = `${err.message} when reading the repository's ${what}`;
  if (err.status === 403 || (!dedicated && [401, 404].includes(err.status))) {
    return { id, status: 'skip', message: `${why}. Give the token read-only "${permission}" access to check this rule.` };
  }
  return { id, status: 'error', message: `${why}. Check that the token can read this repository.` };
}

/**
 * @param {string} repo  owner/name
 * @param {{ now?: Date, env?: object, skip?: string[] }} options
 * @returns {Promise<Array<{ id, status, message }>>}
 */
export async function checkUpkeep(repo, { now = new Date(), env = process.env, skip = [] } = {}) {
  const ids = ['UPKEEP-1', 'UPKEEP-2', 'UPKEEP-3'];
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    return ids.map((id) => ({ id, status: 'error', message: 'The repository must be written as owner/name.' }));
  }
  const gh = client(env);
  const run = async (id, what, permission, fn) => {
    if (skip.includes(id)) return { id, status: 'skip', message: 'Skipped by request.' };
    try {
      return { id, ...(await fn()) };
    } catch (err) {
      return failure(id, err, { dedicated: gh.dedicated, what, permission });
    }
  };

  let openPulls = null;
  const results = [];
  results.push(await run('UPKEEP-1', 'pull requests', 'Pull requests', async () => {
    openPulls = await gh.list(`/repos/${repo}/pulls?state=open`);
    return judgeOpenPulls(openPulls, now);
  }));

  results.push(await run('UPKEEP-2', 'Actions runs', 'Actions', async () => {
    const runs = (await gh.list(`/repos/${repo}/actions/runs?event=dynamic`, (x) => x.workflow_runs))
      .filter((r) => r.path === 'dynamic/dependabot/dependabot-updates');
    return judgeDependabotRuns(runs, now);
  }));

  results.push(await run('UPKEEP-3', 'branches', 'Contents', async () => {
    const { default_branch } = await gh.get(`/repos/${repo}`);
    // Branches with an open pull request are UPKEEP-1's concern. Without pull request
    // access, every branch is judged on its own.
    const withPull = new Set((openPulls ?? []).filter((p) => p.head?.repo?.full_name === repo).map((p) => p.head.ref));
    const branches = (await gh.list(`/repos/${repo}/branches`)).filter((b) => b.name !== default_branch && !withPull.has(b.name));
    const dates = [];
    for (const b of branches) {
      const commit = await gh.get(`/repos/${repo}/commits/${b.commit.sha}`);
      dates.push(commit.commit.committer?.date ?? commit.commit.author?.date);
    }
    return judgeStaleBranches(dates, now);
  }));
  return results;
}
