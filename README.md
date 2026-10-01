# DSH Devwork

English | [中文](README.zh.md)

A desktop development workspace built on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Talk to one lead AI, let coding tasks advance in parallel, and review the results in one place.

**Status: local headless POC.** Official Team development → review → acceptance checks → located feedback → revision is exercised with a scripted model and real DSH services. This does not yet prove real-model autonomy or desktop rendering. No npm release has been published.

## Direction

- Keep DSH's conversation, tools, permissions, and plugin habits.
- Let a lead AI coordinate tasks, summarize results, and surface decisions.
- Make code review and batched feedback part of the same development flow.
- Learn from Orca's developer experience and implement independently in DSH; no Orca code or runtime dependency.

The first phase focuses on local desktop development. Remote execution, mobile clients, email, and automatic crash recovery are deferred.

The [headless POC assessment](docs/headless-poc.md) records the implementation, lifecycle findings, results and blockers. We reuse official tasks and members, gate delivery on current acceptance evidence, and send several diff comments as one follow-up to the same Leader. The UI currently provides an editable start request; a result/feedback surface remains to be built. See also the earlier [phase-one assessment](docs/phase-one.md).

## Develop and try the bundle

Baseline: DSH **0.2.0-rc.2**, Cordis **4.0.4**. Use **Node.js 24.x only**; the minor/patch version is not fixed. CI and releases use Node 24. All source and development scripts use **strict TypeScript 7.0.2**, with unchecked indexed access and exact optional property checks enabled.

```sh
git clone https://github.com/GuoMonth/dsh-devwork.git
cd dsh-devwork
npm ci
npm run verify
npm run pack:check
npm pack
```

In the DSH desktop Plugins page, use the local package directory as an installation source. Enable Devwork and the official opt-in Agent Teams bundle. The Host also needs official tools, a Bash provider, system prompt, and workspace-changes. Missing services leave Devwork pending. The input action inserts an editable request and never submits it automatically. For CLI validation with an installed DSH CLI, from the directory above the checkout:

```sh
dsh plugin --profile devwork-demo add ./dsh-devwork
dsh --profile devwork-demo --dump-config
```

The output should include the Devwork bundle layer and the `guomonth-devwork` row. This CLI profile is an installation check, not a separate desktop application.

The test suite checks Host behavior and Client registration/insertion without a browser. The real-model and native desktop acceptance checks remain open. DSH rc.2 has a public declaration composition defect; our exact, development-only correction is documented in the [POC assessment](docs/headless-poc.md#blockers-and-limits).

## Package and release

Package: `@guosheng_047/dsh-devwork`. It is a DSH **bundle** with `dsh.bundle.patch`, not a profile. Shared Host APIs are peers; built JavaScript, declarations, patch, icon, and locales are included in the npm tarball.

See [release instructions](docs/releasing.md) and [contributing](CONTRIBUTING.md). GitHub alpha tags package a prerelease tarball; npm publishing is a separate, explicit maintainer action.

## References

[First plugin](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.md) · [Package and install](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md) · [Lifecycle](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/framework/index.md)

MIT · Community project; not an official DeepSeek product.
