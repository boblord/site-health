# site-health

Website standards, and an automated checker that holds sites to them.

[STANDARDS.md](STANDARDS.md) defines the rules: HTTPS and security headers, a current `security.txt`, email-spoofing protection in DNS, a working sitemap and 404 page, link previews, accessibility basics, and dependency hygiene. Each rule has an id, a reason, a fix, and an authoritative source (RFCs, CISA, OWASP, MDN, WCAG, Google Search Central).

The checker looks at a site from the outside, the way any visitor or scanner does, and needs no access to the site's host or code. A second set of checks runs inside a site's repository on pull requests.

## How it runs

- **Weekly, for the sites in [sites.yml](sites.yml):** [.github/workflows/weekly.yml](.github/workflows/weekly.yml) checks every listed site and keeps one issue per site in this repository up to date. It comments when the list of problems changes, so GitHub notifies the owner, and closes the issue when everything passes.
- **On pull requests, in each site's repository:** the reusable workflow [.github/workflows/site-check.yml](.github/workflows/site-check.yml) runs the repository checks (dependency vulnerabilities, lockfile, Dependabot). It starts in warning mode and can be switched to block merges once a site passes.
- **Privately, from a site's own repository:** a site that should not appear in the public list can run the weekly live check from its own (private) repository instead. Its results stay there.

[docs/adopting.md](docs/adopting.md) explains how to connect a site.

## Run it yourself

Requires Node.js 22.12 or newer.

```sh
npx --yes github:boblord/site-health#v2 check https://example.org
```

Or from a clone:

```sh
npm ci
node bin/site-health.js check https://example.org          # one live site
node bin/site-health.js run --config sites.yml             # every site in the list
node bin/site-health.js repo path/to/site-repo             # repository checks
```

Options: `--md file` and `--json file` save the report, `--sample N` sets how many sitemap pages to check (default 100), `--skip HTTPS-1,HTTPS-2` skips rules, `--exceptions file.yml` applies a site's exceptions, and `--enforce` exits with status 1 when a required check fails.

The checker sends a neutral User-Agent (`site-health-checker/1`), looks up DNS through Google Public DNS over HTTPS, and needs no credentials except `GITHUB_TOKEN` when it manages issues.

## Using it for your own sites

Everything here is generic. To use it for your own sites, either:

- **Call the reusable workflow** from your site's repository, pointing at this repository (see [templates/site-health.yml](templates/site-health.yml)). Your results stay in your repository.
- **Fork it** to change the standards or keep your own central list. In a fork, update `site-health-repo` in the templates and set `SITE_HEALTH_STANDARDS_URL` so report links point to your copy of `STANDARDS.md`.

Some rules reflect this project's choices (for example, a DMARC policy of reject and a current copyright year). A site can be excused from any rule with a written reason; see [STANDARDS.md](STANDARDS.md).

## Development

`npm test` runs the unit tests. They also check that every rule in [src/rules.js](src/rules.js) has a section in [STANDARDS.md](STANDARDS.md) and the other way around.

| Path | What it is |
| --- | --- |
| `STANDARDS.md` | The rules, in prose |
| `src/rules.js` | The rules, as data: id, title, level, version |
| `src/live.js` | Live checks against a URL |
| `src/repo.js` | Repository checks |
| `src/analyze.js` | Pure functions that judge headers, records, and pages |
| `src/net.js` | HTTP, DNS over HTTPS, and certificate helpers |
| `src/report.js` | Scoring, exceptions, and Markdown reports |
| `src/issues.js` | Keeps one GitHub issue per site up to date |
| `templates/` | Files to copy into a site repository |

## License

MIT. See [LICENSE](LICENSE).
