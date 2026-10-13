# Devwork task delivery

Harden Git-backed workspace capture and Devwork-owned Bash operations against environments where DSH's credential scrub removes `GIT_CONFIG_KEY_*` entries but leaves a nonzero `GIT_CONFIG_COUNT`. The workspace reader now disables inherited command-line config entries, and guarded Devwork commands reset the count inside the official Bash pipeline. The Client test now resolves encoded file URLs correctly on non-ASCII checkout paths.

## Git provenance

Devwork-Source: 60bb360
Devwork-Base: 86b4ebfce4563fde082a5647eaa7845ab905cbe5

## Checks

- `GIT_CONFIG_COUNT=0 npm run verify` — 31 Host tests and 2 Client tests passed; publint retained its existing Client CJS/ESM warning.
- `npm run pack:check` — independent packed entry imported successfully; 26 files.
- `npm pack --dry-run` — passed.

The regression test explicitly supplies a partial inherited Git configuration and verifies that workspace capture remains usable. Ordinary Agent Bash calls remain governed by the official DSH subprocess environment; this plugin does not replace that upstream runtime behavior globally.
