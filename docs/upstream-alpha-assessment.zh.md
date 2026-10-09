# 官方基线升级核查 — 2026-10-09

[English](upstream-alpha-assessment.md) | 中文

本次核查的最新发布是 [DSH 0.2.1-alpha.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-alpha.1)，10 月 3 日发布，源码提交 `5badb15009ae1756c3afe0ae0cef1faafc290ccc`。Devwork 将共享 DSH peer 和开发依赖统一锁定到该版本，Cordis 锁定到 `4.0.5-alpha.1`。项目仍是 POC，不承诺稳定兼容；Node 仍只支持 24.x。npm 的 `alpha`、`next`、`latest` 标签并不相同，安装应使用明确的已验证版本。

| 官方变化或核查发现 | Devwork 处理 |
| --- | --- |
| Team 运行时接口及串行 `agent/turn-stopping` 契约保留 | 继续复用官方任务、消息、成员恢复，不重建编排层 |
| 移除运行时 invariant 插件和导出 | 项目未依赖这些入口，无需适配 |
| 输入区 `stats` 拆为 `activity`、`usage` | 本项目使用独立的公开 `conversation.input.left`；验证发布版 factory 和 SlotRegistry |
| 开发目录 HMR 更新入口和依赖映射；替换已安装版本仍需重启 | 升级基线后重新安装并重启，不承诺运行中无缝升级 |
| `session-projection` wire-register 声明未变 | 重新核查后保留精确的开发期修正，版本守卫改为 alpha.1；#4 继续开放 |
| `workspace-changes.snapshotTree` 仍复制真实 index，未保留原时间戳 | 同秒等长漏报 #7 未解决；fixture 旧时间戳仍只限定测试条件 |

新增审查保护观察公开变更事件，并在同一轮次的串行结束钩子绑定指纹。后续验收通过也不能把新代码换绑到旧 diff；当 summary 的 `total` 大于文件列表长度时也拒绝审查。没有修改官方源码、刷新用户 index、伪造替代 diff 或重试失败快照。官方若漏掉一个文件、同时仍公告另一个文件的变更，仅靠此保护无法证明快照完整。回合级累计审查仍未实现。

九项 Host 与两项 Client 边界场景使用发布版官方服务和脚本模型，证明机制，不证明自主 Leader 判断或原生桌面交互。命令与限制见 [POC 证据](headless-poc.zh.md)。

源码比较：[rc.2 → alpha.1](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.2.0-rc.2...dsh-v0.2.1-alpha.1)；固定提交的[快照实现](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/deliverables/workspace-changes/src/git.ts)、[记录生命周期](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/deliverables/workspace-changes/src/index.ts)、[投影声明](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/session/session-projection/src/index.ts)。
