# Contributing / 参与贡献

Use Node.js 24.x only and the locked npm dependencies:

仅使用 Node.js 24.x，按锁文件安装依赖：

```sh
npm ci
npm run verify
npm pack --dry-run
```

`verify` checks types, builds the standalone package, validates exports with publint, and checks bundle artifacts. It does not exercise a DSH desktop session. Product changes need checks for the behavior they introduce.

`verify` 执行类型检查、独立构建、publint 入口检查和 bundle 产物检查，不代表桌面会话验证。新增产品行为时补充相应验证。

Keep English and Chinese README/release instructions aligned. Use public DSH APIs, declare consumed shared APIs in both peerDependencies and devDependencies, and keep Host and Client TypeScript programs separate when a Client entry is added. Own custom resources with Cordis effects.

同步维护中英文 README 和发布说明。使用 DSH 公共 API；共享 API 同时声明为 peerDependencies 和 devDependencies。新增 Client 入口时隔离 Host 与 Client 的 TypeScript 程序；自建资源由 Cordis effect 管理。

See [AGENTS.md](AGENTS.md) for the project boundaries.

## Issues / 议题管理

| Category / 分类 | Label / 标签 | Content / 内容 |
| --- | --- | --- |
| Request / 需求反馈 | `kind:request` | User problems, needs, suggestions, bug reports, and desired outcomes / 用户问题、需求、建议、问题报告和期望结果 |
| Development / 开发 | `kind:development` | Implementation, fixes, technical investigations, and maintenance / 实现、修复、技术验证和工程维护 |

Use one category label per issue. The issue chooser has two forms that apply the matching label. This convention is not an API-level restriction; maintainers should correct uncategorized or mixed issues. Optional existing labels such as `bug` or `enhancement` describe the topic, not a third category. Git tags are for releases, not issue classification. The label workflow creates/updates these two labels and leaves all other labels alone.

每个 issue 使用一个分类标签。创建入口提供两份表单并自动贴上对应标签；这不是 API 层面的强制约束，维护者需整理未分类或混用标签的 issue。已有的 `bug`、`enhancement` 等标签可补充主题，不构成第三类。Git tag 用于版本发布，不用于 issue 分类。标签工作流只创建或更新这两个分类标签。

Keep the original request and open separate development issues when work is accepted. One request can lead to several development tasks; each product task links its request, and a task can link several requests. Pure maintenance may stand alone. Keep follow-up feedback on the request and implementation discussion on the development task. Use `#number` links for related work; use native sub-issues for an actual breakdown when useful, not for every reference.

保留原始需求，接受实施后另建开发 issue。一个需求可以对应多个开发任务；产品开发任务必须引用需求，也可以关联多个需求；纯工程维护可以独立存在。后续用户反馈留在需求里，实现讨论放在开发任务里。关联使用 `#编号`；真正的任务拆解可按需使用原生 sub-issues，普通关联不强行设置父子关系。

PRs should use `Closes #development-number` and `Related to #request-number`. Close development tasks with delivery/validation evidence. Close a request only after its agreed user-facing acceptance criteria are met; accepting or finishing one task does not complete the request. A small, directly fixable bug may stay a single request issue; split it when separate planning or multiple tasks add value. Search for duplicates before opening an issue. No status/priority label system is required at this stage.

PR 使用 `Closes #开发编号`、`Related to #需求编号`。开发任务以交付和验证证据关闭；需求以约定的用户验收条件关闭，接受需求或完成其中一个任务都不代表需求完成。可直接修复的小 bug 可以保留单个需求 issue，确有独立规划或多个任务时再拆分。新建前先搜索重复议题；当前不增加状态或优先级标签体系。

Source and scripts use strict TypeScript 7.0.2. Node 24 runs the `.mts` scripts directly, but does not type-check them; `npm run typecheck` checks both programs. Treat external data as `unknown` and narrow it with runtime checks. Avoid explicit `any`, blanket type assertions, and error suppressions. Prefer straightforward domain types.

源码和脚本统一使用严格 TypeScript 7.0.2。Node 24 直接执行 `.mts` 脚本，但不会检查类型；`npm run typecheck` 同时检查源码和脚本。外部数据先按 `unknown` 处理，再通过运行时检查收窄。避免显式 `any`、宽泛类型断言和错误屏蔽，优先使用直观的业务类型。

TypeScript 7.0 has no compiler API. Our build uses the `tsc` CLI. Before introducing compiler-API consumers (such as typescript-eslint or framework-specific language tooling), verify their TS7 support; do not silently add a second compiler. See the [official TypeScript 7.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).

TypeScript 7.0 尚未提供编译器 API；本项目通过 `tsc` CLI 构建。引入 typescript-eslint 或框架语言工具等编译器 API 使用者前，先验证其 TS7 支持，避免悄悄维护第二套编译器。参见 [TypeScript 7.0 官方发布说明](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)。
