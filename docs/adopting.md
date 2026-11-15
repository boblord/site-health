# Connecting a site

There are two parts, and a site can use either or both:

1. **Live checks** look at the published site from outside.
2. **Repository checks** run in the site's own repository on pull requests.

## 1. Live checks

Choose one:

- **Central, private (for several sites):** create a private repository of your own. Copy [templates/sites.yml](../templates/sites.yml) to `sites.yml` there and list your sites, and copy [templates/central-weekly.yml](../templates/central-weekly.yml) to `.github/workflows/weekly.yml`. Every Monday it checks each site and keeps one issue per site in that repository. Adding a site is one entry in `sites.yml`. Because the repository is private, nobody else sees the list of sites or the results.
- **From the site's own repository (for one site):** in step 2, uncomment the `schedule:` lines in the workflow. The weekly check then runs in the site's repository, and its issue stays there.

## 2. Repository checks

In the site's repository:

1. Copy [templates/site-health.yml](../templates/site-health.yml) to `.github/workflows/site-health.yml` and set `url` to the site's main address.
2. Copy [templates/dependabot.yml](../templates/dependabot.yml) to `.github/dependabot.yml` (rule DEP-3). Remove ecosystems the site does not use.
3. Optional: copy [templates/site-health-config.yml](../templates/site-health-config.yml) to `.site-health.yml` and list any exceptions, each with a reason.
4. Add the instructions below to the repository's `CLAUDE.md`.

The workflow starts in warning mode (`enforce: false`). Once the site passes, set `enforce: true` and make the check required in the repository's branch protection settings, so a pull request cannot merge if it breaks a required rule.

## Repository upkeep (UPKEEP-1 to UPKEEP-3)

These rules warn when a pull request has been open more than 14 days (UPKEEP-1), when Dependabot has stopped running or is failing (UPKEEP-2), and when a branch has sat idle for more than 30 days without a pull request (UPKEEP-3). They report counts and ages only, never titles or branch names.

- **Checked from the site's own repository:** nothing to set up beyond the `pull-requests: read` and `actions: read` permissions in the template.
- **Central, private:** add `repo: owner/name` to each site in your `sites.yml`, and add a secret `SITE_HEALTH_PULLS_TOKEN` to your private repository holding a fine-grained token for the site repositories with read-only "Pull requests" (UPKEEP-1), "Actions" (UPKEEP-2) and "Contents" (UPKEEP-3) access. Leave out a permission to skip that rule; "Contents" also lets the token read the repositories' files. (If your list must live in a public repository, the checker can instead read the repositories from a `SITE_HEALTH_REPOS` secret holding JSON such as `{"example.org": "owner/example-site"}`.)

## Exceptions

When a rule cannot or should not apply to a site, record why instead of leaving it red. For a site in your central `sites.yml`, add it there:

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
