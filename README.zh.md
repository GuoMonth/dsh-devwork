# DSH Devwork

[English](README.md) | 中文

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的桌面开发工作台。和一个主控 AI 沟通，让开发任务并行推进，在同一个地方查看和审查成果。

**当前状态：本地 headless POC。** 已用脚本模型和真实 DSH 服务验证团队开发 → 审查 → 验收 → 定位反馈 → 修改的闭环；尚未证明真实模型自主协作或桌面渲染质量。目前没有发布 npm 版本。

## 产品方向

- 保留 DSH 的会话、工具、权限和插件使用习惯。
- 由主控 AI 协调任务、汇总成果并呈现需要人决策的问题。
- 将代码审查和一次性反馈融入同一条开发路径。
- 吸收 Orca 的开发者体验，在 DSH 中独立实现；不依赖 Orca 的代码或运行时。

第一阶段聚焦本地桌面开发。远程执行、手机客户端、邮件和崩溃自动恢复暂缓。

参见[headless POC 评估](docs/headless-poc.zh.md)，包含实现、生命周期发现、验证结果与阻塞点。复用官方任务和成员，以当前代码的验收证据约束交付，把多个 diff 评论作为一条消息交回同一个 Leader。临时任务 worktree 已支持[提交 Leader 摘要后的交付清理](docs/task-delivery.zh.md)。UI 目前提供可编辑的启动请求，成果和反馈界面仍待实现。另见早期的[第一阶段评估](docs/phase-one.zh.md)。

## 开发与试装

兼容基线：DSH **0.2.0-rc.2**，Cordis **4.0.4**。仅支持 **Node.js 24.x**，不锁定小版本和补丁版本；CI 与发布流程统一使用 Node 24。源码和开发脚本均采用**严格 TypeScript 7.0.2**，并启用索引访问与可选属性的额外检查。

```sh
git clone https://github.com/GuoMonth/dsh-devwork.git
cd dsh-devwork
npm ci
npm run verify
npm run pack:check
npm pack
```

在 DSH 桌面端「插件」页面，以本地包目录试装，开启 Devwork 和官方显式启用的 Agent Teams bundle。Host 还需要官方 tools、Bash provider、system prompt 和 workspace-changes；依赖缺失时 Devwork 保持 pending。输入区入口只插入可编辑请求，不自动发送。也可以在已安装 DSH CLI 的环境里，从仓库的上级目录验证安装：

```sh
dsh plugin --profile devwork-demo add ./dsh-devwork
dsh --profile devwork-demo --dump-config
```

输出应包含 Devwork 的 bundle 层和 `guomonth-devwork` 插件行。这个 CLI profile 仅用于验证安装，不是独立桌面应用。

测试无需浏览器，覆盖 Host 行为及 Client 注册、文本插入。真实模型与原生桌面验收仍待完成。DSH rc.2 的公开声明组合存在类型缺陷，精确、仅开发期的修正在 [POC 评估](docs/headless-poc.zh.md) 中说明。

官方快照在同秒等长修改下的漏报另由 [issue #7](https://github.com/GuoMonth/dsh-devwork/issues/7) 跟踪；当前测试采用已有仓库的时间基线，这不是生产修复。

## 打包与发布

包名：`@guosheng_047/dsh-devwork`。它通过 `dsh.bundle.patch` 声明为 DSH **bundle**，不声明 profile。共享的 Host API 使用 peer 依赖；npm 包包含编译后的 JavaScript、类型声明、patch、图标和语言文件。

参见[发布说明](docs/releasing.zh.md)和[贡献指南](CONTRIBUTING.md)。GitHub alpha 标签会生成预发布 tarball；npm 发布由维护者单独、明确执行。

## 官方参考

[第一个插件](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.zh.md) · [打包与安装](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md) · [插件生命周期](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/framework/index.zh.md)

MIT · 社区项目，非 DeepSeek 官方产品。
