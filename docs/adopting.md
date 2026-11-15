# Connecting a site

There are two parts, and a site can use either or both:

1. **Live checks** look at the published site from outside.
2. **Repository checks** run in the site's own repository on pull requests.

## 1. Live checks

Choose one:

- **Public, central:** add the site to [sites.yml](../sites.yml) in this repository. It is checked every Monday and gets one public issue here. Use this only for sites you are happy to associate publicly with this repository.
- **Private, from the site's own repository:** do not add it to `sites.yml`. Instead, in step 2, uncomment the `schedule:` lines in the workflow. The weekly check then runs in the site's repository, and its issue stays there. If the repository is private, nobody else sees the results or the connection between the site and this project.

## 2. Repository checks

In the site's repository:

1. Copy [templates/site-health.yml](../templates/site-health.yml) to `.github/workflows/site-health.yml` and set `url` to the site's main address.
2. Copy [templates/dependabot.yml](../templates/dependabot.yml) to `.github/dependabot.yml` (rule DEP-3). Remove ecosystems the site does not use.
3. Optional: copy [templates/site-health-config.yml](../templates/site-health-config.yml) to `.site-health.yml` and list any exceptions, each with a reason.
4. Add the instructions below to the repository's `CLAUDE.md`.

The workflow starts in warning mode (`enforce: false`). Once the site passes, set `enforce: true` and make the check required in the repository's branch protection settings, so a pull request cannot merge if it breaks a required rule.

## Pull requests left open (UPKEEP-1)

UPKEEP-1 warns when a pull request in the site's repository has been open more than 14 days. It reports only a count and the age of the oldest, never titles.

- **Checked from the site's own repository:** nothing to set up beyond the `pull-requests: read` permission in the template.
- **Public, central:** name the repository for each site. For a public repository, add `repo: owner/name` to the site in `sites.yml`. For a private repository, keep its name out of this public repository: set a repository variable `SITE_HEALTH_REPOS` to JSON such as `{"example.org": "owner/example-site"}`, and add a secret `SITE_HEALTH_PULLS_TOKEN` holding a fine-grained token with read-only "Pull requests" access to those repositories.

## Exceptions

When a rule cannot or should not apply to a site, record why instead of leaving it red. For a site in `sites.yml`, add it there:

```yaml
  - url: https://example.org
    exceptions:
      - rule: HDR-2
        reason: The host does not allow custom headers. Moving hosts in Q2.
        until: 2027-06-30
```

For a site checked from its own repository, put the same `exceptions:` list in `.site-health.yml`. An exception without `until` lasts until removed. Expired exceptions stop applying and are noted in the report.

## Instructions for Claude (CLAUDE.md)

Paste this into the site repository's `CLAUDE.md`, so that any work on the site also brings it closer to the standards:

```markdown
## Site standards

This site follows the website standards in https://github.com/boblord/site-health
(STANDARDS.md), version 2. Rule ids such as HDR-2 refer to that file.

- Before opening a pull request, run the repository checks:
  `npx --yes github:boblord/site-health#v2 repo .`
- For changes that affect the published site, also check the deployed preview or
  production: `npx --yes github:boblord/site-health#v2 check <url>`.
- When a change touches an area covered by a failing rule, fix that rule in the
  same change if the fix is small, and say in the pull request what remains.
- Never weaken a passing check to make something else work. If a rule should not
  apply, add an exception with a reason to .site-health.yml and say so.
- Generate dates that expire (copyright year, security.txt Expires) from the
  build date instead of typing them.
```

## Moving to a new version of the standards

Each site chooses its version in two places: the tag in its workflow's `uses:` line (`site-check.yml@v2`), and the version named in its `CLAUDE.md` (`site-health#v2`). Keep them the same. The tag for a version is moved forward with fixes and new recommended rules, but never to a change that makes a passing site fail; that is the next version. When a new version is published, [CHANGELOG.md](../CHANGELOG.md) lists what changed. Update a site when convenient: change both, run the checks, and fix or except what is new.
