# DSH Devwork

[English](README.md) | 中文

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的任务中心桌面开发工作台。以任务定义工作，通过 Session 树跟踪推进，在同一会话中查看验收证据、Artifact 和 PR/MR 交付。

**当前状态：任务中心 Host 桥接已实现并有 mock 覆盖；原生桌面验收仍待完成。** `TaskPanelHost` 持有持久化任务投影、执行引擎和交付服务，并向 Client 面板提供按 Session 绑定的公开 `taskPanelSource`。Provider 和 planner 均需显式配置；缺少配置时 source 明确显示 `unavailable`，不会构造 mock 状态。mock 测试只说明确定性的服务行为，不代表真实桌面、Provider 或模型验收。目前没有发布 npm 版本。

## 产品模型

- 任务是持久化工作单位，每个任务只有一个主 Session。
- 父子任务组成 Session 树；重试在同一 Session 下创建 Attempt。
- 验收条件、执行结果、Artifact、工作区租约和 PR/MR 集成拥有独立的持久化状态。
- 合并必须经过当前版本和用户授权的交接；只有所有权、交付、验收和工作区检查成功后才清理。
- Host 持有任务事实状态；Client 面板和 Session 视图订阅同一投影，不创建第二套存储。
- 第一阶段使用一个活跃执行者；远程执行、手机客户端、邮件和崩溃自动恢复不在产品边界内。

旧 Round/Leader POC 的入口、数据模型和兼容层已经删除。这是一次破坏性的任务中心迁移；使用方应改用公开的任务中心 API。

参见[任务中心领域模型](docs/task-center.zh.md)了解持久化状态和 Host/Client 边界。

## 开发与试装

基线为 DSH **0.2.1-alpha.2**、Cordis **4.0.5-alpha.1**。仅支持 **Node.js 24.x**，使用 **pnpm 12.11.2**。源码和开发脚本均采用严格 TypeScript 7.0.2。

```sh
git clone https://github.com/GuoMonth/dsh-devwork.git
cd dsh-devwork
pnpm install --frozen-lockfile
pnpm run verify
pnpm run pack:check
pnpm pack
```

在 DSH 桌面端插件页面安装本地包并启用 Devwork。Client 入口只插入可编辑的任务请求，不会自动提交。Host 必须显式提供任务仓库和 Session/Agent Provider，任务创建与执行才可用；缺少配置时持续显示不可用状态。

使用已安装的 DSH CLI 验证包安装元数据（在仓库上级目录执行）：

```sh
dsh plugin --profile devwork-demo add ./dsh-devwork
dsh --profile devwork-demo --dump-config
```

输出应包含 Devwork bundle 层和 `guomonth-devwork` 行。这个 profile 只检查安装元数据，不是独立桌面应用。

测试无需浏览器，覆盖任务状态转换、Session 绑定的 Host 操作、执行取消、持久化 Artifact 与交付状态、清理保护、Client 注册和面板渲染。真实 Provider 调用、权限界面、模型判断和原生桌面交互留给最终 E2E 验收。

## 打包与发布

包名：`@guosheng_047/dsh-devwork`。它通过 `dsh.bundle.patch` 声明为 DSH **bundle**，不声明 profile。共享 Host API 使用 peer 依赖；npm 包包含编译后的 JavaScript、类型声明、patch、图标和语言文件。

参见[发布说明](docs/releasing.zh.md)和[贡献指南](CONTRIBUTING.md)。发布和打标签需要维护者明确请求。

## 官方参考

[第一个插件](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.zh.md) · [打包与安装](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md) · [插件生命周期](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/framework/index.zh.md)

MIT · 社区项目，非 DeepSeek 官方产品。
