# Local headless POC: development evidence and review

English | [中文](headless-poc.zh.md)

Baseline: DSH 0.2.0-rc.2 (`639ed015397290b3745d163aafe02ffee4aa3f84`), Cordis 4.0.4, Node 24.x, strict TypeScript 7.0.2. Local validation: 2026-10-01.

## Assessment

An approximately 80% Host/headless focus is a sensible architectural priority, not a coverage claim. Tasks, acceptance, evidence freshness, feedback anchors/delivery, permissions and cleanup can be checked without a browser. UI handles initiation, inspection and feedback expression.

The POC reuses official Team: task CAS, dependencies, messaging, member continuation and authority work in a real local flow. Replacing its roster/mailbox/task board has no demonstrated benefit yet. There is no generic orchestration/backend framework. If independent writer worktrees become necessary and shared cwd is a concrete blocker, reassess composition from the official Agent factory, scopes and lifecycle; that alternative is not implemented.

**The product unit is a reviewable development round.** Team supplies collaboration; Devwork turns the result into evidence, located feedback and another revision. A Team panel plus instructions alone would not distinguish the project.

## Lessons from Orca

| Orca design | DSH treatment | Status |
| --- | --- | --- |
| Batch diff comments instead of interrupting agents repeatedly | Extract new-side locations, excerpts and snapshot identity from official diff; send one Leader follow-up | Host API and headless loop implemented; inline native-diff controls pending |
| Keep feedback associated with code | Bind a batch to snapshot and checkout fingerprint; refuse stale feedback | Stale rejection implemented; automatic reanchoring and reply/resolve threads pending |
| Centralize completion/attention signals | Read official tasks; summarize failed/stale checks and inactive owners with unfinished tasks | Deterministic signals implemented; business importance remains a Leader-model judgment |
| Clear work/review boundaries | Official task contracts, explicit acceptance commands and one Leader | Mechanism implemented; real-model quality pending |
| Isolated worktrees for parallel edits | Opt-in detached task checkout; pass its path explicitly to member tools | Creation, committed handoff and cleanup tested; automatic per-member cwd and enforced isolation pending |

Sources: [batch diff review](https://www.onorca.dev/docs/review/annotate-ai-diff), [notifications](https://www.onorca.dev/docs/notifications), [worktrees](https://www.onorca.dev/docs/model/worktrees). Design lessons only; no Orca source/runtime dependency.

## Plugin and lifecycle

- `dsh.bundle.patch` inserts this Host feature only; it does not silently enable Team.
- `inject` waits for agents, agentTeams, tools, systemPrompt and workspaceChanges. Missing providers mean PENDING; npm installation does not activate services.
- `ctx.plugin(Devwork)` provides `ctx.devwork`. Official registrations own tools and dynamic prompt sections. Guidance appears only for an open round.
- A round stores official task IDs and its own acceptance/feedback data; task state is read from the official service. Only the exact live Leader can control it.
- Idle Team members may release their live instance and return on the next message. Do not retain Worker objects.
- A lifetime effect aborts and drains owned asynchronous operations on unload. Dependency loss unloads the feature; return creates a fresh service without old ephemeral rounds.
- Client uses the public `conversation.input.left` slot, inputActions revision-protected insertion and locale/effects. Slot collapse and plugin unload remove it. No private UI imports, DOM manipulation or duplicate React.

Official references: [effects](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/docs/cordis-tutorial/02-lifecycle-and-effects.md), [injection](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/docs/cordis-tutorial/03-services.md), [headless](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/bundle/headless/README.md).

## Task delivery

`devwork_worktree`, `devwork_handoff`, and `devwork_cleanup` form a small optional checkout lifecycle. Leader summaries and source identity are committed; temporary checkouts are removed after verified integration. `cleanupPending` keeps unfinished cleanup visible. Details and merge-mode boundaries: [task delivery](task-delivery.md).

## Interfaces

Model tools: `devwork_open` references existing tasks and declares checks; `devwork_verify` runs checks; `devwork_brief` returns a compact summary. Member creation/assignment/continuation stays with official Team tools.

Host API: `ctx.devwork.open/brief/review/prepareFeedback/sendFeedback`. Feedback is a trusted Host/UI action, not a model tool that can invent human comments. Sending queues one normal user follow-up to the same Leader and clears old evidence. Duplicate/concurrent sends accept one batch once.

Checks run through **DSH tools.execute → official bash → shell/subprocess**, retaining policy and cancellation. Only settled foreground output with exit code 0, no timeout and no abort passes. Code changes across/after checks invalidate evidence. Passing selected checks is neither sufficient test coverage, human acceptance nor commit permission.

The read-only fingerprint covers tracked and non-ignored files in the Git root, including preexisting dirty content. It does not change index/refs/worktree. POC limits: 10,000 files, 8 MiB per file, 64 MiB total; no submodule directories. Large-repository cost needs assessment.

## Reproduce and evidence boundary

```sh
npm ci
npm run verify
npm run pack:check
npm pack --dry-run
```

Seven `tests/headless.mts` behavior scenarios cover:

1. Real AgentLoop, Team/tools, JSONL persistence, SessionQuery, Bash/subprocess and workspace-changes: writer edit, dependent read-only review, Leader acceptance, two comments in one batch, same-member revision and recheck. Root diff includes member changes and excludes an existing dirty README; stale feedback and concurrent duplicate delivery fail closed.
2. Unload cancels/drains a running official check process.
3. Completed tasks alone are insufficient; failed commands and subsequent code edits block readiness.
4. Official pre-execute denial reaches nested checks.
5. Inactive ownership is not completion or automatic release; children cannot control the Leader round.
6. Real Cordis PENDING, activation, dependency loss/reactivation and tool/prompt cleanup.
7. Real Team member edits/commits in an explicit temporary workdir; stale/unintegrated/missing-summary/dirty/policy-denied cleanup refuses, verified committed handoff removes only the owned checkout, concurrent/repeated cleanup is rejected, existing dirty README remains.

Two `tests/client.mts` browser-free checks load the actual closure factory with official SlotRegistry, exercise declaration/collapse/redeclaration/unload, and check explicit request insertion, insertion revision and no auto-submit. The model is our deterministic script and Client locale is a boundary fixture. Business services and SlotRegistry use published official packages. Real models, a complete CLI profile and macOS/Windows desktop have not been validated.

## Blockers and limits

**rc.2 public declaration defect:** the projection wire-register overload lets `K` span Client keys while indexing Host state keys. Partial public-entry type programs expose keys such as `subagent` without their private Host declarations, causing strict library errors. This is declaration composition, not a requirement for plugin users to install TS7.

`scripts/prepare-types.mts` narrows the development declaration to `keyof SessionProjectionMap & keyof SessionProjectionStateMap`. It validates exact version/signature, is idempotent and refuses unfamiliar input. No `any`, suppressions or `skipLibCheck`. It changes one development `.d.ts`, no runtime, no published artifact and no user-host installation. Reassess on upgrade; downstream strict TS consumers remain exposed to upstream declaration quality.

The type follow-up is tracked in [development issue #4](https://github.com/GuoMonth/dsh-devwork/issues/4). `publint` currently warns that the Client closure-factory looks like CJS under an ESM package. That entry is a DSH loader script, not a standalone Node import; the factory/SlotRegistry tests exercise its actual loading contract. The warning remains visible.

Client declarations also require explicit transitive type dependencies and public generated remote types. These are development dependencies, not browser bundle inputs. Separate Host/Client programs and retained type references keep emitted declarations self-contained without private imports.

**Same-second equal-size snapshot misses.** Local traces showed changed content/timestamps but identical official before/after trees. Copied-index timestamps affecting racy-Git checks are the current hypothesis; see [development issue #7](https://github.com/GuoMonth/dsh-devwork/issues/7). Normal fixtures use an old baseline mtime to model an existing repository and avoid creation-time collisions. This bounds the tests, not a production fix. `DEVWORK_POC_FRESH_BASELINE=1` restores the fresh baseline for diagnosis. No official runtime or user index is modified, and failures are not suppressed with retries. Missing official snapshots still block review.

Remaining first-phase boundaries:

- Team still inherits shared cwd. Temporary worktree leases do not change that API: member tools must use the returned path explicitly. No file lock or sandbox isolation; writeScopes remain advisory. See [task delivery](task-delivery.md).
- Official snapshots are per turn. The API reviews the latest settled turn, not cumulative feature-wide changes across turns.
- Rounds/evidence/batches are ephemeral for this Host/Leader lifetime. No restart recovery; an exited one-shot CLI cannot continue them.
- Comments support a single text hunk's new-side range. Binary/oversized, old-side/deleted lines, reanchoring and unresolved threads are pending.
- UI has an initiation entry; full feedback editor and Host/Client transport remain pending. Planning/contracts/judgment/summaries require real-model acceptance.

Next: real-model loop, a small public-API result/feedback surface, then evidence-led decisions on cumulative diff, comment retention, a second writer or automatic worktree routing. Email, remote execution and recovery remain deferred.
