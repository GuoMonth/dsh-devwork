# 第一阶段：复用官方能力的最小开发闭环

[English](phase-one.md) | 中文

调研日期：2026-10-01。本文是开发建议与源码核查结果，不表示产品功能已经实现。

本文保留初期评估。当前实现和调整后的 headless 优先顺序见 [POC 评估](headless-poc.zh.md)。复用 Team 是当前 POC 选择，不是永久约束；官方 diff 覆盖单轮，不能当作跨轮累计功能交付。

2026-10-09 更新：本文保留首次调研结论；当前 POC 已对齐 [DSH 0.2.1-alpha.1](upstream-alpha-assessment.zh.md)。

## 基线

最新发布为 **DSH 0.2.0-rc.2**，2026-09-29 发布；本次核查的 master 与发布标签均为 `639ed015397290b3745d163aafe02ffee4aa3f84`。本项目已有相同基线，无需为了“追新”修改版本。官方 npm 的 Agent Teams bundle、Team service 和 workspace-changes 包均提供 `0.2.0-rc.2`；Cordis 的 peer 为 `~4.0.4`，当前 `4.0.4` 满足要求。

官方 primary runtime 锁定的 Node 为 `24.21.0`，与我们仅支持 Node 24.x 的选择一致。插件使用严格 TS7 编译并交付 JS/声明，不要求 DSH 主仓库升级其编译器。后续新增官方 API 依赖仍须在严格 TS7 下实测，不能把当前空入口的类型检查当成全部兼容性证明。

## 最小产品价值

用户从一个 Leader 入口提出目标、理解进度、处理决策并审查成果。首版重点交付：

1. **开发任务契约**：目标、触及路径、依赖、验收方法和回报要求，写进官方任务的 description/writeScopes，而不是另建任务数据库。
2. **Leader 协调与汇总**：复用具名成员；工作完成、阻塞或需要人判断时回报 Leader；Leader 等必要成员结束，检查验证证据，再呈现成果。避免把每条工具日志都转述给用户。
3. **整体 diff 与集中反馈**：先用官方变更视图审查本轮团队成果，用户一次反馈给 Leader，再由 Leader 修改或重新委派。

最先演示一个 Git 仓库、一个 Leader、一个 writer 和一个只读 reviewer。先做到真实可用，再验证两个非重叠路径的写任务并行。这里的成员数量是产品运行约定；官方 maxMembers 是一支 Team 的累计成员上限，不是并行执行数，不能把二者混用。

## 官方能力与我们的增量

| 需求 | 官方能力 | 我们需要补充 |
| --- | --- | --- |
| Leader、具名 Worker、持续沟通 | 官方 Agent Teams bundle；ctx.agentTeams 的 spawnTeammate/sendMessage/waitForChange/interrupt | 面向开发的任务与汇报规则、明确的 Team 开发入口 |
| 分工、依赖、负责人、写入范围 | createTask/listTasks/updateTask；revision CAS、blockedBy、writeScopes | 简洁任务描述与验收要求；协调重叠写入 |
| 状态展示 | agentTeam Session projection、成员 Session 状态；已有官方只读 Team 面板 | 先使用官方面板，确有信息负担后再补紧凑摘要；不镜像任务状态 |
| 人的重要判断 | 官方 userQuestions；可选计划模式与计划评审 | Worker 把业务问题报给 Leader，由 Leader 批量问人；不另建问答或审批系统 |
| 实际代码差异 | workspaceChanges.summary/diff；官方 ui-deliverables 改动文件卡片与 changes-review tab | 确认根轮次包含成员改动；首版不做成员级归因或 diff 编辑器 |
| 反馈回到开发流程 | 原有 Leader 会话、官方消息提交/steer 路径 | 先用一条集中反馈；需要时添加我们自己的反馈草稿入口 |
| UI 扩展与释放 | 公开 slots、共享 Session store、Cordis effect | 小型增量入口；Host/Client 分开编译，只使用公开类型与服务 |

业务判断与权限审批是不同职责：普通决策由 Leader 汇总，工具授权继续遵循官方沙箱和审批。计划模式是提示词引导，不是强制只读开关。owned child 不能直接通过 userQuestions.ask(agent) 请求人的回答，首版应把业务问题发送给 Leader。

## 组合选择

首选**官方 Agent Teams 的显式 opt-in 组合**，而不是自己用普通 subagent 拼出另一套 roster、mailbox 和任务板。`@deepseek-ai/dsh-experimental-agent-team-profile` 随 DSH 安装提供但默认关闭；它是 bundle，名字含 profile 不代表它是独立 profile。在桌面插件页开启，或向一个已有 dsh-base 的演示 profile 加入这个 bundle。Team service、tools 和 UI 由这一个官方开关启用。

Team bundle 会禁用普通 subagent 委派及名称重叠的全局 child-control 工具，底层 spawn/fork 提供方仍供 Team 和 workflow 使用。我们不重新启用这些冲突工具，不引入 Codex/Claude 外部 Worker，不要求社区插件、额外 MCP 或第三方编排服务。

我们的 Devwork 入口必须明确表达用户正在请求 Team 开发，遵循官方“用户明确请求才创建 teammate”的策略。不能靠覆盖该策略让普通会话偷偷派生团队。首个演示可直接使用用户消息“请使用 Agent Teams……”验证，之后再做入口。

Agent Teams 是官方**实验能力**，没有稳定性承诺。第一阶段按 rc.2 的精确基线集成；Team 接触点集中在少量模块，读取官方类型与投影，不设计通用后端适配框架。宿主提供服务实例，避免把另一份 DSH/Cordis 实现放进运行时依赖或 bundle。后续新增共享 API 时按官方规则声明 peer/dev 依赖并验证宿主模块身份；实验 Team 保持显式选择，不成为普通会话的默认前提。

## 阻塞点与首版处理

| 边界 | 对产品的影响 | 首版处理与验证 |
| --- | --- | --- |
| Team 共享 cwd，没有 worktree、merge 或文件锁 | Bash、formatter、生成器可以互相覆盖；writeScopes 只有提示作用 | 先一个 writer；随后仅并行不重叠写任务。全局格式化、lockfile 修改与集成步骤由 Leader 串行协调。若目标必须包含独立 worktree，此路线需重新评估 |
| inactive 只表示当前无 turn；task completed 也不是测试证据 | UI 不能把空闲显示成成功；中断不会自动释放 owner | 状态按官方真源展示，Leader 检查结果与命令证据。任务失败/中断后由 Leader 显式更新或释放，不自动猜测 |
| Team 成员只继承已完成 turn 的 fork 前缀；fresh 没有 Leader 历史 | 新成员可能不知道当前目标与用户决策 | spawn 的 prompt 或后续消息明确携带本轮契约，不假设当前轮的上下文已被继承；后续任务复用现有成员 |
| workspace-changes 只记录顶层轮次，排除子代理 Session | 没有天然的每个 Worker diff；Leader 过早结束会漏掉晚完成的改动 | Leader 等必要成员结束并验证后才收尾；实测共享 Git 工作树中的成员改动被根轮次整体 diff 收入 |
| 子代理没有独立文件捕获，Git 外、忽略文件及 shell 修改覆盖有限 | 非 Git 仓库或忽略文件上的 Worker 改动可能没有完整审查视图 | MVP 限定为同一 Git 仓库内未被忽略的代码文件；测试已有未提交改动不会作为新增成果。总体 diff 不声称作者级归因 |
| diff 快照仅在 Host Session 生命周期内存在 | Host 重启后旧轮次卡片/对比不可用 | 第一阶段明确仅审查当前活跃流程；不自建历史快照恢复。用户在轮次期间的手动编辑也可能计入整体 diff |
| 原生 diff 没有逐行批注 slot | “直接给原生 diff 加行内评论”不是现有扩展能直接做到的事 | 首版使用集中反馈，可手写文件与行号。随后评估独立轻量反馈入口，或向上游建议行级 slot；不导入私有 FileDiff、修改 DOM 或重写整个 review tab |
| Team 面板晚启用需要刷新 | 已打开会话可能没有新投影 | 先启用官方 bundle，再新建演示会话；验证关闭/重开及卸载行为 |
| UI 共享 API、Client 打包与宿主身份尚未在本插件验证 | 空 Host 入口通过不等于完整 UI 集成通过 | 先做一个公开 slot 的最小 Client 注册，隔离 Host/Client 类型程序，检查导出、加载、重复 runtime 与释放 |

## 开发顺序与出口

**先做验证任务，不先造大框架。** 在官方桌面 rc.2 上完成下面的 go/no-go：

- 启用官方 Team bundle，在一个 Git 演示仓库中派生 writer/reviewer；使用真实模型完成一次代码修改和审查。
- 验证任务 claim/complete、消息交互，以及根会话等成员结束后得到整体 diff。
- 输入一条集中反馈，验证 Leader 能继续协调同一组成员完成修改；业务问题回到 Leader 的官方问答入口。
- 保留已有 dirty 文件，验证新一轮 diff 的起点；再中断 writer，确认不会把 inactive 或未释放 owner 显示成成功。
- 最小插件通过一个公开 slot 加入再移除入口，严格 TS7 检查真实消费的官方类型，验证桌面 Client 加载和 effect 释放。

通过后依次交付：Leader 开发规则/入口 → 官方投影上的紧凑摘要 → 集中反馈草稿（如果普通输入已够用则暂不做）。每个实际任务单独作为 kind:development issue 关联需求 #1。逐行批注、worktree、远程、邮件与自建恢复不阻塞第一个可用版本。

本次已核查源码、文档、发布标签、npm 包版本及官方已有测试的覆盖位置；**未运行真实 DSH 桌面/模型闭环，未执行上游完整测试**。这些证据必须由验证任务补齐，不能把源码可行性当成已交付体验。

## 演进判断

以下是基于已实现设计记录的判断，不是官方 roadmap 承诺：

- 官方在 9 月把 Team 的 Host/UI 合并为一个 opt-in bundle。我们应交付少量、可解释的功能开关，并利用 bundle composition，避免自己创建另一套安装或运行时管理器。
- Session observation 与 projection 已统一读取和客户端状态归属。我们的 UI 应消费这些投影，业务状态由官方领域服务拥有；不复制任务板或在浏览器回放日志造另一份真源。
- 9 月的变更卡片与 diff 改善表明官方正在补足开发体验。独立 diff 编辑器、文件管理器和通用 IDE 外壳容易与上游重叠；我们的差异化应放在 Leader 的任务质量、异常汇总与反馈组织。
- 实验 Team 的 promotion、owner 自动释放、worktree 和跨进程协作没有承诺。按当前接口开发、按版本验证，不以未来承诺解释现有缺口。后续只在实际升级引入变化时迁移对应接触点。

## 主要依据

所有源码链接固定在上述 rc.2 commit：

- [rc.2 发布记录](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.2)
- [Agent Teams 服务与限制](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/experimental/agent-team/README.zh.md)
- [官方 Team bundle](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/experimental/agent-team-profile/README.zh.md)
- [官方 Team 策略](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/experimental/tool-agent-team/src/index.ts)
- [workspace-changes 覆盖与生命周期](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/deliverables/workspace-changes/README.zh.md)
- [官方 diff UI](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/client/ui-deliverables/README.zh.md)及[现有 file-action slot 类型](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/client/ui-deliverables/src/client/file-actions.ts)
- [公开 slot 扩展规则](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/docs/subsystems/slots.zh.md)
- [官方用户问答边界](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/docs/subsystems/user-questions.zh.md)
- [Team 单 bundle 设计记录](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/.agents/notes/implemented/architecture/2026-09-18-agent-teams-single-bundle.zh.md)
- [Session observation/projection 归属设计](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/.agents/notes/implemented/architecture/2026-08-25-session-observations-and-projection-owned-client-state.zh.md)
- [官方 primary runtime 锁文件](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/scripts/primary-runtime/lock.json)
