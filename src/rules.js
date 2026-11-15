// The machine-readable list of standards. STANDARDS.md explains each rule in
// prose; keep the two in step (the test suite checks that every id here has a
// heading there).
//
// level:
//   required     a failure makes the site fail the standard
//   recommended  a failure is reported as a warning
//   info         never passes or fails; reported for awareness
// since: the standards version that introduced the rule.

export const STANDARDS_VERSION = 2;

export const RULES = [
  // HTTPS
  { id: 'HTTPS-1', title: 'Valid certificate with time to spare', level: 'required', since: 1, scope: 'live' },
  { id: 'HTTPS-2', title: 'Plain HTTP redirects to HTTPS', level: 'required', since: 1, scope: 'live' },
  { id: 'HTTPS-3', title: 'One canonical host (www or apex)', level: 'recommended', since: 1, scope: 'live' },

  // Security headers
  { id: 'HDR-1', title: 'Strict-Transport-Security (ramping up to a year)', level: 'required', since: 1, scope: 'live' },
  { id: 'HDR-2', title: 'Content Security Policy restricts scripts', level: 'required', since: 1, scope: 'live' },
  { id: 'HDR-3', title: 'Framing is restricted', level: 'required', since: 1, scope: 'live' },
  { id: 'HDR-4', title: 'X-Content-Type-Options: nosniff', level: 'required', since: 1, scope: 'live' },
  { id: 'HDR-5', title: 'Referrer-Policy does not leak full URLs', level: 'recommended', since: 1, scope: 'live' },
  { id: 'HDR-6', title: 'Permissions-Policy is set', level: 'recommended', since: 1, scope: 'live' },

  // Security contact
  { id: 'SEC-1', title: 'security.txt is present and current', level: 'required', since: 1, scope: 'live' },

  // DNS
  { id: 'DNS-1', title: 'SPF record (v=spf1 -all if the domain sends no mail)', level: 'required', since: 1, scope: 'live' },
  { id: 'DNS-2', title: 'DMARC policy of reject', level: 'required', since: 1, scope: 'live' },
  { id: 'DNS-3', title: 'CAA record limits certificate issuers', level: 'recommended', since: 1, scope: 'live' },

  // Search and sharing
  { id: 'SEO-1', title: 'robots.txt is present and names the sitemap', level: 'required', since: 1, scope: 'live' },
  { id: 'SEO-2', title: 'Sitemap lists only live pages on this site', level: 'required', since: 1, scope: 'live' },
  { id: 'SEO-3', title: 'Every page has a unique title and a description', level: 'required', since: 1, scope: 'live' },
  { id: 'SEO-4', title: 'Canonical URL matches the page', level: 'recommended', since: 1, scope: 'live' },
  { id: 'SHARE-1', title: 'Link preview (Open Graph) tags and image', level: 'recommended', since: 1, scope: 'live' },

  // Site basics
  { id: 'SITE-1', title: 'Favicon and Apple touch icon', level: 'recommended', since: 1, scope: 'live' },
  { id: 'SITE-2', title: 'Missing pages return a real 404', level: 'required', since: 1, scope: 'live' },
  { id: 'SITE-3', title: 'Copyright year is current', level: 'required', since: 1, scope: 'live' },

  // Accessibility, performance, privacy
  { id: 'A11Y-1', title: 'Accessibility basics', level: 'recommended', since: 1, scope: 'live' },
  { id: 'PERF-1', title: 'Compressed HTML and reasonably sized images', level: 'recommended', since: 1, scope: 'live' },
  { id: 'PRIV-1', title: 'Third-party requests', level: 'info', since: 1, scope: 'live' },

  // Repository (checked in the site's own repo, on pull requests)
  { id: 'DEP-1', title: 'No high or critical dependency vulnerabilities', level: 'required', since: 1, scope: 'repo' },
  { id: 'DEP-2', title: 'Lockfile is committed', level: 'required', since: 1, scope: 'repo' },
  { id: 'DEP-3', title: 'Automated dependency updates are configured', level: 'required', since: 1, scope: 'repo' },

  // Upkeep (checked with the live site when a repository is named for it)
  { id: 'PR-1', title: 'No pull request open longer than 14 days', level: 'recommended', since: 2, scope: 'upkeep' },
];

export const RULES_BY_ID = Object.fromEntries(RULES.map((r) => [r.id, r]));

// Where report links point. A fork can set SITE_HEALTH_STANDARDS_URL to its own copy.
export const STANDARDS_URL =
  process.env.SITE_HEALTH_STANDARDS_URL || 'https://github.com/boblord/site-health/blob/main/STANDARDS.md';

/** Link to a rule's section in STANDARDS.md. */
export function ruleUrl(id) {
  return `${STANDARDS_URL}#${id.toLowerCase()}`;
}
