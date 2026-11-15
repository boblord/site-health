#!/usr/bin/env node
// site-health command line.
//
//   site-health check <url>   [--repo owner/name] [--exceptions file.yml] [--md out.md] [--json out.json] [--sample N] [--skip IDS] [--enforce] [--issue]
//   site-health run           [--config sites.yml] [--md out.md] [--json out.json] [--sample N] [--skip IDS] [--issues]
//   site-health repo [dir]    [--md out.md] [--json out.json] [--enforce]
//
// --enforce   exit 1 when a required check fails (for blocking pull requests)
// --issue(s)  open, update, or close a GitHub issue per site (needs GITHUB_TOKEN)
// --repo      also run the upkeep checks on the site's repository (UPKEEP-1 to UPKEEP-3);
//             `run` reads `repo` from sites.yml or SITE_HEALTH_REPOS

import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import YAML from 'yaml';
import { checkLive } from '../src/live.js';
import { checkRepo } from '../src/repo.js';
import { score, toMarkdown, headline } from '../src/report.js';
import { syncIssues } from '../src/issues.js';
import { checkUpkeep, repoFor } from '../src/upkeep.js';

const { positionals, values: opt } = parseArgs({
  allowPositionals: true,
  options: {
    config: { type: 'string', default: 'sites.yml' },
    exceptions: { type: 'string' },
    repo: { type: 'string' },
    md: { type: 'string' },
    json: { type: 'string' },
    sample: { type: 'string', default: '100' },
    skip: { type: 'string', default: '' },
    enforce: { type: 'boolean', default: false },
    issue: { type: 'boolean', default: false },
    issues: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const [command, target] = positionals;
const skip = opt.skip.split(',').map((s) => s.trim()).filter(Boolean);
const sample = Math.max(1, Number(opt.sample) || 100);

function usage(code) {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 12).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(code);
}

function loadYaml(file) {
  return YAML.parse(readFileSync(file, 'utf8')) ?? {};
}

function output(reports) {
  const markdown = reports.map((r) => r.markdown).join('\n\n');
  console.log(markdown);
  if (opt.md) writeFileSync(opt.md, markdown + '\n');
  if (opt.json) writeFileSync(opt.json, JSON.stringify(reports.map(({ name, scored }) => ({ name, ...scored })), null, 2) + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');
}

async function liveReport(url, exceptions, repo) {
  const raw = await checkLive(url, { sample, skip });
  if (repo) raw.push(...(await checkUpkeep(repo, { skip })));
  const scored = score(raw, exceptions);
  const name = new URL(url).hostname;
  return { name, scored, markdown: toMarkdown(name, scored) };
}

async function main() {
  if (opt.help || !command) usage(opt.help ? 0 : 1);

  if (command === 'check') {
    if (!target) usage(1);
    const exceptions = opt.exceptions ? loadYaml(opt.exceptions).exceptions ?? [] : [];
    const report = await liveReport(target, exceptions, opt.repo);
    output([report]);
    if (opt.issue) await syncIssues([report]);
    process.exit(opt.enforce && report.scored.outcome === 'fail' ? 1 : 0);
  }

  if (command === 'run') {
    const config = loadYaml(opt.config);
    const reports = [];
    for (const site of config.sites ?? []) {
      console.error(`Checking ${site.url} ...`);
      reports.push(await liveReport(site.url, site.exceptions ?? [], repoFor(site)));
    }
    output(reports);
    if (opt.issues) await syncIssues(reports);
    console.error(reports.map((r) => `${r.name}: ${headline(r.scored)}`).join('\n'));
    return;
  }

  if (command === 'repo') {
    const dir = target || '.';
    const scored = score(checkRepo(dir));
    const report = { name: `Repository checks (${dir === '.' ? 'this repo' : dir})`, scored };
    report.markdown = toMarkdown(report.name, scored);
    output([report]);
    process.exit(opt.enforce && scored.outcome === 'fail' ? 1 : 0);
  }

  usage(1);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(2);
});
