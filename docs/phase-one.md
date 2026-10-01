# Phase one: a development loop using official capabilities

English | [中文](phase-one.zh.md)

Research date: 2026-10-01. This document records source findings and an implementation recommendation; it does not claim that the product features are implemented.

This is the initial assessment. Current implementation and revised headless-first priorities are recorded in the [POC assessment](headless-poc.md). Team reuse is the current POC choice, not a permanent requirement. The official diff covers one turn, not a cumulative feature delivery.

## Baseline

The latest release is **DSH 0.2.0-rc.2**, published on September 29. The inspected master and release tag both resolve to `639ed015397290b3745d163aafe02ffee4aa3f84`. Our repository already uses this baseline. Official npm packages for the Team bundle, Team service, and workspace-changes are available at `0.2.0-rc.2`; their Cordis peer range accepts our `4.0.4`.

The official primary runtime pins Node `24.21.0`, consistent with our Node 24.x-only policy. Our strict TS7 compiler produces JS/declarations without requiring the upstream repository to change compilers. New official API dependencies still need actual strict TS7 checks; the inert entry's success does not prove full integration compatibility.

## Minimum product value

The user gives a goal, understands progress, resolves decisions, and reviews results through one Leader conversation. Deliver three things:

1. A development task contract: goal, touched paths, dependencies, acceptance checks, and reporting expectations in official task descriptions/writeScopes.
2. Leader coordination and consolidated reporting: reuse named members; report completion, blockers, and decisions to the Leader; wait for required members and check evidence before presenting results.
3. Aggregate diff review and batched feedback: use the official change review, accept one feedback message, and continue through the same Leader.

Start with one Git repository, one Leader, one writer, and one read-only reviewer. Then validate two writers with disjoint scopes. Member count here is a product execution convention: the official maxMembers limit is cumulative membership, not concurrent execution.

## Official capabilities and our additions

| Need | Official capability | Our addition |
| --- | --- | --- |
| Leader, named workers, communication | Team bundle and ctx.agentTeams spawnTeammate/sendMessage/waitForChange/interrupt | Development contracts, reporting rules, explicit Team development entry |
| Ownership and task dependencies | createTask/listTasks/updateTask, revision CAS, blockedBy, writeScopes | Acceptance text and coordination of overlapping writes |
| Progress | agentTeam Session projection, member Session status, official read-only Team panel | Start with the existing panel; add a compact summary only when needed, without mirroring state |
| Human decisions | userQuestions and optional plan review | Workers report business questions to the Leader; batch related decisions |
| Code changes | workspaceChanges.summary/diff and official changed-files/review UI | Verify that the root turn captures shared-repository member edits; no worker attribution or new diff editor |
| Feedback | Existing Leader conversation and official message/steer path | One feedback message first; an optional draft UI later |
| UI and lifecycle | Public slots, shared Session store, Cordis effects | Small additive controls, separate Host/Client type programs, public APIs only |

Business decisions do not replace official sandbox/approval behavior. Plan mode is guidance, not an enforced read-only boundary. An owned child cannot directly ask the human through userQuestions.ask(agent); it should message the Leader.

## Composition

Use the **official opt-in Agent Teams bundle**, rather than assembling a second roster, mailbox, and task board on ordinary subagents. `@deepseek-ai/dsh-experimental-agent-team-profile` ships with DSH but is disabled by default. Despite its name, it is a bundle, not a standalone profile. Enable it on the desktop Plugins page or add it to a demo profile that already includes dsh-base. One official switch enables service, tools, and UI.

The Team bundle disables ordinary subagent delegation and overlapping global child-control tools. Underlying spawn/fork providers remain available to Team and workflow. Do not re-enable conflicting tools or require external Codex/Claude workers, community plugins, extra MCP servers, or orchestration services.

The Devwork entry must express an explicit user request for Team development, respecting the official policy that teammates are created only on request. First validate with a direct user prompt asking for Agent Teams; add the product entry afterward.

Agent Teams is an **experimental official capability without a stability promise**. Integrate against the exact rc.2 baseline and concentrate its touchpoints in a few modules, without building a generic backend framework. The host owns service instances; do not bundle a second DSH/Cordis implementation. Declare shared APIs as peer/dev dependencies when consumed and verify host module identity. Keep experimental Team explicitly selected rather than making it a prerequisite for ordinary conversations.

## Blockers and initial handling

| Boundary | Consequence | First implementation and verification |
| --- | --- | --- |
| Shared cwd; no worktrees, merge, or file locks | Shell commands, formatters, and generators can overwrite other work; writeScopes is advisory | Start with one writer, then disjoint writers. Leader coordinates formatting, lockfile changes, and integration serially. A requirement for isolated worktrees needs a new evaluation |
| inactive is only turn inactivity; completed is not test evidence | Idle must not be presented as success; interruption retains task owner | Display official facts and verify reported results. Leader explicitly releases/updates tasks after failures |
| Fork inherits completed turns; fresh has no Leader history | Current-turn objectives and decisions may be missing | Send the task contract explicitly; reuse members for later tasks |
| workspace-changes records top-level turns, excluding child sessions | No native per-worker diff; early Leader completion misses later writes | Wait for required workers before finalizing, then validate their shared Git edits appear in the root aggregate diff |
| Child file capture is absent; ignored/outside/non-Git coverage is limited | Some worker changes cannot be reviewed completely | MVP targets non-ignored code inside one Git repository. Verify pre-existing dirty changes are excluded from new outcomes; do not claim author attribution |
| Diff snapshots live only with the Host Session | Old comparisons disappear after Host restart | Review the active flow; do not build history recovery. Concurrent user edits may be counted in the aggregate diff |
| No public per-line annotation slot | Native inline comments are not a ready-made extension | Start with one feedback message, optionally naming files/lines. Later evaluate a small separate draft UI or propose an upstream line slot. No private FileDiff imports, DOM modifications, or full review replacement |
| Late Team activation requires refresh | Existing views may lack the projection | Enable the official bundle before creating the demo Session; verify enable/disable behavior |
| Client loading and shared API types are not yet tested here | A successful empty Host build is insufficient | Validate one public Client slot, exports/loading, strict Host/Client programs, runtime identity, and effect cleanup |

## Development order and exit criteria

Run a validation task before building a framework:

- On official desktop rc.2, enable Team and use a real model in a Git demo repository to perform a writer/reviewer change and review.
- Verify task claim/complete, messages, waiting, and root aggregate diff.
- Submit one feedback message and have the same members implement the correction; route business questions through the Leader's official question interface.
- Retain pre-existing dirty files and verify the round baseline. Interrupt a writer and ensure inactivity/retained ownership is not reported as success.
- Add and remove one public Client slot in the minimal plugin; type-check the real official APIs under strict TS7 and verify desktop loading and cleanup.

After this gate, deliver Leader rules/entry, then a compact projection-based summary, then a feedback draft only if normal input is insufficient. Track each actual task as kind:development linked to request #1. Inline annotations, worktrees, remote operation, email, and custom recovery do not block the first useful version.

This research checked source, documentation, release identity, npm versions, and upstream test locations. **It did not run the real desktop/model loop or upstream's full tests.** The validation task must provide those results.

## Evolution assessment

These are inferences from implemented decisions, not an official roadmap:

- September's single opt-in Team bundle favors understandable composition and a small number of feature switches, rather than another installer/runtime manager.
- Session observation/projection ownership favors consuming official projected facts, without a second task database or browser replay mirror.
- Recent changed-files and diff improvements show investment in development UI. A separate diff editor, file manager, or IDE shell risks overlap; focus our value on task quality, exception summaries, and feedback organization.
- Team promotion, automatic owner release, worktrees, and cross-process coordination are uncommitted. Use current contracts, verify each adopted release, and migrate affected touchpoints when changes occur.

## Primary evidence

See the [pinned primary source list](phase-one.zh.md#主要依据) in the Chinese companion: rc.2 release, Team/service/bundle/tool policy, workspace-changes, native review/slot types, public slot rules, user-question boundaries, implemented composition/projection decisions, and the primary runtime lock. Both documents use the same inspected commit.
