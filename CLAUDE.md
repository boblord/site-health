# Working in site-health

This repository is public. It holds website standards (STANDARDS.md), a checker for them, and workflows that run the checker.

## Rules

- **Never name a site that is not already in `sites.yml`.** Some sites run these checks privately from their own repositories on purpose. Do not add a site to `sites.yml`, an example, a test, a commit message, or an issue unless the owner explicitly asks for that site to be listed publicly. Use `example.org` in examples.
- Keep `STANDARDS.md` and `src/rules.js` in step. Every rule id needs a `### <ID> <Title>` section in STANDARDS.md; `npm test` enforces this.
- A new rule starts as `recommended` and is noted in CHANGELOG.md. Making a rule `required`, or changing what passes, is a new standards version: bump `STANDARDS_VERSION` in `src/rules.js`, update the heading of STANDARDS.md and CHANGELOG.md, and move the major tag (for example `v2`) only when the release is ready.
- Keep the checker dependency-light (currently `yaml` and `cheerio`) and credential-free. It must work for anyone who forks the repository.
- Put judgment logic in `src/analyze.js` as pure functions with unit tests in `test/`. `src/live.js` only fetches and calls them.
- Run `npm test` before committing. To try live checks from a proxied environment, set `NODE_USE_ENV_PROXY=1`; certificate (HTTPS-1) and plain-HTTP (HTTPS-2) checks may need `--skip` there because they cannot pass through an HTTPS proxy.
- Reports and messages are plain sentences. No em dashes.
