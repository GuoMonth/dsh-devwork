# 发布说明

[English](releasing.md) | 中文

这是第三方 DSH bundle，不是 profile，也不是 DSH 官方发行版。构建包不会自动发布版本。

## 要求

源码基线为 DSH `0.2.1-alpha.2`，提交 `d743267388641bc76f17c45ce8b4c231aed1d32c`。

| 约定 | 项目配置 |
| --- | --- |
| npm bundle 清单 | `package.json` 声明 `dsh.bundle.patch`，不声明 `dsh.profile` |
| 可解析的插件行 | `cordis.patch.yml` 插入发布包名 |
| Cordis 入口 | `src/index.ts` 导出 `name` 和 `apply(ctx)` |
| 共享运行时身份 | Cordis 同时是 peer 和开发依赖，不打包另一份运行时 |
| 预构建分发 | `prepack` 构建 JavaScript/声明文件，`files` 包含 patch 和资源 |
| Git 源码安装 | `prepare` 可脱离 DSH 源码仓库独立构建 |
| 插件发现 | npm `dsh-plugin` 关键词，并为 GitHub 仓库添加 `dsh-plugin` topic |
| 插件元数据 | `icon` 以及 `locale/en.json`、`locale/zh.json` 提供 `meta.title`/`meta.description` |

任务中心 API 是唯一产品入口。旧 Round/Leader API、数据模型和兼容层有意不再进入包。

## 验证

```sh
pnpm install --frozen-lockfile
pnpm run verify
pnpm run pack:check
pnpm pack --dry-run
```

这些检查覆盖严格 Host/Client/脚本/测试类型、任务中心领域与 Host 桥接行为、Client 边界、公开导出、bundle 元数据，以及独立消费项目导入预构建 tarball。测试使用 mock Provider，不证明真实 Provider 调用、模型规划、权限界面或原生桌面交互。正式发布前，应在目标 DSH 桌面端安装 tarball，验证任务面板、Session 操作、Artifact/PR 查看和用户授权流程。更换 DSH 基线后重新检查公开 API。

alpha.2 声明修正仍仅用于开发，由 `scripts/prepare-types.mts` 负责版本守卫，不会进入发布包。上游声明变化时重新评估，并保持库检查开启。

## GitHub alpha 发布

1. 选择 `x.y.z-alpha.N` 版本，更新 `package.json` 及锁文件，在 `CHANGELOG.md` 记录实际改动。
2. 执行上面的检查并审查 CI。
3. 只有在明确收到发布请求后，才将审查过的 main 提交标记为 `v<version>` 并推送。

alpha workflow 构建 tarball 并创建 GitHub prerelease。npm 发布仍需维护者单独、明确执行。

## 参考

- [DSH bundle 元数据](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/bundle/agent-team-profile/package.json)
- [DSH 插件开发](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.zh.md)
