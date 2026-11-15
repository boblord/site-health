# Working in site-health

This repository is public. It holds website standards (STANDARDS.md), a checker for them, and workflows that run the checker.

## Rules

- **Never name a real site or repository.** This repository lists no sites: owners keep their lists and results in private repositories (`templates/sites.yml`, `templates/central-weekly.yml`). Do not add a real site or repository name to any file, example, test, commit message or issue here. Use `example.org` in examples.
- Keep `STANDARDS.md` and `src/rules.js` in step. Every rule id needs a `### <ID> <Title>` section in STANDARDS.md; `npm test` enforces this.
- A new rule starts as `recommended` and is noted in CHANGELOG.md. Making a rule `required`, or changing what passes, is a new standards version: bump `STANDARDS_VERSION` in `src/rules.js`, update the heading of STANDARDS.md and CHANGELOG.md, and move the major tag (for example `v2`) only when the release is ready.
- **Releasing.** Sites pin a major tag (`v2`), and the docs and templates name it. A new standards version is released in one go: bump `STANDARDS_VERSION`, update STANDARDS.md, CHANGELOG.md and every `#vN` and `@vN` in the docs and templates (`npm test` checks they match), merge, then push the new tag at that commit. Move an existing tag forward (`git tag -f v2 && git push -f origin v2`) only for fixes and new recommended rules, and only when the owner asks. CI on `main` fails while the tag for the current version is missing.
- Keep the checker dependency-light (currently `yaml` and `cheerio`) and credential-free. It must work for anyone who forks the repository.
- Put judgment logic in `src/analyze.js` as pure functions with unit tests in `test/`. `src/live.js` only fetches and calls them.
- Run `npm test` before committing. To try live checks from a proxied environment, set `NODE_USE_ENV_PROXY=1`; certificate (HTTPS-1) and plain-HTTP (HTTPS-2) checks may need `--skip` there because they cannot pass through an HTTPS proxy.
- Reports and messages are plain sentences. No em dashes.
