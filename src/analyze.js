// Pure functions that judge headers, records, and documents. No network access,
// so each can be unit tested. Each returns { status, message } where status is
// 'pass', 'warn', or 'fail'.

const pass = (message) => ({ status: 'pass', message });
const warn = (message) => ({ status: 'warn', message });
const fail = (message) => ({ status: 'fail', message });

const ONE_YEAR = 31_536_000;
const DAY_MS = 86_400_000;

const ONE_WEEK = 604_800;

// HSTS ramp-up (standards version 2). Until this date, sites start with a
// one-week max-age and leave out includeSubDomains, so a mistake can only lock
// visitors to HTTPS for a week. From this date, one year is required again.
export const HSTS_RAMP_END = new Date('2026-12-15T00:00:00Z');

export function judgeHsts(value, now = new Date()) {
  if (!value) return fail('No Strict-Transport-Security header.');
  const maxAge = Number(/max-age\s*=\s*"?(\d+)/i.exec(value)?.[1] ?? NaN);
  if (!Number.isFinite(maxAge)) return fail(`Strict-Transport-Security has no max-age: "${value}".`);
  const sub = /includesubdomains/i.test(value);
  const rampEnd = HSTS_RAMP_END.toISOString().slice(0, 10);
  if (now < HSTS_RAMP_END) {
    if (maxAge < ONE_WEEK) return fail(`max-age is ${maxAge} seconds; it should be at least ${ONE_WEEK} (one week) during the ramp-up.`);
    if (sub) return warn(`max-age ${maxAge}. Leave out includeSubDomains during the ramp-up, which ends ${rampEnd}.`);
    const note = maxAge < ONE_YEAR ? ` Raise to ${ONE_YEAR} (one year) by ${rampEnd}.` : '';
    return pass(`max-age ${maxAge}.${note}`);
  }
  if (maxAge < ONE_YEAR) return fail(`max-age is ${maxAge} seconds; it should be at least ${ONE_YEAR} (one year). The ramp-up ended ${rampEnd}.`);
  return pass(`max-age ${maxAge}${sub ? ', includes subdomains' : ''}.`);
}

/** Parses a CSP header into { directive: [sources] }. First occurrence wins, as in browsers. */
export function parseCsp(value) {
  const policy = {};
  for (const part of (value || '').split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name && !(name.toLowerCase() in policy)) policy[name.toLowerCase()] = sources;
  }
  return policy;
}

export function judgeCsp(value) {
  if (!value) return fail('No Content-Security-Policy header.');
  const csp = parseCsp(value);
  const scripts = csp['script-src'] ?? csp['default-src'];
  if (!scripts) return fail('The policy sets neither script-src nor default-src, so scripts are unrestricted.');
  const lower = scripts.map((s) => s.toLowerCase());
  const usesNonceOrHash = lower.some((s) => /^'(nonce|sha256|sha384|sha512)-/.test(s));
  const problems = [];
  if (lower.includes("'unsafe-inline'") && !usesNonceOrHash) problems.push("'unsafe-inline'");
  if (lower.includes("'unsafe-eval'")) problems.push("'unsafe-eval'");
  for (const broad of ['*', 'http:', 'https:', 'data:']) if (lower.includes(broad)) problems.push(broad);
  if (problems.length) return fail(`Scripts are allowed from ${problems.join(', ')}, which defeats the policy.`);
  const notes = [];
  const objects = csp['object-src'] ?? csp['default-src'];
  if (!objects?.map((s) => s.toLowerCase()).includes("'none'")) notes.push("object-src is not 'none'");
  if (!csp['base-uri']) notes.push('base-uri is not set');
  if (notes.length) return warn(`Scripts are restricted, but ${notes.join(' and ')}.`);
  return pass('Scripts are restricted to named sources.');
}

export function judgeFraming(cspValue, xfo) {
  const ancestors = parseCsp(cspValue)['frame-ancestors'];
  if (ancestors?.length) return pass(`frame-ancestors ${ancestors.join(' ')}.`);
  if (/^\s*(deny|sameorigin)\s*$/i.test(xfo || '')) return pass(`X-Frame-Options ${xfo.trim().toUpperCase()}.`);
  return fail('Neither CSP frame-ancestors nor X-Frame-Options restricts framing.');
}

export function judgeNosniff(value) {
  return /^\s*nosniff\s*$/i.test(value || '')
    ? pass('nosniff.')
    : fail(value ? `X-Content-Type-Options is "${value}", not nosniff.` : 'No X-Content-Type-Options header.');
}

const SAFE_REFERRER = [
  'no-referrer',
  'same-origin',
  'strict-origin',
  'strict-origin-when-cross-origin',
  'origin',
  'origin-when-cross-origin',
];

export function judgeReferrer(value) {
  if (!value) return warn('No Referrer-Policy header (browsers default to strict-origin-when-cross-origin).');
  // The last recognized value in a comma-separated list wins.
  const policy = value.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean).pop();
  return SAFE_REFERRER.includes(policy) ? pass(`${policy}.`) : fail(`"${policy}" can send full URLs to other sites.`);
}

export function judgePermissionsPolicy(value) {
  return value ? pass('Present.') : fail('No Permissions-Policy header.');
}

/** Parses security.txt into { field: [values] } with lowercase field names. */
export function parseSecurityTxt(text) {
  const fields = {};
  for (const line of (text || '').split(/\r?\n/)) {
    const m = /^([A-Za-z-]+):\s*(.+?)\s*$/.exec(line);
    if (m && !line.startsWith('#')) (fields[m[1].toLowerCase()] ??= []).push(m[2]);
  }
  return fields;
}

export function judgeSecurityTxt(text, now = new Date()) {
  const fields = parseSecurityTxt(text);
  if (!fields.contact?.length) return fail('security.txt has no Contact field.');
  if (!fields.expires?.length) return fail('security.txt has no Expires field.');
  const expires = new Date(fields.expires[0]);
  if (Number.isNaN(expires.valueOf())) return fail(`Expires is not a valid date: "${fields.expires[0]}".`);
  const days = Math.floor((expires - now) / DAY_MS);
  const date = expires.toISOString().slice(0, 10);
  if (days < 0) return fail(`security.txt expired on ${date}.`);
  if (days < 60) return warn(`security.txt expires in ${days} days (${date}). Rebuild or update it.`);
  if (days > 366) return warn(`Expires is ${date}, more than a year away; RFC 9116 recommends less than a year.`);
  return pass(`Contact ${fields.contact[0]}; expires ${date} (${days} days).`);
}

export function judgeSpf(txtRecords, mxRecords) {
  const spf = txtRecords.filter((r) => /^v=spf1(\s|$)/i.test(r));
  if (spf.length === 0) return fail('No SPF record. A domain that sends no mail should publish "v=spf1 -all".');
  if (spf.length > 1) return fail(`${spf.length} SPF records; there must be exactly one.`);
  const record = spf[0];
  // The "all" mechanism and its qualifier: "-all" fail, "~all" softfail,
  // "?all" neutral, "all" or "+all" pass (anyone may send).
  const all = record.split(/\s+/).find((t) => /^[-~+?]?all$/i.test(t));
  const qualifier = all ? (/^[-~+?]/.test(all) ? all[0] : '+') : null;
  if (qualifier === '+' || qualifier === '?') return fail(`"${record}" lets anyone send mail as this domain.`);
  if (mxRecords.length === 0 && qualifier !== '-')
    return warn(`The domain has no MX records, so "v=spf1 -all" would be stricter than "${record}".`);
  if (!qualifier) return warn(`"${record}" does not end with -all or ~all.`);
  return pass(`"${record}".`);
}

export function judgeDmarc(txtRecords) {
  const dmarc = txtRecords.filter((r) => /^v=DMARC1/i.test(r));
  if (dmarc.length === 0) return fail('No DMARC record at _dmarc.');
  if (dmarc.length > 1) return fail(`${dmarc.length} DMARC records; there must be exactly one.`);
  const policy = /(?:^|;)\s*p\s*=\s*(\w+)/i.exec(dmarc[0])?.[1]?.toLowerCase();
  if (policy === 'reject') return pass(`"${dmarc[0]}".`);
  if (policy === 'quarantine') return warn(`Policy is quarantine; reject is stronger: "${dmarc[0]}".`);
  return fail(`Policy is ${policy || 'missing'}, so spoofed mail is not blocked: "${dmarc[0]}".`);
}

export function judgeCaa(records) {
  const issuers = records.filter((r) => /\bissue(wild)?\b/i.test(r));
  return issuers.length
    ? pass(`Allowed issuers: ${[...new Set(issuers.map((r) => r.match(/"([^"]*)"/)?.[1] || r))].join(', ')}.`)
    : fail('No CAA record, so any certificate authority may issue certificates for this domain.');
}

/** Parses robots.txt: sitemap URLs and whether all crawlers are blocked from everything. */
export function parseRobots(text) {
  const sitemaps = [];
  let agents = [];
  let inGroupRules = false;
  let blocksAll = false;
  for (const raw of (text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, key, value] = [m[0], m[1].toLowerCase(), m[2].trim()];
    if (key === 'sitemap') sitemaps.push(value);
    else if (key === 'user-agent') {
      if (inGroupRules) agents = [];
      inGroupRules = false;
      agents.push(value);
    } else if (key === 'disallow' || key === 'allow') {
      inGroupRules = true;
      if (key === 'disallow' && value === '/' && agents.includes('*')) blocksAll = true;
    }
  }
  return { sitemaps, blocksAll };
}

const COPYRIGHT = /(?:©|&copy;|\(c\)|copyright)[^\n]{0,40}?((?:19|20)\d{2})(?:\s*[-–—]\s*((?:19|20)\d{2}))?/gi;

/** Finds the latest year in copyright notices in a page's text, or null. */
export function latestCopyrightYear(text) {
  let latest = null;
  for (const m of (text || '').matchAll(COPYRIGHT)) {
    const year = Math.max(Number(m[1]), Number(m[2] || 0));
    if (latest === null || year > latest) latest = year;
  }
  return latest;
}

export function judgeCopyright(text, now = new Date()) {
  const year = latestCopyrightYear(text);
  if (year === null) return { status: 'skip', message: 'No copyright notice found on the home page.' };
  const current = now.getUTCFullYear();
  if (year >= current) return pass(`© ${year}.`);
  // A short grace period at the start of the year.
  if (now.getUTCMonth() === 0 && now.getUTCDate() <= 14 && year === current - 1)
    return warn(`© ${year}; update to ${current} by mid-January.`);
  return fail(`The copyright notice says ${year}; it is ${current}. Generate the year from the build date.`);
}

/** Heading levels in document order -> true if a level is skipped going down (h2 to h4). */
export function skipsHeadingLevel(levels) {
  for (let i = 1; i < levels.length; i++) if (levels[i] > levels[i - 1] + 1) return true;
  return false;
}

/** Compares a canonical URL to the page URL after normalizing both and ignoring any #fragment. */
export function sameUrl(a, b) {
  try {
    const x = new URL(a);
    const y = new URL(b);
    x.hash = '';
    y.hash = '';
    return x.href === y.href;
  } catch {
    return false;
  }
}

/** UPKEEP-1: pull requests still open after this many days need attention. */
export const PR_MAX_DAYS = 14;

/**
 * Judges a repository's open pull requests. Reports only how many there are and
 * how old the oldest is: never titles, authors or links, because reports can be
 * public while the repository is private.
 * @param {Array<{ created_at: string }>} pulls  open pull requests from the GitHub API
 */
export function judgeOpenPulls(pulls, now = new Date(), maxDays = PR_MAX_DAYS) {
  if (!pulls.length) return { status: 'pass', message: 'No open pull requests.' };
  const ages = pulls.map((p) => Math.floor((now - new Date(p.created_at)) / 86_400_000));
  const oldest = Math.max(...ages);
  const stale = ages.filter((d) => d > maxDays).length;
  const days = (n) => `${n} day${n === 1 ? '' : 's'}`;
  const count = `${pulls.length} open pull request${pulls.length === 1 ? '' : 's'}; the oldest is ${days(oldest)} old.`;
  if (!stale) return { status: 'pass', message: count };
  return {
    status: 'fail',
    message: `${count} ${stale === 1 ? 'One has' : `${stale} have`} been open longer than ${days(maxDays)}: merge, update or close ${stale === 1 ? 'it' : 'them'}.`,
  };
}
