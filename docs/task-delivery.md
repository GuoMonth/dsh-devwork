# Task delivery: retain knowledge, remove worktrees

English | [中文](task-delivery.zh.md)

A temporary task checkout belongs to development. After delivery, remove it and retain integrated code, a concise Leader document and Git provenance. Do not archive checkout copies or create long-lived task branches.

## Implemented minimum flow

1. For an explicitly requested isolated task, the Leader calls `devwork_worktree(taskId)`. It accepts a current official round task, creates a detached checkout under the system temporary directory from committed HEAD, and returns its ID/path/base commit.
2. Put that path in the official Team task contract. Pass workdir/absolute file paths explicitly to every member tool. Commit the source result through the user's authorized Git workflow, then complete the official task.
3. Call `devwork_handoff(worktreeId, summary)` for Markdown, a proposed document path and commit trailers. It prepares content; it does not write, commit or merge.
4. Through the authorized workflow, integrate the source commit and commit the exact summary as a regular document in the target checkout. Record the result, official task ID, base/source SHA and declared checks; do not copy the temporary checkout. Use the trailers in commit/merge messages where appropriate.
5. Run `devwork_verify` in the Leader checkout, then `devwork_cleanup(worktreeId)`. Report cleanup complete only when `cleanupPending` is empty.

```text
Devwork-Round: <round-id>
Devwork-Task: <official-task-id>
Devwork-Source: <source-commit-sha>
```

Source commits remain in integrated history and the document in normal Git history. Checkout archives are unnecessary. The Leader and human still review summary accuracy; declared checks in a document are not execution evidence.

## Removal boundary

Cleanup accepts an ID created by this live Host round, never an arbitrary path. It checks:

- Official task completion, settled Team work and fresh passing target-checkout verification.
- The expected linked checkout and matching Git common directory; never a primary checkout.
- No uncommitted or non-ignored untracked files, and a source HEAD matching its handoff.
- Source SHA ancestry in current target HEAD, plus the exact committed regular Markdown summary.

Mutation runs through official `tools.execute → bash`, retaining policy, cancellation and final-result semantics. Removal uses `git worktree remove`, without force, recursive shell deletion or branch deletion. Ignored build/dependency artifacts follow Git's temporary-checkout removal semantics; they are not delivery archives.

If evidence is missing, retain the checkout and report the reason to the Leader. Unknown, dirty or unintegrated work is never erased just because a task ended. Concurrent cleanup admits one successful operation. Existing user files, branches and other worktrees are outside this feature's cleanup scope.

## Official capabilities and limits

The inspected rc.2 `SpawnTeammateRequest` has no per-member cwd. Standard Team members inherit the root workspace. This flow explicitly passes tool paths: **it does not automatically change Session cwd or enforce file-access isolation**. If real models repeatedly omit the path, reassess composition through official Agent/provider APIs; do not mutate private headers.

The current proof uses Git ancestry and supports fast-forward/ordinary merge. Squash, cherry-pick and abandoning unintegrated results have no automatic cleanup path yet. A model's claim of integration cannot replace Git facts. The tools grant no new commit, merge or human-acceptance authority.

Rounds and ownership leases remain ephemeral. Unload cancels/drains operations without forcibly erasing unfinished work. Restart/crash resource recovery and transactional protection against external concurrent editors are not implemented.

## Verification

`tests/headless.mts` uses a scripted model with real Team/Bash/Git to exercise task-checkout edits, Leader integration, committed summaries, target verification and removal. It covers stale handoffs, missing integration/summary, dirty state, official denial, concurrent/repeated calls and preservation of preexisting user edits. Real-model path discipline, summary quality and native desktop behavior remain pending.

```sh
npm ci
npm run verify
npm run pack:check
npm pack --dry-run
```
