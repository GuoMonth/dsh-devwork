# Changelog / 更新记录

## Unreleased — 0.1.0-alpha.0

- Initialize the DSH bundle, inert Cordis entry, bilingual metadata, icon, and README.
- Add reproducible builds, package validation, and CI/prerelease packaging.
- Support Node 24.x only; adopt stable TypeScript 7.0.2 and strict checking for source and scripts.
- Add a Host POC over official Team/tasks/tools/change review: declared acceptance checks, stale-evidence detection, anchored feedback batches, and one Leader follow-up.
- Add temporary detached task worktrees, committed Leader handoffs/provenance and non-forced cleanup after verified integration; no long-lived task branches or checkout archives.
- Align all DSH peers with official 0.2.1-alpha.2 and Cordis 4.0.5-alpha.1; use live official change events instead of synchronous history reads from the Host.
- Require official working-directory support and a fixed per-round integration root; invalidate evidence/diff/feedback on directory changes, guard in-flight operations, validate summary directories, and explicitly route official Bash to that root. Preserve detached task delivery and pending-creation reservations; no automatic Leader switch or member isolation.
- Add an awaited actual-content start baseline and independent bounded cumulative Host review across turns, with lazy coarse file comparisons, new-side text comments and file-level deletion/binary/mode/symlink feedback. Keep baseline paths after staged/committed deletion and retain the baseline across directory changes while invalidating current evidence/review/batches. Official summaries are supplemental; upstream snapshot issue #7 remains unresolved. No new UI, model, orchestration or recovery layer.
- Add a thin public-slot Client entry that inserts an editable explicit Team request; no automatic submission.
- Exercise real official services with a deterministic model in local headless tests, including dependency loss and in-flight unload.
- Keep strict library checks with a development-only correction to the projection declaration defect retained from rc.2 in alpha.2. Real-model/desktop acceptance and npm publication remain pending.

- 初始化 DSH bundle、空 Cordis 入口、中英文元数据、图标与 README。
- 配置可复现构建、包检查、CI 和预发布打包。
- 仅支持 Node 24.x；采用稳定版 TypeScript 7.0.2，严格检查源码与脚本。
- 增加基于官方 Team、任务、工具和变更服务的 Host POC：声明式验收命令、旧证据失效检测、定位反馈批次及统一 Leader 后续消息。
- 增加临时 detached 任务 worktree、已提交的 Leader 摘要/提交来源与整合验收后的无强制清理；不保留长期任务分支或 checkout 副本。
- 对齐官方 DSH 0.2.1-alpha.2 与 Cordis 4.0.5-alpha.1；使用官方实时变更事件，移除 Host 同步历史读取。
- 依赖官方 working-directory 并固定每回合整合根目录；目录变化使证据/diff/反馈失效，保护运行中操作、校验 summary 目录，官方 Bash 显式使用该根目录。保留 detached 任务交付与创建中预留；不自动切换 Leader 或隔离成员。
- 增加需等待完成的实际内容起点基线及独立、有界、跨 turn 的累计 Host 审查，按需延迟提供粗粒度文件比较、新侧文本行评论及删除/二进制/mode/符号链接的文件级反馈。已暂存/已提交删除后保留基线路径；目录变化保留基线并使当前证据/审查/批次失效。官方 summary 仅作补充，上游快照 issue #7 仍未解决。不新增 UI、模型、编排或恢复层。
- 增加官方公开 slot 的轻量 Client 入口，插入可编辑的显式团队请求，不自动发送。
- 用确定性模型驱动官方真实服务开展本地 headless 验证，覆盖依赖消失与运行中卸载。
- 用仅限开发期的 alpha.2 仍存在的投影声明修正保留严格库检查。真实模型、桌面验收和 npm 发布仍待完成。
