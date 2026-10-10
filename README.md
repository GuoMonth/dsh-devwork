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

The [headless POC assessment](docs/headless-poc.md) records the implementation, lifecycle findings, results and blockers. We reuse official tasks and members, gate delivery on current acceptance evidence, and send several diff comments as one follow-up to the same Leader. Temporary task worktrees now support a [committed Leader handoff and cleanup](docs/task-delivery.md). The UI currently provides an editable start request; a result/feedback surface remains to be built. See also the earlier [phase-one assessment](docs/phase-one.md).

## Develop and try the bundle

Baseline: DSH **0.2.1-alpha.2**, Cordis **4.0.5-alpha.1**. Use **Node.js 24.x only**; the minor/patch version is not fixed. CI and releases use Node 24. All source and development scripts use **strict TypeScript 7.0.2**, with unchecked indexed access and exact optional property checks enabled.

```sh
git clone https://github.com/GuoMonth/dsh-devwork.git
cd dsh-devwork
npm ci
npm run verify
npm run pack:check
npm pack
```

In the DSH desktop Plugins page, use the local package directory as an installation source. Enable Devwork and the official opt-in Agent Teams bundle. The Host also needs official tools, a Bash provider, system prompt, workspace-changes, and working-directory. Missing services leave Devwork pending. The input action inserts an editable request and never submits it automatically. For CLI validation with an installed DSH CLI, from the directory above the checkout:

```sh
dsh plugin --profile devwork-demo add ./dsh-devwork
dsh --profile devwork-demo --dump-config
```

The output should include the Devwork bundle layer and the `guomonth-devwork` row. This CLI profile is an installation check, not a separate desktop application.

The test suite checks Host behavior and Client registration/insertion without a browser. The real-model and native desktop acceptance checks remain open. DSH alpha.2 retains a public declaration composition defect; our exact, development-only correction is documented in the [POC assessment](docs/headless-poc.md#blockers-and-limits).

Host review captures its own bounded, actual-content baseline when the asynchronous `open` completes. Await it before dispatching coding work. Review compares that baseline with the current checkout across turns, including staged/committed changes and deletions while excluding unchanged preexisting dirty/untracked content. A lazy per-file `reviewDiff` exposes coarse text comparisons or file metadata; feedback supports current-side text lines and whole-file comments for deletions, binary files, executable-mode changes and symlinks.

Each round keeps a fixed `integrationRoot` at the Leader’s original Session directory. The current official working directory must match it. Changing directories keeps the start baseline but clears acceptance evidence, current review and feedback, even after switching back; verify and capture a new review after restoration. Devwork never switches the Leader automatically. Member tools must still receive explicit task-worktree paths.

Official alpha.2 upgrade findings: [assessment](docs/upstream-alpha-assessment.md). Same-second equal-size official snapshot misses remain unresolved in [issue #7](https://github.com/GuoMonth/dsh-devwork/issues/7). Official summaries are supplemental, never proof of coverage; their omissions or truncation cannot hide changes in Devwork’s own covered content. This is independent Host review, not an upstream repair. Capture uses two matching reads without retries or an external-writer lock, with limits of 10,000 paths, 8 MiB per file and 64 MiB total. Newly ignored-only paths are excluded; submodule directories refuse capture rather than being silently skipped. Baseline paths remain covered. See the [POC boundaries](docs/headless-poc.md#interfaces).

## Package and release

Package: `@guosheng_047/dsh-devwork`. It is a DSH **bundle** with `dsh.bundle.patch`, not a profile. Shared Host APIs are peers; built JavaScript, declarations, patch, icon, and locales are included in the npm tarball.

See [release instructions](docs/releasing.md) and [contributing](CONTRIBUTING.md). GitHub alpha tags package a prerelease tarball; npm publishing is a separate, explicit maintainer action.

## References

[First plugin](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.md) · [Package and install](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md) · [Lifecycle](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/framework/index.md)

MIT · Community project; not an official DeepSeek product.
