// Checks a live site from the outside, the way any visitor or scanner sees it.
// Returns a list of { id, status, message }, one per rule, where status is
// pass | warn | fail | skip | error ("error" means the check itself could not run).

import * as cheerio from 'cheerio';
import { get, dns, certificate, mapLimit, NAVIGATE_HEADERS } from './net.js';
import * as judge from './analyze.js';

const DAY_MS = 86_400_000;

/**
 * @param {string} siteUrl  e.g. https://example.org
 * @param {{ sample?: number, skip?: string[], now?: Date }} options
 */
export async function checkLive(siteUrl, { sample = 100, skip = [], now = new Date() } = {}) {
  const results = [];
  const add = (id, r) => results.push({ id, ...r });
  const skipped = new Set(skip);
  const run = async (id, fn) => {
    if (skipped.has(id)) return add(id, { status: 'skip', message: 'Skipped by request.' });
    try {
      add(id, await fn());
    } catch (err) {
      add(id, { status: 'error', message: `The check failed to run: ${err.message}` });
    }
  };

  const home = await get(new URL(siteUrl).href, { headers: NAVIGATE_HEADERS });
  if (home.error || home.status !== 200) {
    const why = home.error || `HTTP ${home.status}`;
    add('HTTPS-1', { status: 'fail', message: `The home page did not load: ${why}.` });
    return results;
  }
  // The canonical host is wherever the home page lands after redirects, so
  // "example.org" and "www.example.org" are both checked as the site intends.
  const base = new URL('/', home.url);
  const host = base.hostname;
  const apex = host.replace(/^www\./, '');
  const h = (name) => home.headers.get(name);
  const $home = cheerio.load(home.text);

  // HTTPS
  await run('HTTPS-1', async () => {
    const cert = await certificate(host);
    if (cert.error) return { status: 'fail', message: `TLS connection failed: ${cert.error}.` };
    const days = Math.floor((cert.validTo - now) / DAY_MS);
    const msg = `Issued by ${cert.issuer}; expires ${cert.validTo.toISOString().slice(0, 10)} (${days} days).`;
    if (days < 7) return { status: 'fail', message: msg };
    if (days < 21) return { status: 'warn', message: `${msg} Check that automatic renewal is working.` };
    return { status: 'pass', message: msg };
  });

  await run('HTTPS-2', async () => {
    const res = await get(`http://${host}/`, { redirect: 'manual', body: false });
    if (res.error) return { status: 'error', message: `Could not reach http://${host}/: ${res.error}.` };
    const location = res.headers.get('location') || '';
    if (res.status >= 300 && res.status < 400 && location.startsWith('https://')) {
      return [301, 308].includes(res.status)
        ? { status: 'pass', message: `${res.status} to ${location}.` }
        : { status: 'warn', message: `${res.status} to ${location}; a permanent redirect (301 or 308) is better.` };
    }
    return { status: 'fail', message: `http://${host}/ returned ${res.status} without redirecting to HTTPS.` };
  });

  await run('HTTPS-3', async () => {
    const other = host === apex ? `www.${apex}` : apex;
    const [a, aaaa, cname] = await Promise.all([dns(other, 'A'), dns(other, 'AAAA'), dns(other, 'CNAME')]);
    const exists = [a, aaaa, cname].some((r) => r.records?.length);
    if (!exists) return { status: 'pass', message: `${other} has no DNS records, so there is only one host.` };
    const res = await get(`https://${other}/`, { redirect: 'manual', body: false });
    if (res.error) return { status: 'fail', message: `${other} exists in DNS but fails over HTTPS: ${res.error}.` };
    const location = res.headers.get('location') || '';
    if (res.status >= 300 && res.status < 400 && new URL(location, `https://${other}/`).hostname === host)
      return { status: 'pass', message: `${other} redirects (${res.status}) to ${host}.` };
    return { status: 'fail', message: `${other} returns ${res.status} instead of redirecting to ${host}.` };
  });

  // Headers (from the home page response)
  await run('HDR-1', () => judge.judgeHsts(h('strict-transport-security'), now));
  await run('HDR-2', () => judge.judgeCsp(h('content-security-policy')));
  await run('HDR-3', () => judge.judgeFraming(h('content-security-policy'), h('x-frame-options')));
  await run('HDR-4', () => judge.judgeNosniff(h('x-content-type-options')));
  await run('HDR-5', () => judge.judgeReferrer(h('referrer-policy')));
  await run('HDR-6', () => judge.judgePermissionsPolicy(h('permissions-policy')));

  // security.txt
  await run('SEC-1', async () => {
    const res = await get(new URL('/.well-known/security.txt', base).href, { redirect: 'manual' });
    if (res.error) return { status: 'error', message: `Could not fetch security.txt: ${res.error}.` };
    if (res.status !== 200) return { status: 'fail', message: `/.well-known/security.txt returned ${res.status}.` };
    if (!/^text\/plain/i.test(res.headers.get('content-type') || ''))
      return { status: 'fail', message: `security.txt is served as ${res.headers.get('content-type')}, not text/plain.` };
    return judge.judgeSecurityTxt(res.text, now);
  });

  // DNS (at the registrable name, without www.)
  await run('DNS-1', async () => {
    const [txt, mx] = await Promise.all([dns(apex, 'TXT'), dns(apex, 'MX')]);
    if (txt.error || mx.error) return { status: 'error', message: txt.error || mx.error };
    return judge.judgeSpf(txt.records, mx.records);
  });
  await run('DNS-2', async () => {
    const txt = await dns(`_dmarc.${apex}`, 'TXT');
    return txt.error ? { status: 'error', message: txt.error } : judge.judgeDmarc(txt.records);
  });
  await run('DNS-3', async () => {
    const caa = await dns(apex, 'CAA');
    return caa.error ? { status: 'error', message: caa.error } : judge.judgeCaa(caa.records);
  });

  // robots.txt and sitemap
  let robots = { sitemaps: [], blocksAll: false };
  await run('SEO-1', async () => {
    const res = await get(new URL('/robots.txt', base).href);
    if (res.error) return { status: 'error', message: `Could not fetch robots.txt: ${res.error}.` };
    if (res.status !== 200) return { status: 'fail', message: `/robots.txt returned ${res.status}.` };
    robots = judge.parseRobots(res.text);
    if (robots.blocksAll) return { status: 'fail', message: 'robots.txt blocks all crawlers from the whole site.' };
    if (!robots.sitemaps.length) return { status: 'warn', message: 'robots.txt has no Sitemap line.' };
    return { status: 'pass', message: `Names ${robots.sitemaps.join(', ')}.` };
  });

  let pageUrls = [];
  await run('SEO-2', async () => {
    const candidates = robots.sitemaps.length
      ? robots.sitemaps
      : ['/sitemap.xml', '/sitemap-index.xml', '/sitemap_index.xml'].map((p) => new URL(p, base).href);
    const urls = await readSitemaps(candidates, { listed: robots.sitemaps.length > 0 });
    if (urls === null) return { status: 'fail', message: 'No sitemap found.' };
    if (urls.length === 0) return { status: 'fail', message: 'The sitemap lists no pages.' };
    const foreign = urls.filter((u) => new URL(u).hostname !== host || !u.startsWith('https://'));
    pageUrls = pickSample(
      urls.filter((u) => !foreign.includes(u)),
      base.href,
      sample,
    );
    const statuses = await mapLimit(pageUrls, 4, async (u) => [u, await get(u, { redirect: 'manual', body: false })]);
    const bad = statuses.filter(([, r]) => r.error || r.status !== 200).map(([u, r]) => `${u} (${r.error || r.status})`);
    const problems = [];
    if (foreign.length) problems.push(`${foreign.length} URLs are not https://${host}: ${foreign.slice(0, 3).join(', ')}`);
    if (bad.length) problems.push(`${bad.length} of ${pageUrls.length} sampled URLs do not return 200: ${bad.slice(0, 5).join(', ')}`);
    if (problems.length) return { status: 'fail', message: `${urls.length} URLs. ${problems.join('. ')}.` };
    return { status: 'pass', message: `${urls.length} URLs; ${pageUrls.length} sampled, all return 200.` };
  });
  if (!pageUrls.length) pageUrls = [base.href];

  // Page-level checks over the sample
  const pages = await mapLimit(pageUrls, 4, async (u) => {
    const res = u === base.href ? home : await get(u, { headers: NAVIGATE_HEADERS });
    return { url: u, res, $: res.text ? cheerio.load(res.text) : null };
  });
  const loaded = pages.filter((p) => p.$ && p.res.status === 200);

  await run('SEO-3', () => {
    const missing = [];
    const titles = new Map();
    const descs = new Map();
    for (const { url, $ } of loaded) {
      const title = $('head > title').first().text().trim();
      const desc = $('meta[name="description"]').attr('content')?.trim();
      if (!title || !desc) missing.push(`${url} (${[!title && 'title', !desc && 'description'].filter(Boolean).join(', ')})`);
      if (title) titles.set(title, [...(titles.get(title) || []), url]);
      if (desc) descs.set(desc, [...(descs.get(desc) || []), url]);
    }
    const dupTitles = [...titles].filter(([, u]) => u.length > 1);
    const dupDescs = [...descs].filter(([, u]) => u.length > 1);
    if (missing.length) return { status: 'fail', message: `Missing on ${missing.length} pages: ${missing.slice(0, 5).join('; ')}.` };
    if (dupTitles.length)
      return { status: 'fail', message: `Duplicate titles: ${dupTitles.map(([t, u]) => `"${t}" on ${u.length} pages`).join('; ')}.` };
    if (dupDescs.length)
      return {
        status: 'warn',
        message: `Shared descriptions: ${dupDescs.map(([d, u]) => `"${d.slice(0, 60)}..." on ${u.join(', ')}`).join('; ')}.`,
      };
    return { status: 'pass', message: `${loaded.length} pages checked; titles and descriptions are present and unique.` };
  });

  await run('SEO-4', () => {
    const bad = loaded
      .map(({ url, $ }) => [url, $('link[rel="canonical"]').attr('href')])
      .filter(([url, c]) => !c || !judge.sameUrl(new URL(c, url).href, url))
      .map(([url, c]) => `${url} (${c ? `canonical ${c}` : 'none'})`);
    return bad.length
      ? { status: 'fail', message: `${bad.length} of ${loaded.length} pages: ${bad.slice(0, 5).join('; ')}.` }
      : { status: 'pass', message: `${loaded.length} pages have a matching canonical URL.` };
  });

  await run('SHARE-1', async () => {
    const meta = ($, name) => $(`meta[property="${name}"], meta[name="${name}"]`).attr('content')?.trim();
    const missing = [];
    const images = new Set();
    for (const { url, $ } of loaded) {
      const gaps = ['og:title', 'og:description', 'og:image', 'twitter:card'].filter((n) => !meta($, n));
      if (gaps.length) missing.push(`${url} (${gaps.join(', ')})`);
      const img = meta($, 'og:image');
      if (img) images.add(img);
    }
    if (missing.length) return { status: 'fail', message: `Missing tags on ${missing.length} pages: ${missing.slice(0, 5).join('; ')}.` };
    const imageProblems = [];
    for (const img of [...images].slice(0, 3)) {
      if (!/^https:\/\//.test(img)) {
        imageProblems.push(`${img} is not an absolute https:// URL`);
        continue;
      }
      const res = await get(img, { body: false });
      if (res.error || res.status !== 200 || !/^image\//.test(res.headers.get('content-type') || ''))
        imageProblems.push(`${img} does not load as an image (${res.error || res.status})`);
    }
    if (imageProblems.length) return { status: 'fail', message: imageProblems.join('; ') + '.' };
    return { status: 'pass', message: `Tags on ${loaded.length} pages; preview image loads.` };
  });

  // Site basics
  await run('SITE-1', async () => {
    const gaps = [];
    if (!$home('link[rel~="icon"]').length) {
      const ico = await get(new URL('/favicon.ico', base).href, { body: false });
      if (ico.status !== 200) gaps.push('favicon');
    }
    if (!$home('link[rel="apple-touch-icon"]').length) {
      const touch = await get(new URL('/apple-touch-icon.png', base).href, { body: false });
      if (touch.status !== 200) gaps.push('Apple touch icon');
    }
    return gaps.length ? { status: 'fail', message: `Missing: ${gaps.join(', ')}.` } : { status: 'pass', message: 'Both present.' };
  });

  await run('SITE-2', async () => {
    const probe = new URL(`/site-health-missing-page-${Date.now().toString(36)}/`, base).href;
    const res = await get(probe, { headers: NAVIGATE_HEADERS, redirect: 'manual' });
    if (res.error) return { status: 'error', message: `Could not fetch a missing page: ${res.error}.` };
    if (res.status === 404 || res.status === 410) {
      const hasPage = /<html|<body/i.test(res.text);
      return hasPage
        ? { status: 'pass', message: `${res.status} with an HTML page.` }
        : { status: 'warn', message: `${res.status}, but with no HTML page for visitors.` };
    }
    if (res.status >= 300 && res.status < 400)
      return { status: 'fail', message: `A missing page redirects (${res.status}) to ${res.headers.get('location')} instead of returning 404.` };
    return { status: 'fail', message: `A missing page returns ${res.status} instead of 404 (a "soft 404").` };
  });

  await run('SITE-3', () => {
    const footer = $home('footer').text();
    return judge.judgeCopyright(footer.trim() ? footer : $home('body').text(), now);
  });

  // Accessibility basics over the sample
  await run('A11Y-1', () => {
    const problems = [];
    for (const { url, $ } of loaded) {
      const issues = [];
      if (!$('html').attr('lang')) issues.push('no lang attribute');
      const noAlt = $('img:not([alt])').length;
      if (noAlt) issues.push(`${noAlt} images without alt`);
      const h1 = $('h1').length;
      if (h1 !== 1) issues.push(`${h1} h1 headings`);
      const levels = $('h1, h2, h3, h4, h5, h6').map((_, el) => Number(el.tagName[1])).get();
      if (judge.skipsHeadingLevel(levels)) issues.push('a skipped heading level');
      if (issues.length) problems.push(`${url}: ${issues.join(', ')}`);
    }
    const skipLink = $home('a[href^="#"]').filter((_, el) => /skip/i.test($home(el).text())).length > 0;
    if (!skipLink) problems.push('no "skip to content" link on the home page');
    return problems.length
      ? { status: 'fail', message: problems.slice(0, 6).join('; ') + '.' }
      : { status: 'pass', message: `${loaded.length} pages: lang, alt text, one h1, heading order, skip link.` };
  });

  // Performance
  await run('PERF-1', async () => {
    const problems = [];
    const encoding = h('content-encoding');
    if (!/br|gzip|zstd/i.test(encoding || '')) problems.push('the home page HTML is not compressed');
    if (home.bytes > 200_000) problems.push(`the home page HTML is ${Math.round(home.bytes / 1000)} KB`);
    const imgs = [...new Set($home('img[src]').map((_, el) => new URL($home(el).attr('src'), home.url).href).get())].slice(0, 10);
    const sizes = await mapLimit(imgs, 4, async (src) => [src, await get(src, { body: false })]);
    for (const [src, res] of sizes) {
      const len = Number(res.headers?.get('content-length') || 0);
      if (len > 500_000) problems.push(`${src} is ${Math.round(len / 1000)} KB`);
    }
    return problems.length
      ? { status: 'fail', message: problems.join('; ') + '.' }
      : { status: 'pass', message: imgs.length
          ? `HTML compressed (${encoding}); ${imgs.length} home page images, all under 500 KB.`
          : `HTML compressed (${encoding}); no images on the home page.` };
  });

  // Privacy (informational)
  await run('PRIV-1', () => {
    const hosts = new Set();
    $home('script[src], link[href], img[src], iframe[src], source[src], video[src], audio[src]').each((_, el) => {
      const ref = $home(el).attr('src') || $home(el).attr('href');
      const rel = ($home(el).attr('rel') || '').toLowerCase();
      if (el.tagName === 'link' && !/stylesheet|preload|icon|modulepreload|manifest/.test(rel)) return;
      try {
        const u = new URL(ref, home.url);
        if (u.protocol.startsWith('http') && u.hostname !== host) hosts.add(u.hostname);
      } catch {}
    });
    return {
      status: 'info',
      message: hosts.size ? `The home page loads from: ${[...hosts].join(', ')}.` : 'The home page loads nothing from other sites.',
    };
  });

  return results;
}

/**
 * Reads page URLs from sitemaps. `listed` sitemaps (from robots.txt) are all
 * read; otherwise `candidates` are guesses and the first that loads is used.
 * Sitemap indexes are followed one level. Returns null if no sitemap loads.
 */
async function readSitemaps(candidates, { listed = false } = {}) {
  const roots = [];
  for (const url of candidates) {
    const doc = await loadSitemap(url);
    if (doc) {
      roots.push(doc);
      if (!listed) break;
    }
  }
  if (!roots.length) return null;
  const urls = [];
  for (const { $ } of roots) {
    $('urlset > url > loc').each((_, el) => urls.push($(el).text().trim()));
    const children = $('sitemapindex > sitemap > loc').map((_, el) => $(el).text().trim()).get().slice(0, 20);
    for (const child of children) {
      const doc = await loadSitemap(child);
      doc?.$('urlset > url > loc').each((_, el) => urls.push(doc.$(el).text().trim()));
    }
  }
  return [...new Set(urls)];
}

async function loadSitemap(url) {
  const res = await get(url);
  if (res.error || res.status !== 200 || !/<(urlset|sitemapindex)\b/i.test(res.text)) return null;
  return { $: cheerio.load(res.text, { xml: true }) };
}

/** The home page plus an even spread of up to `size` URLs. */
function pickSample(urls, homeUrl, size) {
  const rest = urls.filter((u) => !judge.sameUrl(u, homeUrl));
  if (rest.length + 1 <= size) return [homeUrl, ...rest];
  const step = rest.length / (size - 1);
  return [homeUrl, ...Array.from({ length: size - 1 }, (_, i) => rest[Math.floor(i * step)])];
}
