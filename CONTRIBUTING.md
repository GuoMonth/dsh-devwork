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

Source and scripts use strict TypeScript 7.0.2. Node 24 runs the `.mts` scripts directly, but does not type-check them; `npm run typecheck` checks both programs. Treat external data as `unknown` and narrow it with runtime checks. Avoid explicit `any`, blanket type assertions, and error suppressions. Prefer straightforward domain types.

源码和脚本统一使用严格 TypeScript 7.0.2。Node 24 直接执行 `.mts` 脚本，但不会检查类型；`npm run typecheck` 同时检查源码和脚本。外部数据先按 `unknown` 处理，再通过运行时检查收窄。避免显式 `any`、宽泛类型断言和错误屏蔽，优先使用直观的业务类型。

TypeScript 7.0 has no compiler API. Our build uses the `tsc` CLI. Before introducing compiler-API consumers (such as typescript-eslint or framework-specific language tooling), verify their TS7 support; do not silently add a second compiler. See the [official TypeScript 7.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).

TypeScript 7.0 尚未提供编译器 API；本项目通过 `tsc` CLI 构建。引入 typescript-eslint 或框架语言工具等编译器 API 使用者前，先验证其 TS7 支持，避免悄悄维护第二套编译器。参见 [TypeScript 7.0 官方发布说明](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)。
