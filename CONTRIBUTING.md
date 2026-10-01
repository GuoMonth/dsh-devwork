# Contributing / 参与贡献

Use Node.js 22.19+ or 24+ and the locked npm dependencies:

使用 Node.js 22.19+ 或 24+，按锁文件安装依赖：

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
