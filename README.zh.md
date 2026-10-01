# DSH Devwork

[English](README.md) | 中文

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的桌面开发工作台。和一个主控 AI 沟通，让开发任务并行推进，在同一个地方查看和审查成果。

**当前状态：插件初始化骨架。** 已配置 bundle 元数据、插件入口、中英文描述、构建检查和打包流程。并行 Worker、任务卡、diff 批注尚未实现。目前没有发布 npm 版本。

## 产品方向

- 保留 DSH 的会话、工具、权限和插件使用习惯。
- 由主控 AI 协调任务、汇总成果并呈现需要人决策的问题。
- 将代码审查和一次性反馈融入同一条开发路径。
- 吸收 Orca 的开发者体验，在 DSH 中独立实现；不依赖 Orca 的代码或运行时。

第一阶段聚焦本地桌面开发。远程执行、手机客户端、邮件和崩溃自动恢复暂缓。

## 开发与试装

兼容基线：DSH **0.2.0-rc.2**，Cordis **4.0.4**。使用 Node.js 22.19+ 或 24+；CI 检查 Node 22 和 24。

```sh
git clone https://github.com/GuoMonth/dsh-devwork.git
cd dsh-devwork
npm ci
npm run verify
npm pack
```

在 DSH 桌面端「插件」页面，以本地包目录作为安装来源并启用。当前骨架尚未增加会话控件。也可以在已安装 DSH CLI 的环境里，从仓库的上级目录验证安装：

```sh
dsh plugin --profile devwork-demo add ./dsh-devwork
dsh --profile devwork-demo --dump-config
```

输出应包含 Devwork 的 bundle 层和 `guomonth-devwork` 插件行。这个 CLI profile 仅用于验证安装，不是独立桌面应用。

## 打包与发布

包名：`@guosheng_047/dsh-devwork`。它通过 `dsh.bundle.patch` 声明为 DSH **bundle**，不声明 profile。共享的 Host API 使用 peer 依赖；npm 包包含编译后的 JavaScript、类型声明、patch、图标和语言文件。

参见[发布说明](docs/releasing.zh.md)和[贡献指南](CONTRIBUTING.md)。GitHub alpha 标签会生成预发布 tarball；npm 发布由维护者单独、明确执行。

## 官方参考

[第一个插件](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.zh.md) · [打包与安装](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md) · [插件生命周期](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/framework/index.zh.md)

MIT · 社区项目，非 DeepSeek 官方产品。
