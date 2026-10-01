# DSH Devwork

English | [中文](README.zh.md)

A desktop development workspace built on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Talk to one lead AI, let coding tasks advance in parallel, and review the results in one place.

**Status: initial plugin scaffold.** The bundle metadata, plugin entry, bilingual descriptions, build checks, and packaging workflow are set up. Parallel workers, task cards, and diff annotations are planned and are not implemented in this version. No npm release has been published yet.

## Direction

- Keep DSH's conversation, tools, permissions, and plugin habits.
- Let a lead AI coordinate tasks, summarize results, and surface decisions.
- Make code review and batched feedback part of the same development flow.
- Learn from Orca's developer experience and implement independently in DSH; no Orca code or runtime dependency.

The first phase focuses on local desktop development. Remote execution, mobile clients, email, and automatic crash recovery are deferred.

## Develop and try the bundle

Baseline: DSH **0.2.0-rc.2**, Cordis **4.0.4**. Use Node.js 22.19+ or 24+; CI checks Node 22 and 24.

```sh
git clone https://github.com/GuoMonth/dsh-devwork.git
cd dsh-devwork
npm ci
npm run verify
npm pack
```

In the DSH desktop Plugins page, use the local package directory as an installation source. Enable the bundle; this scaffold adds no conversation controls yet. For CLI validation with an installed DSH CLI, from the directory above the checkout:

```sh
dsh plugin --profile devwork-demo add ./dsh-devwork
dsh --profile devwork-demo --dump-config
```

The output should include the Devwork bundle layer and the `guomonth-devwork` row. This CLI profile is an installation check, not a separate desktop application.

## Package and release

Package: `@guosheng_047/dsh-devwork`. It is a DSH **bundle** with `dsh.bundle.patch`, not a profile. Shared Host APIs are peers; built JavaScript, declarations, patch, icon, and locales are included in the npm tarball.

See [release instructions](docs/releasing.md) and [contributing](CONTRIBUTING.md). GitHub alpha tags package a prerelease tarball; npm publishing is a separate, explicit maintainer action.

## References

[First plugin](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.md) · [Package and install](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md) · [Lifecycle](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/framework/index.md)

MIT · Community project; not an official DeepSeek product.
