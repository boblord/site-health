// Keeps one GitHub issue per site in step with its latest report: opens it when
// something needs attention, updates it each run, comments when the list of
// problems changes (so GitHub notifies the owner), and closes it when the site
// passes. Uses the workflow's GITHUB_TOKEN; needs `issues: write`.

import { attentionIds } from './report.js';

const LABEL = 'site-health';
const API = process.env.GITHUB_API_URL || 'https://api.github.com';
const MARKER = /<!-- site-health:ids=([^>]*) -->/;

async function gh(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 422) throw new Error(`GitHub API ${method} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

/**
 * @param {Array<{ name, scored, markdown }>} reports
 * @param {string} repo  owner/name where issues live (defaults to GITHUB_REPOSITORY)
 */
export async function syncIssues(reports, repo = process.env.GITHUB_REPOSITORY) {
  if (!process.env.GITHUB_TOKEN || !repo) throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY must be set.');
  await gh(`/repos/${repo}/labels`, {
    method: 'POST',
    body: { name: LABEL, color: '0e8a16', description: 'Automated site-health report' },
  }); // 422 if it already exists, which is fine

  const open = await gh(`/repos/${repo}/issues?labels=${LABEL}&state=open&per_page=100`);
  for (const { name, scored, markdown } of reports) {
    const title = `Site health: ${name}`;
    const existing = open.find((i) => i.title === title);
    const ids = attentionIds(scored);
    const body = `${markdown}\n\n<!-- site-health:ids=${ids.join(',')} -->\n_Updated automatically by site-health. Closes itself when every check passes._`;

    if (scored.outcome === 'pass') {
      if (existing) {
        await gh(`/repos/${repo}/issues/${existing.number}/comments`, { method: 'POST', body: { body: '✅ All checks pass now. Closing.' } });
        await gh(`/repos/${repo}/issues/${existing.number}`, { method: 'PATCH', body: { state: 'closed', state_reason: 'completed', body } });
      }
      console.log(`${name}: passes${existing ? `, closed #${existing.number}` : ''}.`);
      continue;
    }

    if (!existing) {
      const created = await gh(`/repos/${repo}/issues`, { method: 'POST', body: { title, body, labels: [LABEL] } });
      console.log(`${name}: opened #${created.number}.`);
      continue;
    }

    const before = MARKER.exec(existing.body || '')?.[1] || '';
    await gh(`/repos/${repo}/issues/${existing.number}`, { method: 'PATCH', body: { body } });
    if (before !== ids.join(',')) {
      const was = new Set(before.split(',').filter(Boolean));
      const now = new Set(ids);
      const added = ids.filter((id) => !was.has(id));
      const fixed = [...was].filter((id) => !now.has(id));
      const lines = [];
      if (added.length) lines.push(`New: ${added.join(', ')}`);
      if (fixed.length) lines.push(`Fixed: ${fixed.join(', ')}`);
      await gh(`/repos/${repo}/issues/${existing.number}/comments`, { method: 'POST', body: { body: `${lines.join('. ')}. See the updated report above.` } });
    }
    console.log(`${name}: updated #${existing.number}.`);
  }
}
