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

## 当前 Host 审查后续实现

上述上游核查发现保持不变。Devwork 现在在打开回合时等待有界的实际内容基线，并独立跨 turn 比较当前 checkout。自有审查列出变化文件，提供按需延迟的粗粒度单文件文本/元数据比较，以及当前侧行反馈或整文件反馈。未变化的已有 dirty/未跟踪内容被排除；基线路径在已暂存/已提交删除后仍持续覆盖。官方 summary 仅为补充，不证明完整性；其缺失、过期、漏报或截断不会隐藏自有采集范围内的变化，也不阻止自有审查。存在的 summary 仍需满足正确 `cwd`、路径不逃逸，但不会把仅 ignored 的路径纳入自有覆盖；净变化为零的创建后删除不阻止审查。这不修改官方代码、不刷新用户 index，也不修复 issue #7；此前官方快照探针不构成新的累计审查测试证据。

目录变化事件保留原始基线，但使验收证据、当前审查和待发反馈失效，切回原目录也不恢复。版本守卫拒绝跨越目录变化的异步操作；官方 `tools.guard` 仅限调用者 Agent/准确调用，在异步权限/pre-execute 处理后重新检查嵌套 Bash 的目录版本，不停止已经运行的 shell。brief、快照和批次暴露固定 `integrationRoot`。恢复目录后需重新验收，并相对于保留的基线采集新的当前审查，不要求新的官方 diff。这些本地保护不实现自动逐成员分配、强制隔离或恢复。

采集要求两次有界读取一致，不自动重试，也不锁定外部写入。上限仍为 10,000 路径、单个普通文件 8 MiB、每份清单总计 64 MiB；新增且仅 ignored 的路径被排除，保留的基线路径持续覆盖。末级符号链接以目标元数据表示、不跟随目标；父目录符号链接、submodule 目录和其他不支持的条目使采集失败。详细契约与证据边界见[当前审查说明](headless-poc.zh.md)。

临时任务 worktree 保留 detached 生命周期与精确提交 Leader 摘要的要求。创建中预留阻止异步创建尚未形成 lease 时替换回合，已有 lease 也阻止替换。缺失或未完成工作保持可见，不强制删除。详见[任务交付](task-delivery.zh.md)。

Headless 与 Client 边界场景使用发布版官方服务和脚本模型，证明机制，不证明自主 Leader 判断、原生桌面行为或沙箱安全。单独的 alpha.2 探针验证了有效 cwd/快照错位、运行中 shell 行为及原生 worktree 保留；这不代表上游修复。当前回归命令与限制见 [POC 证据](headless-poc.zh.md)。这些验证不代表发行或 npm 发布。

源码比较：[alpha.1 → alpha.2](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.2.1-alpha.1...dsh-v0.2.1-alpha.2)；固定提交的[工作目录服务](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/session/working-directory/src/index.ts)、[原生 worktree](https://github.com/deepseek-ai/deepseek-harness/tree/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/experimental/worktree)、[Team 消息](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/experimental/agent-team/src/index.ts)、[快照实现](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/deliverables/workspace-changes/src/git.ts)、[记录生命周期](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/deliverables/workspace-changes/src/index.ts)、[投影重载](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/session/session-projection/src/index.ts#L233-L255)。
