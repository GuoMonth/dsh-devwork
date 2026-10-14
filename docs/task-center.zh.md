# 任务中心领域模型

任务是 Devwork 的持久化一等对象。Session 是任务的执行界面，Artifact 是任务的产出记录，PR/MR 是一种外部集成产出，工作区租约记录资源预留。租约元数据本身不证明实际 checkout 的所有权，也不授权删除。

任务定义包含目标、范围、验收条件、依赖和可选父任务。待处理任务可以等待分配 Session；绑定后一个任务只有一个主 Session。执行失败、继续和重试写入该 Session 的 Attempt 记录，不生成第二个主 Session。可注入的执行引擎限制为一个活跃执行者；多 Agent 协作不属于当前产品边界。

任务状态、Session 状态、Artifact 状态、PR/MR 集成状态和工作区租约状态独立推进。Session 空闲、Agent 停止、任务子项归零或 PR 创建都不等于任务交付完成。领域层禁止存在未结束子任务或运行/等待中的 Attempt 时完成任务，执行前要求依赖完成，并拒绝依赖和父子完成顺序形成的环。执行与交付服务还必须验证验收证据后才能请求完成。

`TaskRepository` 通过注入式 `TaskLogStore` 保存版本化事件，并重放为统一投影。`taskTree` 添加父 Session 关联和后代进度计数，不改变任务状态。存储边界接受 `unknown`，未知字段、错误序列、非法状态转移和跨任务 Artifact/Integration 绑定均拒绝；拒绝的命令不会追加事件。

`FileTaskLogStore` 通过独占锁、同步临时文件和原子替换保存版本化 JSON 事件日志。仓库串行处理自身命令，并通过版本检查拒绝其他仓库实例的过期写入。重新打开只恢复数据，不恢复 Agent 执行。损坏数据保留现场；中断写入遗留的锁需要明确检查，不自动抢锁、重试、迁移或崩溃恢复。`MemoryTaskLogStore` 为测试提供相同的版本契约。

工作区清理由后续交付服务负责：任务的 Artifact 与 PR/MR 引用先持久化，远端状态和验收证据确认后才允许释放租约。状态未知、未提交、未推送、未整合或清理失败时必须保留现场。当前领域层只记录租约转移，不执行 Git、Provider 或文件清理。创建失败后可释放预留租约，但调用方必须确认没有遗留自有 checkout。

领域与存储基础已经完成，任务执行引擎（#16）现在提供确定性的任务接入和可 mock 的执行。Host 桥接已将执行引擎、面板投影和 PR/MR 交付（#18）接通；测试覆盖状态转移、任务树与 Session 关系、执行结果、并发写入、重启读取、损坏数据和存储失败。mock 桥接测试不证明 AI 自主规划或桌面渲染。

执行层接收经过严格校验的嵌套任务定义，并以稳定顺序注册父任务和子任务。每个任务通过注入的 Session Provider 获得一个确定性的主 Session；注入的 Agent Provider 一次只执行一个任务，并将明确结果映射为可持久化的继续、暂停、阻塞、失败、取消和重试命令。重试保留原 Session，只创建下一个 Attempt。每次执行都有可取消信号，过期的 Provider 结果不会写回；Session 接入使用稳定幂等键。这里是可注入的执行引擎边界，还不是 DSH Host 适配器；Provider 可以使用 mock，执行层不需要真实模型、桌面服务或旧 Round API。任务树的后代计数仍是进度证据，不替代完成状态。

## Host/Client 任务面板桥接

`TaskPanelHost` 在 Host 生命周期内统一持有一份 `FileTaskLogStore`/`TaskRepository`、`TaskExecutionEngine` 和 `TaskDeliveryService`，并注入公开的 `taskPanelSource`。`forSession(sessionId)` 将边界绑定到当前 Session，面板和 Session 视图仍读取同一份 Host 投影，Client 不创建第二套任务事实状态。Host 卸载和取消订阅会释放监听器；新的 Host 可以重新打开事件日志，但不会自动恢复 Agent 执行。

桥接要求显式提供 Session/Agent Provider，可选配置交付 Provider。缺少仓库或 Provider 时，source 明确为 `unavailable`，不会静默构造 mock Provider。Provider 刷新错误由交付服务保留既有 Artifact/PR 状态并标记同步不确定。合并必须经过 `authorizeMerge` 产生的带品牌授权对象，Agent 或 Client 的布尔值不能授权；工作区清理仍受交付、验收、所有权和干净交付条件约束，因此不确定的工作和持久化 Artifact 会继续可见。

创建任务必须显式配置 planner 或 `createInput` 适配器；桥接不会从任意 Client 状态猜测任务。

当前 Host 测试使用 mock Provider 和内存日志，覆盖父子任务创建、统一投影、打开/继续/查看、授权交接、source 拆卸与未配置状态。它们不证明自主规划、真实 Provider 写入、权限界面或原生桌面渲染；这些仍需真实桌面验收。
