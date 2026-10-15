# DSH Devwork

English | [中文](README.zh.md)

A task-centered desktop development workspace built on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Define work as tasks, follow their Session tree, and inspect acceptance evidence, Artifacts and PR/MR delivery from the same conversation.

**Status: the task-center Host bridge is implemented with mock coverage; native desktop acceptance remains open.** `TaskPanelHost` owns the durable task projection, execution engine and delivery service, and exposes one Session-scoped `taskPanelSource` to the Client panel. Provider and planner dependencies are explicit: without them the source reports `unavailable` instead of creating mock state. Mock tests describe deterministic service behavior and do not claim real desktop, provider or model acceptance. No npm release has been published.

## Product model

- A task is the durable unit of work and has one primary Session.
- Parent and child tasks form the Session tree; retries create Attempts under the same Session.
- Acceptance criteria, execution results, Artifacts, workspace leases and PR/MR integrations have independent persisted state.
- Merge requires a current, user-authorized handoff. Cleanup runs only after ownership, delivery, acceptance and workspace checks succeed.
- The Host owns task state. Client views subscribe to the same projection and do not create a second store.
- The first phase uses one active executor. Remote execution, mobile clients, email and automatic crash recovery remain outside the product boundary.

The old Round/Leader POC entry points, data model and compatibility layer have been removed. This alpha is a breaking task-center transition; consumers must use the public task-center APIs.

See the [task-center domain model](docs/task-center.md) for the persisted states and Host/Client boundary.

## Develop and try the bundle

Baseline: DSH **0.2.1-alpha.2**, Cordis **4.0.5-alpha.1**. Use **Node.js 24.x only** and **pnpm 12.11.2**. Source and development scripts use strict TypeScript 7.0.2.

```sh
git clone https://github.com/GuoMonth/dsh-devwork.git
cd dsh-devwork
pnpm install --frozen-lockfile
pnpm run verify
pnpm run pack:check
pnpm pack
```

In the DSH desktop Plugins page, install the local package directory and enable Devwork. The Client entry inserts an editable task request and never submits it automatically. The Host must supply a task repository plus explicit Session/Agent providers before creation and execution are available; a missing configuration remains visibly unavailable.

For CLI package validation with an installed DSH CLI, from the directory above the checkout:

```sh
dsh plugin --profile devwork-demo add ./dsh-devwork
dsh --profile devwork-demo --dump-config
```

The output should include the Devwork bundle layer and the `guomonth-devwork` row. This profile checks installation metadata; it is not a separate desktop application.

The test suite covers task state transitions, Session-scoped Host actions, execution cancellation, durable Artifact and delivery state, cleanup guards, Client registration and panel rendering without a browser. Real provider calls, permission UI, model judgment and native desktop interaction remain final E2E work.

## Package and release

Package: `@guosheng_047/dsh-devwork`. It is a DSH **bundle** with `dsh.bundle.patch`, not a profile. Shared Host APIs are peers; built JavaScript, declarations, patch, icon and locales are included in the npm tarball.

See [release instructions](docs/releasing.md) and [contributing](CONTRIBUTING.md). Publishing and tagging require an explicit maintainer request.

## References

[First plugin](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.md) · [Package and install](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md) · [Lifecycle](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/framework/index.md)

MIT · Community project; not an official DeepSeek product.
