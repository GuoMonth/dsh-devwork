# Real DSH desktop acceptance

`tests/e2e/desktop.mts` is the final acceptance gate for issue #19. It deliberately does not use the mock Host, Agent, Session, or delivery providers. A run is only allowed after an isolated Node 24 DSH desktop and real model/provider driver are supplied by the environment.

Run it with:

```sh
DSH_DEVWORK_REAL_E2E=1 \
DSH_DEVWORK_DESKTOP_EXECUTABLE=/path/to/isolated-dsh-desktop \
DSH_DEVWORK_DESKTOP_VERSION=0.2.0 \
DSH_DEVWORK_DSH_VERSION=0.2.0-rc.2 \
DSH_DEVWORK_PLUGIN_VERSION=0.1.0-alpha.0 \
DSH_DEVWORK_E2E_DRIVER=/path/to/real-dsh-devwork-driver.mjs \
DSH_DEVWORK_MODEL_NAME=deepseek-v4-flash \
DSH_DEVWORK_MODEL_ENDPOINT=https://model.example/v1 \
DSH_DEVWORK_MODEL_API_KEY="$DEEPSEEK_API_KEY" \
DSH_DEVWORK_PROVIDER=github \
DSH_DEVWORK_PROVIDER_TOKEN="$GITHUB_TOKEN" \
DSH_DEVWORK_PROVIDER_REPOSITORY=owner/repository \
DSH_DEVWORK_PROVIDER_TARGET_REF=main \
pnpm run test:e2e
```

The driver must export `run(context)` and return all of the following checkpoints: task definition, AI child-task registration, one primary Session per task, task panel and Session tree updates, Artifact creation, provider/PR state, explicit merge authorization, cleanup, and at least one failure or blocked path. It must also return non-empty screenshot, log, and Artifact paths; the harness checks that every path exists and is non-empty before a run can pass. The driver receives a redacted environment map, so credentials are never passed to the driver through that map; it should read provider/model credentials from its own process environment only.

Every run writes `.artifacts/real-e2e/acceptance.json` and `.artifacts/real-e2e/acceptance.log` (or the directory selected by `DSH_DEVWORK_E2E_ARTIFACT_DIR`). The report records `passed`, `failed`, or `blocked`; missing desktop, Node, model, provider, or explicit side-effect consent is a failing blocked result, never a skipped test.

The current checkout has no approved desktop/provider driver or provider credentials. Its acceptance result is therefore expected to be `blocked` until those prerequisites are supplied. The existing mock tests remain useful for deterministic Host behavior but cannot satisfy this gate.

The local run on 2026-10-15 used Node `24.21.0` and produced `status=blocked` with zero skipped tests. It recorded the missing side-effect consent, isolated desktop executable/version, DSH/plugin versions, real driver, model name/endpoint/credential, and provider kind/credential/repository/target ref in `.artifacts/real-e2e/acceptance.json` and `.artifacts/real-e2e/acceptance.log`.
