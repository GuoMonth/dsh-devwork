# Releasing

English | [中文](releasing.zh.md)

This is a third-party DSH bundle, not a profile or an official DSH distribution. Building a package does not publish a release.

## Requirements

The source baseline is DSH `0.2.1-alpha.2`, commit `d743267388641bc76f17c45ce8b4c231aed1d32c`.

| Contract | Project configuration |
| --- | --- |
| npm bundle manifest | `package.json` declares `dsh.bundle.patch`; no `dsh.profile` |
| Resolvable plugin row | `cordis.patch.yml` inserts the published package name |
| Cordis entry | `src/index.ts` exports `name` and `apply(ctx)` |
| Shared runtime identity | Cordis is both a peer and a development dependency; no runtime bundling |
| Prebuilt distribution | `prepack` builds JavaScript/declarations; `files` includes the patch and assets |
| Git source installation | `prepare` builds standalone, without a DSH source checkout |
| Plugin discovery | npm `dsh-plugin` keyword; add the GitHub repository topic `dsh-plugin` |
| Plugin listing metadata | `icon` and `locale/en.json`, `locale/zh.json` provide `meta.title`/`meta.description` |

The task-center API is the only product entry. The former Round/Leader API, data model and compatibility layer are intentionally absent from the package.

## Validate

```sh
pnpm install --frozen-lockfile
pnpm run verify
pnpm run pack:check
pnpm pack --dry-run
```

These checks cover strict Host/Client/script/test types, task-center domain and Host bridge behavior, Client boundary scenarios, public exports, bundle metadata and importing the prebuilt tarball in an independent consumer. They use mock providers and do not prove real provider calls, model planning, permission UI or native desktop interaction. Before a release, install the tarball in the target DSH desktop and verify the task panel, Session actions, Artifact/PR views and user authorization flow. Recheck the public API whenever the DSH baseline changes.

The alpha.2 declaration correction remains development-only and is guarded by `scripts/prepare-types.mts`; it is not included in the package. Reassess that correction when the upstream declaration changes, and keep library checking enabled.

## GitHub alpha release

1. Choose an `x.y.z-alpha.N` version, update `package.json` and its lockfile, and record the real changes in `CHANGELOG.md`.
2. Run the checks above and review CI.
3. Only after a release request, tag the reviewed main commit as `v<version>` and push the tag.

The alpha workflow builds a tarball and creates a GitHub prerelease. npm publication remains a separate, explicit maintainer action.

## References

- [DSH bundle metadata](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/bundle/agent-team-profile/package.json)
- [DSH plugin development](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.md)
