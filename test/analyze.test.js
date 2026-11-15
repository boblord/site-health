import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as a from '../src/analyze.js';
import { unquoteTxt } from '../src/net.js';

const status = (r) => r.status;

test('HSTS', () => {
  assert.equal(status(a.judgeHsts(undefined)), 'fail');
  assert.equal(status(a.judgeHsts('max-age=86400')), 'fail');
  assert.equal(status(a.judgeHsts('max-age=31536000; includeSubDomains')), 'pass');
  assert.equal(status(a.judgeHsts('includeSubDomains')), 'fail');
});

test('CSP', () => {
  assert.equal(status(a.judgeCsp(undefined)), 'fail');
  assert.equal(status(a.judgeCsp("img-src 'self'")), 'fail', 'no script restriction');
  assert.equal(status(a.judgeCsp("default-src 'self' 'unsafe-inline'")), 'fail');
  assert.equal(status(a.judgeCsp("script-src 'self' https:")), 'fail');
  assert.equal(status(a.judgeCsp("script-src 'nonce-abc' 'unsafe-inline'; object-src 'none'; base-uri 'none'")), 'pass', 'nonce disables unsafe-inline');
  assert.equal(status(a.judgeCsp("default-src 'none'; base-uri 'none'")), 'pass');
  assert.equal(status(a.judgeCsp("default-src 'self'")), 'warn', "object-src not 'none', no base-uri");
});

test('framing', () => {
  assert.equal(status(a.judgeFraming("frame-ancestors 'none'", null)), 'pass');
  assert.equal(status(a.judgeFraming(null, 'DENY')), 'pass');
  assert.equal(status(a.judgeFraming(null, 'ALLOW-FROM x')), 'fail');
});

test('referrer policy uses the last valid value', () => {
  assert.equal(status(a.judgeReferrer('unsafe-url, strict-origin')), 'pass');
  assert.equal(status(a.judgeReferrer('no-referrer-when-downgrade')), 'fail');
  assert.equal(status(a.judgeReferrer(null)), 'warn');
});

test('security.txt', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  assert.equal(status(a.judgeSecurityTxt('Contact: https://x/\nExpires: 2027-01-01T00:00:00Z', now)), 'pass');
  assert.equal(status(a.judgeSecurityTxt('Contact: https://x/\nExpires: 2026-07-01T00:00:00Z', now)), 'warn', 'under 60 days');
  assert.equal(status(a.judgeSecurityTxt('Contact: https://x/\nExpires: 2026-05-01T00:00:00Z', now)), 'fail', 'expired');
  assert.equal(status(a.judgeSecurityTxt('Expires: 2027-01-01T00:00:00Z', now)), 'fail', 'no contact');
  assert.equal(status(a.judgeSecurityTxt('# Contact: commented\nExpires: 2027-01-01T00:00:00Z', now)), 'fail');
});

test('SPF', () => {
  assert.equal(status(a.judgeSpf([], [])), 'fail');
  assert.equal(status(a.judgeSpf(['v=spf1 -all'], [])), 'pass');
  assert.equal(status(a.judgeSpf(['v=spf1 ~all'], [])), 'warn', 'no MX: -all is better');
  assert.equal(status(a.judgeSpf(['v=spf1 include:_spf.google.com ~all'], ['1 mx.example'])), 'pass');
  assert.equal(status(a.judgeSpf(['v=spf1 +all'], ['1 mx'])), 'fail');
  assert.equal(status(a.judgeSpf(['v=spf1 include:x all'], ['1 mx'])), 'fail', 'bare all means pass');
  assert.equal(status(a.judgeSpf(['v=spf1 -all', 'v=spf1 ~all'], [])), 'fail', 'two records');
});

test('DMARC', () => {
  assert.equal(status(a.judgeDmarc(['v=DMARC1; p=reject'])), 'pass');
  assert.equal(status(a.judgeDmarc(['v=DMARC1; p=quarantine'])), 'warn');
  assert.equal(status(a.judgeDmarc(['v=DMARC1; p=none'])), 'fail');
  assert.equal(status(a.judgeDmarc(['v=DMARC1; sp=reject'])), 'fail', 'sp is not p');
  assert.equal(status(a.judgeDmarc([])), 'fail');
});

test('CAA', () => {
  assert.equal(status(a.judgeCaa(['0 issue "letsencrypt.org"'])), 'pass');
  assert.equal(status(a.judgeCaa(['0 iodef "mailto:x"'])), 'fail');
  assert.equal(status(a.judgeCaa([])), 'fail');
});

test('robots.txt', () => {
  assert.deepEqual(a.parseRobots('User-agent: *\nAllow: /\nSitemap: https://x/s.xml'), { sitemaps: ['https://x/s.xml'], blocksAll: false });
  assert.equal(a.parseRobots('User-agent: *\nDisallow: /').blocksAll, true);
  assert.equal(a.parseRobots('User-agent: BadBot\nDisallow: /\n\nUser-agent: *\nDisallow:').blocksAll, false);
});

test('copyright year', () => {
  assert.equal(a.latestCopyrightYear('© 2026 Robert Lord'), 2026);
  assert.equal(a.latestCopyrightYear('Copyright 2019–2025 Example'), 2025);
  assert.equal(a.latestCopyrightYear('Founded 2001. (c) 2024'), 2024);
  assert.equal(a.latestCopyrightYear('No notice here, 2026.'), null);
  const nov = new Date('2026-11-15T00:00:00Z');
  assert.equal(status(a.judgeCopyright('© 2026', nov)), 'pass');
  assert.equal(status(a.judgeCopyright('© 2025', nov)), 'fail');
  assert.equal(status(a.judgeCopyright('© 2025', new Date('2026-01-05T00:00:00Z'))), 'warn', 'January grace period');
  assert.equal(status(a.judgeCopyright('nothing', nov)), 'skip');
});

test('heading levels and URLs', () => {
  assert.equal(a.skipsHeadingLevel([1, 2, 3, 2, 3]), false);
  assert.equal(a.skipsHeadingLevel([1, 3]), true);
  assert.equal(a.sameUrl('https://x.org/a/#top', 'https://x.org/a/'), true);
  assert.equal(a.sameUrl('https://x.org/a', 'https://x.org/a/'), false);
});

test('TXT unquoting', () => {
  assert.equal(unquoteTxt('"v=spf1 " "-all"'), 'v=spf1 -all');
  assert.equal(unquoteTxt('v=spf1 -all'), 'v=spf1 -all');
});
