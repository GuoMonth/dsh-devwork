# 任务交付：保留知识，清理 worktree

[English](task-delivery.md) | 中文

任务的临时 worktree 属于开发过程。交付完成后删除 checkout，只保留已整合代码、必要的 Leader 摘要和 Git 提交来源。仓库不保存 worktree 副本，也不创建长期任务分支。

## 已实现的最小流程

1. 显式请求隔离任务时，Leader 调用 `devwork_worktree(taskId)`。它仅接受当前回合的官方任务 ID，从主工作区已提交 HEAD 创建系统临时目录中的 detached checkout，返回 ID、路径和基线提交。
2. 官方 Team 成员的任务契约写清这个路径，每次工具调用明确指定 workdir/文件绝对路径。完成代码与审查后，按用户已授权的 Git 流程提交源成果，并完成官方任务。
3. Leader 调用 `devwork_handoff(worktreeId, summary)`，得到简短 Markdown、建议文档路径和提交 trailers。这一步只准备内容，不写文件、不自动 commit/merge。
4. Leader 按用户授权整合源提交，将完整摘要作为普通文档提交到目标工作区。文档记录目标结果、官方任务 ID、基线/source SHA 和声明的验收命令，不包含临时目录副本。提交/合并消息可以使用返回的 trailers。
5. 在主工作区重新调用 `devwork_verify`。代码、摘要和目标验收一致后，调用 `devwork_cleanup(worktreeId)` 删除临时 worktree。`cleanupPending` 为空才可报告本回合已完成清理。

```text
Devwork-Round: <round-id>
Devwork-Task: <official-task-id>
Devwork-Source: <source-commit-sha>
```

源提交保留在整合历史中，摘要进入正常文档历史；无需用长期 checkout 维持任务知识。模型生成的摘要准确性仍由 Leader 与人审查。文档中的“声明验收命令”不冒充执行证据；实际证据来自官方工具链。

## 删除的边界

清理只接受本 Host 回合创建的 worktree ID，不接受任意目录。删除前确认：

- 官方任务完成，相关 Team 工作停止，目标工作区当前验收通过。
- checkout 属于相同 Git common dir，仍为预期的 linked worktree；主 checkout 不可删除。
- 没有未提交或非 ignored 的未跟踪文件；当前 source HEAD 与交接摘要一致。
- source SHA 是主工作区当前 HEAD 的祖先；摘要内容已精确提交为普通 Markdown 文件。

执行使用官方 `tools.execute → bash`，继承权限、取消和最终结果语义。删除用 `git worktree remove`，没有 `--force`、`rm -rf` 或分支清理。ignored 的构建/依赖文件遵循 Git 临时 checkout 的删除语义，不当作应归档的交付成果。

缺少任一证明就保留 checkout，由 Leader 汇总具体原因。正在验证、dirty、未整合与 unknown worktree 不会被当作任务结束自动擦除。并发清理只允许一个操作成功；已有用户文件、分支与其他 worktree 不纳入本项目清理范围。

## 官方能力与当前限制

核查的 rc.2 `SpawnTeammateRequest` 没有逐成员 cwd 参数，标准 Team 成员继承主工作区。上述流程通过每次工具显式使用路径验证，**不是自动切换成员 Session cwd，也不是强制文件访问隔离**。下一步若真实模型经常漏传路径，应再评估官方 Agent/provider 组合；不靠修改私有 Session header 实现。

当前清理以 ancestry 为证明，支持 fast-forward/普通 merge。squash、cherry-pick、放弃有未整合成果的任务，尚无自动清理路径；没有用提示词中的“已经合并”替代 Git 证明。工具不授予模型新的提交、合并或人类验收权限。

回合与 ownership lease 仍在当前 Host 内存中。卸载会取消并收尾操作，不会强制删除未交付成果；重新加载或崩溃后的资源恢复未实现。外部程序并发编辑 worktree 的锁定与事务处理也未实现。

## 验证

`tests/headless.mts` 使用确定性模型驱动真实 Team/Bash/Git，证明源 checkout 修改、Leader 整合、摘要提交、主工作区验收及清理的完整路径，并覆盖 stale handoff、未整合、缺摘要、dirty、官方拒绝、并发/重复调用和用户已有 dirty 文件保护。真实模型的路径纪律、摘要质量与原生桌面仍需验收。

```sh
npm ci
npm run verify
npm run pack:check
npm pack --dry-run
```
