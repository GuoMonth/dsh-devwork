# 发布说明

[English](releasing.md) | 中文

本项目是第三方 DSH bundle，不是 profile 或 DSH 官方发行版。仓库初始化不代表发布版本。

## 已采用的官方要求

源码基线为 DSH `0.2.0-rc.2`，提交 `639ed015397290b3745d163aafe02ffee4aa3f84`。

| 约定 | 项目配置 |
| --- | --- |
| npm bundle 声明 | `package.json` 声明 `dsh.bundle.patch`，不声明 `dsh.profile` |
| 可解析的插件行 | `cordis.patch.yml` 插入发布后的包名 |
| Cordis 入口 | `src/index.ts` 导出 `name` 与 `apply(ctx)` |
| 共享运行时实例 | Cordis 同时为 peer 与开发依赖，不打入运行时代码 |
| 预构建分发 | `prepack` 构建 JavaScript/类型声明，`files` 包含 patch 和资源 |
| Git 源码安装 | `prepare` 独立构建，不需要 DSH 源码仓库 |
| 插件发现 | npm 关键词 `dsh-plugin`；GitHub 仓库添加 `dsh-plugin` topic |
| 插件列表元数据 | `icon` 与 `locale/en.json`、`locale/zh.json` 的 `meta.title`/`meta.description` |

图标和语言文件约定参考官方 Agent Teams bundle。中英文项目文档是本项目的选择；上游翻译追踪文件不是外部插件的安装要求。

## 验证

```sh
npm ci
npm run verify
npm run pack:check
npm pack --dry-run
```

这些检查覆盖严格 Host/Client/脚本/测试类型、七项 headless 行为场景、两项 Client 边界场景、入口、bundle 元数据，以及独立消费项目安装和导入预构建 tarball。Client 使用官方 closure-factory loader 和公开会话 slot。精确的 rc.2 声明修正仅用于开发、不进入发布包，见 [POC 评估](headless-poc.zh.md)。这些检查不证明桌面交互或模型任务已可用。真正发布前，在目标 DSH 桌面端安装 tarball、启用/禁用插件，并验证所有对外宣称的功能。更换 DSH 基线后重新检查兼容性。

## GitHub alpha 发布

1. 选择 `x.y.z-alpha.N` 版本，更新 `package.json` 和锁文件，在 `CHANGELOG.md` 记录实际变化。
2. 执行上述检查并审查 CI。
3. 收到发布请求后，为已审查的 main 提交打 `v<version>` 标签并推送。

alpha 工作流拒绝版本不一致的标签，重新检查包，生成包含预构建 `.tgz` 和 `SHA256SUMS` 的 GitHub 预发布，不发布 npm。稳定版需要另行审查工作流和标签规则。

## npm 发布

沿用维护者命名空间 `@guosheng_047`。发布前确认 npm 身份、命名空间发布权限和首次发布的包名可用性。使用正常 npm 认证方式，凭据不写入仓库。

```sh
npm whoami
npm publish --access public --tag alpha
```

`prepublishOnly` 检查包，`prepack` 执行构建。不要把 alpha POC推到 `latest`。本骨架没有配置 GitHub Actions trusted publishing；它需要 npm 侧设置及明确的发布策略。

发布 npm 后，用户可以在桌面端插件页面安装 `@guosheng_047/dsh-devwork@alpha`，也可以执行：

```sh
dsh plugin --profile devwork-demo add @guosheng_047/dsh-devwork@alpha
```

发布 npm 前，以预构建 tarball 或本地目录试装。Git 源码安装需要在 pnpm 中显式允许这个包的 `prepare` 构建；按照 pnpm 诊断中的精确包名配置，并固定源码提交。tarball/npm 使用已构建产物，不需要这一构建许可。

## 一手参考

- [官方打包与安装教程](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/docs/user/develop/basic/publish.zh.md)
- [官方插件入口教程](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/docs/user/develop/basic/index.zh.md)
- [官方 Agent Teams bundle 元数据](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/experimental/agent-team-profile/package.json)
- [官方插件发现说明](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/README.md#community-and-support)
