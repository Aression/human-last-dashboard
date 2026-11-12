# Deployment

The dashboard is a statically generated Next.js app with no server-side state, secrets, or database. Deployment is therefore a build plus an upload of prerendered files; nothing needs to run at request time.

## 1. Where it runs

| | |
| --- | --- |
| Host | Vercel (Hobby plan) |
| Project | `human-last-dashboard` (framework preset: Next.js) |
| Production URL | https://human-last-dashboard.vercel.app |
| Project URL | https://human-last-dashboard-lvdifine-3768s-projects.vercel.app |
| Runtime env vars | none required |

Git pushes do **not** trigger deployments: the project is GitHub-connected with `gitProviderOptions.createDeployments` set to `disabled`, so a deployment is always an explicit action (§2). Turn automatic deployments back on in project settings if the team wants push-to-deploy; until then a merge to `main` is not live until someone deploys.

## 2. Deploying

From the repository root, with a Vercel token in `VERCEL_TOKEN`:

```bash
npx vercel@latest deploy --prod --yes
```

`npm run build` runs first in the same way it does locally (`npm run validate:data && next build`), so a dataset that violates `lib/validate.ts` fails the deployment instead of shipping.

Verify the result without opening the site — the deployment is only "live" when the API says so:

```bash
npx vercel@latest inspect <deployment-url>          # readyState, build logs
curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v9/projects/human-last-dashboard/domains"
```

The checks that count: `readyState: READY`, the production alias points at the new deployment, and the deployment's `meta.githubCommitSha` matches the commit intended to be live.

### Deploying on a schedule

The daemon also deploys, so the site does not depend on someone remembering to run the command. Every five days it runs the `release` task (`tools/evidence-mcp/config/discovery.json`, cron `7 4 */5 * *`), which is:

```bash
npm run evidence:run -- release
```

Rebuild `data/automation/snapshot.json` from the store → commit whatever changed under `data/` → `git push origin <branch>` → `npx vercel@latest deploy --prod --yes`. It refuses when any path outside `data/` is modified, when `HEAD` is detached, when `data/` has no change after the rebuild (nothing to publish, so no deploy), and when the git or Vercel token is missing — in that last case it reports exactly which step stopped, so a commit that was created but not pushed is visible rather than inferred.

Tokens come from the environment (`HLD_GIT_TOKEN`/`GITHUB_TOKEN`/`GITHUB_DEV_TOKEN`, `HLD_VERCEL_TOKEN`/`VERCEL_TOKEN`) or from `HLD_ENV_FILE` (default `D:\devspace\.env`, keys `GITHUB-DEV-TOKEN` and `VERCEL_KEY`). They are redacted from everything the run records. Details and the refusal table: [Evidence automation §7](automation.md).

## 3. Verifying what is live

Two independent sources of truth, because one of them is not reachable from every network:

1. **Vercel API** — deployment state, alias assignment, commit sha (as above).
2. **Local build output** — `npm run build` writes `.next/server/app/**/*.html`; the text in those files is what was uploaded. Grepping them (for a record list, the demo banner, the provenance panel's "not observed" strings) verifies content without HTTP.

**Known network limitation.** On the development machine used to build this project, `*.vercel.app` is unreachable: DNS returns unrelated addresses and TLS connections to the correct Vercel anycast IPs are reset. `vercel.com` and the Vercel API work, so deployment state is verifiable but the public URL is not fetchable from there. This is an environment constraint, not a site failure; check the URL from a normal network, and use a custom domain (§5) if the default domain is blocked on the network you view it from.

## 4. Access and data

The project had Vercel's SSO deployment protection enabled, which makes every preview and production URL require a Vercel login. It is disabled (`ssoProtection: null`) so the public URL answers without authentication.

What the site publishes is **public material only**: the curated records cite published papers, public blog posts, and public repositories, with the URL and retrieval time of each page. Whole page bodies are not stored or served — a record keeps a short quote, a bounded summary, and a content hash. If the dataset ever carries non-public material, re-enable protection and add authentication before deploying.

## 5. Domains and rollback

- **Custom domain:** add it under project settings → Domains, then point the DNS record at Vercel. The build does not need to change.
- **Rollback:** promote an earlier deployment (`npx vercel@latest rollback`, or roll back in the dashboard). Because every route is static and the dataset is versioned in git, redeploying an earlier commit reproduces the earlier site exactly.

## 6. Deployment history

| Commit | Commit | Deployment | State |
| --- | --- | --- |
| `8ec9ebe` (initial dashboard) | `dpl_56NxTQDLUXBy2diM4psmNTL2zLwa` | READY, alias assigned |
| `80edd41` (validation, tests, URL filters, provenance panel) | `dpl_AdMG8wu5XpcB61ZqXsTVHVKHRpxC` | READY, production alias, `meta.githubCommitSha` matches the pushed commit |
| `bcc4eac` (deployment docs) | `dpl_3HGwGWt6FqygCMvZ8xEhbFBNmiHd` | READY, production alias, `source: cli`, sha matches |
| `d013f4f` (discovery and audit automation, docs) | `dpl_2Cd6AZKhk2oK3QGp2J2Qov62qWGc` | READY, production alias, sha matches `HEAD` |
| `1dd3678`, `e8a9417` (deployment notes, daemon fixes) | `dpl_3ffQoud3tTudLtBWFaeZq5oe46pg`, `dpl_GU1CNN4mUe4vq1Ee91qU9MLBmPBC` | READY, production alias, sha matches `HEAD` |
| `f09b14b`, `a68688d` (the `/automation` page and its docs) | `dpl_Bdm1Sf1gNzz3w4xFWDoX7soqGpe4` | READY, production alias, sha matches `HEAD` |
| `8762c25` (timestamp formatting fix) | `dpl_FZEqpV8es7Li8FMb8Kh1mHKMEyVr` | READY, production alias, sha matches `HEAD` |
| `de8bef9` (deployment notes) | `dpl_DeURyBNUucnvT2oQAe7kTC4KBCuz` | READY, production alias, sha matches `HEAD` |
| `fcc7e16` (curated records, bilingual routes, translation overlays) | `dpl_8zpyPJgtUcqYnBg4EwR7QtFXVMhs` | READY, `target: production`, `githubCommitSha: fcc7e16b9652519ad146f50e0c51c5e6f761e827` equal to `git rev-parse HEAD`, both production aliases assigned |

Verified for the `fcc7e16` entry through `GET https://api.vercel.com/v13/deployments/…`: `readyState: READY`, `target: production`, aliases `human-last-dashboard.vercel.app` and `human-last-dashboard-lvdifine-3768s-projects.vercel.app`. `*.vercel.app` is still unreachable from the workstation that deploys, so the live bodies were rendered through a third-party fetch service (`api.microlink.io`):

| Path | Body characters | What it shows |
| --- | --- | --- |
| `/` | 31,105 | English, 2 CJK characters — middleware redirected the unprefixed path to `/en` |
| `/en/automation` | 222,265 | English, 2 CJK characters, no demo-data banner |
| `/zh/automation` | 214,769 | 4,367 CJK characters; failure reasons render as `触发限流（HTTP 429）`, `请求超时`, `其他抓取错误` |
| `/zh/evidence` | 78,656 | `复制链接` once, `Copy link` zero times |
| `/zh/evidence/s-aide2` | 29,457 | `此记录不能确立什么` twice — the provenance panel in Chinese |

The fetching service rate-limited further checks (`HTTP 429`), so `/en/evidence` was confirmed against the local prerender instead: `.next/server/app/en/evidence.html` contains `Copy link` once and `复制链接` zero times, and `.next/server/app/en/evidence/s-aide2.html` contains `What this record does not establish` twice.

Earlier deployments were verified the same way. `8762c25`'s live `/automation` body was 222,481 characters with zero occurrences of `Invalid Date` — the defect that deploy fixed, found by rendering the page rather than by reading the build log. `d013f4f`'s `/evidence/s-01` returned 28,501 characters with `Not observed — no URL is stored for this source.` twice and `Fictional demonstration record` six times; that wording describes the demo era and no longer appears, because the demo fixture is no longer rendered.

The table names the commit whose built output a deployment serves. A documentation-only commit after it does not change that output, but the site is redeployed anyway so the live deployment's commit sha always equals `HEAD`.
