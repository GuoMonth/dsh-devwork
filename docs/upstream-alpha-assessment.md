# Official baseline update — 2026-10-09

English | [中文](upstream-alpha-assessment.zh.md)

The newest published DSH release checked is [0.2.1-alpha.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-alpha.1), published October 3, source `5badb15009ae1756c3afe0ae0cef1faafc290ccc`. Devwork pins its shared DSH peers/development packages to this version and Cordis to `4.0.5-alpha.1`. It remains a POC, not a stable compatibility promise. Node support remains 24.x only. npm's `alpha`, `next`, and `latest` tags differ; installation must use the explicit tested version.

| Official change/finding | Devwork decision |
| --- | --- |
| Team runtime APIs and the serial `agent/turn-stopping` contract are retained | Keep official tasks, messaging and continuation; no replacement orchestration layer |
| Runtime invariant plugins/exports removed | We consume no invariant entry; no adaptation required |
| Composer `stats` split into `activity`/`usage` | Our public `conversation.input.left` action remains separate; exercise the published factory and SlotRegistry |
| Development-directory HMR refreshes entries/dependency maps; replacing installed package versions still requires restart | Reinstall/restart after changing the DSH baseline; do not promise seamless runtime upgrades |
| `session-projection` wire-register declaration is unchanged | Reassess and retain the exact development-only correction, now guarded to alpha.1; issue #4 remains open |
| `workspace-changes.snapshotTree` still copies the repository index without preserving its timestamp | Same-second equal-size snapshot concern #7 remains unresolved; fixture aging is still only a test boundary |

The new review guard observes the public change event and binds it at the same turn's serial stopping hook. Later passing verification cannot attach changed code to an old diff. The guard also refuses a summary when `total` exceeds the listed files. It does not patch official code, refresh the user's index, fabricate a fallback diff or retry failed snapshots. If official recording omits a file while still emitting another file's change, this guard alone cannot establish completeness. Cumulative round-level review remains pending.

The nine Host scenarios and two Client boundary scenarios exercise published official services with a scripted model. They establish the mechanism, not autonomous Leader judgment or native desktop behavior. See [POC evidence](headless-poc.md) for commands and limits.

Source comparison: [rc.2 → alpha.1](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.2.0-rc.2...dsh-v0.2.1-alpha.1); pinned [snapshot implementation](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/deliverables/workspace-changes/src/git.ts), [recorder lifecycle](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/deliverables/workspace-changes/src/index.ts), [projection declarations](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/session/session-projection/src/index.ts).
