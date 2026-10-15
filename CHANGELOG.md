# Changelog / 更新记录

## Unreleased — 0.1.0-alpha.0

- Make the task center the only product entry: durable tasks have one primary Session, nested tasks form a Session tree, retries remain Attempts, and acceptance, Artifacts, PR/MR integrations and workspace leases persist independently.
- Connect `TaskPanelHost` to one Session-scoped Client source with explicit Session/Agent providers, durable execution and delivery services, user-authorized merge and guarded cleanup.
- Remove the obsolete Round/Leader/cumulative-review service, its model types, Team/scripted headless fixtures, temporary worktree command path and stale product assessments. No adapter or compatibility layer is provided for the removed API or data.
- Keep the bounded workspace and file-review helpers as low-level regression utilities; keep task-center acceptance, Artifact and cleanup behavior as the supported delivery path.
- Keep the alpha.2 declaration correction development-only and guarded by its exact upstream version; real provider and native desktop acceptance remain pending.

- 将任务中心设为唯一产品入口：持久化任务拥有一个主 Session，嵌套任务组成 Session 树，重试保留为 Attempt，验收、Artifact、PR/MR 集成和工作区租约分别持久化。
- 将 `TaskPanelHost` 接入按 Session 绑定的 Client source，要求显式 Session/Agent Provider，并提供持久化执行、交付、用户授权合并和受保护清理。
- 删除旧 Round/Leader/累计审查服务、模型类型、Team/脚本模型 headless fixture、临时 worktree 命令路径和过时产品评估。不提供已删除 API 或数据的适配层或兼容层。
- 保留有界 workspace 与文件审查 helper 作为底层回归工具；任务中心的验收、Artifact 和 cleanup 作为受支持的交付路径。
- 保留仅开发期、精确版本守卫的 alpha.2 声明修正；真实 Provider 和原生桌面验收仍待完成。
