# 官方基线升级核查 — 2026-10-10

[English](upstream-alpha-assessment.md) | 中文

当前验证基线为 [DSH 0.2.1-alpha.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-alpha.2)，源码提交 `d743267388641bc76f17c45ce8b4c231aed1d32c`。Devwork 的共享 DSH peer 和开发依赖锁定该版本；Cordis 仍为 `4.0.5-alpha.1`。项目仍是 POC，不承诺稳定兼容；Node 只支持 24.x。安装使用明确的已验证版本，不依赖会移动的 npm 标签。

| 官方变化或核查发现 | Devwork 处理 |
| --- | --- |
| Agent/Team 依赖现在需要官方 working-directory 服务 | 注入 `workingDirectory`；headless fixture 挂载官方工作目录依赖 |
| 有效 cwd 可不同于不可变的 `session.header.cwd`，workspace-changes 仍记录原始根目录 | 每回合的 `integrationRoot` 固定在原始目录，并要求有效 cwd 一致；不自动切换 Leader |
| 新 Bash 使用有效 cwd，已运行 shell 保持原目录 | 官方 Bash 显式指定固定根目录；不承诺迁移运行中进程 |
| 原生 `create_worktree` 切换调用者、创建命名分支，切回后保留 checkout | 保留 Devwork 显式选择的 detached checkout、已提交交接与无强制清理；原生创建不提供交付 ownership、ancestry、摘要或验收检查 |
| Team 新消息走 agent inbox，旧 queued 事件读取器仍保留 | 断言 `agent/inbox/spliced` 中 `source.kind === 'agent-message'`，不再期待新发 `team/message/queued`；inbox 接受不代表处理完成 |
| `session-projection` 公开 wire-register 重载仍用 Client 键索引 Host state | 保留精确开发期交集修正，版本守卫改为 alpha.2；移除后完整严格类型检查失败，即使产品构建可以通过 |
| 官方快照探针仍复现等长修改的时序漏报 | #7 仍未解决；fixture 旧时间戳只是测试边界，不是生产修复 |

目录变化事件使验收证据、diff 绑定、审查快照和待发反馈失效，切回原目录也不恢复。版本守卫拒绝跨越目录变化的异步操作；官方 `tools.guard` 仅限调用者 Agent/准确调用，在异步权限/pre-execute 处理后重新检查嵌套 Bash 的目录版本，不停止已经运行的 shell。审查和反馈校验官方 `summary.cwd`，并拒绝逃出根目录或不在现有 `git ls-files` 指纹集合内的路径，不扩大扫描范围；brief、快照和批次暴露固定 `integrationRoot`。恢复目录后需取得新记录的 diff 并重新验收。这些本地保护不实现自动逐成员分配、强制隔离或恢复。

保留已有公开变更事件/串行 turn-stopping 绑定：后续验收通过也不能把变化后的代码换绑到旧 diff，截断的 summary 被拒绝。没有修改官方代码、刷新用户 index、伪造替代 diff 或重试失败快照。非空官方快照仍可能漏掉文件，这些保护不能证明完整性；回合级累计审查仍未实现。

临时任务 worktree 保留 detached 生命周期与精确提交 Leader 摘要的要求。创建中预留阻止异步创建尚未形成 lease 时替换回合，已有 lease 也阻止替换。缺失或未完成工作保持可见，不强制删除。详见[任务交付](task-delivery.zh.md)。

Headless 与 Client 边界场景使用发布版官方服务和脚本模型，证明机制，不证明自主 Leader 判断、原生桌面行为或沙箱安全。单独的 alpha.2 探针验证了有效 cwd/快照错位、运行中 shell 行为及原生 worktree 保留；这不代表上游修复。当前回归命令与限制见 [POC 证据](headless-poc.zh.md)。这些验证不代表发行或 npm 发布。

源码比较：[alpha.1 → alpha.2](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.2.1-alpha.1...dsh-v0.2.1-alpha.2)；固定提交的[工作目录服务](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/session/working-directory/src/index.ts)、[原生 worktree](https://github.com/deepseek-ai/deepseek-harness/tree/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/experimental/worktree)、[Team 消息](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/experimental/agent-team/src/index.ts)、[快照实现](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/deliverables/workspace-changes/src/git.ts)、[记录生命周期](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/deliverables/workspace-changes/src/index.ts)、[投影重载](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/session/session-projection/src/index.ts#L233-L255)。
