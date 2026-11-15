# Changelog

## Added to version 2 (2026-11-15)

- **UPKEEP-1** (recommended): no pull request in the site's repository open longer than 14 days. It runs only when a repository is named for the site, so sites without one see no change. First published as PR-1 and renamed the same day, because the id read like a pull request number.
- **UPKEEP-2** (recommended): Dependabot has run in the last 14 days and its latest run for each ecosystem succeeded.
- **UPKEEP-3** (recommended): no branch other than the default branch idle for more than 30 days without an open pull request.

## Standards version 2 (2026-11-15)

- **HDR-1** now ramps up. Until 2026-12-15 it passes with a `max-age` of at least one week and warns about `includeSubDomains`. From 2026-12-15 it requires one year again, as in version 1, and allows `includeSubDomains`. The rule's title changed to "Strict-Transport-Security (ramping up to a year)".

## Standards version 1 (2026-11-15)

First version. Rules: HTTPS-1 to HTTPS-3, HDR-1 to HDR-6, SEC-1, DNS-1 to DNS-3, SEO-1 to SEO-4, SHARE-1, SITE-1 to SITE-3, A11Y-1, PERF-1, PRIV-1, and DEP-1 to DEP-3. See [STANDARDS.md](STANDARDS.md).
