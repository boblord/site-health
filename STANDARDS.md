# Website standards, version 2

These are the standards every site checked by site-health is expected to meet. Each rule has an id (such as `HDR-2`) that appears in reports and issues, a level, what passing means, why it matters, how to fix it, and an authoritative source.

**Levels**

- **Required:** a failure means the site does not meet the standard.
- **Recommended:** a failure is reported as a warning.
- **Info:** reported for awareness, never passes or fails.

**Exceptions.** A site can be excused from a rule with a written reason, and optionally an expiry date, in its configuration (see [docs/adopting.md](docs/adopting.md)). Exceptions show in every report, so they are visible decisions rather than silent gaps.

**Changes.** New rules start as recommended and become required in a later version, so a site never goes from passing to failing overnight. [CHANGELOG.md](CHANGELOG.md) lists what changed in each version.

## HTTPS

### HTTPS-1 Valid certificate with time to spare

Required. Passes when the certificate is valid for the host and expires more than 21 days from now (a warning under 21 days, a failure under 7).

**Why:** an expired or mismatched certificate takes the site down for every visitor. Most hosts renew automatically; this catches the times renewal silently breaks.

**Fix:** turn on automatic renewal with your host or certificate authority, and check why it stopped.

**Source:** [CISA BOD 18-01](https://www.cisa.gov/news-events/directives/bod-18-01-enhance-email-and-web-security)

### HTTPS-2 Plain HTTP redirects to HTTPS

Required. Passes when `http://host/` answers with a permanent redirect (301 or 308) to `https://`. A temporary redirect is a warning.

**Why:** visitors who type the address without `https://`, and old links, should never get an unencrypted page.

**Fix:** on Cloudflare, turn on SSL/TLS, Edge Certificates, "Always Use HTTPS". Other hosts have a similar setting.

**Source:** [CISA BOD 18-01](https://www.cisa.gov/news-events/directives/bod-18-01-enhance-email-and-web-security)

### HTTPS-3 One canonical host (www or apex)

Recommended. Passes when the other form of the name (`www.` or the bare domain) either does not exist or permanently redirects to the site's main host.

**Why:** serving the same site at two addresses splits search ranking and link previews, and doubles what has to be kept secure.

**Fix:** add a redirect rule from the secondary host to the main one.

**Source:** [Google Search Central: consolidate duplicate URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)

## Security headers

All header rules are checked on the home page response.

### HDR-1 Strict-Transport-Security (ramping up to a year)

Required. Sites are ramping up HSTS, so what passes depends on the date:

- **Until 2026-12-15:** `max-age` of at least 604800 seconds (one week). `includeSubDomains` is a warning: leave it out until the ramp-up ends.
- **From 2026-12-15:** `max-age` of at least 31536000 seconds (one year). `includeSubDomains` is allowed.

**Why:** tells browsers to use HTTPS for this site from then on, which defeats downgrade attacks on later visits. Browsers remember the setting for `max-age` seconds, so starting short means a mistake (a subdomain without HTTPS, a broken certificate setup) can only lock visitors out for a week while it is fixed.

**Fix:** during the ramp-up, send `Strict-Transport-Security: max-age=604800`. After 2026-12-15, change it to `max-age=31536000`. Add `includeSubDomains` only if every subdomain supports HTTPS, and only on the bare domain, where it has an effect. Do not add `preload` unless you mean it: removal from browser preload lists takes months.

**Source:** [MDN: Strict-Transport-Security](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security), [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/)

### HDR-2 Content Security Policy restricts scripts

Required. Passes when a `Content-Security-Policy` header limits scripts (through `script-src` or `default-src`) without `'unsafe-inline'` (unless nonces or hashes are used), `'unsafe-eval'`, `*`, `http:`, `https:`, or `data:`. A warning if `object-src` is not `'none'` or `base-uri` is unset.

**Why:** the most effective defense against cross-site scripting. If an attacker injects markup, the browser refuses to run their script.

**Fix:** start from `default-src 'none'` and allow only what the site uses, for example `style-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`. Move inline styles and scripts into files. Test in a browser and watch the console for violations.

**Source:** [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP), [OWASP CSP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)

### HDR-3 Framing is restricted

Required. Passes when CSP `frame-ancestors` is set, or `X-Frame-Options` is `DENY` or `SAMEORIGIN`.

**Why:** stops other sites from loading yours in a hidden frame to trick visitors into clicking (clickjacking).

**Fix:** add `frame-ancestors 'none'` to the CSP, and `X-Frame-Options: DENY` for older browsers.

**Source:** [OWASP Clickjacking Defense Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Clickjacking_Defense_Cheat_Sheet.html)

### HDR-4 X-Content-Type-Options: nosniff

Required. Passes when `X-Content-Type-Options` is `nosniff`.

**Why:** stops browsers from guessing a file's type, which can turn an uploaded or mislabeled file into executable script.

**Fix:** send `X-Content-Type-Options: nosniff` on every response.

**Source:** [MDN: X-Content-Type-Options](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Content-Type-Options)

### HDR-5 Referrer-Policy does not leak full URLs

Recommended. Passes when `Referrer-Policy` is one of `no-referrer`, `same-origin`, `strict-origin`, `strict-origin-when-cross-origin`, `origin`, or `origin-when-cross-origin`. A missing header is a warning (browsers default to `strict-origin-when-cross-origin`).

**Why:** full URLs can contain private paths or tokens; other sites should not receive them.

**Fix:** send `Referrer-Policy: strict-origin-when-cross-origin`.

**Source:** [MDN: Referrer-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy)

### HDR-6 Permissions-Policy is set

Recommended. Passes when a `Permissions-Policy` header is present.

**Why:** turns off powerful browser features (camera, microphone, location, payments) the site never uses, so injected or embedded code cannot use them either.

**Fix:** send a policy that disables what you do not use, for example `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`.

**Source:** [MDN: Permissions-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Permissions-Policy)

## Security contact

### SEC-1 security.txt is present and current

Required. Passes when `/.well-known/security.txt` returns 200 as `text/plain`, with a `Contact` and an `Expires` date that is in the future. A warning within 60 days of expiry, or if `Expires` is more than a year away.

**Why:** tells security researchers how to report a problem. An expired file signals that nobody is watching.

**Fix:** generate the file at build time, with `Expires` set to the build date plus 364 days, and rebuild at least monthly (see the practices below). Use a web form or page as the contact if you do not want an email address published.

**Source:** [RFC 9116](https://www.rfc-editor.org/rfc/rfc9116)

## DNS

DNS rules are checked at the registrable name (without `www.`), through public DNS over HTTPS.

### DNS-1 SPF record (v=spf1 -all if the domain sends no mail)

Required. Passes when there is exactly one SPF record that does not allow everyone (`+all` or `?all`). A warning if the domain has no MX records but the record is not `v=spf1 -all`.

**Why:** without it, anyone can send convincing email from your domain.

**Fix:** a domain that sends no mail publishes `v=spf1 -all`. A domain that sends mail lists its senders and ends with `-all` or `~all`.

**Source:** [RFC 7208](https://www.rfc-editor.org/rfc/rfc7208), [CISA BOD 18-01](https://www.cisa.gov/news-events/directives/bod-18-01-enhance-email-and-web-security), [M3AAWG: protecting parked domains](https://www.m3aawg.org/sites/default/files/m3aawg_parked_domains_bp-2015-12.pdf)

### DNS-2 DMARC policy of reject

Required. Passes when `_dmarc.` has a DMARC record with `p=reject`. `p=quarantine` is a warning; `p=none` or no record fails.

**Why:** tells receiving mail servers to refuse mail that fails SPF and DKIM, which is what actually stops spoofing.

**Fix:** publish `v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s`. If the domain sends mail, start with `p=none` and a reporting address, then tighten.

**Source:** [RFC 7489](https://www.rfc-editor.org/rfc/rfc7489), [CISA BOD 18-01](https://www.cisa.gov/news-events/directives/bod-18-01-enhance-email-and-web-security)

### DNS-3 CAA record limits certificate issuers

Recommended. Passes when a CAA record names at least one allowed issuer.

**Why:** if someone tricks a certificate authority into issuing a certificate for your domain, CAA makes every other authority refuse.

**Fix:** add `CAA 0 issue "<your authority>"` records. On Cloudflare, once any CAA record exists, Cloudflare adds the authorities it uses for its own certificates; confirm they appear.

**Source:** [RFC 8659](https://www.rfc-editor.org/rfc/rfc8659)

## Search and sharing

### SEO-1 robots.txt is present and names the sitemap

Required. Passes when `/robots.txt` returns 200, does not block all crawlers from the whole site, and has a `Sitemap:` line (a missing line is a warning).

**Why:** tells crawlers what they may index and where to find every page.

**Fix:** publish `User-agent: *`, `Allow: /`, and `Sitemap: https://<host>/<sitemap file>`.

**Source:** [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309)

### SEO-2 Sitemap lists only live pages on this site

Required. Passes when the sitemap (from `robots.txt`, or a standard location) lists at least one page, every URL is `https://` on the site's main host, and every sampled URL returns 200 without redirecting.

**Why:** a sitemap with redirects, missing pages, or the wrong host wastes crawlers' time and hides real pages.

**Fix:** generate the sitemap from the site's real pages at build time (for Astro, `@astrojs/sitemap`), using the main host.

**Source:** [sitemaps.org protocol](https://www.sitemaps.org/protocol.html), [Google Search Central: sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview)

### SEO-3 Every page has a unique title and a description

Required. Passes when every sampled page has a non-empty `<title>` and meta description, and no two pages share a title. Shared descriptions are a warning.

**Why:** titles and descriptions are what people see in search results and browser tabs. Duplicates make pages look interchangeable.

**Fix:** give each page its own title and a one-sentence description.

**Source:** [Google Search Central: title links](https://developers.google.com/search/docs/appearance/title-link), [snippets](https://developers.google.com/search/docs/appearance/snippet)

### SEO-4 Canonical URL matches the page

Recommended. Passes when every sampled page has `<link rel="canonical">` pointing to its own URL.

**Why:** tells search engines which address is the real one when the same page is reachable in several ways.

**Fix:** output the canonical URL from the page's own path and the site's main host.

**Source:** [Google Search Central: canonicalization](https://developers.google.com/search/docs/crawling-indexing/canonicalization)

### SHARE-1 Link preview (Open Graph) tags and image

Recommended. Passes when every sampled page has `og:title`, `og:description`, `og:image`, and `twitter:card`, and the preview image is an absolute `https://` URL that loads as an image.

**Why:** controls how links look when shared on LinkedIn, Bluesky, Slack, and messaging apps. Without it, a link is a bare URL.

**Fix:** add the tags to the page layout, with a 1200 by 630 image. Put a version in the image file name so caches update when it changes.

**Source:** [The Open Graph protocol](https://ogp.me/)

## Site basics

### SITE-1 Favicon and Apple touch icon

Recommended. Passes when the home page declares an icon (or `/favicon.ico` exists) and an Apple touch icon (or `/apple-touch-icon.png` exists).

**Why:** identifies the site in tabs, bookmarks, and home screens.

**Source:** [MDN: link types (icon)](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/rel#icon)

### SITE-2 Missing pages return a real 404

Required. Passes when a made-up URL returns 404 (or 410) with an HTML page. A 200 (a "soft 404") or a redirect fails.

**Why:** search engines treat soft 404s as duplicate pages, and visitors need to know a link is broken.

**Fix:** add a 404 page and configure the host to serve it with a 404 status (on Cloudflare Workers static assets, `"not_found_handling": "404-page"`).

**Source:** [Google Search Central: soft 404 errors](https://developers.google.com/search/docs/crawling-indexing/http-network-errors#soft-404-errors)

### SITE-3 Copyright year is current

Required. Passes when the latest year in the home page's copyright notice (in the footer, if there is one) is the current year. Skipped if there is no notice. In the first two weeks of January, last year is a warning.

**Why:** a stale year makes a site look abandoned.

**Fix:** generate the year from the build date instead of typing it, and rebuild at least monthly.

## Accessibility, performance, and privacy

### A11Y-1 Accessibility basics

Recommended. Passes when every sampled page has a `lang` attribute, alt text on every image (empty alt is fine for decoration), exactly one `h1`, and no skipped heading levels, and the home page has a "skip to content" link.

**Why:** these basics make a site usable with screen readers and keyboards. They are not a full accessibility audit.

**Source:** [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

### PERF-1 Compressed HTML and reasonably sized images

Recommended. Passes when the home page HTML is served compressed (Brotli, gzip, or zstd), is under 200 KB, and images on the home page are under 500 KB each.

**Why:** fast pages on slow connections, and less data for visitors on metered plans.

**Source:** [web.dev: fast load times](https://web.dev/explore/fast)

### PRIV-1 Third-party requests

Info. Lists the other hosts the home page loads resources from.

**Why:** every third-party request tells that party who visited, and is code or content outside your control. Keep the list short and deliberate.

## Repository

These rules run in a site's own repository, on pull requests.

### DEP-1 No high or critical dependency vulnerabilities

Required. Passes when `npm audit` finds no high or critical vulnerabilities. Moderate findings are a warning. Skipped for projects without an npm lockfile.

**Why:** known vulnerable packages are the easiest way into a build pipeline or a running site.

**Fix:** run `npm audit fix`, or update the affected packages.

**Source:** [npm audit](https://docs.npmjs.com/cli/commands/npm-audit)

### DEP-2 Lockfile is committed

Required. Passes when a project with `package.json` commits a lockfile.

**Why:** without one, every build may install different versions, including newly compromised ones.

**Source:** [npm: package-lock.json](https://docs.npmjs.com/cli/configuring-npm/package-lock-json)

### DEP-3 Automated dependency updates are configured

Required. Passes when `.github/dependabot.yml` (or a Renovate config) exists.

**Why:** security fixes only help if they get applied. Automated pull requests make updating routine.

**Fix:** copy [templates/dependabot.yml](templates/dependabot.yml) into the site's `.github/` folder.

**Source:** [GitHub: Dependabot version updates](https://docs.github.com/en/code-security/dependabot/dependabot-version-updates)

## Upkeep

This rule runs with the weekly live check when the site's repository is named in the configuration (see [docs/adopting.md](docs/adopting.md)). Without that, it is left out of the report.

### UPKEEP-1 No pull request open longer than 14 days

Recommended. Passes when no pull request in the site's repository has been open for more than 14 days. Reports count only how many pull requests are open and how old the oldest is, never their titles, so a public report does not reveal a private repository's work.

**Why:** automated dependency updates only help if someone merges them. A pull request that sits for weeks usually means a security fix that never shipped, or work that was forgotten.

**Fix:** merge, update or close the pull request. To cut the number of dependency pull requests, group Dependabot updates into one per week (see [templates/dependabot.yml](templates/dependabot.yml)).

**Source:** [GitHub: Dependabot version updates](https://docs.github.com/en/code-security/dependabot/dependabot-version-updates)

## Practices

These are not checked automatically, but they keep sites passing with no manual effort.

### Practice: generate dates at build time

Copyright years, `security.txt` expiry, and similar dates should come from the build date, not be typed by hand.

### Practice: rebuild every month

Schedule a rebuild (for example a monthly GitHub Actions job that calls the host's deploy hook) so build-time dates stay fresh even when nobody touches the site.

### Practice: protect the repository

Turn on secret scanning and push protection, and protect the main branch so changes go through pull requests. Never commit secrets; use the host's or GitHub's secret storage.

### Practice: keep third parties to a minimum

Self-host fonts and images. Each third-party script needs a reason, and a matching, narrow CSP entry.
