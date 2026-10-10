# Releasing

English | [中文](releasing.zh.md)

This is a third-party DSH bundle, not a profile or an official DSH distribution. Initialization does not publish a release.

## Official requirements applied here

The source baseline is DSH `0.2.1-alpha.2`, commit `d743267388641bc76f17c45ce8b4c231aed1d32c`.

| Contract | Project configuration |
| --- | --- |
| npm bundle manifest | `package.json` declares `dsh.bundle.patch`; no `dsh.profile` |
| Resolvable plugin row | `cordis.patch.yml` inserts the published package name |
| Cordis entry | `src/index.ts` exports `name` and `apply(ctx)` |
| Shared runtime identity | Cordis is both a peer and a development dependency; no runtime bundling |
| Prebuilt distribution | `prepack` builds JavaScript/declarations; `files` includes the patch and assets |
| Git source installation | `prepare` builds standalone, without a DSH source checkout |
| Plugin discovery | npm `dsh-plugin` keyword; add GitHub repository topic `dsh-plugin` |
| Plugin listing metadata | `icon` and `locale/en.json`, `locale/zh.json` with `meta.title`/`meta.description` |

The icon/locale convention follows the official Agent Teams bundle. English/Chinese project documentation is a project choice; upstream translation tracking files are not an external plugin installation requirement.

## Validate

```sh
npm ci
npm run verify
npm run pack:check
npm pack --dry-run
```

These validate strict Host/Client/script/test types, headless behavior and Client boundary scenarios, exports, bundle metadata, and installing/importing the prebuilt tarball in an independent consumer. The Client uses the official closure-factory loader and public conversation slot. The exact alpha.2 declaration correction is development-only, excluded from the package; see the [POC assessment](headless-poc.md). They do not prove a desktop interaction or model task works. Before an actual release, install the tarball into the target DSH desktop, enable/disable the plugin, and verify every advertised capability. Recheck compatibility whenever the DSH baseline changes.

The cumulative-review Host API requires awaiting `open` before dispatching work and using the returned owned review identity for `reviewDiff` and feedback. Release validation must cover failed replacement-open restoration with invalidated evidence, start-to-current multi-turn changes, unchanged dirty/untracked exclusions, staged/committed deletion, text/file feedback, stale-content and directory-change invalidation, and unchanged permission/worktree safeguards. Test missing, expired, omitted and truncated official summaries against the independent covered file list; passing these tests does not close upstream snapshot issue #7. Keep the bounded capture limits and unsupported cases in the [POC assessment](headless-poc.md#interfaces) visible. Do not present this Host work as a new desktop review UI, real-model validation or restart recovery, and record test results only after running the commands on the release candidate.

## GitHub alpha release

1. Choose an `x.y.z-alpha.N` version, update `package.json` and its lockfile, and record the real changes in `CHANGELOG.md`.
2. Run the checks above and review CI.
3. Only after a release request, tag the reviewed main commit as `v<version>` and push the tag.

The alpha workflow rejects a mismatched version, rechecks the package, and creates a GitHub prerelease with a prebuilt `.tgz` and `SHA256SUMS`. It does not publish npm. Stable releases need a separately reviewed workflow/tag policy.

## npm publication

Use the existing maintainer scope `@guosheng_047`. Confirm npm identity, scope publishing rights, and first-publication package availability before publishing. Authenticate through your normal npm method; no token belongs in the repository.

```sh
npm whoami
npm publish --access public --tag alpha
```

`prepublishOnly` verifies the package and `prepack` builds it. Never promote an alpha POC to `latest`. GitHub Actions trusted publishing is not configured by this scaffold; it requires npm-side setup and a deliberate release policy.

After an npm release, users can install `@guosheng_047/dsh-devwork@alpha` from the desktop Plugins page, or run:

```sh
dsh plugin --profile devwork-demo add @guosheng_047/dsh-devwork@alpha
```

Before npm publication, install the prebuilt tarball or a local checkout. Git installs require pnpm's explicit build allowance for this package's `prepare` script; follow the exact package key in pnpm's diagnostic and pin the source commit. Tarball/npm installs use built artifacts and do not need that build allowance.

## Primary references

- [Official packaging and installation tutorial](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/docs/user/develop/basic/publish.md)
- [Official plugin entry tutorial](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/docs/user/develop/basic/index.md)
- [Official Agent Teams bundle metadata](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/experimental/agent-team-profile/package.json)
- [Official plugin discovery guidance](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/README.md#community-and-support)
