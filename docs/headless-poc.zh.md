# 本地 headless POC：开发成果与审查闭环

[English](headless-poc.md) | 中文

基线：DSH 0.2.1-alpha.2（`d743267388641bc76f17c45ce8b4c231aed1d32c`）、Cordis 4.0.5-alpha.1、Node 24.x、严格 TypeScript 7.0.2。alpha.2 兼容性探针验证日期：2026-10-10；当前回归命令见下文。

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
| 独立 worktree 支持并行写入 | 显式选择 detached 任务 checkout，成员工具明确传入其路径 | 创建、已提交摘要和清理已验证；逐成员 cwd 自动配置与强制隔离未实现 |

依据：[批量 diff 审查](https://www.onorca.dev/docs/review/annotate-ai-diff)、[通知与未读](https://www.onorca.dev/docs/notifications)、[worktree 模型](https://www.onorca.dev/docs/model/worktrees)。这里只吸收设计，不复制源码或依赖 Orca。

## 插件机制与生命周期

- bundle 仍使用 `dsh.bundle.patch`，只插入本项目 Host 插件行，不悄悄开启 Team。
- `inject` 等待官方 agents、agentTeams、tools、systemPrompt、workspaceChanges、workingDirectory；缺依赖时是 PENDING。安装 npm 包不等于这些服务已经启用。
- `ctx.plugin(Devwork)` 提供 `ctx.devwork`；工具和动态提示词通过官方注册 API 归属插件。只在已经打开的开发回合输出 Devwork 指导，不改写其他会话的系统提示词。
- 回合只保存官方任务 ID 和自己的验收/反馈数据，任务状态每次从官方服务读取。校验准确的 live Leader 权限对象，Worker 无权操作主控回合。
- Team 成员空闲后可能释放内存实例；消息恢复后身份不变。本项目不长期持有 Worker 对象。
- `ctx.effect` 在卸载时取消并等待自己的异步工作，然后释放回合。依赖消失会卸载；依赖回来会得到全新服务，不恢复旧的临时回合。
- Client 注册使用公开 `conversation.input.left` slot、官方 inputActions 的插入版本保护、locale/effect；slot 声明消失或插件卸载都会移除入口。没有 DOM 操作、私有 UI 导入或第二份 React。

官方依据：[生命周期与 effect](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/docs/cordis-tutorial/02-lifecycle-and-effects.md)、[依赖注入](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/docs/cordis-tutorial/03-services.md)、[Headless](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/bundle/headless/README.md)。

Host 观察 `session/event` 的实时变更公告，并在 `agent/turn-stopping` 中、官方 recorder 串行监听器之后，将 diff 绑定到只读工作区指纹；不再调用已弃用的同步 Session 历史接口。后续验收不能给旧 diff 换绑新代码。缺失或未绑定的快照、代码变化、文件列表被截断时均拒绝审查；后续未改变代码的轮次可复用原绑定。这防止旧 diff 误审，但不能证明非空官方快照内部没有漏掉某个文件。

升级核查见[官方 alpha.2 评估](upstream-alpha-assessment.zh.md)。

## 固定整合目录

每个回合从 Leader 原始 `session.header.cwd` 固定 `integrationRoot`，并要求官方 `workingDirectory.get(session)` 与其一致。brief、审查快照和反馈批次都暴露该目录。验收、审查、反馈、worktree 创建、交接与清理会拒绝目录不匹配；Devwork 不自动切换目录。官方 Bash 调用显式使用整合根目录。

`working-directory/change` 事件清空验收证据、官方 diff 绑定、审查和待发反馈；切回原目录不会恢复它们，必须取得新记录的 diff 并重新验收。目录版本守卫拒绝跨越目录变化的异步操作，包括切走又切回；审查与反馈还校验官方 summary 的 `cwd` 与固定目录一致。这些保护避免跨目录错误归属，不迁移运行中 shell，不自动分配成员 worktree，也不提供强制隔离。

## 任务交付

`devwork_worktree`、`devwork_handoff`、`devwork_cleanup` 组成小型可选 checkout 生命周期。Leader 摘要与提交来源进入 Git，临时目录在整合验收后删除；`cleanupPending` 呈现尚未收尾的 checkout。同步登记的创建中预留阻止 worktree 创建期间替换回合；已有 ownership lease 也阻止替换。详细流程和合并方式边界见[任务交付](task-delivery.zh.md)。

## 已实现的接口

模型工具：`devwork_open` 引用现有任务并声明验收命令，`devwork_verify` 执行验收，`devwork_brief` 读取紧凑摘要。创建/分配/恢复成员仍使用官方 Team 工具。

Host API：`ctx.devwork.open/brief/review/prepareFeedback/sendFeedback`。反馈 API 供可信 Host/UI 调用，未暴露为让模型伪造人类意见的工具。`sendFeedback` 投递一条普通用户后续消息到相同 Leader，清空旧证据；同一批重复或并发发送只接受一次。

验收命令通过 **DSH tools.execute → 官方 bash → shell/subprocess** 运行，继承原有策略与取消信号。不绕过权限直接启动任意验收命令。临时官方 `tools.guard` 仅限调用者 Agent 和准确的嵌套 Bash call ID，在异步权限/pre-execute 处理后重新检查目录版本，才允许执行；它不取消或迁移已经运行的 shell。只有最终 foreground 结果满足退出码 0、未超时、未中断才算通过；前后代码指纹不同则证据过期。通过所选命令不等于测试充分，也不等于人已接受或授权提交。

指纹只读 Git 根目录中 tracked 和非 ignored 的文件，覆盖已有 dirty 内容；审查、准备反馈和发送反馈时，若官方文件路径逃出根目录，或不在现有 `git ls-files` 指纹集合内（如被捕获的 ignored 未跟踪文件），均拒绝继续。这是集合归属检查，不扩大扫描范围，也不能证明上游记录了全部改动。已暂存或已提交删除若不在当前 `git ls-files` 集合中，也会拒绝审查；未暂存的 tracked 删除仍在列表中，因此不宣称普遍支持删除文件。不修改 index、refs 或工作树。POC 上限为 10,000 文件、单文件 8 MiB、总计 64 MiB；不支持 submodule 目录。大仓库需要重新评估扫描成本。

## 复现与验证边界

```sh
npm ci
npm run verify
npm run pack:check
npm pack --dry-run
```

`tests/headless.mts` 行为测试覆盖：

1. 真实 AgentLoop、官方 Team/tools、JSONL persistence、SessionQuery、Bash/subprocess、workspace-changes：writer 修改 → 依赖 reviewer 审查 → Leader 验收 → 两条意见一批发送 → 原成员修订再验收。整体 diff 收入成员改动，排除之前的 dirty README；过期反馈和并发重复投递被拦截。
2. 插件卸载取消正在运行的官方验收进程并等待收敛。
3. task completed 不是证据；真实失败命令与后续代码修改阻止 ready-for-review。
4. 官方 pre-execute 拒绝传入嵌套验收，不绕过策略。
5. inactive owner 不视为成功或自动释放；子成员不能控制 Leader 回合。
6. 真实 Cordis 的 PENDING、激活、依赖消失、重新激活和工具/提示词释放。
7. 真实 Team 成员在明确 workdir 的临时 checkout 修改并提交；过期交接、未整合、无摘要、dirty 和权限拒绝时不清理；整合验收并提交摘要后删除自有 checkout，并发/重复清理被拦截，已有 dirty README 保留。

8. 外部编辑后仅验收的轮次，即使通过检查，也不能复用旧 diff；恢复完全相同内容可复用，轮次内修改则产生新绑定。
9. 两个成果文件被官方上限截为一个时，拒绝呈现完整审查。

目录保护另覆盖官方工作目录不匹配、切回后仍失效、运行中目录变化和官方 summary 目录检查；这是本地回归边界，不代表修复了上游运行时。

`tests/client.mts` 无浏览器检查：加载实际 closure-factory 与官方 SlotRegistry，验证晚声明/折叠/重声明/卸载；验证按钮插入显式请求、保持 insertion revision、不自动发送。模型是本项目确定性脚本，Client locale 是边界 fixture；官方业务服务与 SlotRegistry 使用发布包。没有执行真实模型、完整 DSH CLI profile 或 macOS/Windows 桌面验收。

## 发现的阻塞与限制

**alpha.2 仍保留 rc.2 的公开声明缺陷。** `dsh-session-projection` 的 wire register 泛型允许 `K` 取 Client map 的任意键，却用它索引 Host state map。独立插件/测试类型程序只导入部分公开入口时，`subagent` 等键的私有 Host 声明未被带入，触发严格库检查错误。这是公开声明的组合问题，不能把它归因于用户安装 TS7。

`scripts/prepare-types.mts` 在开发依赖中将约束收紧为 `keyof SessionProjectionMap & keyof SessionProjectionStateMap`。它检查精确 alpha.2 版本与原始签名，幂等执行，拒绝不认识的声明；没有 `any`、类型压制或 `skipLibCheck`。只改开发目录中的一个 `.d.ts`，不改官方运行时代码，不打进 npm 产物，不在用户安装时修补宿主。升级官方版本需重新评估；下游严格 TS 消费仍受上游原始声明质量影响。

类型后续在[开发 issue #4](https://github.com/GuoMonth/dsh-devwork/issues/4) 跟踪。`publint` 目前提示 ESM 包中的 Client closure-factory 看起来像 CJS。该入口是 DSH loader 脚本，不是独立 Node import；factory/SlotRegistry 测试覆盖它的实际加载约定，保留此工具警告。

Client 公共声明还需要显式安装其传递类型依赖，以及导入公开生成的 remote 类型。这些在 devDependencies 中，不打入浏览器 bundle。Host 与 Client 分开编译，Client 声明保留必要的类型 reference；没有导入私有实现。

**官方快照的同秒等长修改漏报。** 本地诊断观察到内容与文件时间戳已变，官方 before/after tree 却相同；当前推断与复制 index 后的时间戳/racy-Git 检查有关，详见[开发 issue #7](https://github.com/GuoMonth/dsh-devwork/issues/7)。常规 fixture 给基线文件旧 mtime，模拟已有仓库，避免创建测试时的碰撞；这是测试边界，不是生产修复。`DEVWORK_POC_FRESH_BASELINE=1` 可恢复原始基线用于诊断。没有修改官方运行时或用户 index，也没有用自动重试压下失败；缺少官方快照时审查 API 仍拒绝操作。alpha.2 验证仍复现漏报；新绑定保护也会拦截代码变化后的旧快照，但并非官方漏报修复。

第一阶段其余边界：

- Team 仍继承共享 cwd。临时 worktree 不改变这个 API，成员工具必须明确使用返回路径；没有文件锁或强制沙箱隔离，writeScopes 仍是提示。详见[任务交付](task-delivery.zh.md)。
- 官方变更是每轮 turn 的快照；当前 API 审查最新已结束 turn，不是整个 feature 跨多轮的累计 diff。
- 当前回合、验收证据和反馈批次只活在本 Host/Leader 生命周期；进程重启不恢复。一次性 headless CLI 退出后不能继续该临时回合。
- 反馈只支持单个文本 hunk 的新侧范围；binary/oversized、旧侧/删除行、自动重定位和 unresolved 线程待补。
- UI 已有发起入口，完整反馈编辑与 Host/Client 传输未接入。真实模型的拆解、任务契约、判断和摘要仍待验证。

下一步优先：真实模型验收同一闭环 → 在公开能力允许的范围内接入小型成果/反馈面板 → 再决定累计 diff、意见保留、第二名 writer 或 worktree 自动路由 的必要性。邮件、远程与恢复继续不进入第一阶段。
