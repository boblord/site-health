// Turns raw check results into a scored report: applies exceptions and rule
// levels, works out the overall result, and renders Markdown.

import { RULES_BY_ID, STANDARDS_VERSION, ruleUrl } from './rules.js';

const ICONS = { pass: '✅', warn: '⚠️', fail: '❌', error: '❓', skip: '➖', info: 'ℹ️', excepted: '🟦' };
const ORDER = ['fail', 'warn', 'error', 'excepted', 'info', 'skip', 'pass'];

/**
 * @param {Array<{id,status,message}>} raw
 * @param {Array<{rule, reason, until?}>} exceptions
 * @returns {{ results, summary, outcome }}
 */
export function score(raw, exceptions = [], now = new Date()) {
  const active = new Map();
  const notes = [];
  for (const ex of exceptions) {
    if (!RULES_BY_ID[ex.rule]) notes.push(`Exception for unknown rule ${ex.rule} ignored.`);
    else if (ex.until && new Date(ex.until) < now) notes.push(`Exception for ${ex.rule} expired on ${ex.until}.`);
    else active.set(ex.rule, ex);
  }
  const results = raw.map((r) => {
    const rule = RULES_BY_ID[r.id];
    let status = r.status;
    let message = r.message;
    // A recommended rule never fails the site; its failures are warnings.
    if (status === 'fail' && rule.level === 'recommended') status = 'warn';
    const ex = active.get(r.id);
    if (ex && (status === 'fail' || status === 'warn')) {
      message = `Excepted${ex.until ? ` until ${ex.until}` : ''}: ${ex.reason} (Finding: ${message})`;
      status = 'excepted';
    }
    return { ...r, status, message, title: rule.title, level: rule.level };
  });
  const count = (s) => results.filter((r) => r.status === s).length;
  const summary = { fail: count('fail'), warn: count('warn'), error: count('error'), pass: count('pass') };
  const outcome = summary.fail ? 'fail' : summary.warn || summary.error ? 'warn' : 'pass';
  return { results, summary, outcome, notes, standards: STANDARDS_VERSION };
}

export function headline({ summary, outcome }) {
  if (outcome === 'pass') return '✅ Meets the standards';
  const parts = [];
  if (summary.fail) parts.push(`❌ ${summary.fail} required check${summary.fail > 1 ? 's' : ''} failing`);
  if (summary.warn) parts.push(`⚠️ ${summary.warn} warning${summary.warn > 1 ? 's' : ''}`);
  if (summary.error) parts.push(`❓ ${summary.error} could not be checked`);
  return parts.join(', ');
}

const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** Renders one report (a site or a repository) as Markdown. */
export function toMarkdown(name, scored, { checkedAt = new Date() } = {}) {
  const rows = [...scored.results].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  const attention = rows.filter((r) => !['pass', 'skip', 'info'].includes(r.status));
  const quiet = rows.filter((r) => ['pass', 'skip', 'info'].includes(r.status));
  const table = (list) =>
    [
      '| Rule | Result | Details |',
      '| --- | --- | --- |',
      ...list.map((r) => `| [${r.id}](${ruleUrl(r.id)}) ${cell(r.title)} | ${ICONS[r.status]} ${r.status} | ${cell(r.message)} |`),
    ].join('\n');
  const lines = [
    `### ${name}`,
    '',
    `**${headline(scored)}** · standards v${scored.standards} · checked ${checkedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    '',
  ];
  if (attention.length) lines.push(table(attention), '');
  if (quiet.length) lines.push('<details><summary>Passing and informational checks</summary>', '', table(quiet), '', '</details>', '');
  for (const n of scored.notes) lines.push(`> ${n}`);
  return lines.join('\n');
}

/** The rule ids currently needing attention, used to tell whether anything changed. */
export function attentionIds(scored) {
  return scored.results.filter((r) => ['fail', 'warn'].includes(r.status)).map((r) => r.id).sort();
}
