# 本地 headless POC：开发成果与审查闭环

[English](headless-poc.md) | 中文

基线：DSH 0.2.0-rc.2（`639ed015397290b3745d163aafe02ffee4aa3f84`）、Cordis 4.0.4、Node 24.x、严格 TypeScript 7.0.2。2026-10-01 本地验证。

## 评估结论

把约 80% 的重点放在 Host/headless 是合理的架构取向，不是测试覆盖率承诺。任务、验收、证据有效性、反馈定位与投递、权限和资源释放都能在没有浏览器的进程里验证。UI 只承担发起、查看与表达反馈。

本次先复用官方 Team。它的任务 CAS、依赖、消息、成员恢复和权限身份已经在真实本地流程中成立，暂时没有重写 roster/mailbox/task board 的收益。Devwork 不新建编排框架，也没有多后端抽象。将来若必须让每个 writer 使用独立 worktree，而官方 Team 的共享 cwd 成为实际阻塞，再评估直接组合官方 Agent 创建、作用域和生命周期能力；当前没有实现这个替代方案。

**我们的产品单位是可审查的开发回合。** Agent Teams 提供协作基础；Devwork 把协作结果变成带证据、可定位反馈、能继续修订的一份交付。只加 Team 面板和提示词不能构成这个项目的差异化。

## 吸收 Orca 的精髓

| Orca 的设计 | DSH 中的处理 | 当前状态 |
| --- | --- | --- |
| 批量 diff 意见，避免一条条发送打断 Agent | 用官方 diff 提取新侧行号、代码片段和快照标识，汇成一条 Leader follow-up | Host API 与 headless 闭环已实现；原生 diff 行内按钮未实现 |
| 意见随代码保持上下文 | 每批绑定快照与代码指纹；代码变化后拒绝旧反馈，让人刷新 | 已实现拒绝过期；自动重定位、回复/resolve 线程未实现 |
| 完成与需要注意的信息集中出现 | 从官方任务读取进度；检查失败、证据过期、owner 空闲但任务未完成列入 Leader brief | 已实现确定性信号；业务问题重要性仍由 Leader 模型判断 |
| 每个任务有清楚的工作与审查边界 | 官方任务契约 + 显式验收命令 + 一个 Leader 入口 | 已实现骨架与机制验证；真实模型质量待验收 |
| 独立 worktree 支持并行写入 | 先一名 writer 与只读 reviewer，使用官方共享 cwd | 未实现独立 worktree；不声称拥有 Orca 的文件隔离 |

依据：[批量 diff 审查](https://www.onorca.dev/docs/review/annotate-ai-diff)、[通知与未读](https://www.onorca.dev/docs/notifications)、[worktree 模型](https://www.onorca.dev/docs/model/worktrees)。这里只吸收设计，不复制源码或依赖 Orca。

## 插件机制与生命周期

- bundle 仍使用 `dsh.bundle.patch`，只插入本项目 Host 插件行，不悄悄开启 Team。
- `inject` 等待官方 agents、agentTeams、tools、systemPrompt、workspaceChanges；缺依赖时是 PENDING。安装 npm 包不等于这些服务已经启用。
- `ctx.plugin(Devwork)` 提供 `ctx.devwork`；工具和动态提示词通过官方注册 API 归属插件。只在已经打开的开发回合输出 Devwork 指导，不改写其他会话的系统提示词。
- 回合只保存官方任务 ID 和自己的验收/反馈数据，任务状态每次从官方服务读取。校验准确的 live Leader 权限对象，Worker 无权操作主控回合。
- Team 成员空闲后可能释放内存实例；消息恢复后身份不变。本项目不长期持有 Worker 对象。
- `ctx.effect` 在卸载时取消并等待自己的异步工作，然后释放回合。依赖消失会卸载；依赖回来会得到全新服务，不恢复旧的临时回合。
- Client 注册使用公开 `conversation.input.left` slot、官方 inputActions 的插入版本保护、locale/effect；slot 声明消失或插件卸载都会移除入口。没有 DOM 操作、私有 UI 导入或第二份 React。

官方依据：[生命周期与 effect](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/docs/cordis-tutorial/02-lifecycle-and-effects.md)、[依赖注入](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/docs/cordis-tutorial/03-services.md)、[Headless](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/bundle/headless/README.md)。

## 已实现的接口

模型工具：`devwork_open` 引用现有任务并声明验收命令，`devwork_verify` 执行验收，`devwork_brief` 读取紧凑摘要。创建/分配/恢复成员仍使用官方 Team 工具。

Host API：`ctx.devwork.open/brief/review/prepareFeedback/sendFeedback`。反馈 API 供可信 Host/UI 调用，未暴露为让模型伪造人类意见的工具。`sendFeedback` 投递一条普通用户后续消息到相同 Leader，清空旧证据；同一批重复或并发发送只接受一次。

验收命令通过 **DSH tools.execute → 官方 bash → shell/subprocess** 运行，继承原有策略与取消信号。不绕过权限直接启动任意验收命令。只有最终 foreground 结果满足退出码 0、未超时、未中断才算通过；前后代码指纹不同则证据过期。通过所选命令不等于测试充分，也不等于人已接受或授权提交。

指纹只读 Git 根目录中 tracked 和非 ignored 的文件，覆盖已有 dirty 内容；不修改 index、refs 或工作树。POC 上限为 10,000 文件、单文件 8 MiB、总计 64 MiB；不支持 submodule 目录。大仓库需要重新评估扫描成本。

## 复现与验证边界

```sh
npm ci
npm run verify
npm run pack:check
npm pack --dry-run
```

`tests/headless.mts` 六项行为测试：

1. 真实 AgentLoop、官方 Team/tools、JSONL persistence、SessionQuery、Bash/subprocess、workspace-changes：writer 修改 → 依赖 reviewer 审查 → Leader 验收 → 两条意见一批发送 → 原成员修订再验收。整体 diff 收入成员改动，排除之前的 dirty README；过期反馈和并发重复投递被拦截。
2. 插件卸载取消正在运行的官方验收进程并等待收敛。
3. task completed 不是证据；真实失败命令与后续代码修改阻止 ready-for-review。
4. 官方 pre-execute 拒绝传入嵌套验收，不绕过策略。
5. inactive owner 不视为成功或自动释放；子成员不能控制 Leader 回合。
6. 真实 Cordis 的 PENDING、激活、依赖消失、重新激活和工具/提示词释放。

`tests/client.mts` 两项无浏览器检查：加载实际 closure-factory 与官方 SlotRegistry，验证晚声明/折叠/重声明/卸载；验证按钮插入显式请求、保持 insertion revision、不自动发送。模型是本项目确定性脚本，Client locale 是边界 fixture；官方业务服务与 SlotRegistry 使用发布包。没有执行真实模型、完整 DSH CLI profile 或 macOS/Windows 桌面验收。

## 发现的阻塞与限制

**rc.2 公开声明缺陷。** `dsh-session-projection` 的 wire register 泛型允许 `K` 取 Client map 的任意键，却用它索引 Host state map。独立插件/测试类型程序只导入部分公开入口时，`subagent` 等键的私有 Host 声明未被带入，触发严格库检查错误。这是公开声明的组合问题，不能把它归因于用户安装 TS7。

`scripts/prepare-types.mts` 在开发依赖中将约束收紧为 `keyof SessionProjectionMap & keyof SessionProjectionStateMap`。它检查精确 rc.2 版本与原始签名，幂等执行，拒绝不认识的声明；没有 `any`、类型压制或 `skipLibCheck`。只改开发目录中的一个 `.d.ts`，不改官方运行时代码，不打进 npm 产物，不在用户安装时修补宿主。升级官方版本需重新评估；下游严格 TS 消费仍受上游原始声明质量影响。

类型后续在[开发 issue #4](https://github.com/GuoMonth/dsh-devwork/issues/4) 跟踪。`publint` 目前提示 ESM 包中的 Client closure-factory 看起来像 CJS。该入口是 DSH loader 脚本，不是独立 Node import；factory/SlotRegistry 测试覆盖它的实际加载约定，保留此工具警告。

Client 公共声明还需要显式安装其传递类型依赖，以及导入公开生成的 remote 类型。这些在 devDependencies 中，不打入浏览器 bundle。Host 与 Client 分开编译，Client 声明保留必要的类型 reference；没有导入私有实现。

第一阶段其余边界：

- Team 共享 checkout，没有文件锁、worktree 或合并。writeScopes 是提示，不是隔离承诺。
- 官方变更是每轮 turn 的快照；当前 API 审查最新已结束 turn，不是整个 feature 跨多轮的累计 diff。
- 当前回合、验收证据和反馈批次只活在本 Host/Leader 生命周期；进程重启不恢复。一次性 headless CLI 退出后不能继续该临时回合。
- 反馈只支持单个文本 hunk 的新侧范围；binary/oversized、旧侧/删除行、自动重定位和 unresolved 线程待补。
- UI 已有发起入口，完整反馈编辑与 Host/Client 传输未接入。真实模型的拆解、任务契约、判断和摘要仍待验证。

下一步优先：真实模型验收同一闭环 → 在公开能力允许的范围内接入小型成果/反馈面板 → 再决定累计 diff、意见保留、第二名 writer 或独立 worktree 的必要性。邮件、远程与恢复继续不进入第一阶段。
