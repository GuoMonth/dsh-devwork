# Local headless POC: development evidence and review

English | [中文](headless-poc.zh.md)

Baseline: DSH 0.2.1-alpha.2 (`d743267388641bc76f17c45ce8b4c231aed1d32c`), Cordis 4.0.5-alpha.1, Node 24.x, strict TypeScript 7.0.2. Alpha.2 compatibility probes: 2026-10-10; current regression commands are below.

## Assessment

An approximately 80% Host/headless focus is a sensible architectural priority, not a coverage claim. Tasks, acceptance, evidence freshness, feedback anchors/delivery, permissions and cleanup can be checked without a browser. UI handles initiation, inspection and feedback expression.

The POC reuses official Team: task CAS, dependencies, messaging, member continuation and authority work in a real local flow. Replacing its roster/mailbox/task board has no demonstrated benefit yet. There is no generic orchestration/backend framework. If independent writer worktrees become necessary and shared cwd is a concrete blocker, reassess composition from the official Agent factory, scopes and lifecycle; that alternative is not implemented.

**The product unit is a reviewable development round.** Team supplies collaboration; Devwork turns the result into evidence, located feedback and another revision. A Team panel plus instructions alone would not distinguish the project.

## Lessons from Orca

| Orca design | DSH treatment | Status |
| --- | --- | --- |
| Batch diff comments instead of interrupting agents repeatedly | Extract current-side locations/excerpts or file metadata from an owned cumulative comparison; send one Leader follow-up | Host API implemented; inline native-diff controls pending |
| Keep feedback associated with code | Bind a batch to owned review identity and checkout fingerprint; refuse stale feedback | Stale rejection implemented; automatic reanchoring and reply/resolve threads pending |
| Centralize completion/attention signals | Read official tasks; summarize failed/stale checks and inactive owners with unfinished tasks | Deterministic signals implemented; business importance remains a Leader-model judgment |
| Clear work/review boundaries | Official task contracts, explicit acceptance commands and one Leader | Mechanism implemented; real-model quality pending |
| Isolated worktrees for parallel edits | Opt-in detached task checkout; pass its path explicitly to member tools | Creation, committed handoff and cleanup tested; automatic per-member cwd and enforced isolation pending |

Sources: [batch diff review](https://www.onorca.dev/docs/review/annotate-ai-diff), [notifications](https://www.onorca.dev/docs/notifications), [worktrees](https://www.onorca.dev/docs/model/worktrees). Design lessons only; no Orca source/runtime dependency.

## Plugin and lifecycle

- `dsh.bundle.patch` inserts this Host feature only; it does not silently enable Team.
- `inject` waits for agents, agentTeams, tools, systemPrompt, workspaceChanges and workingDirectory. Missing providers mean PENDING; npm installation does not activate services.
- `ctx.plugin(Devwork)` provides `ctx.devwork`. Official registrations own tools and dynamic prompt sections. Guidance appears only for an open round.
- A round stores official task IDs, its actual-content start baseline, and its own acceptance/review/feedback data; task state is read from the official service. Only the exact live Leader can control it.
- Idle Team members may release their live instance and return on the next message. Do not retain Worker objects.
- A lifetime effect aborts and drains owned asynchronous operations on unload. Dependency loss unloads the feature; return creates a fresh service without old ephemeral rounds.
- Client uses the public `conversation.input.left` slot, inputActions revision-protected insertion and locale/effects. Slot collapse and plugin unload remove it. No private UI imports, DOM manipulation or duplicate React.

Official references: [effects](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/docs/cordis-tutorial/02-lifecycle-and-effects.md), [injection](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/docs/cordis-tutorial/03-services.md), [headless](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/bundle/headless/README.md).

The Host observes live `session/event` announcements without deprecated synchronous Session history reads. Official workspace-change events invalidate the current owned review and prepared batches. Review coverage comes from an independent comparison of the round's actual-content start baseline with a fresh current capture, not an official turn snapshot. An absent or expired summary, or an omitted/truncated official file list, cannot hide covered changes or block owned review. If a supplemental summary is present, only its directory and non-escaping path safety are validated; a wrong directory or escaping path refuses review. Supplemental ignored-only paths are not promoted into owned coverage, and a net-zero create/delete does not block review. Passing later verification does not make an old owned review current: refresh it after checkout changes.

Upgrade findings: [official alpha.2 assessment](upstream-alpha-assessment.md).

## Fixed integration directory

Every round captures `integrationRoot` from the Leader’s original `session.header.cwd`, requiring the official `workingDirectory.get(session)` to match. Briefs, review snapshots and feedback batches expose that root. Verification, review, feedback, worktree creation, handoff and cleanup refuse a mismatched directory; Devwork never changes it automatically. Official Bash calls explicitly use the integration root.

A `working-directory/change` event preserves the start baseline but clears acceptance evidence, the supplemental change reference, current review and prepared feedback batches. Restoring the original directory does not restore them: run verification again and capture a fresh current review against the original baseline; a new official diff is not required. A directory-version guard rejects asynchronous operations spanning a change, including switch-away-and-back. Review and feedback check any available supplemental summary's `cwd` against the fixed root. These guards prevent attribution across directories; they do not move running shells, allocate member worktrees or enforce isolation.

## Task delivery

`devwork_worktree`, `devwork_handoff`, and `devwork_cleanup` form a small optional checkout lifecycle. Leader summaries and source identity are committed; temporary checkouts are removed after verified integration. `cleanupPending` keeps unfinished cleanup visible. A synchronous pending-creation reservation prevents replacing a round while a worktree is being created; owned leases also block replacement. Details and merge-mode boundaries: [task delivery](task-delivery.md).

## Interfaces

Model tools: `devwork_open` references existing tasks and declares checks; `devwork_verify` runs checks; `devwork_brief` returns a compact summary. Member creation/assignment/continuation stays with official Team tools. `open` is asynchronous: open before dispatching coding work and await completion of the actual-content baseline. The opening round is reserved synchronously, cannot be replaced while capture is pending, and later Leader/Team tools wait at the official pre-execute boundary. If opening a replacement fails while the Host and Leader are still live, the previous successful round and its baseline are restored, but its checks, current review, supplemental change reference and prepared batches are invalidated. Reverify and refresh that review before continuing. An initially failed open leaves no round.

Host API: `ctx.devwork.open/brief/review/reviewDiff/prepareFeedback/sendFeedback`. `review` requires a settled Leader and current passing acceptance evidence. Its owned `id`, start/current fingerprints, `scope: 'round-start-to-current'` and `coverage: 'tracked-and-unignored-content'` bind the cumulative changed-file list; `seq` is only a supplemental official event reference, or zero when absent. A new review supersedes the old review and its batches. Feedback is a trusted Host/UI action, not a model tool that can invent human comments. Sending queues one normal user follow-up to the same Leader and clears old evidence and review. Duplicate/concurrent sends accept one batch once.

`reviewDiff` computes one requested file comparison lazily. Text returns coarse whole-file `oldText`/`newText`, preserving final-newline state; it is not a minimal hunk diff. Binary/non-UTF-8 content and symlink targets use metadata. File sides expose absence, regular-file byte count/executable bits, or a symlink target. Whole-file comments cover any changed file, including deletion, binary, mode-only and symlink changes. Line comments use 1-based ranges in changed current-side text, not old/deleted lines; they need not correspond to a minimal changed hunk. Batches allow 1–32 comments, up to 4,000 characters per comment and 64 KiB total line excerpts. Stale content, superseded review identity and directory changes refuse diff/feedback reuse.

Checks run through **DSH tools.execute → official bash → shell/subprocess**, retaining policy and cancellation. A temporary official `tools.guard`, scoped to the caller Agent and exact nested Bash call ID, rechecks the directory generation after asynchronous permission/pre-execute handling before allowing execution. This does not cancel or relocate an already-running shell. Only settled foreground output with exit code 0, no timeout and no abort passes. Code changes across/after checks invalidate evidence. Passing selected checks is neither sufficient test coverage, human acceptance nor commit permission.

Capture reads actual checkout bytes and executable bits, not HEAD or index content. Git supplies tracked and non-ignored untracked paths in the canonical Git root. Unchanged preexisting dirty or untracked content is included in the baseline but excluded from the cumulative changed list. Baseline paths remain in subsequent capture scope after removal from Git's current list, so staged/committed deletion and later reappearance remain comparable; making a baseline path ignored does not remove its coverage. Newly created ignored-only paths are excluded. Changes reverted to baseline disappear from the cumulative result, and edits by external writers are not attributed to an individual actor.

Each capture requires two matching bounded reads with no automatic retry. Observed instability fails closed; there is no atomic snapshot or lock on external writers. File reads avoid following a leaf symlink, and symlinks are represented by target metadata without reading their targets; parent-directory symlinks are refused. Capture changes neither index, refs nor worktree. POC caps are 10,000 enumerated/retained paths, 8 MiB per regular file and 64 MiB total content/target bytes per manifest; submodule directories, filenames that cannot round-trip through UTF-8, Git enumeration warnings and other unsupported entries refuse capture. Oversized workspaces fail rather than silently truncating coverage. Large-repository cost needs assessment.

## Reproduce and evidence boundary

```sh
npm ci
npm run verify
npm run pack:check
npm pack --dry-run
```

Earlier headless runs established the following baseline behavior. The official-binding cases 8–9 below are historical evidence, superseded by the independent cumulative review contract above; they are not current acceptance claims. Use a fresh run of the commands above to validate the current implementation.

1. Real AgentLoop, Team/tools, JSONL persistence, SessionQuery, Bash/subprocess and workspace-changes: writer edit, dependent read-only review, Leader acceptance, two comments in one batch, same-member revision and recheck. Root diff includes member changes and excludes an existing dirty README; stale feedback and concurrent duplicate delivery fail closed.
2. Unload cancels/drains a running official check process.
3. Completed tasks alone are insufficient; failed commands and subsequent code edits block readiness.
4. Official pre-execute denial reaches nested checks.
5. Inactive ownership is not completion or automatic release; children cannot control the Leader round.
6. Real Cordis PENDING, activation, dependency loss/reactivation and tool/prompt cleanup.
7. Real Team member edits/commits in an explicit temporary workdir; stale/unintegrated/missing-summary/dirty/policy-denied cleanup refuses, verified committed handoff removes only the owned checkout, concurrent/repeated cleanup is rejected, existing dirty README remains.

8. The previous official-binding implementation refused reuse after an external edit despite a verification-only turn passing; restoring identical content allowed reuse, and a recorded revision created a new binding.
9. The previous official-binding implementation refused review when an official one-file cap truncated a two-file result.

Current cumulative-review regression requirements include awaited baseline capture and safe failed-replacement restoration, multi-turn changes with the same start baseline, unchanged dirty/untracked exclusions, staged/committed deletion, mode/symlink/binary file feedback, exact text/newline handling, new-side line validation, stale-review/batch rejection and coverage despite absent, expired or incomplete official summaries. Preserve the permission, directory, unload and task-worktree checks above. This list specifies the changed contract, not a new test-run result or scenario count.

Directory guards additionally cover a mismatched official working directory, change-event invalidation after restoration, in-flight changes and official summary-directory checks. These are local regression boundaries, not a claim of upstream runtime repair.

`tests/client.mts` browser-free checks load the actual closure factory with official SlotRegistry, exercise declaration/collapse/redeclaration/unload, and check explicit request insertion, insertion revision and no auto-submit. The model is our deterministic script and Client locale is a boundary fixture. Business services and SlotRegistry use published official packages. Real models, a complete CLI profile and macOS/Windows desktop have not been validated.

## Blockers and limits

**alpha.2 public declaration defect (retained from rc.2):** the projection wire-register overload lets `K` span Client keys while indexing Host state keys. Partial public-entry type programs expose keys such as `subagent` without their private Host declarations, causing strict library errors. This is declaration composition, not a requirement for plugin users to install TS7.

`scripts/prepare-types.mts` narrows the development declaration to `keyof SessionProjectionMap & keyof SessionProjectionStateMap`. It validates exact version/signature, is idempotent and refuses unfamiliar input. No `any`, suppressions or `skipLibCheck`. It changes one development `.d.ts`, no runtime, no published artifact and no user-host installation. Reassess on upgrade; downstream strict TS consumers remain exposed to upstream declaration quality.

The type follow-up is tracked in [development issue #4](https://github.com/GuoMonth/dsh-devwork/issues/4). `publint` currently warns that the Client closure-factory looks like CJS under an ESM package. That entry is a DSH loader script, not a standalone Node import; the factory/SlotRegistry tests exercise its actual loading contract. The warning remains visible.

Client declarations also require explicit transitive type dependencies and public generated remote types. These are development dependencies, not browser bundle inputs. Separate Host/Client programs and retained type references keep emitted declarations self-contained without private imports.

**Same-second equal-size snapshot misses.** Local traces showed changed content/timestamps but identical official before/after trees. Copied-index timestamps affecting racy-Git checks are the current hypothesis; see [development issue #7](https://github.com/GuoMonth/dsh-devwork/issues/7). Normal official-snapshot fixtures use an old baseline mtime to model an existing repository and avoid creation-time collisions. This bounds those tests, not a production fix. `DEVWORK_POC_FRESH_BASELINE=1` restores the fresh baseline for diagnosis. Alpha.2 probes still reproduce the miss. Devwork's independent start-to-current content comparison makes official omissions irrelevant to its own covered changed-file list, but does not repair the upstream recorder or prove its snapshots complete. No official runtime or user index is modified, and no failed capture is hidden by automatic retries.

Remaining first-phase boundaries:

- Team still inherits shared cwd. Temporary worktree leases do not change that API: member tools must use the returned path explicitly. No file lock or sandbox isolation; writeScopes remain advisory. See [task delivery](task-delivery.md).
- Official snapshots remain per turn; the Host API independently reviews net changes from the awaited round start across turns, within its bounded scope. This is not change history, attribution or coverage outside that scope.
- Rounds/evidence/batches are ephemeral for this Host/Leader lifetime. No restart recovery; an exited one-shot CLI cannot continue them.
- Text comparison is coarse whole-file, with current-side line feedback and file-level feedback for deletion/binary/mode/symlink changes. Oversized capture, old-side/deleted-line anchors, automatic reanchoring and unresolved threads remain unsupported.
- UI has an initiation entry; full feedback editor and Host/Client transport remain pending. Planning/contracts/judgment/summaries require real-model acceptance.

Next: real-model loop, a small public-API result/feedback surface, then evidence-led decisions on finer diffs, comment retention, a second writer or automatic worktree routing. This Host reliability work adds no UI, model or orchestration layer. Email, remote execution and recovery remain deferred.
