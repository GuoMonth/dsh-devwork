# Project instructions

- Build DSH Devwork as a local desktop developer experience on DSH's public plugin APIs.
- Support Node.js 24.x only. Do not add other Node major versions or a compatibility matrix.
- Use strict TypeScript 7 for all first-party code, including scripts. Validate external data from unknown; do not bypass checks with explicit any, blanket casts, or suppression comments. Favor clear types over elaborate type-level machinery.
- Absorb Orca's engineering and interaction lessons; do not copy Orca source or depend on its runtime/services.
- Preserve one primary Leader conversation. Favor a small useful coding/review flow over a general orchestration platform.
- Remote execution, mobile, email, and automatic crash recovery are outside the first phase.
- Do not report planned capabilities as implemented. The initial entry is intentionally inert.
- Shared DSH/Cordis runtime packages belong in peerDependencies and devDependencies; do not bundle another instance.
- Use dependency injection for consumed services and Cordis effects for resources. Never import another feature's private UI components.
- If adding a browser entry, isolate Host and Client TypeScript configurations and use documented DSH slots.
- Keep README.md/README.zh.md, docs/releasing.md/docs/releasing.zh.md, and locale/en.json/locale/zh.json in sync.
- Keep user needs/feedback (kind:request) separate from implementation/maintenance (kind:development), using one category per issue. Link product development tasks to their requests. PRs close development tasks; close requests only when user acceptance is satisfied. Follow CONTRIBUTING.md.
- Run npm run verify and npm pack --dry-run for package changes. Add behavioral tests when actual product behavior is introduced.
- Do not publish npm packages or tag a release without a user/maintainer request.
- Never commit credentials, user DSH homes, generated lib output, node_modules, or local worktrees.
